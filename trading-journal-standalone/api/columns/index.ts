import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db';

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
      `INSERT INTO custom_columns (name, col_key, data_type, sort_order) VALUES ($1, $2, $3, $4) RETURNING id`,
      [p.name, p.col_key, p.data_type ?? 'text', nextOrder]
    );
    res.status(200).json(rows[0]);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
