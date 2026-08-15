import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';

// `comments` and `screenshots` are derived from notes_blocks server-side so
// they can never drift out of sync with what's actually in the editor —
// `comments` powers the Journal table's text column / any future search,
// `screenshots` is a flat list for possible future thumbnail use.
// IMPORTANT: values bound to a `::jsonb`-cast parameter below must be passed
// as raw JS objects/arrays, NOT pre-stringified with JSON.stringify(). The
// `postgres` driver infers each placeholder's Postgres type from the query
// text (it sees the `::jsonb` cast) and applies its own JSON serializer to
// whatever value you give it — so a value that's already a JSON string gets
// serialized a second time, and the column ends up holding a jsonb *string*
// containing escaped JSON text instead of a real jsonb array/object
// (`jsonb_typeof(...)` shows 'string' and `jsonb_array_length(...)` throws
// "cannot get array length of a scalar"). Confirmed by reproducing against a
// throwaway local Postgres instance with this exact INSERT. Passing the raw
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

async function listTrades(accountId: number) {
  const sql = db();
  const rows = await sql.unsafe(
    `SELECT * FROM trades
     WHERE account_id = $1
     ORDER BY
       COALESCE(trade_number, 999999) ASC,
       COALESCE(trade_placed_at, created_at::date) ASC,
       created_at ASC`,
    [accountId]
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
  const accountId = Number(p.account_id);
  if (!accountId || isNaN(accountId)) throw new Error('account_id is required');

  // start_capital / end_capital / gain_loss / gain_loss_pct are never taken
  // from the client — they're filled in by recalcAccountCapital right after
  // insert, derived from the account's starting_balance and every trade's
  // position_size / profit_loss / rr in chronological order.
  const trade_duration = calcDuration(p.trade_placed_at, p.trade_executed_at, p.date_closed, p.time_closed);
  const { comments, screenshots } = deriveFromNotesBlocks(p.notes_blocks);

  const rows = await sql.unsafe(
    `INSERT INTO trades (
      account_id,
      trade_number,
      structure_15m, wr_1m, before_chart_1m, direction, entry_type,
      liquidity_swept, distance_from_asia, liquidity_swept_no,
      cisd_break, total_inverse_candles, inverse_candle_size, sl_pips, position_size,
      profit_loss, rr, entry_price, tp_price, sl_price,
      coin_token, trade_placed_at, trade_executed_at, session_in,
      date_closed, time_closed, closed_session, trade_duration,
      partial_1, partial_2, reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr,
      comments, extra_data, screenshots, notes_blocks, checklist_enabled, checklist_id, checklist_results, tags, tag_selections
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,
      $36,$37::jsonb,$38::jsonb,$39::jsonb,$40,$41,$42::jsonb,$43::jsonb,$44::jsonb
    ) RETURNING id`,
    [
      accountId,
      p.trade_number,
      p.structure_15m, p.wr_1m, p.before_chart_1m, p.direction, p.entry_type ?? null,
      p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
      p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
      p.profit_loss, p.rr, p.entry_price, p.tp_price, p.sl_price,
      p.coin_token, p.trade_placed_at, p.trade_executed_at, p.session_in,
      p.date_closed, p.time_closed, p.closed_session, trade_duration,
      p.partial_1, p.partial_2,
      p.reached_1r2 ?? false, p.reached_1r3 ?? false, p.reached_1r4 ?? false, p.reached_1r5 ?? false,
      // Passed as raw JS values (not pre-stringified) on purpose — see the
      // note by deriveFromNotesBlocks below for why.
      p.max_rr, comments, p.extra_data ?? {}, screenshots, p.notes_blocks ?? [],
      p.checklist_enabled ?? false, p.checklist_id ?? null, p.checklist_results ?? {}, p.tags ?? [], p.tag_selections ?? {},
    ]
  );
  await recalcAccountCapital(sql, accountId);
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET') {
    // Tolerant of a missing/invalid account_id (e.g. during the first render
    // before the account context has resolved) — return an empty list rather
    // than erroring, since the frontend will refetch once it has a real id.
    const accountIdParam = req.query.account_id;
    const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
    if (!accountId || isNaN(accountId)) { res.status(200).json([]); return; }
    res.status(200).json(await listTrades(accountId));
  } else if (req.method === 'POST') {
    res.status(200).json(await addTrade(req.body));
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
