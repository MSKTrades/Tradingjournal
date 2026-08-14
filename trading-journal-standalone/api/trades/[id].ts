import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db.js';

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
        account_id=$1,
        trade_number=$2, start_capital=$3, end_capital=$4, gain_loss=$5, gain_loss_pct=$6,
        structure_15m=$7, wr_1m=$8, before_chart_1m=$9, direction=$10,
        liquidity_swept=$11, distance_from_asia=$12, liquidity_swept_no=$13,
        cisd_break=$14, total_inverse_candles=$15, inverse_candle_size=$16, sl_pips=$17, position_size=$18,
        profit_loss=$19, rr=$20,
        coin_token=$21, trade_placed_at=$22, trade_executed_at=$23, session_in=$24,
        date_closed=$25, time_closed=$26, closed_session=$27, trade_duration=$28,
        partial_1=$29, partial_2=$30, reached_1r2=$31, reached_1r3=$32, reached_1r4=$33, reached_1r5=$34,
        max_rr=$35, comments=$36, extra_data=$37::jsonb
      WHERE id=$38`,
      [
        p.account_id,
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
