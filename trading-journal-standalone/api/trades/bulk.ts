import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from '../_db.js';
import { requireUserId, ownsAccount } from '../_auth.js';

// Combines the old api/trades/bulk-add.ts and api/trades/bulk-delete.ts into
// one file, dispatched by ?resource=add / ?resource=delete - same reasoning
// as api/columns.ts's own multi-resource comment: the Vercel Hobby plan caps
// serverless functions at 12, and freeing this one slot is what made room
// for the new Stripe billing endpoint (api/stripe.ts) without paying for a
// plan upgrade or cutting another feature. Frontend callers now hit
// POST /api/trades/bulk?resource=add and POST /api/trades/bulk?resource=delete
// instead of two separate paths (see src/pages/Journal.tsx) - the demo-mode
// fake backend (src/lib/demoBackend.ts) was updated to match the same split.

function sanitizeDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || !/\d/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const yr = d.getFullYear();
  if (yr < 2000 || yr > 2100) return null;
  return d.toISOString().split('T')[0] ?? null;
}

function sanitizeTime(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const simple = s.match(/^(\d{1,2}):(\d{2})/);
  if (simple) return `${simple[1]!.padStart(2, '0')}:${simple[2]}`;
  const embedded = s.match(/(\d{1,2}):(\d{2}):\d{2}/);
  if (embedded) return `${embedded[1]!.padStart(2, '0')}:${embedded[2]}`;
  return null;
}

function sanitizeText(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/1899/.test(s)) return null;
  return s || null;
}

function parseBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val ?? '').trim().toLowerCase().replace(/[\s​ ]/g, '');
  return ['1', 'true', 'yes', 'y', '✓', 'x', 'hit', 'done', '✅', 'reached', 'took', 'tp'].includes(s);
}

function computeDuration(
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

async function bulkAdd(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>, userId: number) {
  const rows: any[] = req.body.trades ?? [];
  if (rows.length === 0) { res.status(200).json({ inserted: 0, skipped: 0 }); return; }

  const accountId = Number(req.body.account_id);
  if (!accountId || isNaN(accountId)) { res.status(400).json({ error: 'account_id is required' }); return; }
  if (!(await ownsAccount(sql, accountId, userId))) { res.status(404).json({ error: 'Account not found' }); return; }

  let inserted = 0, skipped = 0;

  for (const p of rows) {
    const tradePlacedAt   = sanitizeDate(p.trade_placed_at);
    const tradeExecutedAt = sanitizeTime(p.trade_executed_at);
    const sessionIn       = sanitizeText(p.session_in);
    const dateClosed      = sanitizeDate(p.date_closed);
    const timeClosed      = sanitizeTime(p.time_closed);
    const closedSession   = sanitizeText(p.closed_session);
    const tradeDuration   = computeDuration(tradePlacedAt, tradeExecutedAt, dateClosed, timeClosed);
    // 'csv_import' is the only other source this endpoint ever writes (see
    // ImportTradesDialog.tsx) — a real broker statement carries an actual
    // dollar P&L per row instead of the Profit/Loss category a hand-logged
    // trade uses, and recalcAccountCapital (api/_db.js) trusts that stored
    // gain_loss directly for this source instead of recomputing it from
    // position_size%/RR, same as it already does for source='mt_sync'.
    const source     = p.source === 'csv_import' ? 'csv_import' : 'manual';
    const externalId = source === 'csv_import' ? (p.external_id ?? null) : null;
    const gainLoss   = source === 'csv_import' && p.gain_loss != null ? Number(p.gain_loss) : null;

    try {
      await sql.unsafe(
        `INSERT INTO trades (
          account_id, source, external_id,
          trade_number,
          structure_15m, wr_1m, before_chart_1m, direction,
          liquidity_swept, distance_from_asia, liquidity_swept_no,
          cisd_break, total_inverse_candles, inverse_candle_size, sl_pips, position_size,
          profit_loss, gain_loss, rr, entry_price, tp_price, sl_price,
          coin_token, trade_placed_at, trade_executed_at, session_in,
          date_closed, time_closed, closed_session, trade_duration,
          partial_1, partial_2, reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr,
          comments, extra_data
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38::jsonb
        )
        -- Only ever matches a prior row when source='csv_import' AND both
        -- rows share a broker-provided external_id (the partial unique
        -- index this targets is scoped to source='csv_import' — see
        -- schema.sql). A 'manual' row, or a csv_import row whose source
        -- CSV had no ticket/order-id column to map, never conflicts and
        -- always inserts fresh, same as before this change. Deliberately
        -- doesn't touch comments/screenshots/notes/tags/checklist results
        -- on conflict, so re-uploading a statement can't clobber anything
        -- you've added by hand since the last import — mirrors the same
        -- restraint api/accounts.ts's MT4/5 sync upsert already uses.
        ON CONFLICT (account_id, source, external_id) WHERE source = 'csv_import' DO UPDATE SET
          coin_token = EXCLUDED.coin_token, direction = EXCLUDED.direction,
          entry_price = EXCLUDED.entry_price, sl_price = EXCLUDED.sl_price, tp_price = EXCLUDED.tp_price,
          trade_placed_at = EXCLUDED.trade_placed_at, trade_executed_at = EXCLUDED.trade_executed_at,
          date_closed = EXCLUDED.date_closed, time_closed = EXCLUDED.time_closed,
          trade_duration = EXCLUDED.trade_duration,
          profit_loss = EXCLUDED.profit_loss, gain_loss = EXCLUDED.gain_loss,
          rr = EXCLUDED.rr, extra_data = EXCLUDED.extra_data`,
        [
          accountId, source, externalId,
          p.trade_number,
          p.structure_15m, p.wr_1m, p.before_chart_1m ?? null, p.direction ?? 'Long',
          p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
          p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
          p.profit_loss, gainLoss, p.rr, p.entry_price ?? null, p.tp_price ?? null, p.sl_price ?? null,
          p.coin_token, tradePlacedAt, tradeExecutedAt, sessionIn,
          dateClosed, timeClosed, closedSession, tradeDuration,
          p.partial_1, p.partial_2,
          parseBool(p.reached_1r2), parseBool(p.reached_1r3), parseBool(p.reached_1r4), parseBool(p.reached_1r5),
          // Raw value, not JSON.stringify()'d — see api/trades/index.ts for
          // why pre-stringifying a value bound to a `::jsonb` cast
          // double-encodes it.
          p.max_rr, p.comments, p.extra_data ?? {},
        ]
      );
      inserted++;
    } catch (_err) {
      skipped++;
    }
  }

  // start_capital / end_capital / gain_loss / gain_loss_pct for every trade
  // in this account (including the ones just imported) are derived here,
  // once, rather than per-row above.
  if (inserted > 0) await recalcAccountCapital(sql, accountId);

  res.status(200).json({ inserted, skipped });
}

async function bulkDelete(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>, userId: number) {
  const ids: number[] = req.body.ids ?? [];
  if (ids.length === 0) { res.status(200).json({ deleted: 0 }); return; }

  // Only actually delete the ids that belong to this user's own accounts —
  // any id in the list that isn't theirs (a typo, a stale client cache, or
  // someone poking at the API directly) is silently excluded rather than
  // either deleting it anyway or failing the whole batch.
  const ownedRows = await sql.unsafe(
    `SELECT t.id, t.account_id FROM trades t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.id = ANY($1::integer[]) AND a.user_id = $2`,
    [ids, userId]
  );
  const ownedIds = ownedRows.map((r: any) => r.id);
  const affectedAccountIds = [...new Set(ownedRows.map((r: any) => r.account_id))];

  if (ownedIds.length > 0) {
    await sql.unsafe('DELETE FROM trades WHERE id = ANY($1::integer[])', [ownedIds]);
    for (const accountId of affectedAccountIds) {
      await recalcAccountCapital(sql, accountId as number);
    }
  }

  res.status(200).json({ deleted: ownedIds.length });
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sql = db();
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  const resource = req.query.resource;
  if (resource === 'delete') { await bulkDelete(req, res, sql, userId); return; }
  if (resource === 'add') { await bulkAdd(req, res, sql, userId); return; }
  res.status(400).json({ error: 'Unknown resource — expected ?resource=add or ?resource=delete' });
});
