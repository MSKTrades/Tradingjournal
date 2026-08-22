# New: Smart Money Concepts (SMC) Analysis — admin-only

This is the big one you asked for: a whole new section that pulls live
candles across 7 timeframes (Weekly, Daily, 4H, 1H, 15M, 5M, 1M), reads them
against Lewis Kelly's market-structure-hierarchy / liquidity / Premium-
Discount framework, auto-marks the current range, Order Blocks and FVGs on
every timeframe, runs all six of your strategy models against live price
action to surface entry/SL/TP when a setup is actually valid right now, and
lets you draw your own entry/SL/TP idea and grade it against any of the six
models — showing exactly which of that model's rules your idea does and
doesn't satisfy.

**Locked to just your account**, same three-layer pattern as Backtest
(sidebar link hidden, the route shows a "Coming soon" card, and — the part
that actually matters — the API itself 404s for anyone but
`manjyot1537@gmail.com`).

## 1. Database migration — run this against Neon

Two new tables, both brand new (nothing existing is touched). Copy/paste
this into Neon's SQL editor, or just re-run the full `schema.sql` in this
zip (every statement in it is idempotent — safe to run against your existing
database, it'll skip everything that already exists):

```sql
CREATE TABLE IF NOT EXISTS smc_candle_cache (
  id            SERIAL PRIMARY KEY,
  pair          TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  blob_url      TEXT NOT NULL,
  candle_count  INTEGER NOT NULL DEFAULT 0,
  from_time     TIMESTAMPTZ,
  to_time       TIMESTAMPTZ,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pair, timeframe)
);

CREATE TABLE IF NOT EXISTS smc_markups (
  id            SERIAL PRIMARY KEY,
  pair          TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  model_key     TEXT,
  direction     TEXT NOT NULL DEFAULT 'bullish',
  entry_price   NUMERIC NOT NULL,
  sl_price      NUMERIC NOT NULL,
  tp_price      NUMERIC NOT NULL,
  entry_time    TIMESTAMPTZ,
  points        JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes         TEXT NOT NULL DEFAULT '',
  grade         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smc_markups_pair ON smc_markups (pair);
```

No changes to any existing table.

## 2. No new Vercel function, no new env vars

This all lives inside `api/backtest.ts` as two more `resource=` branches
(`smc_candles`, `smc_markups`) — same reason everything else in that file is
crammed together: Vercel's Hobby plan caps you at 12 serverless functions
and you're already sitting exactly at that limit. Because it's the same
file, it inherits the exact same admin-only gate the rest of Backtest
already has, automatically.

It reuses the Blob storage token you've already got configured
(`forexblob_READ_WRITE_TOKEN` / `BLOB_READ_WRITE_TOKEN`) — nothing new to
add in Vercel's environment variables.

## 3. Files in this zip

```
api/backtest.ts                      (new smc_candles / smc_markups resources)
schema.sql                           (the two new tables)
src/App.tsx                          (new /smc-analysis route, admin-gated)
src/components/Layout.tsx            (new sidebar link, admin-only)
src/pages/SmcAnalysis.tsx            (the page itself)
src/pages/SmcComingSoon.tsx          (placeholder shown to everyone else)
src/pages/ui/smc/types.ts            (domain types)
src/pages/ui/smc/marketStructure.ts  (swing/structure/OB/FVG/range/liquidity detection)
src/pages/ui/smc/strategyHelpers.ts  (shared building blocks for the 6 models)
src/pages/ui/smc/strategyModels.ts   (the 6 strategy rule engines)
src/pages/ui/smc/markupGrading.ts    (grades your own markup against a model)
src/pages/ui/smc/smcOverlayPrimitive.ts (chart rendering for OB/FVG/range/EQ)
src/pages/ui/smc/SmcChart.tsx        (the chart component)
src/pages/ui/smc/StrategyPanel.tsx   (the 6-model live dashboard)
src/pages/ui/smc/RuleChecklist.tsx   (shared rule-list renderer)
```

## 4. How each concept was actually implemented — read this before trusting any output

You're going to be looking at this for real trading decisions on a funded
account, so here's exactly what the app is doing under the hood, not just
what it's called. Every one of these is ONE specific, defensible reading of
an SMC concept — not "the" definition. A human trader would bring more
context and judgment than any fixed algorithm can.

- **Swings**: classic 5-bar fractal (2 candles either side). A swing only
  counts once it's actually confirmed by price turning away from it —
  same as a person reading a chart couldn't call a swing high in real time
  either.
- **Structure / BOS / CHoCH**: a break is a candle CLOSING beyond the most
  recently confirmed opposite swing (not just a wick through it). BOS =
  break in the direction of the current trend, CHoCH = break against it
  (trend flips). This is a common convention, not the only one — some
  traders use wicks instead of closes.
- **Order Blocks**: the last opposite-colored candle before a break, found
  by searching backward up to 15 candles. Marked "mitigated" the first time
  price trades back into its range.
- **FVGs**: the standard 3-candle imbalance (candle 1's high/low doesn't
  overlap candle 3's low/high). Marked "filled" once price fully trades
  back through it.
- **Range & Premium/Discount**: the most recent confirmed swing high and
  swing low bound the active range; 50% of that is the equilibrium line.
  Buy setups are only valid below it, sell setups only above it — enforced
  everywhere a model picks a POI, not just in Model 4 where you specified it
  explicitly.
- **Liquidity (EQH/EQL)**: swing highs (or lows) within ~0.06% of price of
  each other count as one pool. "Swept" once price later trades through it.
- **The six strategy models**: each is turned into an ordered checklist of
  rules evaluated against the live multi-timeframe data. The checklist is
  ALWAYS shown in full — a step that hasn't been reached yet shows as
  "pending" rather than being hidden, so you can see exactly how far along a
  setup is and what it's still waiting on. Entry is placed at the
  conservative edge of the relevant zone (buy the dip into it, sell the rip
  into it), SL sits just beyond the relevant invalidation swing with a small
  price-scaled buffer, TP is a fixed R-multiple per model (see the code
  comments in `strategyModels.ts` for the exact numbers per model).
- **"London session"**: approximated as UTC year-round (no daylight-saving
  correction) — off by up to an hour during British Summer Time. Called out
  explicitly here and in the code rather than silently guessing.
- **Grading your own markup**: reuses the exact same rule-checking code a
  live scan uses, fed only the candle data that existed at (or before) your
  stated entry time — so you're graded against what you could actually have
  known then, not hindsight. On top of the model's own context checklist, it
  separately checks that your SL/TP sit on the correct side of your entry,
  that your entry sits in the correct discount/premium half of the range,
  and (when the model has a live setup of its own) whether your direction
  matches it.

**This is a second opinion, not a signal** — that line is on the page
itself too. Please don't execute anything against your funded account
purely because this app said a setup is valid.

## 5. Tested before sending this

- `tsc -b` (full project, including every new file) — clean, zero errors.
- A standalone script fed the detection engine ~7,700 synthetic candles
  across all 7 timeframes (deterministic pseudo-random walk with real
  trending legs, pullbacks, and displacement candles, not pure noise) and
  verified: swings/structure/OB/FVG/range all populate sensibly on every
  timeframe; all six strategy evaluators always return a full rule list,
  every rule has a real detail string, and a `valid` status always comes
  with a setup while anything else never does; grading a deliberately
  inverted SL/TP correctly flags both as wrong and grades the whole thing
  invalid.
- Full browser walkthrough (scripted, real clicks/typing, not just API
  calls) against a local Postgres + a stand-in for `vercel dev`, with
  synthetic GBPUSD candle data seeded through the same cache path
  production uses (so the exact cache-read code path was exercised):
  - Logged in as your account: sidebar shows "SMC Analysis", the page loads
    real candles across timeframe tabs, the chart renders with Order
    Block/FVG/range overlays, all 6 strategy model cards render with full
    rule checklists and correct pass/pending/fail states.
  - Filled in an entry/SL/TP, clicked Grade Markup, got real feedback
    listing which specific rules did and didn't pass; clicked Save,
    confirmed it shows up in the Saved Markups list with its verdict badge.
  - Clicked a "pick price from chart" button and clicked the chart — the
    price populated the field correctly (this also caught and fixed a real
    bug: picking a price while looking at a different timeframe tab than
    your markup's own timeframe used to silently do nothing; arming a field
    now jumps you to the right tab automatically).
  - Logged in as a second, non-admin account: no "SMC Analysis" link in the
    sidebar, `/smc-analysis` shows the "Coming soon" card instead of the
    real page, and a direct API call to `smc_candles` returns 404 — same as
    Backtest, this is the real access control, not just the UI hiding a
    button.

## 6. What to check after deploying

- Log in as yourself, open **SMC Analysis** from the sidebar, type a real
  pair (e.g. GBPUSD) and click **Load** — first load will actually hit
  Dukascopy for all 6 fetchable timeframes (Weekly is derived from Daily),
  so give it a few seconds. Reloading again soon after should be much
  faster (served from cache).
- Click through the 7 timeframe tabs and confirm each chart shows candles,
  and the Order Block / FVG / range overlays look sane.
- Check the 6 strategy model cards under **Strategy Models — live scan** —
  each should show a status and a rule checklist.
- Try grading a markup, then saving it, then deleting it from the Saved
  Markups list.
- If you have a second test account, confirm they don't see the SMC
  Analysis tab and `/smc-analysis` shows "Coming soon" for them.
