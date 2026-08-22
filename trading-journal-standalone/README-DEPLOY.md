# New: Upload or paste your own chart screenshots — AI cross-checked against live data

This adds what you asked for: on every timeframe tab of SMC Analysis, you can
now paste (Ctrl+V) or upload a screenshot of your own chart, and an AI vision
model gives you a best-effort read of it — cross-checked against the real
live data already loaded for that pair/timeframe, not just guessed from the
picture.

**Note:** this zip's `api/backtest.ts` and `src/pages/SmcAnalysis.tsx` also
include the earlier "Something went wrong" fix (sequential candle fetching,
no more all-or-nothing failure). If you haven't applied that fix zip yet,
this one covers both — you don't need to apply them separately.

## 1. New setup step: an Anthropic API key

This is the one genuinely new piece of infrastructure. The AI read is a real
Claude API call (Claude has to actually look at your image), so it needs its
own API key:

1. Go to **console.anthropic.com**, sign in (or create an account), and
   create an API key under **Settings → API Keys**. Anthropic's API is
   pay-as-you-go, separate from any claude.ai subscription — you'll need to
   add billing details there if you haven't already.
2. In Vercel, open the `tradingjournal` project → **Settings → Environment
   Variables**, and add:
   - `ANTHROPIC_API_KEY` = the key you just created.
   - *(optional)* `SMC_VISION_MODEL` — only set this if you want to override
     the model. It defaults to `claude-3-haiku-20240307`, the cheapest
     Anthropic model that can still read an image — this feature is a rough
     second opinion, not a precision tool, so there's no reason to spend
     more per screenshot than that. If the reads ever feel too shallow, set
     this to a stronger model (check current model names/pricing at
     docs.claude.com).
3. Redeploy after adding the env var (or it just won't be visible until the
   next deploy).

**Cost**: each screenshot analyzed is one small API call — a chart image plus
a few hundred words of prompt/response. At the default Haiku-tier model this
is a fraction of a cent per upload. You only pay for images you actually
upload; nothing runs in the background.

## 2. Database migration — run this against Neon

One new table. Copy/paste into Neon's SQL editor, or re-run the full
`schema.sql` from this zip (idempotent, safe against your existing DB):

```sql
CREATE TABLE IF NOT EXISTS smc_chart_markups (
  id            SERIAL PRIMARY KEY,
  pair          TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  live_context  JSONB,
  analysis      JSONB,
  raw_response  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smc_chart_markups_pair_tf ON smc_chart_markups (pair, timeframe);
```

## 3. No new Vercel function

Same reasoning as everything else in this feature — you're at the Hobby
plan's 12-function cap. This lives as two more `resource=` branches inside
`api/backtest.ts` (`smc_chart_analyze`, `smc_chart_markups`), so it inherits
the same admin-only gate automatically. The image upload itself reuses your
existing `/api/upload` endpoint (same one trade screenshots already use) —
no new upload function either.

## 4. Files in this zip

```
api/backtest.ts                          (smc_chart_analyze / smc_chart_markups resources + the earlier smcCandles fix)
schema.sql                               (new smc_chart_markups table)
src/pages/SmcAnalysis.tsx                (wires the new upload panel into each timeframe tab + the earlier fix)
src/pages/ui/smc/types.ts                (new SmcChartAnalysis / SmcChartMarkup types)
src/pages/ui/smc/ChartMarkupPanel.tsx    (new — the upload/paste UI + saved markups list)
```

## 5. How it actually works

- On any timeframe tab, there's a new **"Chart Markup — AI Read"** card
  below the chart. Click it and press Ctrl+V to paste a screenshot, drag a
  file onto it, or click to browse for one.
- The image uploads straight to your Blob storage (bypassing any server
  body-size limit), then gets sent — as just a URL, not the raw bytes — to
  Claude along with a compact summary of what the live data engine already
  reads for that pair/timeframe (trend, current range, open Order
  Blocks/FVGs, unswept liquidity).
- Claude gives back: a plain-English description of what it sees in the
  image, a note on whether that agrees or conflicts with the live data, a
  rough bullish/bearish/neutral/unclear lean, a confidence level, and any
  caveats (most commonly: it can't reliably read exact prices off a
  screenshot's axis labels).
- That's saved and shown in a running list under the same card — reload the
  page and your past uploads for that pair/timeframe are still there.
- Delete any one with the trash icon; click the thumbnail to view it full
  size.

## 6. Why this is a rougher tool than the rest of the page

Worth being direct about this, since it's a different kind of feature than
everything else on this page. The six strategy models and the live structure
detection work off real numeric candle data — they're precise, even if the
underlying SMC interpretation is still just one reasonable reading. This new
piece is different: an AI model looking at a picture cannot reliably read
exact price levels off a chart's axis labels, cannot verify the screenshot is
even current, and can be wrong about what it thinks it's seeing the same way
any of us glancing at a chart can be wrong. That's exactly why it's paired
with the real live data (so you get a cross-check, not just an opinion in a
vacuum) and why every response comes back with an explicit confidence level
and caveats rather than a flat verdict. Treat it the way you'd treat asking a
knowledgeable friend to eyeball a screenshot — a useful second look, never a
precise reading and never a signal to act on by itself.

## 7. Tested before sending this

- `tsc -b` (full project) — clean, zero errors. `vite build` — clean
  production build.
- A standalone script exercised the real `api/backtest.ts` handler directly
  (mocked Anthropic's API response, real local Postgres) end-to-end:
  uploading + analyzing a chart correctly stores and returns a fully parsed
  result (not a stray JSON string — this caught and fixed a real bug where
  the `analysis`/`live_context` columns were coming back as unparsed text
  instead of objects), the saved markup shows up in the list for that
  pair/timeframe, deleting it removes it, a request with no
  `ANTHROPIC_API_KEY` configured comes back with that exact actionable
  message instead of a generic error, and a non-admin account still gets a
  404 on this new resource exactly like every other SMC/Backtest resource.

## 8. What to check after deploying

- Add `ANTHROPIC_API_KEY` in Vercel and redeploy first — without it, you'll
  see a clear "AI chart analysis is not configured yet" message if you try
  to upload something, rather than a broken feature.
- Open **SMC Analysis**, pick any timeframe tab, and paste or upload a real
  chart screenshot. Give it a few seconds — you'll see "Uploading…" then
  "Analyzing chart…" before the result card appears.
- Confirm the result's bias/confidence badges and text look sensible, and
  that reloading the page still shows your saved upload in the list.
- Try deleting one.
