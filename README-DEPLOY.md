# ForexForge — More stats on the Journal top bar

One file changed: `src/pages/Journal.tsx`.

## What changed

The stat row at the top of the Journal page (Total Trades, Win Rate, Profit Factor, the Wins/Losses pie) now has these added, in this order:

1. **Total Wins** / **Total Losses** / **Total Break Even** — raw counts, colored green/red/muted the same way the rest of the app colors outcomes.
2. **Starting Capital** — the account's starting balance.
3. **Current Capital** — the account's live running balance (starting balance plus every trade's P/L so far, same math the Performance page's drawdown chart and the Position Size Calculator already use), colored green if you're up overall and red if you're down.
4. **Position Size %** — the highest and lowest "Position Size (% of capital)" you've actually used, so you can see at a glance if your sizing has been consistent or all over the place.
5. **Max Loss Race** — how much of your account's Max Drawdown Limit % (set on the account when you created or edited it) you've used up so far, as a progress bar plus the dollar figures — the same "race against the limit" idea as the Risk Guardrail widget on the Summary page, just surfaced here too since this is where you're actually reviewing trades. Only shows up if that account has a Max Drawdown Limit % set — if you haven't set one, this card just doesn't appear (same as Risk Guardrail).

One behavior worth knowing: Total Trades, Total Wins/Losses/Break Even, and Position Size % all reflect whatever the filter bar above them is currently set to (Assets/Side/Outcome/Tags/Day/date range) — same as Win Rate and Profit Factor already did. Starting Capital, Current Capital, and Max Loss Race always reflect the whole account, regardless of filters, since a partial/filtered view of your trades wouldn't give you a real balance or drawdown number.

## Apply the file

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/src/pages/`, overwriting the existing `Journal.tsx`.

No schema changes, no environment variables, no other files touched.

## Verified

Checked in a real browser with mock data (a 3-trade account, $10,000 starting balance, a 10% Max Drawdown Limit): Total Wins/Losses/Break Even counted correctly, Starting Capital showed $10,000, Current Capital showed $9,950 in red (net down $50), Position Size % showed ▲1.00% / ▼0.25% matching the highest/lowest sized trades, and Max Loss Race showed "$200 of $1,000 (10.0% max)" at 20% used with a green bar — all matching the underlying numbers by hand. Also checked dark mode — same layout, correct contrast.
