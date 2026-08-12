import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  if (req.method === 'GET') {
    const rows = await sql.unsafe(
      'SELECT * FROM strategies ORDER BY sort_order ASC, id ASC'
    );

    const normalized = rows.map((s: any) => ({
      ...s,
      conditions:
        typeof s.conditions === 'string'
          ? JSON.parse(s.conditions || '[]')
          : s.conditions ?? [],
      days:
        typeof s.days === 'string'
          ? JSON.parse(s.days || '[]')
          : s.days ?? [],
      time_start: s.time_start ?? null,
      time_end: s.time_end ?? null,
    }));

    res.status(200).json(normalized);
  } else if (req.method === 'POST') {
    const p = req.body;

    const rows = await sql.unsafe(
      `INSERT INTO strategies 
         (name, conditions, days, time_start, time_end, tp1_rr, tp2_rr, split_percent, sort_order, active)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        p.name,
        JSON.stringify(p.conditions ?? []),
        JSON.stringify(p.days ?? []),
        p.time_start ?? null,
        p.time_end ?? null,
        p.tp1_rr,
        p.tp2_rr ?? null,
        p.split_percent ?? null,
        p.sort_order ?? 0,
        p.active ?? true,
      ]
    );

    res.status(200).json(rows[0]);
  } else if (req.method === 'PUT') {
    const p = req.body;
    const id = p.id;

    if (!id) {
      res.status(400).json({ error: 'Missing strategy id' });
      return;
    }

    await sql.unsafe(
      `UPDATE strategies SET
         name = $1,
         conditions = $2::jsonb,
         days = $3::jsonb,
         time_start = $4,
         time_end = $5,
         tp1_rr = $6,
         tp2_rr = $7,
         split_percent = $8,
         sort_order = $9,
         active = $10
       WHERE id = $11`,
      [
        p.name,
        JSON.stringify(p.conditions ?? []),
        JSON.stringify(p.days
