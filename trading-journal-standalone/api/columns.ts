import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db, withApi } from './_db.js';
import {
  parseCookies, sessionCookie, createSessionToken, getUserFromRequest, requireUserId, ownsTagGroup,
} from './_auth.js';

// Also handles the reusable Tags list (?resource=tags), Tag Groups
// (?resource=tag_groups / tag_group_options), and Auth (?resource=auth)
// through this same function — kept here rather than new api/tags.ts,
// api/tag-groups.ts, or api/auth.ts files because the Vercel Hobby plan
// caps serverless functions at 12 and this project is already at the cap.
// Tags, tag groups, and custom columns are all small "define a reusable
// named thing" tables, so the same GET/POST/DELETE shape fits all of them;
// `resource` (query param on GET/DELETE, body field on POST) defaults to
// `columns` since that's the original/more common caller. Auth doesn't
// really fit that CRUD shape, but it's the only file left with headroom.
//
// Session/JWT helpers used to live here as private functions; they're now
// shared via api/_auth.js so accounts.ts, trades/*, strategies.ts, and
// checklist.ts can all check "who is this?" too, not just this file.
async function getTagGroups(sql: ReturnType<typeof db>, userId: number) {
  const groups = await sql.unsafe('SELECT * FROM tag_groups WHERE user_id = $1 ORDER BY sort_order ASC, id ASC', [userId]);
  const groupIds = groups.map((g: any) => g.id);
  const options = groupIds.length
    ? await sql.unsafe('SELECT * FROM tag_group_options WHERE group_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC', [groupIds])
    : [];
  return groups.map((g: any) => ({ ...g, options: options.filter((o: any) => o.group_id === g.id) }));
}

// Every brand-new account (password signup, or the first time someone signs
// in with a given Google account) needs at least one trading account to
// exist — the account switcher, Journal, Summary, etc. all assume there's
// something to select. This used to be handled once, globally, by a
// fresh-install migration in schema.sql (back when there was only ever one
// person's data); now that each signup gets its own isolated data, each
// signup creates its own starter account instead.
async function createStarterAccount(sql: ReturnType<typeof db>, userId: number) {
  await sql.unsafe(
    `INSERT INTO accounts (name, type, sort_order, user_id) VALUES ('Default', 'Live', 0, $1)`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Google sign-in ("Continue with Google" button). This is a plain
// server-side OAuth 2.0 authorization-code flow — no SDK needed, since it's
// just two HTTPS calls (exchange code -> token, then token -> profile) that
// `fetch` (built into the Vercel Node runtime) handles fine.
//
// Flow: browser navigates (real page load, not fetch) to .../auth?action=
// google_start -> we redirect it to Google's consent screen -> Google
// redirects back to our own .../auth?action=google_callback with a `code`
// -> we exchange that code server-side for the person's email/name -> we
// look up or create their `users` row by email -> set the same session
// cookie the password flow uses -> redirect into the app. From the
// frontend's point of view, a successful OAuth login looks identical to a
// successful password login: same cookie, same shape of user object.
//
// `state` is a random value round-tripped through a short-lived cookie
// purely as CSRF protection (proves the person completing the callback is
// the same one who started it on this browser) — it is not a chosen
// abbreviation for anything, just the OAuth spec's standard name for this.
//
// (Facebook login was removed - Google + email/password only now. The
// provider parameter/type below is kept as a single-member union rather
// than collapsed away entirely, since it keeps this code shaped the same
// as before in case another provider is ever added back.)
// ---------------------------------------------------------------------------
type OAuthProvider = 'google';

const OAUTH_STATE_COOKIE = 'ff_oauth_state';

function oauthStateCookie(state: string | null) {
  const parts = [
    `${OAUTH_STATE_COOKIE}=${state ?? ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    state ? 'Max-Age=600' : 'Max-Age=0', // 10 minutes to complete the round trip
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

// Redirect URIs must exactly match what's registered in the Google
// developer console, so this deliberately prefers an explicit APP_URL env
// var (set this to your real production URL) over trusting request headers,
// which can't be registered in advance and would make the redirect_uri
// mismatch on every request from an unexpected host.
function getAppUrl(req: VercelRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}`;
}

function oauthRedirectUri(appUrl: string, provider: OAuthProvider) {
  return `${appUrl}/api/columns?resource=auth&action=${provider}_callback`;
}

function redirectTo(res: VercelResponse, url: string, extraCookies: string[] = []) {
  if (extraCookies.length > 0) res.setHeader('Set-Cookie', extraCookies);
  res.writeHead(302, { Location: url });
  res.end();
}

async function oauthStart(req: VercelRequest, res: VercelResponse, provider: OAuthProvider) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = getAppUrl(req);
  if (!clientId) {
    redirectTo(res, `${appUrl}/login?error=${provider}_not_configured`);
    return;
  }
  const state = randomBytes(24).toString('base64url');
  const redirectUri = oauthRedirectUri(appUrl, provider);

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account',
  })}`;

  redirectTo(res, authUrl, [oauthStateCookie(state)]);
}

async function fetchGoogleProfile(code: string, redirectUri: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, redirect_uri: redirectUri, grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error(`Google profile fetch failed: ${await profileRes.text()}`);
  const profile = await profileRes.json();

  return {
    email: String(profile.email ?? '').toLowerCase(),
    name: profile.name ?? null,
    providerId: String(profile.sub ?? ''),
    avatarUrl: profile.picture ?? null,
  };
}

async function oauthCallback(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>, provider: OAuthProvider) {
  const appUrl = getAppUrl(req);
  const clearState = oauthStateCookie(null);
  const { code, state, error } = req.query;

  if (error) { redirectTo(res, `${appUrl}/login?error=oauth_cancelled`, [clearState]); return; }

  const expectedState = parseCookies(req)[OAUTH_STATE_COOKIE];
  if (!code || !state || !expectedState || state !== expectedState) {
    redirectTo(res, `${appUrl}/login?error=oauth_invalid_state`, [clearState]);
    return;
  }

  try {
    const redirectUri = oauthRedirectUri(appUrl, provider);
    const profile = await fetchGoogleProfile(String(code), redirectUri);

    if (!profile.email) throw new Error(`${provider} did not return an email address`);

    const existing = await sql.unsafe('SELECT * FROM users WHERE email = $1', [profile.email]);
    let user;
    if (existing.length > 0) {
      // Same email already has an account (maybe signed up with a password
      // originally) - just link this provider onto it rather than making a
      // second account, and log in as that existing row.
      user = existing[0];
      await sql.unsafe(
        `UPDATE users SET oauth_provider = COALESCE(oauth_provider, $2), oauth_id = COALESCE(oauth_id, $3),
                          avatar_url = COALESCE(avatar_url, $4), name = COALESCE(name, $5)
         WHERE id = $1`,
        [user.id, provider, profile.providerId, profile.avatarUrl, profile.name]
      );
    } else {
      const rows = await sql.unsafe(
        `INSERT INTO users (email, password_hash, name, oauth_provider, oauth_id, avatar_url)
         VALUES ($1, NULL, $2, $3, $4, $5) RETURNING *`,
        [profile.email, profile.name, provider, profile.providerId, profile.avatarUrl]
      );
      user = rows[0];
      await createStarterAccount(sql, user.id);
    }

    const token = await createSessionToken(user.id, user.email);
    redirectTo(res, `${appUrl}/`, [clearState, sessionCookie(token)]);
  } catch (err) {
    console.error(err);
    redirectTo(res, `${appUrl}/login?error=oauth_failed`, [clearState]);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleAuth(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>) {
  if (req.method === 'GET') {
    const action = req.query.action;
    // The OAuth start/callback legs are real browser navigations (the user
    // is redirected to Google and back), not fetch() calls, so they arrive
    // as GET requests on this same ?resource=auth endpoint rather than
    // through the POST action dispatch below.
    if (action === 'google_start') { await oauthStart(req, res, 'google'); return; }
    if (action === 'google_callback') { await oauthCallback(req, res, sql, 'google'); return; }

    const user = await getUserFromRequest(req, sql);
    res.status(200).json({ user });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const p = req.body ?? {};
  const action = p.action;

  if (action === 'logout') {
    res.setHeader('Set-Cookie', sessionCookie(null));
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'signup') {
    const email = String(p.email ?? '').trim().toLowerCase();
    const password = String(p.password ?? '');
    const name = String(p.name ?? '').trim() || null;
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
    if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }

    const existing = await sql.unsafe('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) { res.status(409).json({ error: 'An account with that email already exists.' }); return; }

    const passwordHash = await bcrypt.hash(password, 10);
    const rows = await sql.unsafe(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at`,
      [email, passwordHash, name]
    );
    const user = rows[0];
    await createStarterAccount(sql, user.id);
    const token = await createSessionToken(user.id, user.email);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.status(200).json({ user });
    return;
  }

  if (action === 'login') {
    const email = String(p.email ?? '').trim().toLowerCase();
    const password = String(p.password ?? '');
    const rows = await sql.unsafe('SELECT * FROM users WHERE email = $1', [email]);
    const row = rows[0];
    // Deliberately identical error for "no such user", "wrong password", and
    // "this account only has Google, no password" - distinguishing
    // them tells an attacker (or just confuses a person) which emails have
    // accounts and how they signed up.
    if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    const token = await createSessionToken(row.id, row.email);
    res.setHeader('Set-Cookie', sessionCookie(token));
    res.status(200).json({ user: { id: row.id, email: row.email, name: row.name, created_at: row.created_at } });
    return;
  }

  res.status(400).json({ error: 'Unknown auth action' });
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.query.resource === 'auth' || (req.method === 'POST' && req.body?.resource === 'auth')) {
    // Auth itself is the one thing here that must NOT require a session —
    // it's how you get one. Everything below this point does require it.
    await handleAuth(req, res, sql);
    return;
  }

  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  if (req.method === 'GET') {
    if (req.query.resource === 'tags') {
      const rows = await sql.unsafe('SELECT * FROM tags WHERE user_id = $1 ORDER BY sort_order ASC, id ASC', [userId]);
      res.status(200).json(rows);
      return;
    }
    if (req.query.resource === 'tag_groups') {
      res.status(200).json(await getTagGroups(sql, userId));
      return;
    }
    // Custom fields are scoped to a single account (see schema.sql's
    // account-scoping migration) — tolerant of a missing/invalid account_id
    // the same way GET /trades is, since this fires before the account
    // context has resolved on first render; an empty list there just means
    // "nothing to show yet", not an error. An account_id that doesn't belong
    // to this user gets the same empty-list treatment, not a 403 — no need
    // to reveal whether that id exists at all.
    const accountIdParam = req.query.account_id;
    const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
    if (!accountId || isNaN(accountId)) { res.status(200).json([]); return; }
    const rows = await sql.unsafe(
      `SELECT cc.* FROM custom_columns cc
       JOIN accounts a ON a.id = cc.account_id
       WHERE cc.account_id = $1 AND a.user_id = $2
       ORDER BY cc.sort_order ASC, cc.id ASC`,
      [accountId, userId]
    );
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const p = req.body;
    if (p.resource === 'tags') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tags WHERE user_id = $1', [userId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      // A tag this user already created (case-insensitive) just returns the
      // existing row instead of erroring on the UNIQUE constraint — the
      // picker calls this optimistically whenever a not-yet-known name is
      // typed, so "already exists" should be a silent no-op, not a failure.
      const existing = await sql.unsafe('SELECT * FROM tags WHERE user_id = $1 AND lower(name) = lower($2)', [userId, name]);
      if (existing.length > 0) { res.status(200).json(existing[0]); return; }
      const rows = await sql.unsafe(
        `INSERT INTO tags (name, color, sort_order, user_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, p.color ?? '#f59e0b', nextOrder, userId]
      );
      res.status(200).json(rows[0]);
      return;
    }
    if (p.resource === 'tag_groups') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const existing = await sql.unsafe('SELECT * FROM tag_groups WHERE user_id = $1 AND lower(name) = lower($2)', [userId, name]);
      if (existing.length > 0) { res.status(200).json({ ...existing[0], options: [] }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tag_groups WHERE user_id = $1', [userId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO tag_groups (name, sort_order, user_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, nextOrder, userId]
      );
      res.status(200).json({ ...rows[0], options: [] });
      return;
    }
    if (p.resource === 'tag_group_options') {
      const groupId = Number(p.group_id);
      const name = String(p.name ?? '').trim();
      if (!groupId || isNaN(groupId) || !name) { res.status(400).json({ error: 'group_id and name are required' }); return; }
      if (!(await ownsTagGroup(sql, groupId, userId))) { res.status(404).json({ error: 'Tag group not found' }); return; }
      const existing = await sql.unsafe(
        'SELECT * FROM tag_group_options WHERE group_id = $1 AND lower(name) = lower($2)',
        [groupId, name]
      );
      if (existing.length > 0) { res.status(200).json(existing[0]); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tag_group_options WHERE group_id = $1', [groupId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO tag_group_options (group_id, name, color, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
        [groupId, name, p.color ?? '#f59e0b', nextOrder]
      );
      res.status(200).json(rows[0]);
      return;
    }
    const accountId = Number(p.account_id);
    if (!accountId || isNaN(accountId)) { res.status(400).json({ error: 'account_id is required' }); return; }
    const ownRows = await sql.unsafe('SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
    if (!ownRows[0]) { res.status(404).json({ error: 'Account not found' }); return; }
    const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM custom_columns WHERE account_id = $1', [accountId]);
    const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
    // Same col_key derived on this account before (e.g. two fields that both
    // normalize to the same key) just returns the existing row instead of
    // erroring on the unique (account_id, col_key) index — same
    // already-exists-is-a-no-op pattern used by tags/tag_groups above.
    const existing = await sql.unsafe('SELECT * FROM custom_columns WHERE account_id = $1 AND col_key = $2', [accountId, p.col_key]);
    if (existing.length > 0) { res.status(200).json(existing[0]); return; }
    const rows = await sql.unsafe(
      `INSERT INTO custom_columns (name, col_key, data_type, sort_order, account_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [p.name, p.col_key, p.data_type ?? 'text', nextOrder, accountId]
    );
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (req.query.resource === 'tags') {
      await sql.unsafe('DELETE FROM tags WHERE id = $1 AND user_id = $2', [id, userId]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (req.query.resource === 'tag_groups') {
      await sql.unsafe('DELETE FROM tag_groups WHERE id = $1 AND user_id = $2', [id, userId]); // cascades to tag_group_options
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (req.query.resource === 'tag_group_options') {
      await sql.unsafe(
        `DELETE FROM tag_group_options o USING tag_groups g
         WHERE o.id = $1 AND g.id = o.group_id AND g.user_id = $2`,
        [id, userId]
      );
      res.status(200).json({ deleted: 1 });
      return;
    }
    await sql.unsafe(
      `DELETE FROM custom_columns cc USING accounts a
       WHERE cc.id = $1 AND a.id = cc.account_id AND a.user_id = $2`,
      [id, userId]
    );
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
