import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  if (req.method === 'GET') {
    const rows = await sql.unsafe('SELECT * FROM strategies ORDER BY sort_order ASC, id ASC');
    res.status(200).json(rows);
  } else if (req.method === 'POST') {
    const p = req.body;
    const rows = await sql.unsafe(
      `INSERT INTO strategies (name, conditions, days, tp1_rr, tp2_rr, split_percent, sort_order)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)
       RETURNING id`,
      [p.name, JSON.stringify(p.conditions ?? []), JSON.stringify(p.days ?? []), p.tp1_rr, p.tp2_rr, p.split_percent, p.sort_order ?? 0]
    );
    res.status(200).json(rows[0]);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
