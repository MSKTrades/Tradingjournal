# ForexForge — re-fix: Strategy "Applies To" still not saving

Your Neon screenshot confirms the `account_ids` column exists on `strategies` and every row is stuck at `[]` — and the dialog reverts to "All Accounts" even for a brand new strategy. That combination (column exists, but a save into it never sticks, and no error appears) points at one specific thing: **the version of `api/strategies.ts` actually live on your Vercel deployment doesn't have the account-scoping code in it.** The version in front of you locally looks right, but the file that runs on the server is the one that was uploaded to GitHub — and it's easy for one file to get missed when several were uploaded together in the very first "Risk Guardrail + Strategy scoping" batch.

## Quick way to confirm this before doing anything else

Open this file directly on GitHub:
`https://github.com/MSKTrades/Tradingjournal/blob/main/trading-journal-standalone/api/strategies.ts`

Press Ctrl+F (or Cmd+F) and search for `account_ids`. If it's **not** there, that's the whole bug — the server has never known this column exists, so every save just leaves it at its default. If it **is** there already, tell me and we'll look somewhere else (most likely a stale Vercel deployment that needs a manual redeploy).

## What's in this delivery

Only 3 files this time — no schema changes needed, the column is already there:

```
trading-journal-standalone/
├── api/strategies.ts                   (the file that actually saves account_ids — most likely the missing piece)
├── src/pages/ui/StrategyDialog.tsx     (re-sent for safety, includes the save-error banner from last time)
└── src/pages/Strategies.tsx            (re-sent for safety, unchanged logic)
```

## Apply

1. On GitHub, go into `MSKTrades/Tradingjournal` → `trading-journal-standalone/api/` → open `strategies.ts` → click the pencil (edit) icon → select all, delete, paste in the new content → commit directly to `main`.
2. Do the same for `src/pages/ui/StrategyDialog.tsx` and `src/pages/Strategies.tsx`.
3. No `schema.sql` step this time.
4. Go to your Vercel dashboard → the project → **Deployments** and confirm a new deployment kicks off automatically after the GitHub commits (it should, if GitHub is connected). If nothing starts within a minute or two, click the "..." on the latest deployment and **Redeploy** manually.

## How to know it's actually fixed

Once the new deployment is live: open Strategies, edit any strategy, click a specific account under "Applies To", hit **Save Strategy**, then **refresh the whole page** (not just reopen the dialog) and check that account again. If it's still checked after a hard refresh, it's fixed. If it reverts again, or if you now see a red error message in the dialog when you save, send me a screenshot of that error — it'll tell us exactly what's failing server-side.
