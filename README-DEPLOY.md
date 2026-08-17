# ForexForge — Checklist rule editing fixed + new Daily Routine notes

Five files changed:

```
trading-journal-standalone/
├── schema.sql                          (changed — new daily_routine_notes table)
├── api/checklist.ts                    (changed — item editing + Daily Routine endpoints)
├── src/pages/data/types.ts             (changed — new DailyRoutineNote type)
├── src/pages/Checklists.tsx            (changed — rule text is now editable; renders Daily Routine)
└── src/pages/ui/DailyRoutine.tsx       (NEW — the Daily Routine widget)
```

## 1. Checklist rule editing — bug fix

Once you added a rule to a checklist (like "Wait for price to reach POI on 15M" in Fractal Model), there was no way to fix a typo or reword it — only delete and re-add from scratch. Each rule now has a pencil icon next to the X (hover over the rule to see both) that lets you edit its text in place, Enter to save or Escape to cancel — same pattern as renaming a checklist itself.

## 2. Daily Routine — new notes widget

A new card at the top of the Checklists page, above your rule-set checklists. It's a free-text notepad for whatever you want to check before placing any trade that day — which pairs you scanned, whether CISD's formed anywhere, your daily bias, anything else worth remembering.

- **Today's box** is always at the top, pre-filled with whatever you already saved for today (if anything) — type and hit Save to update it.
- **History** below it keeps every previous day's note, most recent first, so you can scroll back through your own routine over time. Each past entry has its own edit (pencil) and delete icons on hover, in case you want to fix or clear an old one.
- Saving today's note again just overwrites today's entry — it won't create duplicates for the same day.

This is entirely separate from the rule-set checklists (Fractal Model, etc.) below it — those are still for grading individual trades against fixed rules; Daily Routine is just a running journal, not something a trade gets checked against.

## 3. Apply the files

Same as always: GitHub's "Add files via upload" into `MSKTrades/Tradingjournal`, inside `trading-journal-standalone/`, preserving the folder paths above.

## 4. Re-run schema.sql in Neon

One new table:

```sql
CREATE TABLE IF NOT EXISTS daily_routine_notes (
  id          SERIAL PRIMARY KEY,
  note_date   DATE NOT NULL UNIQUE,
  text        TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Open your Neon SQL editor and run the full `schema.sql` again — safe and idempotent, doesn't touch anything else.

## 5. Environment variables

None needed.

## 6. Redeploy on Vercel

Trigger a redeploy the same way as before. No new serverless function was added — Daily Routine and the rule-editing fix both piggyback on the existing `/api/checklist` endpoint, so you're still safely under Vercel's 12-function cap.

## Verified

Checked in a real browser: hovering a rule now shows both a pencil and an X, clicking the pencil pre-fills an editable input with the rule's current text, and pressing Enter saved it — confirmed the PUT request carried the exact new text and the rule updated on screen immediately. Also typed and saved a Daily Routine note for today and confirmed the POST request carried the right date and text, and the note appeared correctly formatted. Two mock history entries (with dates like "Sun, Aug 16, 2026") rendered correctly below today's box.
