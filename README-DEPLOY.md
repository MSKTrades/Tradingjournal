# ForexForge — Custom Fields are now per-account

Six files changed:

```
trading-journal-standalone/
├── schema.sql                          (changed — custom_columns scoped to an account)
├── api/columns.ts                      (changed — filters/saves by account_id)
├── src/pages/data/types.ts             (changed — CustomColumn now carries account_id)
├── src/pages/Journal.tsx               (changed — fetches/creates columns for the active account)
├── src/pages/StrategyDetail.tsx        (changed — same, for trades opened from Strategies)
└── src/pages/ui/StrategyDialog.tsx     (changed — strategy condition fields scoped the same way)
```

## What changed

Custom fields (CISD Break, Total Inverse Candles, SL Pips, and anything else you've added under "Custom Fields") used to be global — every account showed the exact same list, whether it actually used those fields or not. That's why your brand-new test account was showing all seven SMC fields from your main account.

Now each account has its own set of custom fields:

- A **new account starts with none** — the Custom Fields section is blank until you add your own with "+ Add your own field".
- A field you add on one account **only shows up on that account** going forward.
- Your **existing accounts keep every custom field they already use**, untouched — nothing was deleted, and no trade data was touched.

## 1. Apply the files

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving the folder paths above — this overwrites the six files listed.

## 2. Re-run schema.sql in Neon — this one matters more than usual

Open your Neon SQL editor and run the full `schema.sql` again. It's still safe and idempotent (nothing here touches your trades or their data), but this update includes a one-time migration that needs to actually run once to sort your existing custom fields onto the right accounts:

- It adds an `account_id` column to `custom_columns`.
- For every custom field that used to be global, it looks at which of your accounts actually have a trade using that field (i.e. a trade whose data includes a value for it) and gives just those accounts their own copy of the field.
- Any account with zero trades using a given field — like the new one you just created — gets none of them.
- If a custom field was defined but genuinely never used on any trade anywhere, it's dropped (nothing was relying on it, since no trade data references it).

Practically: your main account should end up with the same custom fields it has today, and your new test account's Custom Fields section will be empty until you add fields to it yourself.

**Do this before redeploying** — the app expects `custom_columns` rows to have an `account_id` once this version's frontend/API code is live.

## 3. Environment variables

None needed.

## 4. Redeploy on Vercel

Trigger a redeploy the same way as before (auto-deploy on push, or manually from the Vercel dashboard).

## 5. Double-check after deploying

- Open your main account → Journal → any trade → Custom Fields — you should still see CISD Break, Total Inverse Candles, etc. with their existing values intact.
- Switch to your new test account → open a trade → Custom Fields should be empty, with just "+ Add your own field".
- Add a field on the test account, confirm it does **not** appear back on your main account.

## A heads-up on Strategies

Strategy condition fields (the dropdown when you're setting up a filter like "CISD Break ≤ 8") also pull from custom fields, so that dropdown now shows whichever account is currently active in the account switcher, instead of always showing every custom field from every account. If you build a strategy that references a custom field, make sure you're on the right account in the switcher first.
