import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { db, withApi } from './_db.js';

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
async function getTagGroups(sql: ReturnType<typeof db>) {
  const groups = await sql.unsafe('SELECT * FROM tag_groups ORDER BY sort_order ASC, id ASC');
  const options = await sql.unsafe('SELECT * FROM tag_group_options ORDER BY sort_order ASC, id ASC');
  return groups.map((g: any) => ({ ...g, options: options.filter((o: any) => o.group_id === g.id) }));
}

// ---------------------------------------------------------------------------
// Auth helpers. Sessions are a signed JWT (HS256 via `jose`) stored in an
// httpOnly cookie — never readable/tamperable from client JS, and since the
// app is same-origin, the browser attaches it to every /api request
// automatically with no change needed to src/lib/api.ts's fetch wrapper.
// ---------------------------------------------------------------------------
const SESSION_COOKIE = 'ff_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function sessionCookie(token: string | null) {
  // Empty value + Max-Age=0 clears the cookie (used on logout).
  const parts = [
    `${SESSION_COOKIE}=${token ?? ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    token ? `Max-Age=${SESSION_MAX_AGE_SECONDS}` : 'Max-Age=0',
  ];
  // Only set Secure in production — a local `vite dev` / `vercel dev` server
  // over plain http would otherwise have the cookie silently rejected by
  // the browser.
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

async function createSessionToken(userId: number, email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

async function getUserFromRequest(req: VercelRequest, sql: ReturnType<typeof db>) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = Number(payload.sub);
    if (!userId || isNaN(userId)) return null;
    const rows = await sql.unsafe('SELECT id, email, name, created_at FROM users WHERE id = $1', [userId]);
    return rows[0] ?? null;
  } catch {
    // Expired, malformed, or signed with an old/rotated secret — treat as logged out.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google / Facebook sign-in ("Continue with ___" buttons). This is a plain
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
// ---------------------------------------------------------------------------
type OAuthProvider = 'google' | 'facebook';

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

// Redirect URIs must exactly match what's registered in the Google/Facebook
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
  const clientId = provider === 'google' ? process.env.GOOGLE_CLIENT_ID : process.env.FACEBOOK_APP_ID;
  const appUrl = getAppUrl(req);
  if (!clientId) {
    redirectTo(res, `${appUrl}/login?error=${provider}_not_configured`);
    return;
  }
  const state = randomBytes(24).toString('base64url');
  const redirectUri = oauthRedirectUri(appUrl, provider);

  const authUrl = provider === 'google'
    ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: 'openid email profile', state, prompt: 'select_account',
      })}`
    : `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: 'email,public_profile', state,
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

async function fetchFacebookProfile(code: string, redirectUri: string) {
  const tokenParams = new URLSearchParams({
    code, redirect_uri: redirectUri,
    client_id: process.env.FACEBOOK_APP_ID!, client_secret: process.env.FACEBOOK_APP_SECRET!,
  });
  const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams}`);
  if (!tokenRes.ok) throw new Error(`Facebook token exchange failed: ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();

  const profileRes = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(tokens.access_token)}`
  );
  if (!profileRes.ok) throw new Error(`Facebook profile fetch failed: ${await profileRes.text()}`);
  const profile = await profileRes.json();

  return {
    email: String(profile.email ?? '').toLowerCase(),
    name: profile.name ?? null,
    providerId: String(profile.id ?? ''),
    avatarUrl: profile.picture?.data?.url ?? null,
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
    const profile = provider === 'google'
      ? await fetchGoogleProfile(String(code), redirectUri)
      : await fetchFacebookProfile(String(code), redirectUri);

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
    // is redirected to Google/Facebook and back), not fetch() calls, so they
    // arrive as GET requests on this same ?resource=auth endpoint rather
    // than through the POST action dispatch below.
    if (action === 'google_start') { await oauthStart(req, res, 'google'); return; }
    if (action === 'facebook_start') { await oauthStart(req, res, 'facebook'); return; }
    if (action === 'google_callback') { await oauthCallback(req, res, sql, 'google'); return; }
    if (action === 'facebook_callback') { await oauthCallback(req, res, sql, 'facebook'); return; }

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
    // "this account only has Google/Facebook, no password" - distinguishing
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
    await handleAuth(req, res, sql);
    return;
  }

  if (req.method === 'GET') {
    if (req.query.resource === 'tags') {
      const rows = await sql.unsafe('SELECT * FROM tags ORDER BY sort_order ASC, id ASC');
      res.status(200).json(rows);
      return;
    }
    if (req.query.resource === 'tag_groups') {
      res.status(200).json(await getTagGroups(sql));
      return;
    }
    const rows = await sql.unsafe('SELECT * FROM custom_columns ORDER BY sort_order ASC, id ASC');
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const p = req.body;
    if (p.resource === 'tags') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tags');
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      // A tag someone already created (case-insensitive) just returns the
      // existing row instead of erroring on the UNIQUE constraint — the
      // picker calls this optimistically whenever a not-yet-known name is
      // typed, so "already exists" should be a silent no-op, not a failure.
      const existing = await sql.unsafe('SELECT * FROM tags WHERE lower(name) = lower($1)', [name]);
      if (existing.length > 0) { res.status(200).json(existing[0]); return; }
      const rows = await sql.unsafe(
        `INSERT INTO tags (name, color, sort_order) VALUES ($1, $2, $3) RETURNING *`,
        [name, p.color ?? '#f59e0b', nextOrder]
      );
      res.status(200).json(rows[0]);
      return;
    }
    if (p.resource === 'tag_groups') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const existing = await sql.unsafe('SELECT * FROM tag_groups WHERE lower(name) = lower($1)', [name]);
      if (existing.length > 0) { res.status(200).json({ ...existing[0], options: [] }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tag_groups');
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO tag_groups (name, sort_order) VALUES ($1, $2) RETURNING *`,
        [name, nextOrder]
      );
      res.status(200).json({ ...rows[0], options: [] });
      return;
    }
    if (p.resource === 'tag_group_options') {
      const groupId = Number(p.group_id);
      const name = String(p.name ?? '').trim();
      if (!groupId || isNaN(groupId) || !name) { res.status(400).json({ error: 'group_id and name are required' }); return; }
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
    const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM custom_columns');
    const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
    const rows = await sql.unsafe(
      `INSERT INTO custom_columns (name, col_key, data_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [p.name, p.col_key, p.data_type ?? 'text', nextOrder]
    );
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (req.query.resource === 'tags') {
      await sql.unsafe('DELETE FROM tags WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (req.query.resource === 'tag_groups') {
      await sql.unsafe('DELETE FROM tag_groups WHERE id = $1', [id]); // cascades to tag_group_options
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (req.query.resource === 'tag_group_options') {
      await sql.unsafe('DELETE FROM tag_group_options WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    await sql.unsafe('DELETE FROM custom_columns WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
