import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const sql = db();

    const strategies = await sql.unsafe(
      'SELECT id, name, active FROM strategies WHERE active = true'
    );

    const results = (strategies as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      tp1_rr: 3,
      tp2_rr: null,
      split_percent: null,
      conditions: [],
      days: [],
      time_start: null,
      time_end: null,
      total_trades: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      total_r: 0,
      avg_r: 0,
      profit_factor: 0,
      trades: [],
    }));

    res.status(200).json(results);
  } catch (err: any) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});
