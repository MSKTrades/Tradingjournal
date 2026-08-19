# PipEcho — multi-tenancy / data-isolation fix (apply before any real signups)

## What this fixes
Every signed-up user was reading and writing the exact same shared data. `accounts`, `trades`, `strategies`, `tags`, `tag_groups`, `custom_columns`, `checklists`, and `daily_routine_notes` had no owner column at all, and no API handler checked who was logged in before touching them. `GET /api/accounts` was a plain `SELECT * FROM accounts` — no `WHERE`, no auth check. This wasn't a subtle edge case: it meant the very first Discord signup would land in the same account/trade data as every other user, including yours, and could edit or delete it.

This is now fixed. Every table that holds personal data has a real owner, every API handler checks the logged-in session and rejects (401) or filters (404 on a foreign id) anything that isn't the caller's own, and I verified it end-to-end against a real second account, not just by reading the code — see "Verified" below.

## How to apply

**1. Run the schema migration FIRST**, against your production Neon database, before deploying the new code. Open Neon's SQL console (or `psql`) and run the entirety of `schema.sql` — it's the same idempotent full-schema file you've always run, just with a new migration block appended at the end. It's safe to run against your existing database: it adds `user_id` columns, backfills every existing row to your account (the oldest registered user), and only locks columns as `NOT NULL` once every row has a value. Read the comment block at the top of that new section in the file — it explains the backfill assumption explicitly. **If more than one real user has already signed up in production, stop and tell me before running this** — the backfill assigns every existing row to a single account, which is only correct if that account is still the only one with real data in it.

**2. Then upload the code files** via GitHub "Add files via upload," preserving folder structure:

- `api/_auth.js` (new — shared session/ownership helpers)
- `api/_db.js` (overwrite — one change: generic error messages instead of leaking raw DB errors to the client)
- `api/accounts.ts`, `api/columns.ts`, `api/strategies.ts`, `api/checklist.ts` (overwrite)
- `api/trades/index.ts`, `api/trades/[id].ts`, `api/trades/bulk-add.ts`, `api/trades/bulk-delete.ts`, `api/trades/performance.ts` (overwrite)
- `api/summary/index.ts` (overwrite)

Commit, redeploy. No new serverless functions added (`_auth.js` is a shared module, not a route) — still exactly 12.

## What actually changed

**Every account, strategy, checklist, tag, tag group, and daily-routine note now belongs to exactly one user** (`user_id` column, backfilled and enforced `NOT NULL`). Trades, custom fields, checklist items, and tag-group options don't get their own `user_id` — they're owned transitively through the account/checklist/tag-group they belong to, checked via a join at read/write time.

**Every API endpoint now requires a valid session before doing anything**, via a new shared `requireUserId()` helper — a request with no cookie, or an expired one, gets a flat 401. Beyond that, every endpoint that receives an id from the client (an account_id, a trade id, a checklist_id, a strategy id) verifies that id actually belongs to the logged-in user before reading or writing it. An id that belongs to someone else behaves exactly like an id that doesn't exist — a 404, not a 403 — so there's no way to even confirm another user's data exists by probing ids.

**New signups get their own starter "Default" account automatically** (both password signup and first-time Google sign-in) — this used to happen once, globally, for the single pre-existing install; now every new user needs their own.

**Tag names and daily-routine note dates were globally unique** (one "A+ Setup" tag for the whole app, one note per calendar date, for everyone) — now they're unique per-user, so two different traders can each have their own "A+ Setup" tag without colliding.

**Error responses no longer leak internals.** A failed request used to return the raw database error message (`err.message`) straight to the client — could include table/column names or query fragments. Now the client gets a generic message and the real error is still logged server-side for you to debug from Vercel's logs.

## Verified before sending — not just read, actually run
I stood up a local copy of the schema and API, ran the migration against it, then drove the real HTTP endpoints with two separate logged-in users (one your existing `bugtest@example.com` account with real trade/strategy/checklist data, one a brand-new signup) and confirmed:

- The new signup landed with only their own starter account — none of the existing account's trades, strategies, or tags were visible to them.
- The new user's attempt to `PUT` (rename) and `DELETE` the existing user's account by id both returned 404, and the existing account's data was confirmed untouched afterward.
- A request with no session cookie at all got 401 on `/api/accounts`.
- Both users creating a tag with the identical name ("A+ Setup") succeeded independently — confirms the per-user uniqueness fix works, not just the isolation.
- Custom fields, checklists, and daily-routine notes all round-tripped correctly for the existing account after the migration — same data, same behavior, no regression.
- Full app smoke test (logged in as your existing account, dark mode, Summary/Journal/Strategies pages) — real trade data, real strategies, all rendering exactly as before. `tsc --noEmit` and `npm run build` both clean.

## What this does NOT cover (deliberately, not silently)
`api/backtest.ts` and the `chart_datasets`/`backtest_trades` tables were left untouched — Chart Replay & Backtesting is already disabled in the UI (the nav tab and route both show "Coming soon"), so there's no live user-facing surface pointing at it. It'll need the same ownership treatment before it ships, whenever that is — flagging it now so it doesn't get missed later, not because it's fine to skip.

The wildcard CORS header (`Access-Control-Allow-Origin: *`) is still there. It's lower-risk now than before this fix, since every data endpoint requires a valid session and browsers already block credentialed cross-origin requests against a wildcard origin — but tightening it to your real domain is still worth doing as a later polish pass.

A 401 from an expired session currently just surfaces as an error message in the UI rather than redirecting to `/login` automatically — minor UX gap, not a security one, worth a follow-up.
