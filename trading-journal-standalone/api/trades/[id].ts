import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';

function deriveFromNotesBlocks(notesBlocks: any) {
  const blocks = Array.isArray(notesBlocks) ? notesBlocks : [];
  const comments = blocks.filter((b: any) => b?.type === 'text' && b.value)
    .map((b: any) => b.value).join('\n\n').trim() || null;
  const screenshots = blocks.filter((b: any) => b?.type === 'image' && b.url).map((b: any) => b.url);
  return { comments, screenshots };
}

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
    const newAccountId = Number(p.account_id);
    if (!newAccountId || isNaN(newAccountId)) { res.status(400).json({ error: 'account_id is required' }); return; }

    const priorRows = await sql.unsafe('SELECT account_id FROM trades WHERE id = $1', [id]);
    const priorAccountId = priorRows[0]?.account_id ?? null;

    // start_capital / end_capital / gain_loss / gain_loss_pct are always
    // recomputed below via recalcAccountCapital, never trusted from the client.
    const trade_duration = calcDuration(p.trade_placed_at, p.trade_executed_at, p.date_closed, p.time_closed);
    const { comments, screenshots } = deriveFromNotesBlocks(p.notes_blocks);

    await sql.unsafe(
      `UPDATE trades SET
        account_id=$1,
        trade_number=$2,
        structure_15m=$3, wr_1m=$4, before_chart_1m=$5, direction=$6,
        liquidity_swept=$7, distance_from_asia=$8, liquidity_swept_no=$9,
        cisd_break=$10, total_inverse_candles=$11, inverse_candle_size=$12, sl_pips=$13, position_size=$14,
        profit_loss=$15, rr=$16, entry_price=$17, tp_price=$18, sl_price=$19,
        coin_token=$20, trade_placed_at=$21, trade_executed_at=$22, session_in=$23,
        date_closed=$24, time_closed=$25, closed_session=$26, trade_duration=$27,
        partial_1=$28, partial_2=$29, reached_1r2=$30, reached_1r3=$31, reached_1r4=$32, reached_1r5=$33,
        max_rr=$34, comments=$35, extra_data=$36::jsonb, screenshots=$37::jsonb, notes_blocks=$38::jsonb
      WHERE id=$39`,
      [
        newAccountId,
        p.trade_number,
        p.structure_15m, p.wr_1m, p.before_chart_1m, p.direction,
        p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
        p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
        p.profit_loss, p.rr, p.entry_price, p.tp_price, p.sl_price,
        p.coin_token, p.trade_placed_at, p.trade_executed_at, p.session_in,
        p.date_closed, p.time_closed, p.closed_session, trade_duration,
        p.partial_1, p.partial_2,
        p.reached_1r2 ?? false, p.reached_1r3 ?? false, p.reached_1r4 ?? false, p.reached_1r5 ?? false,
        p.max_rr, comments, JSON.stringify(p.extra_data ?? {}), JSON.stringify(screenshots), JSON.stringify(p.notes_blocks ?? []), id,
      ]
    );

    // Recalc whichever account(s) this trade actually touched — both the
    // old and new one if it was just reassigned, so neither chain is left stale.
    await recalcAccountCapital(sql, newAccountId);
    if (priorAccountId && priorAccountId !== newAccountId) {
      await recalcAccountCapital(sql, priorAccountId);
    }

    res.status(200).json({ id });
  } else if (req.method === 'DELETE') {
    const priorRows = await sql.unsafe('SELECT account_id FROM trades WHERE id = $1', [id]);
    const accountId = priorRows[0]?.account_id ?? null;
    await sql.unsafe('DELETE FROM trades WHERE id = $1', [id]);
    if (accountId) await recalcAccountCapital(sql, accountId);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
