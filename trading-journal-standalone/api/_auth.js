import { jwtVerify, SignJWT } from 'jose';

// Shared session/auth helpers, used by every handler that needs to know who
// is making the request — not just columns.ts (where this logic used to
// live, private to that one file). Pulling it out here is what lets
// accounts.ts, trades/*, strategies.ts, and checklist.ts all check
// "who is this?" and "do they actually own the thing they're asking for?"
// without copy-pasting JWT verification into every file.
const SESSION_COOKIE = 'ff_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return new TextEncoder().encode(secret);
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function sessionCookie(token) {
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

export async function createSessionToken(userId, email) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function getUserFromRequest(req, sql) {
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

// Returns the numeric user id for the logged-in request, or writes a 401 and
// returns null. This is the actual access-control gate: every endpoint that
// touches personal data (accounts, trades, strategies, checklists, tags,
// custom fields) MUST call this first and bail out (`if (!userId) return;`)
// on null. Without this, an endpoint might still *work* for a logged-in
// user, but there's nothing stopping a logged-out (or different-account)
// request from reaching the same data — which is exactly the gap this fixes.
export async function requireUserId(req, res, sql) {
  const user = await getUserFromRequest(req, sql);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user.id;
}

// Confirms `accountId` is actually owned by `userId`. Every endpoint that
// receives an account_id from the client (trades, custom fields, summary,
// performance) must check this before reading/writing anything scoped to
// that account — account_id is just a number in a request body/query string,
// so without this check any logged-in user could read or modify ANY
// account by guessing/incrementing its id, not just their own.
export async function ownsAccount(sql, accountId, userId) {
  if (!accountId || !userId) return false;
  const rows = await sql.unsafe('SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
  return rows.length > 0;
}

// Same idea as ownsAccount, for checklist_id (checklist_items, and any trade
// grading against a checklist_id).
export async function ownsChecklist(sql, checklistId, userId) {
  if (!checklistId || !userId) return false;
  const rows = await sql.unsafe('SELECT 1 FROM checklists WHERE id = $1 AND user_id = $2', [checklistId, userId]);
  return rows.length > 0;
}

// Same idea, for tag_groups.id (tag_group_options belong to a group, not
// directly to a user).
export async function ownsTagGroup(sql, groupId, userId) {
  if (!groupId || !userId) return false;
  const rows = await sql.unsafe('SELECT 1 FROM tag_groups WHERE id = $1 AND user_id = $2', [groupId, userId]);
  return rows.length > 0;
}
