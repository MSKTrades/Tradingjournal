# ForexForge — found the real Strategy bug + Checklist account scoping

## The actual root cause of "Applies To" not showing up

Your screenshot was the key: strategies scoped to a specific account were saving correctly in the database (the `account_ids` column really did hold `[2]` etc.) but **never appeared on any account's Summary page — not even the one they were scoped to.** That's a different, more specific bug than a stale deployment, and I found it: `api/summary/index.ts` was building the account filter like this:

```js
[JSON.stringify([accountId])]
```

`sql.unsafe(...)` already serializes values bound to a `::jsonb`-cast placeholder — so wrapping the array in `JSON.stringify()` first serialized it a *second* time. Instead of sending the JSON array `[2]`, it sent the JSON *string* `"[2]"` (the six characters `[`, `2`, `]` quoted as text). Postgres's `@>` containment check against a string never matches an array, so **every account-scoped strategy silently vanished from every account's Summary page**, no matter which account you'd scoped it to. Unscoped ("All Accounts") strategies were unaffected, which is exactly why some strategies worked fine and others just disappeared.

The exact same bug was sitting in the new Checklist-scoping code I was about to ship you — caught and fixed before it ever reached you, so you never saw that one. I checked every other place in the codebase that binds a value to a `::jsonb` placeholder, and these were the only two.

**Bottom line: your earlier "select an account, hit Save, doesn't stick" report was two things layered together** — a save/reload issue that the visible-error-banner fix from before addresses, and this Summary-page display bug that made even a successfully-saved scope look broken. Both are now fixed.

## New: Checklists can now be scoped to specific accounts too

Same "Applies To" picker as Strategies, right on each checklist card:

- **All Accounts** (default) — shows up everywhere, including new accounts.
- Pick one or more specific accounts — the checklist only shows up in that account's grading picker (on the trade screen) and in that account's Checklist Compliance stats on the Summary page.
- Renaming a checklist doesn't touch its scoping, and vice versa — each saves independently the moment you click it, no separate Save button.

## Files changed

```
trading-journal-standalone/
├── schema.sql                     (checklists gets an account_ids column, same shape as strategies)
├── api/checklist.ts               (checklist list now filters by account when asked; scoping is saved/read)
├── api/summary/index.ts           (THE FIX — removed the double JSON-encoding that hid scoped strategies)
├── src/pages/data/types.ts        (Checklist type gains account_ids)
├── src/pages/Checklists.tsx       (new "Applies To" pills on every checklist card)
├── src/pages/Journal.tsx          (trade-grading checklist picker now scoped to the active account)
├── src/pages/StrategyDetail.tsx   (same scoping applied here too, for consistency)
└── src/pages/Summary.tsx          (Checklist Compliance widget now scoped to the active account)
```

## Apply

GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving every folder path above — **all 8 files this time**, including the two nested ones (`api/summary/index.ts` and `src/pages/data/types.ts`) since it's easy to only grab the top-level ones by accident.

## Re-run schema.sql in Neon

One new column, safe to re-run:

```sql
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
```

## Redeploy on Vercel

Same as always — no new function added, still under the 12-function cap.

## How to confirm both fixes actually landed

1. Go to Strategies, open the strategy you scoped to a specific account earlier (or scope one now), Save, then go to **Summary** on that same account. It should now show up in the strategy performance table instead of "No active strategies found."
2. Go to Checklists, pick a specific account on any checklist's "Applies To" row, then switch to a *different* account in the sidebar and confirm that checklist no longer shows up in that account's grading picker or Checklist Compliance section — switch back and confirm it's still there.

## Verified

Reproduced the exact bug against a real Postgres database before fixing it (confirmed `$1::jsonb` was arriving as the string `"[2]"` instead of the array `[2]`), then confirmed the fix with the same query returning the correct rows. Re-tested the whole flow end-to-end afterward: scoped a checklist to one account, confirmed it disappeared from a different account's fetch and stayed visible on its own; renamed it and confirmed the scoping wasn't wiped by the rename; and confirmed the Strategy summary bug fix the same way, checking the account it was scoped to now actually shows it.
