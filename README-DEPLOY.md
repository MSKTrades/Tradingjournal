# ForexForge — Risk Guardrail, Drawdown Chart & Position Size Calculator

This delivery adds three things you asked for:

1. **Daily loss / max drawdown guardrail** — a widget on the Summary page that shows how close you are to a prop-firm-style daily loss limit and overall max drawdown limit, per account.
2. **Drawdown chart** — a new card on the Performance page showing your equity's distance below its running peak over time, plus max/current drawdown figures.
3. **Position Size Calculator** — right on the Journal trade form. Enter SL Distance (pips) and Position Size (% of capital) and it tells you the suggested lot size and dollar risk, using the account's *live* current balance.

Everything here is entirely client-side except one small addition to the existing accounts API — no new serverless functions were added, so you're still safely under Vercel's 12-function cap on the Hobby plan.

## 1. Apply the files

Same process as before: use GitHub's "Add files via upload" (or drag-and-drop in the GitHub web UI) into your `MSKTrades/Tradingjournal` repo, inside the `trading-journal-standalone` folder, preserving the folder structure below. This will overwrite the existing versions of these files.

Files in this delivery:

```
trading-journal-standalone/
├── schema.sql                          (changed — 2 new columns on accounts)
├── api/accounts.ts                     (changed — new columns supported)
├── src/lib/accounts.tsx                (changed — new fields on payload types)
├── src/pages/data/types.ts             (changed — Account type updated)
├── src/pages/data/risk.ts              (NEW — drawdown & position-size math)
├── src/pages/ui/AccountDialog.tsx      (changed — new Daily/Max Drawdown % inputs)
├── src/pages/ui/RiskGuardrail.tsx      (NEW — the Summary page guardrail widget)
├── src/pages/Summary.tsx               (changed — renders RiskGuardrail)
├── src/pages/Performance.tsx           (changed — renders the Drawdown chart)
├── src/pages/ui/TradeDetailPanel.tsx   (changed — SL pips field + calculator)
├── src/pages/Journal.tsx               (changed — passes trades to the panel)
└── src/pages/StrategyDetail.tsx        (changed — same, for trades opened from Strategies)
```

Note: this delivery does **not** touch the Google/Facebook login files from last time — that round is already live and untouched here.

## 2. Re-run schema.sql in Neon

Two new nullable columns were added to `accounts`:

```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS daily_loss_limit_pct NUMERIC;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS max_drawdown_limit_pct NUMERIC;
```

Open your Neon SQL editor and run the full `schema.sql` again (it's all `IF NOT EXISTS` / idempotent, so it's safe to re-run against your existing database — it won't touch your trade data).

## 3. Environment variables

None needed. This round doesn't touch auth, OAuth, or any secrets.

## 4. Redeploy on Vercel

Once the files are pushed and the schema is updated, trigger a redeploy the same way as before (Vercel should auto-deploy on push if it's connected to the repo; otherwise redeploy manually from the Vercel dashboard).

## 5. How to use it

**Set risk limits on an account:** go to the account switcher → Edit Account (the account you're using for your funding challenge). You'll see two new optional fields — "Daily Loss Limit %" and "Max Drawdown Limit %". For an FTMO-style challenge that's typically 5% and 10%. Leave either blank if you don't want to track it — the guardrail widget only shows up on Summary once at least one of these is set, and only for accounts that have it set.

**Position sizer:** open any trade (new or existing) in the Journal, fill in "SL Distance (pips)" (in the Stop Loss / Take Profit section) and "Position Size (% of capital)" (in the Result section), and a small card appears showing suggested lot size, unit size, and dollar risk. It uses your account's live running balance (starting balance plus every trade recorded so far), not just the static starting balance — so the sizing tracks where you actually stand today.

One honest caveat on the pip-value math: it's exact for any pair quoted in USD (EURUSD, GBPUSD, etc.) and for USDJPY. For any other pair (crosses like GBPJPY, EURGBP, or gold/crypto tickers) it falls back to the standard $10/pip-per-standard-lot approximation, since getting it exactly right for those would need a second live exchange rate this app doesn't currently fetch. The calculator flags this with an "Approximate" note whenever it applies, so you always know when to double-check with your broker's own calculator before sizing a real trade.

## A correction from the earlier competitive-brief notes

I'd flagged "calendar heatmap of daily P&L" as something FX Replay/TradeZella have that ForexForge was missing. Looking at the actual code more closely, ForexForge already has this — it's the **Calendar** tab on the Performance page (daily P&L grid with color coding and weekly totals), alongside a separate **Heatmap** tab (monthly % returns by year). So no new work was needed there — that one was already covered.

Still on the table from that brief, if you want them next: MAE/MFE excursion analysis and Monte Carlo resampling on your backtest trades. Just say the word.
