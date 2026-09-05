# Found it: off-by-one bug in the bulk import INSERT

Your error-visibility fix (already live) did exactly its job — it caught
the real error on the first retry:

```
PostgresError: INSERT has more target columns than expressions
```

Not a missing migration at all. The `INSERT INTO trades (...)` statement in
`api/trades/bulk.ts` lists 42 columns, but its `VALUES (...)` clause only
had 41 `$N` placeholders — the `::jsonb` cast that belongs on `extra_data`
(the 39th column) was misapplied to `$38` (`comments`, a plain text column,
one position too early), and nothing ever supplied a `$42` for the last
column (`net_profit`). Every single row hit this and got silently caught by
the per-row try/catch — which is exactly why the previous "run the schema
migration" theory looked plausible (a genuinely missing constraint produces
the same symptom) but wasn't actually it.

This bug predates today's FTMO work — it was already wrong in the file
before the Gross Profit/Commission/Swap columns were added; adding those
three new columns just extended an already-miscounted placeholder list
instead of introducing a new problem. `tsc`/`vite build` can't catch this
class of bug — `sql.unsafe()` takes a raw string, so column-count-vs-
placeholder-count is only checked by Postgres at query execution time.

## The fix (1 line)

```diff
- $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38::jsonb,$39,$40,$41
+ $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39::jsonb,$40,$41,$42
```

## How this was verified this time

Static type-checking already couldn't catch this once — it wasn't going to
convince either of us the second time. Instead:

1. Wrote a small script that parses every multi-column `INSERT INTO ... (
   cols ) VALUES ( $n... )` in `api/trades/bulk.ts`, `api/trades/index.ts`,
   and `api/accounts.ts`, and counts columns vs. distinct `$N` placeholders
   for each. Confirmed `bulk.ts` was the only one with a mismatch (42 cols
   vs 41 placeholders) — the sibling files (49 cols/49 placeholders,
   17/17, 9/9, 7/7, 6/6) are all fine, so this wasn't a systemic pattern
   elsewhere.
2. Spun up a real local Postgres 16, loaded your actual `schema.sql`
   against it unmodified, and ran the exact fixed `INSERT ... ON CONFLICT
   ... DO UPDATE` statement from `bulk.ts` via `PREPARE`/`EXECUTE` (the
   same positional-parameter binding `postgres.js` uses under the hood) —
   using FTMO row 1's real values. It inserted successfully, returned the
   correct `gain_loss/gross_profit/commission/net_profit = -5.79/-1.17/
   4.62/-5.79`, matching the hand-calculation from before.
3. Ran it a second time with the same `external_id` and a changed P&L to
   confirm the re-import upsert path also works — same row `id`, updated
   value, no duplicate.

This is the only file changed. Once deployed, re-try the FTMO import —
it should actually insert this time.
