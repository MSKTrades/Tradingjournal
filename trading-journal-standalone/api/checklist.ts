import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';

// Handles checklists (named rule sets, e.g. "London Reversal"),
// checklist_items (the individual rules inside one), AND Daily Routine
// notes (a free-text per-date note, unrelated to the rule-set checklists
// above) through a single serverless function — kept as one file, not
// three, because the Vercel Hobby plan caps functions at 12 and this
// project is already at 11. The `resource` field (query param on
// GET/DELETE, body field on POST) distinguishes which table an operation
// targets; `?resource=` defaults to `checklist` where omitted since that's
// the more common read.
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.method === 'GET') {
    if (req.query.resource === 'daily_routine') {
      const rows = await sql.unsafe('SELECT * FROM daily_routine_notes ORDER BY note_date DESC');
      res.status(200).json(rows);
      return;
    }

    // Single round trip: fetch every checklist plus every item, then nest
    // items under their checklist in JS. Simpler for the frontend than
    // forcing a second fetch per checklist.
    const checklists = await sql.unsafe('SELECT * FROM checklists ORDER BY sort_order ASC, id ASC');
    const items = await sql.unsafe('SELECT * FROM checklist_items ORDER BY sort_order ASC, id ASC');
    const byChecklist = new Map<number, any[]>();
    for (const item of items) {
      const list = byChecklist.get(item.checklist_id) ?? [];
      list.push(item);
      byChecklist.set(item.checklist_id, list);
    }
    const withItems = checklists.map((c: any) => ({ ...c, items: byChecklist.get(c.id) ?? [] }));
    res.status(200).json(withItems);
    return;
  }

  if (req.method === 'POST') {
    const p = req.body;
    const resource = p.resource ?? 'checklist';

    if (resource === 'daily_routine') {
      // Upsert by date — saving today's note again overwrites the same row
      // (note_date is UNIQUE) instead of creating a duplicate for the day.
      const noteDate = String(p.note_date ?? '').trim();
      if (!noteDate) { res.status(400).json({ error: 'note_date is required' }); return; }
      const rows = await sql.unsafe(
        `INSERT INTO daily_routine_notes (note_date, text)
         VALUES ($1, $2)
         ON CONFLICT (note_date) DO UPDATE SET text = EXCLUDED.text, updated_at = now()
         RETURNING *`,
        [noteDate, p.text ?? '']
      );
      res.status(200).json(rows[0]);
      return;
    }

    if (resource === 'checklist') {
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM checklists');
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO checklists (name, sort_order) VALUES ($1, $2) RETURNING *`,
        [p.name, nextOrder]
      );
      res.status(200).json({ ...rows[0], items: [] });
      return;
    }

    if (resource === 'item') {
      const checklistId = Number(p.checklist_id);
      if (!checklistId || isNaN(checklistId)) { res.status(400).json({ error: 'checklist_id is required' }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM checklist_items WHERE checklist_id = $1', [checklistId]);
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES ($1, $2, $3) RETURNING *`,
        [checklistId, p.text, nextOrder]
      );
      res.status(200).json(rows[0]);
      return;
    }

    res.status(400).json({ error: `Unknown resource "${resource}"` });
    return;
  }

  if (req.method === 'PUT') {
    const resource = req.query.resource ?? 'checklist';
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

    if (resource === 'checklist') {
      const p = req.body;
      await sql.unsafe('UPDATE checklists SET name = $1 WHERE id = $2', [p.name, id]);
      res.status(200).json({ id });
      return;
    }

    if (resource === 'item') {
      const text = String(req.body?.text ?? '').trim();
      if (!text) { res.status(400).json({ error: 'text is required' }); return; }
      await sql.unsafe('UPDATE checklist_items SET text = $1 WHERE id = $2', [text, id]);
      res.status(200).json({ id });
      return;
    }

    if (resource === 'daily_routine') {
      // Editing a past day's note directly by id (the "today" editor uses
      // the POST upsert above instead, keyed by date rather than id).
      const text = String(req.body?.text ?? '');
      await sql.unsafe('UPDATE daily_routine_notes SET text = $1, updated_at = now() WHERE id = $2', [text, id]);
      res.status(200).json({ id });
      return;
    }

    res.status(400).json({ error: `Unknown resource "${resource}"` });
    return;
  }

  if (req.method === 'DELETE') {
    const resource = req.query.resource ?? 'checklist';
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

    if (resource === 'daily_routine') {
      await sql.unsafe('DELETE FROM daily_routine_notes WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }

    if (resource === 'checklist') {
      // ON DELETE CASCADE on checklist_items.checklist_id handles the rules;
      // ON DELETE SET NULL on trades.checklist_id un-links any trade that
      // was graded against this checklist rather than orphaning a dangling
      // reference — those trades' checklist_results stay as a historical
      // record even though the checklist itself is gone.
      await sql.unsafe('DELETE FROM checklists WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }

    if (resource === 'item') {
      await sql.unsafe('DELETE FROM checklist_items WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }

    res.status(400).json({ error: `Unknown resource "${resource}"` });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
