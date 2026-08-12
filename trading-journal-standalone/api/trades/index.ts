import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

function calcDuration(
  placedDate: string | null, execTime: string | null,
  closedDate: string | null, closeTime: string | null
): string | null {
  if (!placedDate || !closedDate) return null;
  try {
    const diffMs = new Date(`${closedDate}T${closeTime ?? '00:00'}`).getTime()
                 - new Date(`${placedDate}T${execTime ?? '00:00'}`).getTime();
    if (isNaN(diffMs) || diffMs < 0) return null;
    const d = Math.floor(diffMs / 86400000);
    const h = Math.floor((diffMs % 86400000) / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return m > 0 ? `${m}m` : '< 1m';
  } catch { return null; }
}

async function listTrades() {
  const sql = db();
  const rows = await sql.unsafe(
    `SELECT * FROM trades
     ORDER BY
       COALESCE(trade_number, 999999) ASC,
       COALESCE(trade_placed_at, created_at::date) ASC,
       created_at ASC`
  );
  if (rows.length === 0) return [];

  const initialCapital = Number(rows[0].start_capital ?? 0);
  const withTotals = rows.map((t: any) => {
    const endCap = Number(t.end_capital ?? t.start_capital ?? 0);
    const overallGain = Math.round((endCap - initialCapital) * 100) / 100;
    const overallPct = initialCapital !== 0 ? Math.round((overallGain / initialCapital) * 10000) / 100 : 0;
    return { ...t, overall_gain: overallGain, overall_pct: overallPct };
  });
  return withTotals.reverse();
}

async function addTrade(p: any) {
  const sql = db();
  const dollarRisk = (p.start_capital ?? 0) * (p.position_size ?? 0) / 100;
  const gain_loss  = p.profit_loss === 'Profit' ? dollarRisk * (p.rr ?? 0)
                    : p.profit_loss === 'Loss' ? -dollarRisk : 0;
  const gain_loss_pct = p.start_capital ? (gain_loss / p.start_capital * 100) : 0;
  const end_capital   = (p.start_capital ?? 0) + gain_loss;
  const trade_duration = calcDuration(p.trade_placed_at, p.trade_executed_at, p.date_closed, p.time_closed);

  const rows = await sql.unsafe(
    `INSERT INTO trades (
      trade_number, start_capital, end_capital, gain_loss, gain_loss_pct,
      structure_15m, wr_1m, before_chart_1m, direction,
      liquidity_swept, distance_from_asia, liquidity_swept_no,
      cisd_break, total_inverse_candles, inverse_candle_size, sl_pips, position_size,
      profit_loss, rr,
      coin_token, trade_placed_at, trade_executed_at, session_in,
      date_closed, time_closed, closed_session, trade_duration,
      partial_1, partial_2, reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr,
      comments, extra_data
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb
    ) RETURNING id`,
    [
      p.trade_number, p.start_capital, end_capital,
      Math.round(gain_loss * 100) / 100,
      Math.round(gain_loss_pct * 100) / 100,
      p.structure_15m, p.wr_1m, p.before_chart_1m, p.direction,
      p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
      p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
      p.profit_loss, p.rr,
      p.coin_token, p.trade_placed_at, p.trade_executed_at, p.session_in,
      p.date_closed, p.time_closed, p.closed_session, trade_duration,
      p.partial_1, p.partial_2,
      p.reached_1r2 ?? false, p.reached_1r3 ?? false, p.reached_1r4 ?? false, p.reached_1r5 ?? false,
      p.max_rr, p.comments, JSON.stringify(p.extra_data ?? {}),
    ]
  );
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') {
    res.status(200).json(await listTrades());
  } else if (req.method === 'POST') {
    res.status(200).json(await addTrade(req.body));
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
