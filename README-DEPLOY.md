# ForexForge — More stats on the Journal top bar

One file changed: `src/pages/Journal.tsx`.

## What changed

The stat row at the top of the Journal page (Total Trades, Win Rate, Profit Factor) now has these added, in this order:

1. **Total Wins** / **Total Losses** / **Total Break Even** — raw counts, colored green/red/muted the same way the rest of the app colors outcomes.
2. **Starting Capital** — the account's starting balance.
3. **Current Capital** — the account's live running balance (starting balance plus every trade's P/L so far, same math the Performance page's drawdown chart and the Position Size Calculator already use), colored green if you're up overall and red if you're down.
4. **Total P/L** — the account's total profit/loss so far, in dollars and percent (Current Capital minus Starting Capital), colored the same way.
5. **Max Loss Race** — how much of your account's Max Drawdown Limit % (set on the account when you created or edited it) you've used up so far, as a progress bar plus the dollar figures — the same "race against the limit" idea as the Risk Guardrail widget on the Summary page, just surfaced here too since this is where you're actually reviewing trades. Only shows up if that account has a Max Drawdown Limit % set — if you haven't set one, this card just doesn't appear (same as Risk Guardrail).

(An earlier version of this delivery had a "Position Size %" card showing your highest/lowest position size used — swapped out for Total P/L per your last message, since with most accounts sizing a fixed % per trade that card just showed the same number twice and wasn't useful. The Wins/Losses donut chart that used to sit next to Profit Factor has also been removed per your request — its numbers are already covered by the Total Wins/Losses/Break Even cards and the Win Rate card's "W/L/BE" breakdown, so nothing is lost.)

One behavior worth knowing: Total Trades and Total Wins/Losses/Break Even reflect whatever the filter bar above them is currently set to (Assets/Side/Outcome/Tags/Day/date range) — same as Win Rate and Profit Factor already did. Starting Capital, Current Capital, Total P/L, and Max Loss Race always reflect the whole account, regardless of filters, since a partial/filtered view of your trades wouldn't give you a real balance or P/L number.

## Apply the file

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/src/pages/`, overwriting the existing `Journal.tsx`.

No schema changes, no environment variables, no other files touched.

## Verified

Checked in a real browser with mock data (a 3-trade account, $15,000 starting balance, 10% Max Drawdown Limit): Total Wins/Losses/Break Even counted correctly, Starting Capital showed $15,000, Current Capital showed $21,422 in green, and Total P/L showed +$6,422 (+42.81%) in green — matching Current minus Starting Capital exactly. Max Loss Race showed 0% used since this run had no live drawdown below peak. Also checked light and dark mode — same layout, correct contrast.
