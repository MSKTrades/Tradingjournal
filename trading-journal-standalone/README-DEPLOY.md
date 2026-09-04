# CSV Import — deploy notes

Scope: widen the existing "Import from Excel" flow so it also accepts real
broker CSV statement exports, not just your own hand-tracked spreadsheet.
Auto-sync (MT4/5, TradeLocker, cTrader) is intentionally untouched — that
stays parked per your call to prioritize CSV import first.

## What changed (5 files)

- `schema.sql` — new partial unique index `idx_trades_csv_import_dedup` on
  `(account_id, source, external_id) WHERE source = 'csv_import'`. Mirrors
  the existing MT4/5 sync dedup index, just for CSV imports.
- `api/_db.js` — `recalcAccountCapital` now trusts the stored `gain_loss`
  directly for `source = 'csv_import'` rows (same treatment already given to
  `mt_sync` rows), instead of running it back through the %-risk formula
  meant for hand-logged trades.
- `api/trades/bulk.ts` — the bulk-add endpoint now accepts `source`,
  `external_id`, and `gain_loss` per row, and upserts on
  `(account_id, source, external_id)` when `source = 'csv_import'` so
  re-uploading next month's statement updates existing trades instead of
  duplicating them. Deliberately does not overwrite comments, screenshots,
  tags, notes, or checklist results on conflict — your own annotations
  survive a re-import.
- `src/lib/demoBackend.ts` — mirrors the same `csv_import` bypass into the
  demo-mode `recalcCapital` so the in-browser demo behaves consistently with
  the real backend.
- `src/pages/ui/ImportTradesDialog.tsx` — the actual UI work:
  - File picker now accepts `.csv` in addition to `.xlsx`/`.xls`.
  - New "Profit/Loss ($)" field for the real broker dollar P&L, kept
    separate from the existing categorical Profit/Loss/Breakeven field so
    your own template import flow is untouched.
  - New "Ticket / Order / Position ID" field, auto-detected from common
    broker column headers (`Ticket`, `Order ID`, `Position ID`, `Deal ID`),
    used as the dedup key when present.
  - Preview table shows the real `+$X.XX` / `-$X.XX` figure when a $P&L
    column was mapped, falling back to the categorical badge otherwise.
  - Dialog renamed "Import Trades" to reflect the wider scope.

  Auto-detection deliberately does NOT guess the $P&L column — broker
  headers like "Profit" or "P/L" would collide with the existing
  categorical-P&L detection regex that your own spreadsheet template relies
  on. You map that column by hand from the dropdown; everything else
  auto-detects as before.

## Verification performed in this session

- `git status`/`git ls-files` confirmed this workspace was already synced to
  the current `origin/main` (commit `56dec01`) before these edits — no stale
  base.
- Ran the actual production build path Vercel uses (`vite build`, not the
  local `npm run build` script) — succeeds cleanly.
- Scoped `tsc --noEmit` (excluding 3 pre-existing orphaned files unrelated
  to this change, see note below) — 0 errors.
- Scoped `tsc --noEmit` over `api/` — 0 errors.
- Confirmed still exactly 12 routed serverless functions (Vercel Hobby cap)
  — no new API file was added.

### Note: unrelated pre-existing build quirk found & explained

While verifying, `npm run build`'s `tsc -b` step failed — but on 3 files
that have nothing to do with this change: `src/Summary.tsx`,
`src/pages/HtfBiasAlignment.tsx`, `src/pages/TagGroupsPicker.tsx`. These are
orphaned duplicates of the real files (`src/pages/Summary.tsx`,
`src/pages/ui/HtfBiasAlignment.tsx`, `src/pages/ui/TagGroupsPicker.tsx`)
left over from earlier refactor work — nothing imports them, and their
relative imports don't resolve from where they sit.

This looked alarming at first (a broken build already on `origin/main`?)
but it's harmless in practice: Vercel's actual build for this project runs
`vite build` directly (via its own Vite framework auto-detection), not the
`npm run build` script in `package.json` — confirmed straight from the
build logs of the live production deployment for this exact commit. `vite
build` only bundles files actually reachable from the app's entry point, so
these 3 dead files are never touched and never block a real deploy. `tsc
-b`, on the other hand, type-checks everything matched by `tsconfig.json`'s
`include: ["src"]` regardless of whether it's reachable, which is why it
trips on them.

Net effect: not a live bug, but `npm run build` is currently misleading
locally (looks broken, isn't) and these 3 files are dead weight. Not
touched in this delivery since they're outside the CSV-import scope and
likely mid-use by whatever refactor left them there — flagging for you to
delete when convenient, not fixing unprompted.

## Applying this

This workspace is a clone of `github.com/MSKTrades/Tradingjournal` synced to
`origin/main` at commit `56dec01`, with only the 5 files above modified on
top of it (nothing else touched, nothing else pending). Two ways to apply:

1. **Patch**: apply `csv-import.diff` (included in this zip) against a
   checkout at commit `56dec01` or later (as long as these 5 files haven't
   changed further upstream).
2. **Copy over**: the zip mirrors the repo's folder structure — copy the 5
   files straight into place.

### After deploying

Run the new `schema.sql` migration against the production database (same as
any other schema change here) — the new partial unique index is additive
and safe to apply without downtime.
