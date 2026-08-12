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

type Strategy = {
  id: number;
  name: string;
  conditions: Condition[];
  days: number[] | null;
  time_start: string | null;
  time_end: string | null;
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
  active: boolean;
};

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
  const dow = new Date(trade.trade_placed_at).getDay();
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

  const time = t.substring(0, 5); // "HH:MM"

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

  const sql = db();

  const [trades, rawStrategies] = await Promise.all([
    sql.unsafe(
      `SELECT id, trade_placed_at, trade_executed_at, coin_token, cisd_break,
              inverse_candle_size, distance_from_asia,
              reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, profit_loss
       FROM trades`
    ),
    sql.unsafe('SELECT * FROM strategies WHERE active = true ORDER BY sort_order ASC, id ASC'),
  ]);

  const strategies: Strategy[] = (rawStrategies as any[]).map((s) => ({
    ...s,
    conditions: parseJsonArray<Condition>(s.conditions),
    days: parseJsonArray<number>(s.days),
    time_start: s.time_start ?? null,
    time_end: s.time_end ?? null,
    tp1_rr: Number(s.tp1_rr),
    tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
    split_percent: s.split
