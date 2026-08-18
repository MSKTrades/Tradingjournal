# ForexForge — Gross/Commission/Net Profit drives RR Achieved, partials become optional

## What changed

**Result section, new order:** Result → Gross Profit/Loss ($) → Commissions ($) → Net Profit ($, auto) → RR Achieved (auto) → Partial 1/2 (now hidden behind a toggle) → Max RR Reached → TP Levels Hit.

You type the actual dollar result off your broker statement — Gross Profit/Loss and Commissions — and everything else fills itself in:

- **Net Profit ($)** = Gross − Commissions, shown live, colored green/red.
- **RR Achieved** = Net Profit ÷ your dollar risk on that trade (this trade's start capital × Position Size %, the same number the Position Size calculator already shows you as "Risking $X"). Needs Position Size % filled in above to compute — if it's empty, Net Profit and Result still update, RR Achieved just waits for you to fill it in (or type it directly).
- **Result** (Profit/Loss/Breakeven) sets itself from Net Profit's sign. You can still change it by hand — just know it'll re-follow the $ math if you edit Gross/Commission again afterward.

**Partials, tucked away:** Partial 1 (RR) and Partial 2 (RR) are hidden by default behind a small "I exited in partials" toggle — most trades are a single clean exit, so the default view is just the four $ fields. Flip that toggle on for a trade where you scaled out at two RR levels, and once both are filled in, their average **overrides** RR Achieved (and Result follows that instead) — since that's a more precise, price-based fact than the blended $ number. Reopening a trade that already has a partial filled in turns the toggle on automatically so nothing's hidden.

You can still always just type RR Achieved directly, no matter which path you used to get there — any manual edit sticks until you change one of the underlying inputs again.

## A real bug this surfaced, and how I handled it

While wiring RR Achieved into the app's actual Gain/Loss $ math, I found that **every trade marked "Loss" has always been counted as a flat -1×risk, completely ignoring whatever RR Achieved was typed in for it.** So a trade you closed early at -0.6R, or one that slipped past your stop to -1.4R, has always shown up in your Performance/Summary/Journal $ stats as exactly -1R — the number you actually entered was saved but silently unused.

I fixed that (you approved this) — a Loss now uses its real RR the same way a Profit does. But I checked your actual trade data before shipping this and found something important: **existing Loss trades that do have an RR value saved have it stored as a plain positive number** (e.g. "1.5" meaning "I lost 1.5R," not "-1.5") — because there was never a reason to think about the sign before, since it was ignored either way. If I'd used that stored number's sign directly, a lot of old Loss trades with RR > 1 would have flipped to showing a *bigger dollar loss* than before (e.g. RR=3 on a loss now means -3× your risk instead of the old flat -1×) — a real, if arguably more accurate, change to historical numbers.

To keep this safe regardless of which convention a given row was entered under, the fix takes the **magnitude** of whatever RR is stored on a Loss trade and always applies it as a loss (`-Math.abs(...)`), rather than trusting the stored sign. This works correctly both for old rows (unsigned magnitude) and new ones going forward (properly signed, from this feature). A Loss trade that's never had an RR value at all still falls back to the old flat -1× behavior exactly as before.

**Bottom line: this will change the displayed $ amount on any existing Loss trade that already has an RR Achieved value other than exactly 1** — the new number reflects your real entered RR instead of a flat -1R. If you'd rather review that before it applies, let me know and I can hold this specific piece back; everything else in this delivery (the new fields, the toggle, Net Profit) works independently of it.

## Files changed

```
trading-journal-standalone/
├── schema.sql                     (adds gross_profit, commission, net_profit columns to trades)
├── api/_db.js                     (the Loss-formula fix described above)
├── api/trades/index.ts            (saves the 3 new fields; net_profit computed server-side)
├── api/trades/[id].ts             (same, for edits)
├── src/pages/data/types.ts        (Trade type gains the 3 new fields)
└── src/pages/ui/TradeDetailPanel.tsx  (the whole new Result section + auto-calc logic)
```

## Apply

GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving every folder path above — 6 files, including the two nested `api/trades/` ones and `api/_db.js`.

**Given what happened last time:** after uploading, go check the **Deployments** tab in Vercel yourself and confirm a *new* deployment appears automatically within a minute of the push — don't rely on clicking "Redeploy" on an existing card, since (as we found) that just rebuilds whatever commit that card already has, not your newest one.

## Re-run schema.sql in Neon

One new set of columns, safe to re-run — paste the whole file into Neon's SQL editor:

```sql
ALTER TABLE trades ADD COLUMN IF NOT EXISTS gross_profit NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS commission NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS net_profit NUMERIC;
```

## How to confirm it landed

1. Open any trade, fill in Position Size %, then Gross Profit/Loss and Commissions — Net Profit and RR Achieved should update live, and Result should flip to Profit/Loss/Breakeven on its own.
2. Toggle "I exited in partials," fill both Partial 1 and Partial 2 — RR Achieved should switch to their average, overriding the $-derived number.
3. Save the trade, then check Performance/Summary — the Gain/Loss $ shown should now match Net Profit for that trade (previously a Loss's $ impact was always a flat -1× risk regardless of RR).

## Verified

Traced the app's actual money-calculation code (`recalcAccountCapital`) before touching it, confirmed exactly how it derives Gain/Loss $ today, and checked it against real trade data rather than assuming. Ran the schema migration against a fresh database twice (idempotent) and against your existing test data. Built the app clean (`tsc` + `vite build`). Logged into the running app with Playwright and drove the actual flow: filled Position Size 5%, Gross Profit -$80, Commission $5 → confirmed Net Profit read -$85, RR Achieved read -1.7, Result auto-set to Loss; toggled partials on, entered 2 and 4 → confirmed RR Achieved switched to 3 and Result flipped to Profit; saved the trade and queried the database directly, confirming gross_profit=-80, commission=5, net_profit=-85, rr=-1.7, profit_loss='Loss', and — critically — gain_loss=-85 (matching net_profit exactly), confirming the full chain from typed $ figures through to the account's actual running balance is consistent end-to-end.
