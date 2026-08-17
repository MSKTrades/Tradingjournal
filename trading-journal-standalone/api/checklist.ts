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
      const normalized = rows.map((r: any) => ({
        ...r,
        points: typeof r.points === 'string' ? JSON.parse(r.points || '[]') : r.points ?? [],
      }));
      res.status(200).json(normalized);
      return;
    }

    // Single round trip: fetch every checklist plus every item, then nest
    // items under their checklist in JS. Simpler for the frontend than
    // forcing a second fetch per checklist.
    //
    // account_id is optional: the Checklists management page calls this
    // without one because it needs to see (and edit the scoping of) every
    // rule set that exists, account-restricted or not. Everywhere else
    // (Journal's grading picker, Summary's compliance widget) passes the
    // active account so only checklists that apply there come back — same
    // account_ids = '[]' (every account) OR @> containment convention as
    // strategies.
    const accountIdParam = req.query.account_id;
    const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
    const scoped = !!accountId && !isNaN(accountId);

    const checklists = scoped
      ? await sql.unsafe(
          `SELECT * FROM checklists
           WHERE account_ids = '[]'::jsonb OR account_ids @> $1::jsonb
           ORDER BY sort_order ASC, id ASC`,
          // Raw array, NOT JSON.stringify()'d - postgres.js serializes a
          // bound value a second time when the placeholder has a ::jsonb
          // cast, so JSON.stringify([accountId]) here would send the JSON
          // *string* "[2]" instead of the JSON *array* [2], and `@>`
          // containment against a string never matches - every scoped
          // checklist would silently vanish from every account, including
          // its own. See the account_ids write path in api/strategies.ts
          // for the same reasoning applied to INSERT/UPDATE.
          [[accountId]]
        )
      : await sql.unsafe('SELECT * FROM checklists ORDER BY sort_order ASC, id ASC');
    const items = await sql.unsafe('SELECT * FROM checklist_items ORDER BY sort_order ASC, id ASC');
    const byChecklist = new Map<number, any[]>();
    for (const item of items) {
      const list = byChecklist.get(item.checklist_id) ?? [];
      list.push(item);
      byChecklist.set(item.checklist_id, list);
    }
    const withItems = checklists.map((c: any) => ({
      ...c,
      account_ids: typeof c.account_ids === 'string' ? JSON.parse(c.account_ids || '[]') : c.account_ids ?? [],
      items: byChecklist.get(c.id) ?? [],
    }));
    res.status(200).json(withItems);
    return;
  }

  if (req.method === 'POST') {
    const p = req.body;
    const resource = p.resource ?? 'checklist';

    if (resource === 'daily_routine') {
      // Upsert by date — saving today's points again overwrites the same
      // row (note_date is UNIQUE) instead of creating a duplicate for the
      // day. The whole array is written each time (add/edit/delete a point
      // all recompute the full list client-side and POST it here) rather
      // than exposing per-point CRUD endpoints, since a day's points are
      // few and this keeps the API surface — and the Vercel Hobby function
      // count — small.
      const noteDate = String(p.note_date ?? '').trim();
      if (!noteDate) { res.status(400).json({ error: 'note_date is required' }); return; }
      const points = Array.isArray(p.points) ? p.points : [];
      const rows = await sql.unsafe(
        `INSERT INTO daily_routine_notes (note_date, points)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (note_date) DO UPDATE SET points = EXCLUDED.points, updated_at = now()
         RETURNING *`,
        [noteDate, points]
      );
      res.status(200).json(rows[0]);
      return;
    }

    if (resource === 'checklist') {
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM checklists');
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      const rows = await sql.unsafe(
        `INSERT INTO checklists (name, sort_order, account_ids) VALUES ($1, $2, $3::jsonb) RETURNING *`,
        [p.name, nextOrder, p.account_ids ?? []]
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
      // Renaming and re-scoping (Applies To) both land here, but as two
      // independent, partial edits - the rename UI only ever sends `name`
      // and the account-pill toggle only ever sends `account_ids`, so this
      // only updates whichever field(s) were actually included rather than
      // defaulting a missing `account_ids` to '[]' and silently wiping out
      // scoping every time someone renames a checklist.
      const p = req.body;
      if (p.name !== undefined) {
        await sql.unsafe('UPDATE checklists SET name = $1 WHERE id = $2', [p.name, id]);
      }
      if (p.account_ids !== undefined) {
        await sql.unsafe('UPDATE checklists SET account_ids = $1::jsonb WHERE id = $2', [p.account_ids, id]);
      }
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
      // Editing a past day's points directly by id (the "today" editor uses
      // the POST upsert above instead, keyed by date rather than id).
      const points = Array.isArray(req.body?.points) ? req.body.points : [];
      await sql.unsafe('UPDATE daily_routine_notes SET points = $1::jsonb, updated_at = now() WHERE id = $2', [points, id]);
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
