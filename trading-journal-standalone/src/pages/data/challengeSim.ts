// Challenge Simulator's core engine: replays an account's already-loaded
// trade history, day by day in chronological order, against a set of
// user-entered prop-firm-style challenge rules (profit target, daily loss
// limit, max drawdown, minimum trading days, optional time limit, optional
// consistency rule) and reports whether - and when - it would have passed
// or failed. Entirely client-side, same "no backend change" reasoning as
// risk.ts (Vercel Hobby plan's serverless-function count is already at its
// cap) - this just walks the same trades ChallengeSimulator.tsx already
// fetches via GET /trades?account_id=.
import { Trade } from './types';

export type DrawdownType = 'static' | 'trailing';

export type ChallengeRules = {
  startingBalance: number;
  profitTargetPct: number;
  dailyLossPct: number;
  maxDrawdownPct: number;
  drawdownType: DrawdownType;
  minTradingDays: number;
  timeLimitDays: number | null; // null = unlimited
  consistencyRulePct: number | null; // null = not enforced/not checked
};

export type ChallengeDayPoint = {
  date: string;
  dayPnL: number;
  equity: number;
  peakEquity: number;
};

export type ChallengeFailReason = 'daily_loss' | 'max_drawdown' | 'time_limit';

export type ChallengeResult = {
  status: 'passed' | 'failed' | 'in_progress';
  resolvedDate: string | null;
  failReason: ChallengeFailReason | null;
  tradingDaysCount: number;
  profitPct: number;
  dailyLossUsedPct: number;   // % of the daily loss limit used, as of resolution (or the latest day if in_progress)
  drawdownUsedPct: number;    // % of the max drawdown limit used, same timing
  bestDayContributionPct: number | null; // best single day's $ as a % of cumulative profit $ so far — null if cumulative profit isn't positive yet
  timeline: ChallengeDayPoint[];
};

// Local-date (not UTC) day math - trade_placed_at is a plain DATE string
// with no time/timezone attached, same convention already used throughout
// this codebase (see computeTodayPnL/computeConsistency in risk.ts, and
// WeeklyDigest.tsx's identical helper).
function localDateFromISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function simulateChallenge(trades: Trade[], rules: ChallengeRules): ChallengeResult {
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const d = (t.trade_placed_at ?? '').slice(0, 10);
    if (!d) continue;
    byDay.set(d, (byDay.get(d) ?? 0) + Number(t.gain_loss ?? 0));
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const timeline: ChallengeDayPoint[] = [];
  let equity = rules.startingBalance;
  let peakEquity = rules.startingBalance;
  let tradingDaysCount = 0;
  let bestDayDollar = 0;
  let cumulativeProfitDollar = 0;

  const dailyLossLimitDollar = rules.startingBalance * (rules.dailyLossPct / 100);

  let status: ChallengeResult['status'] = 'in_progress';
  let resolvedDate: string | null = null;
  let failReason: ChallengeFailReason | null = null;
  let dailyLossUsedPct = 0;
  let drawdownUsedPct = 0;

  const firstDate = days[0]?.[0] ?? null;

  for (const [date, dayPnL] of days) {
    // Time-limit check happens BEFORE applying the day's P&L, based on
    // calendar days elapsed since the first trading day (most firms define
    // the evaluation window this way, not by trading-day count).
    if (rules.timeLimitDays != null && firstDate) {
      const elapsedDays = Math.round(
        (localDateFromISO(date).getTime() - localDateFromISO(firstDate).getTime()) / 86400000
      );
      if (elapsedDays >= rules.timeLimitDays) {
        status = 'failed';
        resolvedDate = date;
        failReason = 'time_limit';
        break;
      }
    }

    equity += dayPnL;
    tradingDaysCount++;
    cumulativeProfitDollar += dayPnL;
    if (dayPnL > bestDayDollar) bestDayDollar = dayPnL;
    peakEquity = Math.max(peakEquity, equity);

    const ddBasis = rules.drawdownType === 'trailing' ? peakEquity : rules.startingBalance;
    const ddFloor = ddBasis * (1 - rules.maxDrawdownPct / 100);
    const ddDollar = Math.max(0, ddBasis - equity);
    const ddLimitDollar = ddBasis * (rules.maxDrawdownPct / 100);
    const ddPctOfLimit = ddLimitDollar > 0 ? (ddDollar / ddLimitDollar) * 100 : 0;

    const dailyLossUsedDollar = Math.max(0, -dayPnL);
    const dailyPctOfLimit = dailyLossLimitDollar > 0 ? (dailyLossUsedDollar / dailyLossLimitDollar) * 100 : 0;

    timeline.push({ date, dayPnL, equity, peakEquity });

    if (dailyLossLimitDollar > 0 && dailyLossUsedDollar > dailyLossLimitDollar) {
      status = 'failed'; resolvedDate = date; failReason = 'daily_loss';
      dailyLossUsedPct = dailyPctOfLimit; drawdownUsedPct = ddPctOfLimit;
      break;
    }
    if (equity < ddFloor) {
      status = 'failed'; resolvedDate = date; failReason = 'max_drawdown';
      dailyLossUsedPct = dailyPctOfLimit; drawdownUsedPct = ddPctOfLimit;
      break;
    }

    dailyLossUsedPct = dailyPctOfLimit;
    drawdownUsedPct = ddPctOfLimit;

    const profitPctSoFar = ((equity - rules.startingBalance) / rules.startingBalance) * 100;
    if (profitPctSoFar >= rules.profitTargetPct && tradingDaysCount >= rules.minTradingDays) {
      status = 'passed'; resolvedDate = date;
      break;
    }
  }

  const finalProfitPct = ((equity - rules.startingBalance) / rules.startingBalance) * 100;
  const bestDayContributionPct = cumulativeProfitDollar > 0 ? (bestDayDollar / cumulativeProfitDollar) * 100 : null;

  return {
    status, resolvedDate, failReason,
    tradingDaysCount,
    profitPct: Math.round(finalProfitPct * 100) / 100,
    dailyLossUsedPct: Math.round(dailyLossUsedPct * 100) / 100,
    drawdownUsedPct: Math.round(drawdownUsedPct * 100) / 100,
    bestDayContributionPct: bestDayContributionPct !== null ? Math.round(bestDayContributionPct * 100) / 100 : null,
    timeline,
  };
}
