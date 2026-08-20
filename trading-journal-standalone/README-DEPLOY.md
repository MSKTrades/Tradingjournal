# Deploy: Drawing tools on the replay chart (trend line, horizontal line, rectangle, Fibonacci retracement)

Adds a small toolbar above the Backtest replay chart (both the Practice
Backtest tab and the Trade Replay tab) so you can mark up the chart while
you're studying it — trend lines, horizontal support/resistance lines,
rectangles, and Fibonacci retracements. Drawings are saved per dataset (not
just kept in the browser), so they're still there next time you open that
same pair/timeframe, and anyone else who opens it sees the same markup —
same visibility model as the candle data itself.

## 1. Run this against your Neon database first

This feature needs one new table. Open your Neon project's SQL editor (or
any Postgres client pointed at your `DATABASE_URL`) and run:

```sql
CREATE TABLE IF NOT EXISTS chart_drawings (
  id            SERIAL PRIMARY KEY,
  dataset_id    INTEGER NOT NULL REFERENCES chart_datasets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,          -- 'trendline' | 'horizontal' | 'rectangle' | 'fib'
  points        JSONB NOT NULL,         -- [{time, price}, ...]
  color         TEXT NOT NULL DEFAULT '#3b82f6',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_drawings_dataset ON chart_drawings (dataset_id);
```

`schema.sql` in this zip already has this added too, so your local copy of
that file (if you keep one in the repo for reference) stays in sync — but
the table itself only exists once you actually run the SQL above against
Neon.

## 2. Files in this zip

```
api/backtest.ts                 (adds a resource=drawings GET/POST/DELETE branch — no new function, still fits Vercel Hobby's 12-function cap)
src/pages/ui/drawingPrimitives.ts   (new — the trend line / rectangle / Fibonacci rendering, drawn directly on the chart's own canvas)
src/pages/ui/ReplayChart.tsx    (adds the toolbar + click-to-draw/select/delete interaction)
src/pages/Backtest.tsx          (one line — tells the chart which dataset to scope drawings to)
src/pages/ui/TradeReplayTab.tsx (same one line, for the Trade Replay tab)
src/pages/data/types.ts         (adds the ChartDrawing type)
package.json                    (adds `fancy-canvas` as a direct dependency — see note below)
```

Copy all of these over the matching paths in your repo, **then run
`npm install`** before your next deploy (see the `fancy-canvas` note below —
this is the one step that's easy to miss).

## 3. Why `fancy-canvas` got added to package.json

The trend line/rectangle/Fib drawings are rendered by hooking into
lightweight-charts' own canvas via its "Series Primitives" API — the same
mechanism the library's own official plugin examples use, since it has no
built-in drawing tools. That API's types live in a small library called
`fancy-canvas`, which lightweight-charts already depends on internally (it's
already sitting in your `node_modules` right now, just not listed directly
in your `package.json`). Adding it as a direct dependency just makes sure
`npm install` always pulls a working copy in when this file imports it
directly — cheap insurance against a future lockfile change moving it
somewhere `drawingPrimitives.ts` can't see it.

## 4. What you get

- A small toolbar (cursor / trend line / horizontal line / rectangle /
  Fibonacci / delete) above the chart, next to the timeframe and indicator
  chips.
- **Trend line, Rectangle, Fibonacci retracement**: click the tool, click
  two points on the chart (e.g. a swing low then a swing high for Fib).
  Fibonacci draws the standard levels — 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%,
  100% — labeled on the right of each line.
- **Horizontal line**: click the tool, click once on the chart.
- **Select tool** (the cursor icon, default): click near any drawing to
  select it (it highlights), then the trash icon deletes it. Click empty
  chart space to deselect.
- Everything survives a page reload and a timeframe switch (1m ↔ 1h ↔ 1d,
  etc.) — drawings are anchored to real price/time, not a fixed pixel
  position, so zooming/panning/resampling doesn't distort them.
- Drawings are scoped to the dataset (pair + timeframe) you're viewing, not
  to your account — same as the candle data itself. If you and someone else
  both open the same GBPUSD 1m replay, you'll both see the same markup.

## 5. What's intentionally NOT included (kept the scope reasonable)

- No drag-to-move/resize on an existing drawing — to reposition one, delete
  it and redraw it. Adding drag support is a reasonable follow-up if it
  turns out you want it often.
- No per-drawing color picker — each tool has one fixed, distinguishable
  color (trend line blue, horizontal green, rectangle purple, Fib amber).
- No undo — deleting is immediate (one click on the trash icon once
  something's selected).

## 6. Tested before sending this

Ran this against a local test dataset (a few thousand 1-minute candles) via
a full browser test:

- Drew one of each tool (trend line, horizontal line, rectangle, Fibonacci)
  — each rendered correctly and persisted to the database (confirmed via a
  direct DB query, not just visually).
- Reloaded the page — all four drawings reloaded from the database and
  rendered in the same place, confirming persistence actually round-trips
  (not just an in-memory illusion).
- Selected a drawing with the cursor tool (it highlighted), deleted it,
  confirmed it disappeared from both the chart and the database, and the
  other three drawings were untouched.
- Cycled through every timeframe chip (1m → 5m → 15m → 1h → 4h → 1m) with
  drawings on screen — no distortion, no console errors, no crashes. This
  was the main risk (drawings are anchored to raw price/time, and the
  timeframe switcher resamples what's actually plotted underneath them) and
  it held up cleanly.
- Zero console/JS errors throughout. `tsc --noEmit` and `npm run build`
  both clean.

## 7. What to check after deploying

- Open a dataset's replay, start it, draw a trend line and a Fibonacci
  retracement.
- Reload the page, confirm both are still there.
- Switch timeframes (1m/1h/1d) with drawings visible, confirm they don't
  jump or distort.
- Select one and delete it with the trash icon, confirm only that one goes
  away.
- If you use the Trade Replay tab too, confirm the toolbar shows up there
  as well and drawings for that trade's dataset load correctly.
