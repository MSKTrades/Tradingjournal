import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db.js';
import { requireUserId, ownsAccount } from '../_auth.js';

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Condition = { field: string; op: string; value: number | string };
const TAG_CONDITION_FIELD = 'has_tag';

// --- Same filter helpers as summary/index.ts, duplicated here on purpose so
// this endpoint has no dependency on that file and can't be broken by
// changes made there (or vice versa). Keep them in sync if you touch the
// filtering logic in one place. ---
function parseJsonArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const p = JSON.parse(value || '[]'); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }
  return [];
}

function matchesDay(trade: any, days: number[] | null | undefined): boolean {
  if (!days || days.length === 0) return true;
  if (!trade.trade_placed_at) return false;
  const d = new Date(trade.trade_placed_at);
  if (isNaN(d.getTime())) return false;
  return days.includes(d.getUTCDay());
}

function matchesTime(trade: any, timeStart: string | null, timeEnd: string | null): boolean {
  if (!timeStart && !timeEnd) return true;
  const t = trade.trade_executed_at;
  if (!t) return false;
  const time = String(t).substring(0, 5);
  if (timeStart && time < timeStart) return false;
  if (timeEnd && time > timeEnd) return false;
  return true;
}

// Mirrors api/summary/index.ts's getFieldValue exactly - see that file's
// comment for why the three legacy SMC keys alias into extra_data rather
// than reading the (still-present, but no longer written to) raw columns.
// This copy had drifted out of sync with that one: it only ever recognized
// those three hardcoded keys and returned null for anything else, which
// meant a strategy condition on ANY other custom field (added via Manage
// Columns) silently matched zero trades here - evalCondition(null, ...) is
// always false - even though the exact same condition worked correctly on
// the Summary page. Bringing this back in line with summary/index.ts fixes
// that for good instead of just patching the one field someone happens to
// report next.
const RAW_NUMERIC_FIELDS: Record<string, string> = {
  rr: 'rr',
  max_rr: 'max_rr',
  entry_price: 'entry_price',
  tp_price: 'tp_price',
  sl_price: 'sl_price',
  gain_loss: 'gain_loss',
  gain_loss_pct: 'gain_loss_pct',
  position_size: 'position_size',
  partial_1: 'partial_1',
  partial_2: 'partial_2',
};

const LEGACY_EXTRA_DATA_ALIASES: Record<string, string> = {
  cisd_break: 'cisd_break',
  inverse_candles: 'inverse_candle_size',
  gap_from_asia_h: 'distance_from_asia',
};

function getFieldValue(trade: any, field: string): number | null {
  const rawKey = RAW_NUMERIC_FIELDS[field];
  if (rawKey) {
    const v = trade[rawKey];
    return v != null ? Number(v) : null;
  }
  const extraKey = LEGACY_EXTRA_DATA_ALIASES[field] ?? field;
  const v = trade.extra_data?.[extraKey];
  return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null;
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

// Same reasoning as summary/index.ts's matchesTagCondition - a condition on
// TAG_CONDITION_FIELD carries a tag name in `value`, not a number, so it's
// checked against trade.tags directly instead of going through
// getFieldValue/evalCondition.
function matchesCondition(trade: any, cond: Condition): boolean {
  if (cond.field === TAG_CONDITION_FIELD) {
    const has = (trade.tags ?? []).includes(String(cond.value));
    return cond.op === '!has' ? !has : has;
  }
  return evalCondition(getFieldValue(trade, cond.field), cond.op, Number(cond.value));
}

function isWin(t: any): boolean {
  if (t.profit_loss === 'Profit') return true;
  if (t.profit_loss === 'Loss') return false;
  return Number(t.gain_loss ?? 0) > 0;
}
function isLoss(t: any): boolean {
  if (t.profit_loss === 'Loss') return true;
  if (t.profit_loss === 'Profit') return false;
  return Number(t.gain_loss ?? 0) < 0;
}

function toISODate(t: any): string {
  const raw = t.trade_placed_at;
  if (!raw) return '';
  if (raw instanceof Date) return raw.toISOString().substring(0, 10);
  return String(raw).substring(0, 10);
}

function computeStreaks(list: any[]) {
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  const winStreaks: number[] = [], lossStreaks: number[] = [];
  for (const t of list) {
    if (isWin(t)) {
      curWin++;
      if (curLoss > 0) { lossStreaks.push(curLoss); curLoss = 0; }
      maxWin = Math.max(maxWin, curWin);
    } else if (isLoss(t)) {
      curLoss++;
      if (curWin > 0) { winStreaks.push(curWin); curWin = 0; }
      maxLoss = Math.max(maxLoss, curLoss);
    }
  }
  if (curWin > 0) winStreaks.push(curWin);
  if (curLoss > 0) lossStreaks.push(curLoss);
  return {
    maxWin, maxLoss,
    avgWin: winStreaks.length ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0,
    avgLoss: lossStreaks.length ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0,
  };
}

function computeAdvancedStats(list: any[]) {
  const winners = list.filter(isWin);
  const losers = list.filter(isLoss);
  const n = list.length;
  const winRate = n > 0 ? winners.length / n : 0;
  const lossRate = n > 0 ? losers.length / n : 0;
  const avgWin = winners.length ? winners.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0) / winners.length : 0;
  const avgLoss = losers.length ? losers.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0) / losers.length : 0;
  const expectancy = winRate * avgWin + lossRate * avgLoss;
  const grossWin = winners.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const grossLoss = -losers.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0);
  const bestWin = winners.length ? Math.max(...winners.map(t => Number(t.gain_loss_pct ?? 0))) : 0;
  const avgWinPct = winners.length ? winners.reduce((s, t) => s + Number(t.gain_loss_pct ?? 0), 0) / winners.length : 0;
  const worstLoss = losers.length ? Math.min(...losers.map(t => Number(t.gain_loss_pct ?? 0))) : 0;
  const avgLossPct = losers.length ? losers.reduce((s, t) => s + Number(t.gain_loss_pct ?? 0), 0) / losers.length : 0;
  const streaks = computeStreaks(list);

  return {
    expectancy: Math.round(expectancy * 100) / 100,
    avg_win: Math.round(avgWin * 100) / 100,
    avg_loss: Math.round(avgLoss * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    total_winners: winners.length,
    best_win: Math.round(bestWin * 100) / 100,
    avg_win_pct: Math.round(avgWinPct * 100) / 100,
    max_cons_wins: streaks.maxWin,
    avg_cons_wins: Math.round(streaks.avgWin * 100) / 100,
    total_losers: losers.length,
    worst_loss: Math.round(worstLoss * 100) / 100,
    avg_loss_pct: Math.round(avgLossPct * 100) / 100,
    max_cons_losses: streaks.maxLoss,
    avg_cons_losses: Math.round(streaks.avgLoss * 100) / 100,
  };
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sql = db();
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  // Tolerant of a missing/invalid account_id (e.g. before the account context
  // has resolved on first render) — return empty results instead of erroring.
  // An account_id that isn't this user's own gets the same treatment.
  const accountIdParam = req.query.account_id;
  const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
  if (!accountId || isNaN(accountId) || !(await ownsAccount(sql, accountId, userId))) {
    res.status(200).json({ monthly: [], yearly: [], weekday: [], daily: [], hourly: [], session: [], stats: undefined });
    return;
  }

  let trades: any[] = await sql.unsafe(
    `SELECT id, trade_placed_at, trade_executed_at, coin_token, profit_loss, gain_loss, gain_loss_pct,
            start_capital, end_capital, cisd_break, inverse_candle_size, distance_from_asia,
            reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, rr, session_in,
            entry_price, tp_price, sl_price, position_size, partial_1, partial_2,
            extra_data, tags
     FROM trades
     WHERE trade_placed_at IS NOT NULL AND account_id = $1
     ORDER BY trade_placed_at ASC, COALESCE(trade_number, 999999) ASC, created_at ASC`,
    [accountId]
  );

  // --- Strategy filtering (matches the ?strategy_id= param your frontend already sends) ---
  const strategyIdParam = req.query.strategy_id;
  if (strategyIdParam) {
    const strategyId = Number(Array.isArray(strategyIdParam) ? strategyIdParam[0] : strategyIdParam);
    const strategyRows = await sql.unsafe('SELECT * FROM strategies WHERE id = $1 AND user_id = $2', [strategyId, userId]);
    const s = strategyRows[0];
    if (!s) { res.status(404).json({ error: 'Strategy not found' }); return; }

    const conditions = parseJsonArray<Condition>(s.conditions);
    const days = parseJsonArray<number>(s.days);
    const timeStart = s.time_start ?? null;
    const timeEnd = s.time_end ?? null;

    trades = trades.filter(trade => {
      if (!matchesDay(trade, days)) return false;
      if (!matchesTime(trade, timeStart, timeEnd)) return false;
      if (!conditions.length) return true;
      return conditions.every(c => matchesCondition(trade, c));
    });
  }

  function aggregate(key: (t: any) => string) {
    const map = new Map<string, any[]>();
    for (const t of trades) {
      const k = key(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries()).map(([period, ts]) => {
      const totalGain = ts.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const startCap  = Number(ts[0]?.start_capital ?? 0);
      const endCap    = Number(ts[ts.length - 1]?.end_capital ?? startCap + totalGain);
      const wins   = ts.filter(isWin).length;
      const losses = ts.filter(isLoss).length;
      const total  = ts.length;
      const grossWin  = ts.filter(isWin).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const grossLoss = -ts.filter(isLoss).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
      const rrValues = ts.map(t => t.rr).filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
      const avgRr = rrValues.length ? rrValues.reduce((a: number, b: number) => a + b, 0) / rrValues.length : null;
      return {
        period, total_trades: total, wins, losses,
        win_rate: total > 0 ? Math.round(wins / total * 100) : 0,
        total_gain: Math.round(totalGain * 100) / 100,
        pct_return: startCap > 0 ? Math.round(totalGain / startCap * 10000) / 100 : 0,
        start_capital: Math.round(startCap * 100) / 100,
        end_capital: Math.round(endCap * 100) / 100,
        profit_factor: profitFactor,
        avg_rr: avgRr !== null ? Math.round(avgRr * 100) / 100 : null,
      };
    });
  }

  const toYYYYMM  = (t: any) => toISODate(t).substring(0, 7);
  const toYYYY    = (t: any) => toISODate(t).substring(0, 4);
  const toDay     = (t: any) => toISODate(t);
  const toWeekday = (t: any) => {
    const iso = toISODate(t);
    if (!iso) return 'Unknown';
    return WEEKDAY_NAMES[new Date(iso + 'T00:00:00Z').getUTCDay()] ?? 'Unknown';
  };
  const toHour = (t: any) => {
    const raw = t.trade_executed_at;
    if (!raw) return 'Unknown';
    const s = String(raw);
    const hh = s.includes('T') ? s.split('T')[1]!.substring(0, 2)
             : s.includes(' ') ? s.split(' ')[1]!.substring(0, 2)
             : s.substring(0, 2);
    const n = Number(hh);
    return isNaN(n) ? 'Unknown' : String(n).padStart(2, '0') + ':00';
  };

  const weekdayRows = aggregate(toWeekday);
  const weekdaySorted = WEEKDAY_ORDER.map(name => weekdayRows.find(r => r.period === name)).filter(Boolean);
  const hourlySorted = aggregate(toHour).filter(r => r.period !== 'Unknown').sort((a, b) => a.period.localeCompare(b.period));

  // Session breakdown - "which session is my edge actually working in?" View
  // sorted in time-of-day order (not alphabetical) so it reads left-to-right
  // the way a trading day unfolds. Trades without a session logged land in
  // 'Unknown' at the end rather than being silently dropped.
  const SESSION_ORDER = ['Asia', 'Pre-London', 'London', 'London/NY Overlap', 'New York', 'Unknown'];
  const toSession = (t: any) => t.session_in || 'Unknown';
  const sessionRows = aggregate(toSession);
  const sessionSorted = SESSION_ORDER
    .map(name => sessionRows.find(r => r.period === name))
    .filter(Boolean)
    .concat(sessionRows.filter(r => !SESSION_ORDER.includes(r.period))); // any custom session values not in the known list

  res.status(200).json({
    monthly: aggregate(toYYYYMM),
    yearly: aggregate(toYYYY),
    weekday: weekdaySorted,
    daily: aggregate(toDay),
    hourly: hourlySorted,
    session: sessionSorted,
    stats: computeAdvancedStats(trades),
  });
});
