# Fix: "just one candle visible" on /tv-chart-test

You flagged this twice, so I stopped treating it as a cosmetic footnote and
actually dug in. Good news: it wasn't zoom, and it wasn't cosmetic — it was a
real bug in the datafeed, and it's now fixed and verified.

## What was actually wrong

Every timestamp in PipEcho (`Candle.time`, everything `resample.ts` and
`ReplayChart.tsx` touch) is Unix **seconds**. The Advanced Charts widget's
`getBars`/`subscribeBars` request parameters (`periodParams.from`/`.to`) are
*also* seconds — so that part lined up fine. But the `Bar` objects a datafeed
hands **back** to the widget are documented to need Unix **milliseconds** —
the one place in the whole interface where the unit changes. `tvDatafeed.ts`
was passing `candle.time` straight through unconverted.

The effect: candles a real minute apart were being placed about 1
*millisecond* apart on the widget's internal timeline instead of 60,000ms
apart. 500 revealed candles ended up squeezed into roughly half a second of
chart-time — at any normal zoom level that's indistinguishable from a single
bar, which is exactly what you were seeing, and exactly why the price kept
changing (the data was correct) while the shape never did (the positions
weren't).

I'd actually shipped a different fix first — forcing the chart's visible
range explicitly via `setVisibleRange()`, on the theory that the widget's
default zoom (which assumes a live symbol trading up to real wall-clock "now")
was the problem. That code is still in here because it's a real, separate
improvement (see below), but re-testing after applying it showed the exact
same single-blob symptom — which is what proved the actual bug was in the
bar timestamps, not the zoom. Worth being upfront about since it means this
delivery fixes two things, not one.

## The two changes in this delivery

1. **`tvDatafeed.ts`** — the real fix. Added a `toBar()` helper that converts
   a resampled candle's `time` to milliseconds only at the point it's handed
   to the widget (both in `getBars`'s return and `subscribeBars`'s `onTick`
   push). Everything else in the file — filtering by `periodParams.from/to`,
   the resample cache, `notifyReveal` — stays in seconds, matching the rest
   of the codebase. No other logic changed.
2. **`TradingViewChart.tsx`** — a secondary, genuinely worthwhile fix.
   Explicitly fits the visible range to the last ~200 revealed candles once
   the chart's actual data has loaded (via `activeChart().onDataLoaded()`,
   not immediately in `onChartReady` — the first attempt at this fired too
   early and got silently overwritten once real data arrived). Without this,
   a freshly-loaded replay defaults to a zoom level anchored near real
   wall-clock "now" (since the symbol's marked `data_status: 'streaming'`),
   which has nothing to do with where a historical replay sits. This isn't
   what caused "one candle," but it's what makes the initial view land on
   something sensible instead of an arbitrary default.

## How this was verified

Same headless-browser approach as the last two deliveries — actually
clicking through the real dev build, not just reading the diff:

- **`proof-01-many-candles-visible.png`** — replay started at candle 500 of
  20,000. The chart now shows a full, properly-spaced ~500-candle series
  with a real time axis (08:15 through 12:00), not one bar. This is the
  direct fix for your report.
- **`proof-02-after-play-still-scrolling.png`** — played forward via the
  real `useReplayPlayback` hook (8x speed, a few seconds). Readout advanced
  to 534/20,000, and the chart is still a full, correctly-spaced series with
  the price scale auto-rescaling — confirms the live-push path
  (`subscribeBars`/`onTick`) still works correctly with the corrected
  timestamps, not just the initial load.

Also re-ran `tsc --noEmit` (zero new errors) and `npm run build` (the real
Vercel build command — completes clean) against both changed files.

**Still not automated-verified** (same gap as the last delivery, unrelated to
this fix): switching the displayed resolution (1m → 1h) mid-replay via the
widget's own UI dropdown — Playwright still can't reliably click into that
control inside the widget's nested iframe. Worth a quick manual check once
this is live, but I'm not going to claim I tested it when I didn't.

## Next step

Once you've confirmed this looks right on `pipecho.com/tv-chart-test`, step 3
(trade markers via `createExecutionShape`/`createOrderLine`) is next whenever
you're ready.
