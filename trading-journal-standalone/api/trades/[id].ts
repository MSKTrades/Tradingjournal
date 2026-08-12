import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db';

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

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const id = Number(req.query.id);

  if (req.method === 'PUT') {
    const p = req.body;
    const dollarRisk = (p.start_capital ?? 0) * (p.position_size ?? 0) / 100;
    const gain_loss  = p.profit_loss === 'Profit' ? dollarRisk * (p.rr ?? 0)
                      : p.profit_loss === 'Loss' ? -dollarRisk : 0;
    const gain_loss_pct = p.start_capital ? (gain_loss / p.start_capital * 100) : 0;
    const end_capital   = (p.start_capital ?? 0) + gain_loss;
    const trade_duration = calcDuration(p.trade_placed_at, p.trade_executed_at, p.date_closed, p.time_closed);

    await sql.unsafe(
      `UPDATE trades SET
        trade_number=$1, start_capital=$2, end_capital=$3, gain_loss=$4, gain_loss_pct=$5,
        structure_15m=$6, wr_1m=$7, before_chart_1m=$8, direction=$9,
        liquidity_swept=$10, distance_from_asia=$11, liquidity_swept_no=$12,
        cisd_break=$13, total_inverse_candles=$14, inverse_candle_size=$15, sl_pips=$16, position_size=$17,
        profit_loss=$18, rr=$19,
        coin_token=$20, trade_placed_at=$21, trade_executed_at=$22, session_in=$23,
        date_closed=$24, time_closed=$25, closed_session=$26, trade_duration=$27,
        partial_1=$28, partial_2=$29, reached_1r2=$30, reached_1r3=$31, reached_1r4=$32, reached_1r5=$33,
        max_rr=$34, comments=$35, extra_data=$36::jsonb
      WHERE id=$37`,
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
        p.max_rr, p.comments, JSON.stringify(p.extra_data ?? {}), id,
      ]
    );
    res.status(200).json({ id });
  } else if (req.method === 'DELETE') {
    await sql.unsafe('DELETE FROM trades WHERE id = $1', [id]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
