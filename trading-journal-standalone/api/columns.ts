import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.method === 'GET') {
    const rows = await sql.unsafe('SELECT * FROM custom_columns ORDER BY sort_order ASC, id ASC');
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const p = req.body;
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
    await sql.unsafe('DELETE FROM custom_columns WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
