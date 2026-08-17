# ForexForge — Daily Routine as a point system + Strategy save-error visibility

Five files changed:

```
trading-journal-standalone/
├── schema.sql                          (changed — daily_routine_notes gets a `points` column)
├── api/checklist.ts                    (changed — Daily Routine endpoints now read/write `points`)
├── src/pages/data/types.ts             (changed — DailyRoutineNote.points replaces .text)
├── src/pages/ui/DailyRoutine.tsx       (rewritten — points list instead of a free-text box)
└── src/pages/ui/StrategyDialog.tsx     (changed — save failures now show an error instead of failing silently)
```

## 1. Daily Routine is now a point system

Instead of one big text box, Daily Routine is now a stacked list — "Point 1: ...", "Point 2: ...", one below the other, same as the rules inside your rule-set checklists (Fractal Model, etc.).

- **Today** always starts empty until you add your first point. Click **+ Add a point**, type it, hit Enter (or click Add). Add as many as you want.
- Hover any point to see a pencil (edit in place, Enter to save / Escape to cancel) and an X (delete it).
- **History** below it works exactly the same way per past day — you can add, edit, or delete individual points on an old day too, or delete the whole day with the trash icon in its header.
- Your existing free-text notes aren't lost: the schema migration below copies whatever you'd already typed into a single point for that day, so old entries still show up (just as one point) instead of disappearing.

## 2. Strategy save failures are now visible

While tracking down the "select an account, hit Save, but it doesn't stick" issue, I rebuilt the exact same flow multiple ways in a clean test environment (create a strategy, scope it to one account, scope it to two accounts, save, reopen, refetch) and every one of them round-tripped correctly — the account-scoping code itself checks out.

The most likely real-world explanation is a partial deployment: if the previous delivery that added account scoping (`api/strategies.ts`, `StrategyDialog.tsx`, the `account_ids` schema migration) didn't get fully applied — a file missed on upload, or `schema.sql` not re-run — a save can fail behind the scenes with zero visible feedback: the dialog just closes (or seems to hang) and the selection silently reverts next time you open it.

To close that gap, the strategy dialog now catches save errors and shows them inline (a small red banner right above Save/Cancel) instead of failing silently — so if this happens again you'll see exactly what went wrong instead of just "it didn't save."

**If you still see this after applying these files:** please re-check that `api/strategies.ts` and `src/pages/ui/StrategyDialog.tsx` from the *previous* delivery (Risk Guardrail reorder + strategy account scoping) are both actually live in your GitHub repo and that you re-ran the full `schema.sql` (which includes `ALTER TABLE strategies ADD COLUMN IF NOT EXISTS account_ids ...`) in Neon. If the account picker in Strategies now shows an error message when you save, send me a screenshot of exactly what it says — that'll pinpoint it immediately.

## 3. Apply the files

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving the folder paths above.

## 4. Re-run schema.sql in Neon

One column addition + a one-time backfill, both safe to re-run:

```sql
ALTER TABLE daily_routine_notes ADD COLUMN IF NOT EXISTS points JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE daily_routine_notes
  SET points = jsonb_build_array(text)
  WHERE points = '[]'::jsonb AND text IS NOT NULL AND btrim(text) <> '';
```

Open your Neon SQL editor and run the full `schema.sql` again — idempotent, won't touch anything else. **This time, also double-check `account_ids` shows up on the `strategies` table afterward** (`\d strategies` in Neon's SQL editor, or just look for it in the column list) — if it's missing, that confirms the earlier migration never landed and explains the save issue on its own.

## 5. Environment variables

None needed.

## 6. Redeploy on Vercel

Trigger a redeploy the same way as before. No new serverless function was added — everything here still piggybacks on the existing `/api/checklist` and `/api/strategies` functions, so you're still safely under Vercel's 12-function cap.

## Verified

Built and typechecked clean (`tsc --noEmit`, `vite build`). Tested against a real Postgres database end-to-end with Playwright, not just visually:

- Added 3 points to Today, confirmed each POST carried the full array and the row in the database matched exactly.
- Edited a point in place ("Confirmed daily bias: bullish" → "...(revised)") and confirmed it persisted.
- Deleted a point and confirmed the remaining points renumbered correctly (Point 1/Point 2) both on screen and in the database.
- Seeded a History day directly in the database and confirmed it rendered with its own working add/edit/delete controls, independent of Today.
- For the strategy bug: created a strategy, scoped it to one account, saved, reopened the dialog, and confirmed the same account was still selected — then scoped it to two accounts and repeated the same check. Both round-tripped correctly against a real database every time.
- Also deliberately broke the database (dropped the `account_ids` column) to confirm the new error banner actually appears instead of failing silently — it does.
