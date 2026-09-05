# Why your FTMO import "didn't load anything" — and the fix

## What's actually happening

Checked Vercel's runtime logs for `/api/trades/bulk` around when you tried
the import: the request came back `200 OK` both times — no crash, no error
shown anywhere. That's the trap. `bulkAdd` inserts trades one row at a time
inside a `try/catch`, and the catch block just did `skipped++` with no
logging at all. So if every single row failed to insert, the whole import
silently produced `{ inserted: 0, skipped: 15 }`, the dialog closed like
normal, and the Journal page — which never even looked at that response —
just showed nothing new. Zero trace of *why* anywhere, front or back end.

**Almost certainly the actual cause**: the CSV importer's `schema.sql`
changes (the new `idx_trades_csv_import_dedup` index, plus whatever else
has piled up in that file recently) were never run against your production
database. The import code writes `ON CONFLICT (account_id, source,
external_id) WHERE source = 'csv_import'` — Postgres requires an actual
index matching that exact condition to exist, or the insert throws
`42P10: there is no unique or exclusion constraint matching the ON CONFLICT
specification`. With the old silent catch, that error just vanished into
`skipped++`.

This is the same category of issue as the `instruments`/`timeframes` "table
does not exist" errors flagged earlier — `schema.sql` keeps growing with
new `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT
EXISTS` statements every time a feature ships, but nothing re-runs it
against production automatically. Worth noting: the README's own wording
("`schema.sql` — run once against a fresh database") reads like a one-time
setup step, which is probably why it doesn't get re-run after later
changes — every statement in the file is written to be safe to run
repeatedly (that's what `IF NOT EXISTS` is for), so the real fix going
forward is treating it as "re-run after every deploy that touches it," not
"already done."

## The immediate fix

Run the full current `schema.sql` against your production database (Neon
or wherever it's hosted) — it's entirely idempotent, so re-running the
whole file is safe even for parts you've already applied. That will create
`idx_trades_csv_import_dedup` (and pick up anything else that's drifted,
including `instruments`/`timeframes` if those are still missing).

If you want to fix just this one thing without touching anything else:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_csv_import_dedup
  ON trades (account_id, source, external_id) WHERE source = 'csv_import';
```

## What this delivery changes (2 files, on top of what's already live)

- `api/trades/bulk.ts` — the catch block now does `console.error('bulkAdd:
  row insert failed', err)` before `skipped++`. Costs nothing, and turns
  any future version of this exact problem into a one-line, readable error
  in Vercel's runtime logs instead of total silence.
- `src/pages/Journal.tsx` — the import dialog's `onImport` now actually
  looks at the `{ inserted, skipped }` response instead of discarding it.
  0 trades saved now pops an alert telling you to check the schema; partial
  skips pop an alert with the count. Blunt (this app has no toast
  system yet), but immediately visible instead of silent.

## After deploying this fix + running the migration

Re-try the FTMO import. If it still doesn't insert anything, the Vercel
runtime logs for `/api/trades/bulk` will now show the *actual* Postgres
error message from `console.error`, and that tells us exactly what's
really wrong instead of guessing.
