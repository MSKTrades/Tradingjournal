# PipEcho — the 3 growth recommendations, all built

1 new database table (`leads`), no new serverless functions (still 12/12
on Vercel Hobby — the one new backend need went into a `resource=lead`
branch on the existing `api/columns.ts`). 4 new files, 8 edited.

## 1. Interactive "Try Demo" on the landing page

New `/demo` page — a real sample account (64 trades, styled as a "London
Reversal _ GU" GBPUSD playbook) where toggling a rule (CISD confirmed,
Asia session swept, skip Mondays, London session only) instantly
recalculates trade count, win rate, total R, profit factor, and the equity
curve. Entirely client-side — no login, no backend call, so it works for a
completely cold visitor. Linked from the hero ("Try the live demo") and the
nav bar/footer ("Live Demo").

The sample data isn't random noise — CISD confirmation, an Asia sweep, and
the London session all genuinely raise the odds of a winner in the
generated dataset, and Monday genuinely hurts, so toggling rules tells an
honest, coherent story (e.g. turning on "CISD confirmed" alone takes win
rate from 52% to 68% in testing) instead of numbers jumping around
meaninglessly.

## 2. Landing page micro-demo (in place of a recorded video/GIF)

Rather than a screen-recorded video (nothing to record against yet, and a
recording goes stale the moment the UI changes), I built the same demo
component with an `autoplay` mode: embedded directly on the landing page,
it cycles through CISD → +Asia swept → +all four rules → back to raw, one
step every ~3 seconds, so a visitor sees the recalculation happen without
touching anything. Both the landing embed and the full /demo page share
one component (`RuleToggleDemo.tsx`) and one dataset, so they can never
tell two different stories.

## 3. Lead-magnet tool: free Forex Session Clock

New `/tools/session-clock` page — the same live "Trading Sessions" clock
that's always been on the authenticated Summary page (which session is
open, London/NY overlap, weekend close countdown), given away for free
behind a one-field email form. I extracted that widget out of `Summary.tsx`
into its own file (`SessionClockWidget.tsx`) so the public page doesn't
have to import anything from the authenticated app to use it — Summary.tsx
now just imports the same shared component, so the two can never drift
out of sync with each other.

Email capture posts to a new `resource=lead` branch on `api/columns.ts`
(same public-before-login shape as the existing Contact form), stored in a
new `leads` table with a `source` column so future lead magnets can reuse
this same endpoint. **Never blocks the tool** if the request fails — same
best-effort philosophy as the Contact form elsewhere in this app; the
point is to try to capture an email, not to hold a free tool hostage to a
flaky network call.

## Also fixed along the way

- **Backtesting was never actually "coming soon."** While wiring routes I
  found `src/pages/Backtest.tsx` is a full, live, 400+ line Chart Replay &
  Backtesting workspace, open to every signed-in user today — the
  `BacktestComingSoon.tsx` file I'd been trusting as the source of truth
  for an earlier delivery is an orphaned leftover, not wired into any
  route in `App.tsx`. That means the "(coming soon)" I added to both
  Pricing plans' backtest lines two deliveries ago was wrong — removed it
  from both. The Free-vs-Pro **history length** split (6 months vs.
  unlimited) still isn't enforced in `Backtest.tsx` itself — same "pricing
  describes the plan, nothing gates it in code yet" state as the rest of
  this page — so that's copy only for now, not a new bug I introduced.
- **Sitemap** now includes `/demo` and `/tools/session-clock` — worth it
  for a lead-magnet page especially, since organic search traffic finding
  it is half the point of building one.

## Not touched (flagging, not fixing, since it's outside what was asked)

Two of your blog posts have a code comment explaining they intentionally
link to "Strategy Playbooks" instead of "Chart Replay & Backtesting" as
their related feature, because "Backtesting isn't live yet." That's the
same stale assumption as above — worth a look next time you're touching
blog content, but I didn't change blog copy in this delivery since it
wasn't part of what you asked for and touches editorial content rather
than app code.

## How to apply

1. **Run the migration first** — `migration-leads-table.sql` (in this same
   folder, not inside the zip) in Neon's SQL editor. Do this before
   deploying the code below, or `resource=lead` submissions will 500 until
   it's run.
2. `MSKTrades/Tradingjournal` → `trading-journal-standalone/` on GitHub.
3. Add these 4 new files:
   - `src/pages/ui/RuleToggleDemo.tsx`
   - `src/pages/ui/SessionClockWidget.tsx`
   - `src/pages/Demo.tsx`
   - `src/pages/SessionClockTool.tsx`
4. Replace these 8 existing files:
   - `src/App.tsx`
   - `src/pages/Landing.tsx`
   - `src/pages/Summary.tsx`
   - `src/pages/Pricing.tsx`
   - `src/pages/ui/MarketingChrome.tsx`
   - `src/lib/proFeatures.ts`
   - `api/columns.ts`
   - `scripts/generate-sitemap.mjs`
5. Commit to `main` — Vercel auto-deploys.
6. Hard-refresh after it deploys.

## Verified before packaging

- `tsc --noEmit` clean and `npm run build` succeeds (sitemap now reports 9
  URLs, up from 7).
- Ran a local static preview and screenshotted `/`, `/demo`, and
  `/tools/session-clock` with a real headless browser — all three render
  correctly with no console errors beyond an expected 500 from an API call
  that only exists once this is actually deployed (there's no live backend
  in a static local preview).
- Confirmed the autoplay demo actually advances and recalculates on a
  timer (screenshotted mid-cycle: toggling "CISD confirmed" alone took the
  sample account from 52% → 68% win rate, 64 → 34 trades, exactly the kind
  of number movement the demo is supposed to sell).
- `api/columns.ts`'s new branch isn't covered by local `tsc` (only `src/`
  is in this project's tsconfig — the `api/` folder has never been
  type-checked locally, same as every other file in it), so I hand-checked
  it follows the exact same shape as the neighboring `contact` branch it
  sits next to.
