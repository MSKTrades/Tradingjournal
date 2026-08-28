import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';
import { requireUserId, ownsAccount } from '../_auth.js';

// IMPORTANT: values bound to a `::jsonb`-cast parameter below must be passed
// as raw JS objects/arrays, NOT pre-stringified with JSON.stringify(). The
// `postgres` driver infers each placeholder's Postgres type from the query
// text (it sees the `::jsonb` cast) and applies its own JSON serializer to
// whatever value you give it — so a value that's already a JSON string gets
// serialized a second time, and the column ends up holding a jsonb *string*
// containing escaped JSON text instead of a real jsonb array/object
// (`jsonb_typeof(...)` shows 'string' and `jsonb_array_length(...)` throws
// "cannot get array length of a scalar"). Confirmed by reproducing against a
// throwaway local Postgres instance with this exact UPDATE. Passing the raw
// value lets the driver serialize it exactly once.
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
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  const id = Number(req.query.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

  // Ownership is checked through the trade's OWNING account, not a user_id
  // column on trades itself (trades don't have one — they're owned
  // transitively through account_id, same as custom_columns). A trade id
  // that doesn't exist, or whose account belongs to someone else, is treated
  // identically: 404, not "found but not yours" — no need to confirm to a
  // caller that a given trade id exists at all if it isn't theirs.
  const priorRows = await sql.unsafe(
    `SELECT t.account_id FROM trades t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1 AND a.user_id = $2`,
    [id, userId]
  );
  if (!priorRows[0]) { res.status(404).json({ error: 'Trade not found' }); return; }
  const priorAccountId = priorRows[0].account_id;

  if (req.method === 'PUT') {
    const p = req.body;
    const newAccountId = Number(p.account_id);
    if (!newAccountId || isNaN(newAccountId)) { res.status(400).json({ error: 'account_id is required' }); return; }
    // Reassigning the trade to a different account is only allowed if that
    // account is also this user's own — otherwise someone could move their
    // own trade into another user's account (or, combined with the check
    // above, move a trade they don't even own in the first place).
    if (!(await ownsAccount(sql, newAccountId, userId))) { res.status(404).json({ error: 'Account not found' }); return; }

    // start_capital / end_capital / gain_loss / gain_loss_pct are always
    // recomputed below via recalcAccountCapital, never trusted from the client.
    const trade_duration = calcDuration(p.trade_placed_at, p.trade_executed_at, p.date_closed, p.time_closed);
    const { comments, screenshots } = deriveFromNotesBlocks(p.notes_blocks);
    // net_profit is computed here, not trusted from the client, same reasoning
    // as start_capital/end_capital/gain_loss above - it's a derived number
    // (gross_profit - commission), not a fact being reported.
    const netProfit = p.gross_profit != null ? Math.round((Number(p.gross_profit) - Number(p.commission ?? 0)) * 100) / 100 : null;

    await sql.unsafe(
      `UPDATE trades SET
        account_id=$1,
        trade_number=$2,
        structure_15m=$3, wr_1m=$4, before_chart_1m=$5, direction=$6, entry_type=$7,
        liquidity_swept=$8, distance_from_asia=$9, liquidity_swept_no=$10,
        cisd_break=$11, total_inverse_candles=$12, inverse_candle_size=$13, sl_pips=$14, position_size=$15,
        profit_loss=$16, rr=$17, entry_price=$18, tp_price=$19, sl_price=$20,
        coin_token=$21, trade_placed_at=$22, trade_executed_at=$23, session_in=$24,
        date_closed=$25, time_closed=$26, closed_session=$27, trade_duration=$28,
        partial_1=$29, partial_2=$30, reached_1r2=$31, reached_1r3=$32, reached_1r4=$33, reached_1r5=$34,
        max_rr=$35, comments=$36, extra_data=$37::jsonb, screenshots=$38::jsonb, notes_blocks=$39::jsonb,
        checklist_enabled=$40, checklist_id=$41, checklist_results=$42::jsonb, tags=$43::jsonb, tag_selections=$44::jsonb,
        emotions=$45, trade_rating=$46,
        gross_profit=$47, commission=$48, net_profit=$49
      WHERE id=$50`,
      [
        newAccountId,
        p.trade_number,
        p.structure_15m, p.wr_1m, p.before_chart_1m, p.direction, p.entry_type ?? null,
        p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
        p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
        p.profit_loss, p.rr, p.entry_price, p.tp_price, p.sl_price,
        p.coin_token, p.trade_placed_at, p.trade_executed_at, p.session_in,
        p.date_closed, p.time_closed, p.closed_session, trade_duration,
        p.partial_1, p.partial_2,
        p.reached_1r2 ?? false, p.reached_1r3 ?? false, p.reached_1r4 ?? false, p.reached_1r5 ?? false,
        p.max_rr, comments, p.extra_data ?? {}, screenshots, p.notes_blocks ?? [],
        p.checklist_enabled ?? false, p.checklist_id ?? null, p.checklist_results ?? {}, p.tags ?? [], p.tag_selections ?? {},
        // emotions is a native Postgres TEXT[] column (unlike tags, which is
        // JSONB) - passed as a plain JS array with no ::jsonb cast, so the
        // driver encodes it as a real Postgres array instead of JSON text.
        p.emotions ?? [], p.trade_rating ?? null,
        p.gross_profit ?? null, p.commission ?? null, netProfit, id,
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
    // Ownership of `id` was already confirmed above (priorRows), so this
    // DELETE is safe to run unscoped by user_id — there's nothing to
    // additionally filter by, since trades has no user_id column of its own.
    await sql.unsafe('DELETE FROM trades WHERE id = $1', [id]);
    await recalcAccountCapital(sql, priorAccountId);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
