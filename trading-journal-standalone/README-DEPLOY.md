# Fix: Filter Conditions showing your own fields to every user

## What was wrong

The Strategies -> "Filter Conditions" dropdown had three of your own
original trading fields — **CISD Break**, **Inverse Candle Size**, and
**Distance from Asia H/L** — hardcoded into the list every single account
sees, including brand-new signups who've never touched them. They were
built into the app from before "custom columns" existed, and stayed in a
global list that every account shared, instead of being scoped to the
account that actually uses them.

Nothing was leaking anyone's actual data — a new user's values for those
fields are just empty (they've never filled them in) — but it's confusing
noise: showing filter options for concepts that mean nothing to that user
and will never have data behind them.

## What changed

Two files, both self-contained, no database change needed:

- **`src/pages/data/types.ts`** — removed those three fields from the
  global `CONDITION_FIELDS` list (which is shared by every account) and
  removed the now-unnecessary de-dupe logic that existed only to stop them
  from appearing twice.
- **`src/pages/ui/StrategyDialog.tsx`** — small follow-on change so the
  dropdown still shows those three fields, but now exactly the same way
  every other custom field already works: only for an account that
  actually has that field defined (your own accounts already do, from the
  migration that ran when custom columns were introduced — nothing to redo
  there).

Your own strategies and any of your existing saved filter conditions using
those fields are unaffected — same fields, same values, same behavior.
Only the dropdown's *availability* changed: it now reflects what an
account has actually used, the same way every other custom field already
did.

## How this was tested

Ran locally against a real Postgres database with two accounts: one with a
seeded custom column matching your real setup (so it has a `CISD Break`
condition field available, same as production), and one plain new signup
with nothing custom defined. Confirmed via the actual UI (not just reading
the code) that the first account's Filter Conditions dropdown includes
CISD Break and the second account's does not — everything else in the
list (Risk:Reward, Entry Price, Gain/Loss, etc.) is unchanged and present
for both, since those really are generic to every trade.

## Deploy

Copy these two files over the matching paths in your repo (GitHub's "Add
files via upload," same as before) and redeploy:

```
src/pages/data/types.ts
src/pages/ui/StrategyDialog.tsx
```

No database migration, no environment variable changes, no new
dependency — this is a pure frontend fix.
