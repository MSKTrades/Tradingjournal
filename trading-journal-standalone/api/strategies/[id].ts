import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const p = req.body;
    await sql.unsafe(
      `UPDATE strategies SET
        name = $1, conditions = $2::jsonb, days = $3::jsonb,
        time_start = $4, time_end = $5,
        tp1_rr = $6, tp2_rr = $7, split_percent = $8, active = $9, sort_order = $10
       WHERE id = $11`,
      [p.name, JSON.stringify(p.conditions ?? []), JSON.stringify(p.days ?? []), p.time_start ?? null, p.time_end ?? null, p.tp1_rr, p.tp2_rr, p.split_percent, p.active, p.sort_order ?? 0, id]
    );
    res.status(200).json({ id });
  } else if (req.method === 'DELETE') {
    await sql.unsafe('DELETE FROM strategies WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
