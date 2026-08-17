# ForexForge — Risk Guardrail moved + Strategies scoped per account

Seven files changed:

```
trading-journal-standalone/
├── schema.sql                          (changed — strategies get an account_ids column)
├── api/strategies.ts                   (changed — reads/saves account_ids)
├── api/summary/index.ts                (changed — filters strategies by account_ids)
├── src/pages/data/types.ts             (changed — Strategy now carries account_ids)
├── src/pages/Summary.tsx               (changed — Risk Guardrail moved below the strategy table)
├── src/pages/Strategies.tsx            (changed — shows which accounts each strategy applies to)
└── src/pages/ui/StrategyDialog.tsx     (changed — new "Applies To" picker)
```

## What changed

**1. Risk Guardrail moved.** On the Summary page, the Risk Guardrail widget (Daily Loss / Max Drawdown bars) used to sit at the very top, above Trading Sessions and the strategy performance summary. It now sits right below the strategy summary table (or the "no active strategies" message when there isn't one yet), just above Market Sentiment.

**2. Strategies can now be scoped to specific accounts.** This is the fix for strategies "coming across" into a brand-new account. Every strategy (edit it from the Strategies page) now has an **Applies To** picker: "All Accounts" (the default — behaves exactly like today, counted everywhere including new accounts) or one or more specific accounts. Restrict a strategy to just the account(s) it was actually built for, and it stops being evaluated against every other account — including new ones you create later.

Nothing changes automatically for strategies you already have: every existing strategy defaults to "All Accounts" (same as today), so nothing disappears on its own. You decide which strategies to restrict, and to which accounts, from the Strategies page whenever you're ready.

The Strategies page itself now shows an "Applies To" badge on every strategy card so you can see its scope at a glance without opening the editor.

## 1. Apply the files

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving the folder paths above — this overwrites the seven files listed.

## 2. Re-run schema.sql in Neon

One new column, safe and idempotent to add:

```sql
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
```

Open your Neon SQL editor and run the full `schema.sql` again. Every existing strategy gets `[]` (All Accounts) automatically — nothing about your current strategy results changes until you deliberately restrict one.

## 3. Environment variables

None needed.

## 4. Redeploy on Vercel

Trigger a redeploy the same way as before.

## 5. How to use it

Go to **Strategies**, click the pencil on any strategy, and look for the new **Applies To** section (right below Days Traded). Click a specific account to restrict the strategy to just that one (click more than one if it should apply to a few but not all); click **All Accounts** any time to lift the restriction again.

## Verified

Checked in a real browser with two mock accounts and two mock strategies (one left at "All Accounts", one restricted to just "Main Account"): the Strategies page correctly showed "All accounts" and "Main Account" badges on the respective cards, and the edit dialog's Applies To picker correctly highlighted the right pill(s) and updated its helper text live. Also confirmed the Summary page now renders Risk Guardrail after the strategy summary section (both when a strategy table is present and when the "no active strategies" empty state shows instead), right before Market Sentiment.
