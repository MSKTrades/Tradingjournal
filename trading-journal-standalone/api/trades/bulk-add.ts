import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

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
  const s = String(val ?? '').trim().toLowerCase().replace(/[\s\u200b\u00a0]/g, '');
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

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const rows: any[] = req.body.trades ?? [];
  if (rows.length === 0) { res.status(200).json({ inserted: 0, skipped: 0 }); return; }

  const sql = db();
  let inserted = 0, skipped = 0;

  for (const p of rows) {
    const tradePlacedAt   = sanitizeDate(p.trade_placed_at);
    const tradeExecutedAt = sanitizeTime(p.trade_executed_at);
    const sessionIn       = sanitizeText(p.session_in);
    const dateClosed      = sanitizeDate(p.date_closed);
    const timeClosed      = sanitizeTime(p.time_closed);
    const closedSession   = sanitizeText(p.closed_session);
    const tradeDuration   = computeDuration(tradePlacedAt, tradeExecutedAt, dateClosed, timeClosed);

    const dollarRisk  = (p.start_capital ?? 0) * (p.position_size ?? 0) / 100;
    const gain_loss   = p.profit_loss === 'Profit' ? dollarRisk * (p.rr ?? 0)
                       : p.profit_loss === 'Loss' ? -dollarRisk : null;
    const gain_loss_pct = (gain_loss != null && p.start_capital) ? gain_loss / p.start_capital * 100 : null;
    const end_capital = (gain_loss != null && p.start_capital != null) ? p.start_capital + gain_loss : null;

    try {
      await sql.unsafe(
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
        )`,
        [
          p.trade_number, p.start_capital, end_capital,
          gain_loss != null ? Math.round(gain_loss * 100) / 100 : null,
          gain_loss_pct != null ? Math.round(gain_loss_pct * 100) / 100 : null,
          p.structure_15m, p.wr_1m, p.before_chart_1m ?? null, p.direction ?? 'Long',
          p.liquidity_swept, p.distance_from_asia, p.liquidity_swept_no,
          p.cisd_break, p.total_inverse_candles, p.inverse_candle_size, p.sl_pips, p.position_size,
          p.profit_loss, p.rr,
          p.coin_token, tradePlacedAt, tradeExecutedAt, sessionIn,
          dateClosed, timeClosed, closedSession, tradeDuration,
          p.partial_1, p.partial_2,
          parseBool(p.reached_1r2), parseBool(p.reached_1r3), parseBool(p.reached_1r4), parseBool(p.reached_1r5),
          p.max_rr, p.comments, JSON.stringify(p.extra_data ?? {}),
        ]
      );
      inserted++;
    } catch (_err) {
      skipped++;
    }
  }

  res.status(200).json({ inserted, skipped });
});
