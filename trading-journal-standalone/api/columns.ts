import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';

// Also handles the reusable Tags list (?resource=tags) through this same
// function — kept here rather than a new api/tags.ts file because the
// Vercel Hobby plan caps serverless functions at 12 and this project is
// already at 11. Tags and custom columns are both small "define a
// reusable named thing" tables, so the same GET/POST/DELETE shape fits
// both; `resource` (query param on GET/DELETE, body field on POST)
// defaults to `columns` since that's the original/more common caller.
export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.method === 'GET') {
    if (req.query.resource === 'tags') {
      const rows = await sql.unsafe('SELECT * FROM tags ORDER BY sort_order ASC, id ASC');
      res.status(200).json(rows);
      return;
    }
    const rows = await sql.unsafe('SELECT * FROM custom_columns ORDER BY sort_order ASC, id ASC');
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const p = req.body;
    if (p.resource === 'tags') {
      const name = String(p.name ?? '').trim();
      if (!name) { res.status(400).json({ error: 'name is required' }); return; }
      const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM tags');
      const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
      // A tag someone already created (case-insensitive) just returns the
      // existing row instead of erroring on the UNIQUE constraint — the
      // picker calls this optimistically whenever a not-yet-known name is
      // typed, so "already exists" should be a silent no-op, not a failure.
      const existing = await sql.unsafe('SELECT * FROM tags WHERE lower(name) = lower($1)', [name]);
      if (existing.length > 0) { res.status(200).json(existing[0]); return; }
      const rows = await sql.unsafe(
        `INSERT INTO tags (name, color, sort_order) VALUES ($1, $2, $3) RETURNING *`,
        [name, p.color ?? '#f59e0b', nextOrder]
      );
      res.status(200).json(rows[0]);
      return;
    }
    const maxOrderRows = await sql.unsafe('SELECT COALESCE(MAX(sort_order), 0) as max FROM custom_columns');
    const nextOrder = (maxOrderRows[0]?.max ?? 0) + 1;
    const rows = await sql.unsafe(
      `INSERT INTO custom_columns (name, col_key, data_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [p.name, p.col_key, p.data_type ?? 'text', nextOrder]
    );
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (req.query.resource === 'tags') {
      await sql.unsafe('DELETE FROM tags WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    await sql.unsafe('DELETE FROM custom_columns WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
