# CSV Import — deploy notes

Scope: widen the existing "Import from Excel" flow so it also accepts real
broker CSV statement exports (tested against a real FTMO MT5 export), not
just your own hand-tracked spreadsheet. Auto-sync (MT4/5 live connection,
TradeLocker, cTrader) is intentionally untouched — that stays parked per
your call to prioritize CSV import first.

## What changed (5 files)

- `schema.sql` — new partial unique index `idx_trades_csv_import_dedup` on
  `(account_id, source, external_id) WHERE source = 'csv_import'`. Mirrors
  the existing MT4/5 sync dedup index, just for CSV imports.
- `api/_db.js` — `recalcAccountCapital` now trusts the stored `gain_loss`
  directly for `source = 'csv_import'` rows (same treatment already given to
  `mt_sync` rows), instead of running it back through the %-risk formula
  meant for hand-logged trades.
- `api/trades/bulk.ts` — the bulk-add endpoint now accepts `source`,
  `external_id`, `gain_loss`, and (new) `gross_profit`/`commission` per row.
  Two ways in for a broker's $ P&L: a single net figure via `gain_loss`, or
  the Gross/Commission split via `gross_profit`/`commission` — the server
  computes `net_profit = gross_profit - commission` (mirroring the same
  formula `api/trades/index.ts` already uses for a hand-typed trade's Result
  section) and uses that as `gain_loss` when no direct net figure was given.
  Upserts on `(account_id, source, external_id)` so re-uploading next
  month's statement updates existing trades instead of duplicating them —
  never touches your comments, screenshots, tags, notes, or checklist
  results on conflict.
- `src/lib/demoBackend.ts` — mirrors both the `csv_import` capital-chain
  bypass and the gross/commission → net computation into demo mode, so the
  in-browser demo behaves the same as the real backend.
- `src/pages/ui/ImportTradesDialog.tsx` — the actual UI work:
  - File picker accepts `.csv` in addition to `.xlsx`/`.xls`.
  - New "Profit/Loss ($) — net" field for a broker that reports one net
    dollar figure directly.
  - New "Gross Profit/Loss ($)" + "Commission ($)" + "Swap ($)" fields for a
    broker that splits gross P&L and costs into separate columns (FTMO and
    most MT4/5-style statements do this) — Swap has no column of its own
    server-side, so it's automatically folded into Commission during
    parsing rather than needing its own field end-to-end.
  - New "Ticket / Order / Position ID" field, auto-detected from common
    broker column headers, used as the dedup key when present.
  - Preview table shows the real computed $ figure (net directly, or
    gross − commission) whichever path was mapped.
  - Auto-detection now recognizes several more broker-statement column
    names — see the FTMO mapping table below for exactly which.
  - Dialog renamed "Import Trades" to reflect the wider scope.

## How your FTMO export maps, column by column

Tested directly against the file you sent. 8 of 15 columns now auto-map
with zero clicks; the rest need either a one-time manual pick in the
mapping step or don't have anywhere to go yet.

| FTMO column | Auto-maps to | Notes |
|---|---|---|
| Ticket | Ticket / Order / Position ID | Used as the dedup key for re-imports. |
| Open | Date Placed | Bare "Open" (not "Open Time") is now recognized — new. Time-of-day is dropped (see limitation below). |
| Type | Direction | buy/sell → Long/Short. |
| Volume | *(not mapped)* | Lot size — PipEcho doesn't have a lot-size field (Position Size % means something different for manual trades). Harmless to leave unmapped; doesn't affect any math since `csv_import` rows bypass the %-risk formula entirely. |
| Symbol | Pair / Token | |
| Price *(1st)* | *(not mapped — map by hand to "Entry Price")* | Both Price columns share the exact header text, so auto-detect can't tell them apart by name alone — position in the file is the only signal, and regex has no notion of "this is the first one." One manual click. |
| SL | SL Price | |
| TP | TP Price | |
| Close | Date Closed | Bare "Close" is now recognized — new. |
| Price *(2nd, exit)* | *(nowhere to go)* | PipEcho's schema has no exit/close-price column at all (only Entry/SL/TP). Not something this change adds — flagging as a possible future field if you want exit price tracked. |
| Swap | Swap ($) | New field — folds into Commission automatically (see below). |
| Commissions | Commission ($) | New field. |
| Profit | Gross Profit/Loss ($) | New field — this is FTMO's *gross* price P&L, before commission/swap. |
| Pips | *(not mapped)* | Fixed a real bug while building this: the old rules would have silently mapped this into "SL Pips" (a completely different meaning — stop-loss distance, not trade result). Now falls through unmapped, which is the safe default since there's no dedicated pip-result field. |
| Trade duration in seconds | Trade Duration | Auto-maps, but harmless either way — the server always recomputes duration itself from the placed/closed timestamps rather than trusting an imported value. |

**The one thing that needed a decision, and what we went with**: FTMO's
`Profit` column is gross — it excludes commission and swap, so a real
imported trade's true $ result is `Profit + Commissions + Swap` (e.g. row 1
in your file: -1.17 + -4.62 + 0 = **-5.79**, not -1.17). You confirmed
routing this through PipEcho's existing Gross Profit / Commission / Net
Profit trio (the same fields the manual trade-entry form already uses)
rather than a one-off combine step — so mapping `Profit`→Gross Profit and
`Commissions`→Commission is enough; the importer folds `Swap` in
automatically and the server computes the real net the same way it already
does for a hand-typed trade.

**Net result after mapping**: 4 columns need a one-time manual pick each
import (the two `Price` columns, since they're indistinguishable by name —
though Volume and the 2nd Price genuinely have nowhere to go so those stay
skipped either way). Everything else — Ticket, Open, Close, Type, Symbol,
SL, TP, Swap, Commissions, Profit — auto-detects correctly now.

**Known limitation**: `Open`/`Close` are combined date+time in your file
("2026-06-04 02:16:51"). Mapping them to Date Placed/Date Closed captures
the date correctly but drops the time-of-day (PipEcho's Time
Executed/Time Closed fields would need that same column mapped a second
time, which the current one-column-one-field mapping UI doesn't support in
a single pass). Not a blocker — trade ordering and the capital chain both
run off date, not time-of-day — but flagging it since your journal will
show no execution/close time for these imports.

## Verification performed in this session

- Ran the actual production build path Vercel uses (`vite build`, not the
  local `npm run build` script) — succeeds cleanly.
- Scoped `tsc --noEmit` over `src/` (excluding 3 pre-existing orphaned files
  unrelated to this change — see note below) — 0 errors.
- Scoped `tsc --noEmit` over `api/` — 0 errors.
- Confirmed still exactly 12 routed serverless functions (Vercel Hobby cap)
  — no new API file was added.
- Ran your actual FTMO file's headers through the real `DETECT_RULES` logic
  in Node directly (not just reasoning about the regex) and confirmed the
  mapping table above matches what the code actually does. Also verified
  the commission/swap-fold math against a manual hand-calc (-5.79 for row 1
  — matches).

### Note: unrelated pre-existing build quirk found & explained

`npm run build`'s `tsc -b` step fails on 3 files that have nothing to do
with this change: `src/Summary.tsx`, `src/pages/HtfBiasAlignment.tsx`,
`src/pages/TagGroupsPicker.tsx` — orphaned duplicates of the real files
(`src/pages/Summary.tsx`, `src/pages/ui/HtfBiasAlignment.tsx`,
`src/pages/ui/TagGroupsPicker.tsx`) left over from earlier refactor work.
Nothing imports them, and their relative imports don't resolve from where
they sit. Confirmed via the live production deployment's own build logs
that Vercel actually runs `vite build` directly (via its own Vite framework
auto-detection), not the `npm run build` script — so these 3 dead files are
never bundled/checked and never block a real deploy. Not touched in this
delivery since they're outside the CSV-import scope — flagging for you to
delete when convenient.

## Applying this

This workspace is a clone of `github.com/MSKTrades/Tradingjournal` synced to
`origin/main`, with only the 5 files above modified on top of it (nothing
else touched, nothing else pending). Two ways to apply:

1. **Patch**: apply `csv-import.diff` (included in this zip).
2. **Copy over**: the zip mirrors the repo's folder structure — copy the 5
   files straight into place.

### After deploying

Run the new `schema.sql` migration against the production database — the
new partial unique index is additive and safe to apply without downtime.
