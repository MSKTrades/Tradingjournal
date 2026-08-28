// Risk-management math shared across the app: drawdown (Performance page +
// the Summary Risk Guardrail) and the position size calculator (Journal
// trade form). Kept in one place so "how do we compute current balance"
// and "how do we compute drawdown" can't quietly drift apart between the
// two screens that both need them.
import { Trade } from './types';

// --- Equity / drawdown -----------------------------------------------------

export type DrawdownPoint = {
  idx: number;
  date: string;
  equity: number;
  peak: number;
  ddDollar: number;      // >= 0, distance below the running peak
  ddPct: number;         // >= 0, same distance as a % of the peak
  ddDurationDays: number; // >= 0, calendar days since the running peak was last set (0 when at a new peak)
};

export type DrawdownResult = {
  curve: DrawdownPoint[];
  currentBalance: number;
  maxDDDollar: number;
  maxDDPct: number;
  maxDDDurationDays: number;     // longest calendar-day stretch spent underwater, anywhere in the history
  currentDDDollar: number;
  currentDDPct: number;
  currentDDDurationDays: number; // calendar days into the CURRENT drawdown (0 if sitting at a new peak right now)
};

const EMPTY_DRAWDOWN: DrawdownResult = {
  curve: [], currentBalance: 0, maxDDDollar: 0, maxDDPct: 0, maxDDDurationDays: 0,
  currentDDDollar: 0, currentDDPct: 0, currentDDDurationDays: 0,
};

// Local-date (not UTC) day-count between two trade_placed_at DATE strings -
// same slice(0,10) + local-midnight-parse convention used throughout this
// file and WeeklyDigest.tsx/challengeSim.ts, so a drawdown's duration is
// measured the same way "today" and weekly buckets already are.
function daysBetweenISO(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((db - da) / 86400000);
}

// Builds a running equity curve from a starting balance + every trade's
// already-server-computed gain_loss, then walks it to find the running peak
// and the drawdown (peak minus current) at each point. Trades are ordered
// by trade_placed_at (falling back to created_at) - the same simplification
// Performance.tsx's existing "Cumulative P/L" chart already makes, rather
// than trying to replicate the server's fuller trade_number-aware ordering
// client-side.
export function computeDrawdown(trades: Trade[], startingBalance: number | null): DrawdownResult {
  const dated = trades.filter(t => t.trade_placed_at);
  if (dated.length === 0) {
    return { ...EMPTY_DRAWDOWN, currentBalance: startingBalance ?? 0 };
  }

  const sorted = [...dated].sort((a, b) => {
    const byDate = new Date(a.trade_placed_at!).getTime() - new Date(b.trade_placed_at!).getTime();
    if (byDate !== 0) return byDate;
    return new Date((a as any).created_at ?? 0).getTime() - new Date((b as any).created_at ?? 0).getTime();
  });

  // starting_balance (like every other NUMERIC column from Postgres) comes
  // back over the API as a string, not a number - forgetting to coerce it
  // here used to make `equity` a string too, and `equity += Number(...)`
  // silently does string concatenation instead of addition, poisoning the
  // whole curve with NaN a couple of trades in (visible as a flat 0%
  // drawdown line with "$NaN" max/current, since `peak > 0` is false for a
  // NaN peak and quietly falls back to the 0 branch below).
  const base = startingBalance != null ? Number(startingBalance) : Number(sorted[0]!.start_capital ?? 0);
  let equity = base;
  let peak = base;
  // Approximation: with no explicit "challenge start date" separate from
  // the first trade, the running peak's date starts out pinned to the
  // first trade's date - so if that very first trade is a loss, its
  // duration is measured from itself (0 days) rather than from some
  // earlier, untracked start date. Every peak set AFTER that is exact.
  let peakDate = sorted[0]!.trade_placed_at!;
  let maxDDDollar = 0;
  let maxDDPct = 0;
  let maxDDDurationDays = 0;

  const curve: DrawdownPoint[] = sorted.map((t, i) => {
    equity += Number(t.gain_loss ?? 0);
    if (equity >= peak) {
      peak = equity;
      peakDate = t.trade_placed_at!;
    }
    const ddDollar = Math.max(0, peak - equity);
    const ddPct = peak > 0 ? (ddDollar / peak) * 100 : 0;
    const ddDurationDays = ddDollar > 0 ? daysBetweenISO(peakDate, t.trade_placed_at!) : 0;
    maxDDDollar = Math.max(maxDDDollar, ddDollar);
    maxDDPct = Math.max(maxDDPct, ddPct);
    maxDDDurationDays = Math.max(maxDDDurationDays, ddDurationDays);
    return {
      idx: i + 1,
      date: t.trade_placed_at!,
      equity: Math.round(equity * 100) / 100,
      peak: Math.round(peak * 100) / 100,
      ddDollar: Math.round(ddDollar * 100) / 100,
      ddPct: Math.round(ddPct * 100) / 100,
      ddDurationDays,
    };
  });

  const last = curve[curve.length - 1]!;
  return {
    curve,
    currentBalance: last.equity,
    maxDDDollar: Math.round(maxDDDollar * 100) / 100,
    maxDDPct: Math.round(maxDDPct * 100) / 100,
    maxDDDurationDays,
    currentDDDollar: last.ddDollar,
    currentDDPct: last.ddPct,
    currentDDDurationDays: last.ddDurationDays,
  };
}

// Local-date (not UTC) "today", matching how a trader thinks about "today's
// P&L" - trade_placed_at is a plain DATE with no time/timezone attached, so
// comparing it against the viewer's own local calendar date (rather than
// UTC) is the correct comparison, same reasoning already used for
// trade_executed_at elsewhere in this app.
function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeTodayPnL(trades: Trade[]): number {
  const today = todayISODate();
  const total = trades
    .filter(t => (t.trade_placed_at ?? '').slice(0, 10) === today)
    .reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  return Math.round(total * 100) / 100;
}

// --- Consistency rule --------------------------------------------------

export type ConsistencyResult = {
  totalProfitDollar: number;
  bestDayDollar: number;
  bestDayDate: string | null;
  usedPct: number;
};

const EMPTY_CONSISTENCY: ConsistencyResult = {
  totalProfitDollar: 0, bestDayDollar: 0, bestDayDate: null, usedPct: 0,
};

// Prop-firm "consistency rule" math: no single day should account for more
// than some % of total profit (commonly 20-30% on FTMO-style challenges).
// Groups trades by local calendar date of trade_placed_at (same
// slice(0, 10) string-bucketing computeTodayPnL above uses - trade_placed_at
// is a plain DATE with no time/timezone attached, so this is already a
// local-calendar-date comparison, not a UTC one) and sums gain_loss per
// day. bestDayDollar only considers days with a positive sum - a big losing
// day doesn't count against you here, this rule is about profit
// concentration, not losses. usedPct is bestDayDollar as a % of
// totalProfitDollar (0 when there's no profit yet to evaluate).
export function computeConsistency(trades: Trade[]): ConsistencyResult {
  const dated = trades.filter(t => t.trade_placed_at);
  if (dated.length === 0) return EMPTY_CONSISTENCY;

  const byDay = new Map<string, number>();
  let totalProfitDollar = 0;
  for (const t of dated) {
    const day = t.trade_placed_at!.slice(0, 10);
    const gl = Number(t.gain_loss ?? 0);
    totalProfitDollar += gl;
    byDay.set(day, (byDay.get(day) ?? 0) + gl);
  }

  let bestDayDollar = 0;
  let bestDayDate: string | null = null;
  for (const [day, sum] of byDay) {
    if (sum > bestDayDollar) {
      bestDayDollar = sum;
      bestDayDate = day;
    }
  }

  const usedPct = totalProfitDollar > 0 ? (bestDayDollar / totalProfitDollar) * 100 : 0;

  return {
    totalProfitDollar: Math.round(totalProfitDollar * 100) / 100,
    bestDayDollar: Math.round(bestDayDollar * 100) / 100,
    bestDayDate,
    usedPct: Math.round(usedPct * 100) / 100,
  };
}

// --- Outcome summary ---------------------------------------------------

// Outcome summary for one group of trades — win rate + realized P/L, using
// the trade's own already-computed gain_loss (the real, position-sized
// dollar result) rather than a re-derived R-multiple, so this always
// matches what the Journal table shows for the same trades.
export function summarizeOutcome(group: Trade[]) {
  const wins = group.filter(t => t.profit_loss === 'Profit').length;
  const losses = group.filter(t => t.profit_loss === 'Loss').length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const totalGL = group.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const avgGL = group.length > 0 ? totalGL / group.length : 0;
  return {
    count: group.length,
    wins, losses,
    winRate,
    totalGL: Math.round(totalGL * 100) / 100,
    avgGL: Math.round(avgGL * 100) / 100,
  };
}

// --- Position size calculator -----------------------------------------------

export type PositionSizeResult = {
  riskDollar: number;
  pipValuePerStdLot: number; // in account currency (assumed USD), per 1.00 standard lot (100,000 units)
  lots: number | null;       // standard lots, e.g. 0.42
  units: number | null;      // lots * 100,000
  approximate: boolean;      // true when the pip-value conversion is a fallback estimate, not exact
};

// A pair's pip size: 0.01 for any JPY-quoted pair (2-decimal quoting), 0.0001
// for everything else (4-decimal quoting - true for the other majors/crosses
// this app targets; exotics with 3-decimal quoting etc. aren't handled
// specially and fall back to this same default). Shared by the pip-value
// calc below and the SL-distance auto-calc in TradeDetailPanel, so both
// agree on what "1 pip" means for a given pair.
function pipSizeForPair(pair: string | null): number {
  const clean = (pair ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const quote = clean.length === 6 ? clean.slice(3, 6) : '';
  return quote === 'JPY' ? 0.01 : 0.0001;
}

// Pip value per standard lot (100,000 units), in USD, assuming a USD
// account. This is exact for the common cases (any XXXUSD pair, and
// USDJPY using its own quoted price to convert JPY -> USD) and falls back
// to the standard "$10/pip" majors approximation for anything else (e.g.
// JPY or other non-USD crosses) - a real conversion there needs a second
// live exchange rate this app doesn't fetch, so it's flagged as
// approximate rather than silently presented as exact.
function pipValuePerStandardLot(pair: string | null, entryPrice: number | null): { value: number; approximate: boolean } {
  const clean = (pair ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const unitsPerStdLot = 100000;

  if (clean.length !== 6) return { value: 10, approximate: true };

  const base = clean.slice(0, 3);
  const quote = clean.slice(3, 6);
  const isJpyQuote = quote === 'JPY';
  const pipSize = pipSizeForPair(pair);
  const pipValueInQuoteCcy = pipSize * unitsPerStdLot; // $10 for 4-decimal XXXUSD; ¥1000 for XXXJPY

  if (quote === 'USD') return { value: pipValueInQuoteCcy, approximate: false };
  if (base === 'USD' && isJpyQuote && entryPrice) {
    // USDJPY specifically: its own quoted price *is* the JPY-per-USD rate,
    // so no separate lookup is needed to convert JPY pip value -> USD.
    return { value: pipValueInQuoteCcy / entryPrice, approximate: false };
  }
  // Any other cross (EURJPY, EURGBP, etc.) would need a second currency's
  // rate this app doesn't have - approximate with the typical majors value.
  return { value: 10, approximate: true };
}

export function positionSizeLots(opts: {
  accountBalance: number;
  riskPct: number | null;
  slPips: number | null;
  pair: string | null;
  entryPrice: number | null;
}): PositionSizeResult {
  const { accountBalance, riskPct, slPips, pair, entryPrice } = opts;
  const { value: pipValuePerStdLot, approximate } = pipValuePerStandardLot(pair, entryPrice);
  const riskDollar = Math.round(accountBalance * ((riskPct ?? 0) / 100) * 100) / 100;

  if (!riskPct || !slPips || slPips <= 0 || pipValuePerStdLot <= 0) {
    return { riskDollar, pipValuePerStdLot, lots: null, units: null, approximate };
  }

  const lots = riskDollar / (slPips * pipValuePerStdLot);
  return {
    riskDollar,
    pipValuePerStdLot,
    lots: Math.round(lots * 100) / 100,
    units: Math.round(lots * 100000),
    approximate,
  };
}

// Distance between Entry Price and SL Price, in pips, for the given pair -
// powers the "auto-fill SL Distance once both prices are in" rule on the
// trade form. Returns null (rather than 0) when either price is missing, so
// the caller can tell "nothing to calculate yet" apart from "calculated to
// zero pips" and leave whatever the user already typed into SL Distance
// alone instead of clobbering it.
export function slPipsFromPrices(entryPrice: number | null, slPrice: number | null, pair: string | null): number | null {
  if (entryPrice == null || slPrice == null) return null;
  const pipSize = pipSizeForPair(pair);
  const pips = Math.abs(entryPrice - slPrice) / pipSize;
  return isFinite(pips) ? Math.round(pips * 10) / 10 : null;
}
