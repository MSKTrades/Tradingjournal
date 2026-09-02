import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db, withApi } from './_db.js';
import {
  parseCookies, sessionCookie, createSessionToken, getUserFromRequest, requireUserId, ownsTagGroup, isAdminEmail,
  getRequestGeo,
} from './_auth.js';

// ---------------------------------------------------------------------------
// Contact form email delivery. Best-effort: every submission is stored in
// contact_messages regardless (see the POST resource === 'contact' handler
// below), so a missing/misconfigured RESEND_API_KEY never loses a message —
// it just means the admin has to check the Admin page instead of an inbox.
//
// Uses Resend's plain HTTP API (no SDK dependency) - https://resend.com.
// Setup: create a free Resend account, verify the pipecho.com domain (adds
// a couple of DNS records - Resend walks you through it), then set these
// two env vars in Vercel:
//   RESEND_API_KEY = re_xxxxx
//   RESEND_FROM    = "PipEcho <contact@pipecho.com>"  (must be on the
//                     verified domain - Resend rejects anything else)
// CONTACT_TO_EMAIL defaults to support@pipecho.com if not set.
//
// Important: Resend's sandbox "from" address (onboarding@resend.dev) can
// ONLY deliver to the email address on your own Resend account - sending to
// support@pipecho.com specifically requires domain verification first.
// Until RESEND_API_KEY is set, this function is a silent no-op.
async function sendContactEmail(fromEmail: string, message: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = process.env.RESEND_FROM || 'PipEcho <onboarding@resend.dev>';
  const to = process.env.CONTACT_TO_EMAIL || 'support@pipecho.com';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        // Reply-To is the whole point here - it means hitting "Reply" in a
        // normal inbox goes straight back to the person who wrote in,
        // without them ever seeing an internal pipecho.com address.
        reply_to: fromEmail,
        subject: `PipEcho contact form — ${fromEmail}`,
        text: `From: ${fromEmail}\n\n${message}`,
      }),
    });
    if (!res.ok) {
      console.error('Resend send failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    // Never let an email-provider hiccup fail the request - the message is
    // already safely in contact_messages by the time this is called.
    console.error('Resend send threw:', err);
  }
}

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
// accountId is optional: passing one scopes the result to groups that
// apply there - account_ids = '[]' (every account) OR @> containment, same
// convention api/checklist.ts uses for checklists. Omitting it (e.g. a
// future "manage all my tag groups" surface) returns every group this user
// owns regardless of scoping, same as before this filter existed.
async function getTagGroups(sql: ReturnType<typeof db>, userId: number, accountId?: number) {
  const scoped = !!accountId && !isNaN(accountId);
  const groups = scoped
    ? await sql.unsafe(
        `SELECT * FROM tag_groups
         WHERE user_id = $1 AND (account_ids = '[]'::jsonb OR account_ids @> $2::jsonb)
         ORDER BY sort_order ASC, id ASC`,
        // Raw array, not JSON.stringify()'d - see api/checklist.ts's GET for
        // why: postgres.js double-serializes a bound value when the
        // placeholder has a ::jsonb cast, and `@>` containment against a
        // JSON *string* never matches.
        [userId, [accountId]]
      )
    : await sql.unsafe('SELECT * FROM tag_groups WHERE user_id = $1 ORDER BY sort_order ASC, id ASC', [userId]);
  const groupIds = groups.map((g: any) => g.id);
  const options = groupIds.length
    ? await sql.unsafe('SELECT * FROM tag_group_options WHERE group_id = ANY($1::int[]) ORDER BY sort_order ASC, id ASC', [groupIds])
    : [];
  return groups.map((g: any) => ({
    ...g,
    account_ids: typeof g.account_ids === 'string' ? JSON.parse(g.account_ids || '[]') : g.account_ids ?? [],
    options: options.filter((o: any) => o.group_id === g.id),
  }));
}

// Every brand-new account (password signup, or the first time someone signs
// in with a given Google account) needs at least one trading account to
// exist — the account switcher, Journal, Summary, etc. all assume there's
// something to select. This used to be handled once, globally, by a
// fresh-install migration in schema.sql (back when there was only ever one
// person's data); now that each signup gets its own isolated data, each
// signup creates its own starter account instead.
//
// It also seeds one starter Strategy Playbook, "All Trades" — an empty
// `conditions` array (the column's own DEFAULT) matches every trade with no
// filtering at all (see StrategyDialog.tsx's own "No conditions — all
// trades qualify" copy, and demoBackend.ts's `conditions.every(...)` which
// is vacuously true on an empty array — the real API's strategy-results
// query has the same behavior). Before this, a brand-new account's Summary
// page showed "No active strategies found" and an empty strategy-results
// table until the person went and manually built their first Strategy —
// which is the exact "I just see this" blank-dashboard problem reported
// against a fresh signup. `days`/`time_start`/`time_end`/`tp1_rr`/
// `account_ids` are all left at their own table defaults (every day, no
// time bounds, tp1_rr=3, every account) for the same "match everything,
// out of the box" reasoning.
async function createStarterAccount(sql: ReturnType<typeof db>, userId: number) {
  await sql.unsafe(
    `INSERT INTO accounts (name, type, sort_order, user_id) VALUES ('Default', 'Live', 0, $1)`,
    [userId]
  );
  await sql.unsafe(
    `INSERT INTO strategies (name, user_id) VALUES ('All Trades', $1)`,
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

    const geo = getRequestGeo(req);
    const existing = await sql.unsafe('SELECT * FROM users WHERE email = $1', [profile.email]);
    let user;
    if (existing.length > 0) {
      // Same email already has an account (maybe signed up with a password
      // originally) - just link this provider onto it rather than making a
      // second account, and log in as that existing row. This is a real
      // login event too, same as the password path above - bump the same
      // counters, and backfill signup geo if this account predates it.
      user = existing[0];
      await sql.unsafe(
        `UPDATE users SET oauth_provider = COALESCE(oauth_provider, $2), oauth_id = COALESCE(oauth_id, $3),
                          avatar_url = COALESCE(avatar_url, $4), name = COALESCE(name, $5),
                          login_count = login_count + 1, last_login_at = now(), last_seen_at = now(),
                          signup_country = COALESCE(signup_country, $6),
                          signup_city = COALESCE(signup_city, $7),
                          signup_ip = COALESCE(signup_ip, $8)
         WHERE id = $1`,
        [user.id, provider, profile.providerId, profile.avatarUrl, profile.name, geo.country, geo.city, geo.ip]
      );
    } else {
      const rows = await sql.unsafe(
        `INSERT INTO users (
           email, password_hash, name, oauth_provider, oauth_id, avatar_url,
           signup_country, signup_city, signup_ip, login_count, last_login_at, last_seen_at
         )
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 1, now(), now()) RETURNING *`,
        [profile.email, profile.name, provider, profile.providerId, profile.avatarUrl, geo.country, geo.city, geo.ip]
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
    if (user) {
      // This fires on every app load (AuthProvider's session-check), which
      // is exactly why it's throttled server-side via the WHERE clause
      // rather than in JS - most calls become a no-op UPDATE (matches zero
      // rows) instead of a real write, so an active user browsing for an
      // hour doesn't generate dozens of writes, but last_seen_at still
      // reflects real recency of use rather than only explicit logins.
      // Awaited (not fire-and-forget) on purpose - a serverless function can
      // be frozen the moment the response is sent, so an un-awaited write
      // here could just never actually happen. Wrapped in try/catch so a
      // failure here never fails the session check itself.
      try {
        await sql.unsafe(
          `UPDATE users SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - INTERVAL '15 minutes')`,
          [user.id]
        );
      } catch (err) {
        console.error('last_seen_at update failed:', err);
      }
    }
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
    const geo = getRequestGeo(req);
    const rows = await sql.unsafe(
      `INSERT INTO users (email, password_hash, name, signup_country, signup_city, signup_ip, login_count, last_login_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, now(), now())
       RETURNING id, email, name, created_at, plan, stripe_subscription_status, plan_current_period_end`,
      [email, passwordHash, name, geo.country, geo.city, geo.ip]
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
    // Fire-and-record: a real login event (not just a session-check) always
    // bumps login_count/last_login_at, and backfills signup_country/city/ip
    // from THIS login's geo if the account predates those columns and never
    // got one - best-effort, not meant to be a precise "where they signed up
    // from" for every pre-existing account, just better than staying NULL
    // forever.
    const geo = getRequestGeo(req);
    await sql.unsafe(
      `UPDATE users SET
         login_count = login_count + 1, last_login_at = now(), last_seen_at = now(),
         signup_country = COALESCE(signup_country, $2),
         signup_city = COALESCE(signup_city, $3),
         signup_ip = COALESCE(signup_ip, $4)
       WHERE id = $1`,
      [row.id, geo.country, geo.city, geo.ip]
    );
    res.status(200).json({
      user: {
        id: row.id, email: row.email, name: row.name, created_at: row.created_at,
        plan: row.plan, stripe_subscription_status: row.stripe_subscription_status,
        plan_current_period_end: row.plan_current_period_end,
      },
    });
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

  // Contact form is the other deliberate exception - it has to work for a
  // logged-out visitor on the public landing page, not just inside the app,
  // so it's handled here too, before requireUserId. No rate limiting on
  // this yet (same known gap as login/signup - see the security review),
  // worth revisiting if it ever gets abused since it's a public endpoint.
  if (req.method === 'POST' && req.body?.resource === 'contact') {
    const email = String(req.body.email ?? '').trim();
    const message = String(req.body.message ?? '').trim();
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }
    if (!message) { res.status(400).json({ error: 'Message is required.' }); return; }
    if (message.length > 4000) { res.status(400).json({ error: 'Message is too long.' }); return; }

    await sql.unsafe(`INSERT INTO contact_messages (email, message) VALUES ($1, $2)`, [email, message.slice(0, 4000)]);
    // Best-effort - never lets a Resend hiccup fail the request, the
    // message above is already safely stored either way.
    await sendContactEmail(email, message);
    res.status(200).json({ ok: true });
    return;
  }

  // Lead-magnet email capture - same public-before-requireUserId shape as
  // `contact` above, for the same reason: this has to work for a logged-out
  // visitor on a public marketing page (see src/pages/SessionClockTool.tsx),
  // not just inside the app. `source` records which free tool/page captured
  // the email (e.g. 'session_clock_tool') so future lead magnets can reuse
  // this same table/endpoint instead of each needing its own. Stores into
  // the new `leads` table - see the delivery's migration SQL. A repeat
  // signup from the same email+source is a silent no-op rather than a
  // duplicate row or an error, since re-submitting the same tool's form
  // twice (e.g. a page refresh) isn't a second lead.
  if (req.method === 'POST' && req.body?.resource === 'lead') {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const source = String(req.body.source ?? '').trim().slice(0, 100) || 'unknown';
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Enter a valid email address.' }); return; }

    const existing = await sql.unsafe('SELECT id FROM leads WHERE email = $1 AND source = $2', [email, source]);
    if (existing.length === 0) {
      await sql.unsafe(`INSERT INTO leads (email, source) VALUES ($1, $2)`, [email, source]);
    }
    res.status(200).json({ ok: true });
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
      // account_id is optional (see getTagGroups above) - the trade detail
      // panel passes the active account so it only sees groups that apply
      // there; omitting it would show every group regardless of scoping.
      const accountIdParam = req.query.account_id;
      const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
      res.status(200).json(await getTagGroups(sql, userId, accountId));
      return;
    }
    if (req.query.resource === 'timeframes') {
      // Not account-scoped (see the Timeframe type note in data/types.ts) -
      // every one of this user's accounts sees the same saved list.
      const rows = await sql.unsafe('SELECT * FROM timeframes WHERE user_id = $1 ORDER BY sort_order ASC, id ASC', [userId]);
      res.status(200).json(rows);
      return;
    }
    if (req.query.resource === 'admin_stats') {
      // Gated on email, not just "logged in" — this is the one place in the
      // app that shows data across every user, so a plain requireUserId()
      // check isn't enough. Returns 404, not 403, for the same reason ids
      // return 404 elsewhere in this app: no need to confirm to a
      // non-admin caller that this resource exists at all.
      const requester = await getUserFromRequest(req, sql);
      if (!requester || !isAdminEmail(requester.email)) { res.status(404).json({ error: 'Not found' }); return; }

      const [totalRows, dailyRows, feedbackRows, userRows, contactRows] = await Promise.all([
        sql.unsafe('SELECT COUNT(*)::int AS count FROM users'),
        // Signups per day, last 30 days — the simplest honest answer to
        // "how many users have registered" and "is that number growing".
        sql.unsafe(`
          SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(u.id)::int AS signups
          FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
          LEFT JOIN users u ON u.created_at::date = d.day
          GROUP BY d.day
          ORDER BY d.day ASC
        `),
        sql.unsafe(`
          SELECT f.id, f.category, f.message, f.created_at, u.email
          FROM feedback f JOIN users u ON u.id = f.user_id
          ORDER BY f.created_at DESC
          LIMIT 50
        `),
        // Per-user detail: who registered, from where (Vercel geolocation,
        // see getRequestGeo), and how often they're actually coming back
        // (login_count / last_login_at / last_seen_at - see the schema.sql
        // comment on these columns for why "session duration" isn't here:
        // that needs PostHog, not this table).
        sql.unsafe(`
          SELECT id, email, name, created_at, signup_country, signup_city,
                 login_count, last_login_at, last_seen_at
          FROM users
          ORDER BY created_at DESC
          LIMIT 200
        `),
        sql.unsafe(`SELECT id, email, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 50`),
      ]);

      res.status(200).json({
        total_users: totalRows[0]?.count ?? 0,
        daily_signups: dailyRows,
        feedback: feedbackRows,
        users: userRows,
        contact_messages: contactRows,
      });
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
    const rawAccountId = Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam;
    // account_id=all is for callers that need to know about a field
    // regardless of which single account happens to be active right now -
    // e.g. StrategyDialog's condition-field picker, since a strategy can
    // apply to a specific OTHER account (or several) than whichever one is
    // active in the switcher while you're editing it. Still scoped to this
    // user's own accounts via the join below, same as the single-account
    // case - just not narrowed to one of them.
    if (rawAccountId === 'all') {
      const rows = await sql.unsafe(
        `SELECT cc.* FROM custom_columns cc
         JOIN accounts a ON a.id = cc.account_id
         WHERE a.user_id = $1
         ORDER BY cc.account_id ASC, cc.sort_order ASC, cc.id ASC`,
        [userId]
      );
      res.status(200).json(rows);
      return;
    }
    const accountId = Number(rawAccountId);
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
    if (p.resource === 'feedback') {
      const message = String(p.message ?? '').trim();
      if (!message) { res.status(400).json({ error: 'message is required' }); return; }
      const category = p.category === 'feature_request' ? 'feature_request' : 'feedback';
      await sql.unsafe(
        `INSERT INTO feedback (user_id, category, message) VALUES ($1, $2, $3)`,
        [userId, category, message]
      );
      res.status(200).json({ ok: true });
      return;
    }
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
    if (p.resource === 'timeframes') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      // Same create-if-not-exists behaviour as `tags` above - the picker
      // calls this the moment a preset or a typed-in custom timeframe is
      // picked, so "already saved" should silently return the existing row
      // rather than erroring on the unique (user_id, lower(name)) index.
      const existing = await sql.unsafe('SELECT * FROM timeframes WHERE user_id = $1 AND lower(name) = lower($2)', [userId, name]);
      if (existing.length > 0) { res.status(200).json(existing[0]); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM timeframes WHERE user_id = $1', [userId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO timeframes (name, sort_order, user_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, nextOrder, userId]
      );
      res.status(200).json(rows[0]);
      return;
    }
    if (p.resource === 'tag_groups') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const existing = await sql.unsafe('SELECT * FROM tag_groups WHERE user_id = $1 AND lower(name) = lower($2)', [userId, name]);
      if (existing.length > 0) {
        const g = existing[0];
        res.status(200).json({ ...g, account_ids: typeof g.account_ids === 'string' ? JSON.parse(g.account_ids || '[]') : g.account_ids ?? [], options: [] });
        return;
      }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tag_groups WHERE user_id = $1', [userId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      // account_ids defaults to [] (every account, including new ones) -
      // same default strategies/checklists use - so a brand-new group keeps
      // showing up everywhere until someone deliberately restricts it via
      // the "Applies To" control.
      const rows = await sql.unsafe(
        `INSERT INTO tag_groups (name, sort_order, account_ids, user_id) VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
        [name, nextOrder, p.account_ids ?? [], userId]
      );
      res.status(200).json({ ...rows[0], account_ids: p.account_ids ?? [], options: [] });
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
    // Multi-account creation: pass account_ids (an array) instead of a
    // single account_id to provision the SAME field (identical name AND
    // col_key) on every one of those accounts in one call, mirroring how a
    // Strategy's own "Applies To" picker already works. This exists because
    // custom fields used to only ever get created one account at a time
    // (whichever account happened to be active) - a strategy meant to run
    // across several accounts, or a field a trader wants everywhere, needed
    // manually re-adding on each account separately, and it was extremely
    // easy for the name to be typed slightly differently the second time
    // (extra space, different capitalization/punctuation), silently
    // deriving a DIFFERENT col_key on that account. Since a strategy's
    // Filter Conditions and the Summary page both match a field purely by
    // its col_key string against trades.extra_data, that divergence is
    // exactly what made a condition or a summary total quietly stop picking
    // up values on some accounts but not others - not a bug in the lookup
    // itself, but a data-entry footgun this endpoint removes by deriving
    // the col_key ONCE here and reusing it for every account in the list.
    if (Array.isArray(p.account_ids)) {
      const ids = p.account_ids.map((x: any) => Number(x)).filter((x: number) => x && !isNaN(x));
      if (ids.length === 0) { res.status(400).json({ error: 'account_ids must contain at least one account id' }); return; }
      const ownRows = await sql.unsafe('SELECT id FROM accounts WHERE id = ANY($1) AND user_id = $2', [ids, userId]);
      const ownedIds = new Set(ownRows.map((r: any) => r.id));
      const results: any[] = [];
      for (const accountId of ids) {
        if (!ownedIds.has(accountId)) continue; // silently skip accounts this user doesn't own rather than 404ing the whole batch
        const existing = await sql.unsafe('SELECT * FROM custom_columns WHERE account_id = $1 AND col_key = $2', [accountId, p.col_key]);
        if (existing.length > 0) { results.push(existing[0]); continue; }
        const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM custom_columns WHERE account_id = $1', [accountId]);
        const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
        const rows = await sql.unsafe(
          `INSERT INTO custom_columns (name, col_key, data_type, sort_order, account_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [p.name, p.col_key, p.data_type ?? 'text', nextOrder, accountId]
        );
        results.push(rows[0]);
      }
      res.status(200).json({ columns: results });
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
  } else if (req.method === 'PUT') {
    if (req.query.resource === 'tag_groups') {
      // Renaming and re-scoping (Applies To) are two independent, partial
      // edits - same shape as api/checklist.ts's checklist PUT - so this
      // only touches whichever field(s) were actually sent rather than
      // defaulting a missing account_ids to '[]' and silently clearing
      // scoping every time someone just renames a group.
      const p = req.body;
      const id = Number(p.id);
      if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
      if (!(await ownsTagGroup(sql, id, userId))) { res.status(404).json({ error: 'Tag group not found' }); return; }
      if (p.name !== undefined) {
        const name = String(p.name).trim();
        if (!name) { res.status(400).json({ error: 'name is required' }); return; }
        await sql.unsafe('UPDATE tag_groups SET name = $1 WHERE id = $2 AND user_id = $3', [name, id, userId]);
      }
      if (p.account_ids !== undefined) {
        await sql.unsafe('UPDATE tag_groups SET account_ids = $1::jsonb WHERE id = $2 AND user_id = $3', [p.account_ids, id, userId]);
      }
      res.status(200).json({ id });
      return;
    }
    // Rename only - col_key is deliberately immutable once created. It's
    // the literal key strategies' Filter Conditions and every trade's
    // extra_data already reference; changing it would silently disconnect
    // every existing condition and every already-logged value from this
    // field with no way for the user to notice until numbers stopped
    // adding up. The display name has no such downstream dependency, so
    // it's free to rename any time - "I created this field with the wrong
    // label" is fixed here without touching data.
    const p = req.body;
    const id = Number(p.id);
    const name = String(p.name ?? '').trim();
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const rows = await sql.unsafe(
      `UPDATE custom_columns cc SET name = $1 FROM accounts a
       WHERE cc.id = $2 AND a.id = cc.account_id AND a.user_id = $3
       RETURNING cc.*`,
      [name, id, userId]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Custom field not found' }); return; }
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
    // RETURNING + checking the row count matters here (found while testing
    // the new rename/delete UI): without it, a delete attempt against a
    // field id that exists but belongs to a different user's account
    // silently matches zero rows yet still reports {"deleted": 1} back to
    // the caller - nothing is actually leaked or removed since the WHERE
    // clause already scopes by user_id, but the UI would show a false
    // "deleted" confirmation for a field that's still sitting there.
    const deletedRows = await sql.unsafe(
      `DELETE FROM custom_columns cc USING accounts a
       WHERE cc.id = $1 AND a.id = cc.account_id AND a.user_id = $2
       RETURNING cc.id`,
      [id, userId]
    );
    if (deletedRows.length === 0) { res.status(404).json({ error: 'Custom field not found' }); return; }
    res.status(200).json({ deleted: deletedRows.length });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
