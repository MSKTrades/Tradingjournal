import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../db.js';

type Trade = {
  id: number;
  trade_placed_at: string | null;
  trade_executed_at: string | null;
  coin_token: string | null;
  cisd_break: number | null;
  inverse_candle_size: number | null;
  distance_from_asia: number | null;
  reached_1r2: boolean;
  reached_1r3: boolean;
  reached_1r4: boolean;
  reached_1r5: boolean;
  max_rr: number | null;
  profit_loss: string | null;
};

type Condition = { field: string; op: string; value: number };

function parseJsonArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function matchesDay(trade: Trade, days: number[] | null | undefined): boolean {
  if (!days || days.length === 0) return true;
  if (!trade.trade_placed_at) return false;
  const dow = new Date(trade.trade_placed_at + 'T00:00:00').getDay();
  return days.includes(dow);
}

function matchesTime(
  trade: Trade,
  timeStart: string | null,
  timeEnd: string | null
): boolean {
  if (!timeStart && !timeEnd) return true;
  const t = trade.trade_executed_at;
  if (!t) return false;
  const time = String(t).substring(0, 5);
  if (timeStart && time < timeStart) return false;
  if (timeEnd && time > timeEnd) return false;
  return true;
}

function getFieldValue(trade: Trade, field: string): number | null {
  if (field === 'cisd_break') return trade.cisd_break != null ? Number(trade.cisd_break) : null;
  if (field === 'inverse_candles') return trade.inverse_candle_size != null ? Number(trade.inverse_candle_size) : null;
  if (field === 'gap_from_asia_h') return trade.distance_from_asia != null ? Number(trade.distance_from_asia) : null;
  return null;
}

function evalCondition(val: number | null, op: string, threshold: number): boolean {
  if (val === null || val === undefined) return false;
  switch (op) {
    case '<': return val < threshold;
    case '<=': return val <= threshold;
    case '>': return val > threshold;
    case '>=': return val >= threshold;
    case '=': return val === threshold;
    case '!=': return val !== threshold;
    default: return false;
  }
}

function getReached(trade: Trade, tp: number): boolean {
  if (tp <= 2) return Boolean(trade.reached_1r2);
  if (tp <= 3) return Boolean(trade.reached_1r3);
  if (tp <= 4) return Boolean(trade.reached_1r4);
  if (tp <= 5) return Boolean(trade.reached_1r5);
  return Number(trade.max_rr ?? -1) >= tp;
}

function calcR(trade: Trade, tp1: number, tp2: number | null, splitPct: number | null): number {
  if (tp2 !== null && splitPct !== null) {
    const half = splitPct / 100;
    if (getReached(trade, tp2)) return half * tp1 + (1 - half) * tp2;
    if (getReached(trade, tp1)) return half * tp1;
    return -1;
  }
  if (getReached(trade, tp1)) return tp1;
  return -1;
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const sql = db();

    const [tradesRaw, strategiesRaw] = await Promise.all([
      sql.unsafe(`
        SELECT id, trade_placed_at, trade_executed_at, coin_token, cisd_break,
               inverse_candle_size, distance_from_asia,
               reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, profit_loss
        FROM trades
      `),
      sql.unsafe(`
        SELECT * FROM strategies 
        WHERE active = true 
        ORDER BY sort_order ASC, id ASC
      `),
    ]);

    const trades = tradesRaw as Trade[];

    const strategies = (strategiesRaw as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      conditions: parseJsonArray<Condition>(s.conditions),
      days: parseJsonArray<number>(s.days),
      time_start: s.time_start ?? null,
      time_end: s.time_end ?? null,
      tp1_rr: Number(s.tp1_rr) || 3,
      tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
      split_percent: s.split_percent != null ? Number(s.split_percent) : null,
      active: Boolean(s.active),
    }));

    const results = strategies.map((strategy) => {
      const tp1 = strategy.tp1_rr;
      const tp2 = strategy.tp2_rr;
      const split = strategy.split_percent;

      const qualifying = trades.filter((trade) => {
        if (!matchesDay(trade, strategy.days)) return false;
        if (!matchesTime(trade, strategy.time_start, strategy.time_end)) return false;
        if (!strategy.conditions.length) return true;
        return strategy.conditions.every((cond) =>
          evalCondition(getFieldValue(trade, cond.field), cond.op, Number(cond.value))
        );
      });

      const tradeResults = qualifying.map((trade) => ({
        id: trade.id,
        date: trade.trade_placed_at ?? '',
        pair: trade.coin_token ?? '',
        r: calcR(trade, tp1, tp2, split),
      }));

      const total = tradeResults.length;
      const wins = tradeResults.filter((t) => t.r > 0).length;
      const losses = tradeResults.filter((t) => t.r < 0).length;
      const totalR = tradeResults.reduce((sum, t) => sum + t.r, 0);
      const grossWinR = tradeResults.filter((t) => t.r > 0).reduce((sum, t) => sum + t.r, 0);
      const grossLossR = Math.abs(
        tradeResults.filter((t) => t.r < 0).reduce((sum, t) => sum + t.r, 0)
      );

      const profitFactor =
        grossLossR > 0
          ? Math.round((grossWinR / grossLossR) * 100) / 100
          : grossWinR > 0
            ? null
            : 0;

      return {
        id: strategy.id,
        name: strategy.name,
        tp1_rr: tp1,
        tp2_rr: tp2,
        split_percent: split,
        conditions: strategy.conditions,
        days: strategy.days,
        time_start: strategy.time_start,
        time_end: strategy.time_end,
        total_trades: total,
        wins,
        losses,
        win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
        total_r: Math.round(totalR * 100) / 100,
        avg_r: total > 0 ? Math.round((totalR / total) * 100) / 100 : 0,
        profit_factor: profitFactor,
        trades: tradeResults,
      };
    });

    res.status(200).json(results);
  } catch (err: any) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});
