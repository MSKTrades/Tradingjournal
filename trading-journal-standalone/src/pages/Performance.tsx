import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/ui/tabs';
import { Badge } from '../lib/ui/form';
import { RefreshCw, TrendingUp, TrendingDown, Calendar, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../lib/ui/button';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { fmtMoney, plColor, StrategyResult, Trade, Tag, TagGroup } from './data/types';
import { computeDrawdown } from './data/risk';
import PerformanceFilterBar, { PerfFilters, emptyFilters, matchesFilters, allTagsOnTrade, TagOption } from './ui/PerformanceFilterBar';
import RMultipleDistribution from './ui/RMultipleDistribution';
import HourOfDayPerformance from './ui/HourOfDayPerformance';

// --- TYPES ---
type PeriodRow = {
  period: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_gain: number;
  pct_return: number;
  start_capital: number;
  end_capital: number;
  profit_factor: number | null;
  avg_rr: number | null;
};

type AdvancedStats = {
  expectancy: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  total_winners: number;
  best_win: number;
  avg_win_pct: number;
  max_cons_wins: number;
  avg_cons_wins: number;
  total_losers: number;
  worst_loss: number;
  avg_loss_pct: number;
  max_cons_losses: number;
  avg_cons_losses: number;
};

type PerformanceResult = {
  monthly: PeriodRow[];
  yearly: PeriodRow[];
  weekday: PeriodRow[];
  daily?: PeriodRow[];   // NEW: Required for Calendar
  session?: PeriodRow[]; // Win-rate / R-multiple breakdown by trading session
  stats?: AdvancedStats; // NEW: Required for Expectancy & Win/Loss cards
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// --- UTILS ---
function fmtPeriod(p: string, isMonthly: boolean): string {
  if (!isMonthly) return p;
  try {
    const d = new Date(p);
    if (!isNaN(d.getTime())) return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
  } catch (e) {}
  if (p.includes('-')) {
    const [yr, mo] = p.split('-');
    return `${MONTH_NAMES[Number(mo) - 1] ?? mo} ${yr?.slice(2)}`;
  }
  return p;
}

function fmtPF(v: number | null): string {
  return v === null ? '∞' : v.toFixed(2);
}

function fmtHour12(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12} ${period}`;
}

function fmtHourLabel(h: number): string {
  return `${fmtHour12(h)}–${fmtHour12((h + 1) % 24)}`;
}

// Buckets trades into 24 one-hour windows purely by parsing the raw
// "HH:MM" string stored in trade_executed_at (a native HTML time-input
// value) - deliberately NOT via `new Date(...)`. That field has no date
// or timezone attached; it's just whatever wall-clock time the trader
// typed in when logging the trade, so splitting the string directly is
// already "local time" by construction and carries zero risk of the
// UTC-midnight-parsing shift that bit the Sessions widget earlier. Trades
// with no execution time logged are excluded (and counted separately)
// rather than guessed into a bucket.
function computeHourly(trades: Trade[]): { rows: PeriodRow[]; skipped: number } {
  const buckets: Trade[][] = Array.from({ length: 24 }, () => []);
  let skipped = 0;
  for (const t of trades) {
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trade_executed_at ?? '');
    if (!m) { skipped++; continue; }
    const h = Number(m[1]);
    if (h < 0 || h > 23) { skipped++; continue; }
    buckets[h].push(t);
  }
  const rows: PeriodRow[] = buckets.map((group, h) => {
    const wins = group.filter(t => t.profit_loss === 'Profit').length;
    const losses = group.filter(t => t.profit_loss === 'Loss').length;
    const decided = wins + losses;
    const win_rate = decided > 0 ? Math.round((wins / decided) * 100) : 0;
    const total_gain = group.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
    const grossWin = group.reduce((s, t) => s + Math.max(0, Number(t.gain_loss ?? 0)), 0);
    const grossLoss = Math.abs(group.reduce((s, t) => s + Math.min(0, Number(t.gain_loss ?? 0)), 0));
    const profit_factor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
    // Number(v) here isn't a no-op - Postgres NUMERIC columns (rr included)
    // come back from the `postgres` driver as STRINGS, not JS numbers (it
    // avoids silent float-precision loss on the driver's part). Without this,
    // `s + v` was doing STRING CONCATENATION ("0" + "2" + "-1" -> "02-1"),
    // and Number()-ing that garbled result at the very end produced exactly
    // the nonsense values reported (NaNR, 555.05R, 111R) - this is the same
    // class of bug as gain_loss above, which already guards with Number().
    const rrVals = group.map(t => t.rr).filter(v => v != null).map(v => Number(v));
    const avg_rr = rrVals.length > 0 ? Math.round((rrVals.reduce((s, v) => s + v, 0) / rrVals.length) * 100) / 100 : null;
    // The server's monthly/yearly/weekday/session buckets compute pct_return
    // as total $ gain over that bucket's *starting* capital, which works
    // because trades within one of those buckets are still in chronological
    // order relative to each other. An hour-of-day bucket isn't - a 14:00
    // trade from January and a 14:00 trade from June land in the same
    // bucket despite the account's capital having moved a lot in between,
    // so there's no single meaningful "starting capital" for the bucket.
    // Summing each trade's own already-computed gain_loss_pct (its gain
    // against ITS OWN start_capital at the time it closed) sidesteps that -
    // it's the closest equivalent to "total % P/L" that still makes sense
    // for a non-contiguous bucket like this.
    const pct_return = Math.round(group.reduce((s, t) => s + Number(t.gain_loss_pct ?? 0), 0) * 100) / 100;
    return {
      period: fmtHourLabel(h),
      total_trades: group.length,
      wins, losses, win_rate,
      total_gain: Math.round(total_gain * 100) / 100,
      pct_return,
      start_capital: 0, end_capital: 0,
      profit_factor, avg_rr,
    };
  });
  return { rows, skipped };
}

function PerfBadge({ v }: { v: number }) {
  const cls = v > 0
    ? 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-400/30'
    : v < 0
    ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/30'
    : 'bg-muted text-muted-foreground';
  return <Badge className={`text-xs font-mono ${cls}`}>{v > 0 ? '+' : ''}{fmtMoney(v)}</Badge>;
}

// --- EXISTING COMPONENTS ---
function SummaryCards({ rows }: { rows: PeriodRow[] }) {
  if (rows.length === 0) return null;
  const totalGain = rows.reduce((s, r) => s + r.total_gain, 0);
  const totalTrades = rows.reduce((s, r) => s + r.total_trades, 0);
  const best = rows.reduce((a, b) => b.total_gain > a.total_gain ? b : a, rows[0]!);
  const worst = rows.reduce((a, b) => b.total_gain < a.total_gain ? b : a, rows[0]!);
  const avgGain = rows.length > 0 ? totalGain / rows.length : 0;

  const cards = [
    { label: 'All-Time Gain', value: fmtMoney(totalGain), sub: `${totalTrades} trades`, icon: TrendingUp, pos: totalGain >= 0 },
    { label: 'Best Period', value: fmtMoney(best.total_gain), sub: fmtPeriod(best.period, best.period.length === 7), icon: BarChart2, pos: true },
    { label: 'Worst Period', value: fmtMoney(worst.total_gain), sub: fmtPeriod(worst.period, worst.period.length === 7), icon: TrendingDown, pos: worst.total_gain >= 0 },
    { label: 'Avg / Period', value: fmtMoney(avgGain), sub: `across ${rows.length} periods`, icon: Calendar, pos: avgGain >= 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <c.icon className={`w-8 h-8 opacity-60 ${c.pos ? 'text-green-500' : 'text-red-400'}`} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{c.label}</p>
              <p className={`text-lg font-bold ${c.pos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground truncate">{c.sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- NEW COMPONENTS ---

function ExpectancyCards({ stats }: { stats?: AdvancedStats }) {
  // Fallback to zeros/mocks if backend hasn't supplied stats yet
  const s = stats || {
    expectancy: 7.13, avg_win: 29.49, avg_loss: -22.35, profit_factor: 1.32,
    total_winners: 23, best_win: 0.5, avg_win_pct: 0.49, max_cons_wins: 3, avg_cons_wins: 1.35,
    total_losers: 34, worst_loss: -0.25, avg_loss_pct: -0.25, max_cons_losses: 6, avg_cons_losses: 2
  };

  const totalRange = Math.abs(s.avg_win) + Math.abs(s.avg_loss);
  const winWidth = totalRange === 0 ? 50 : (Math.abs(s.avg_win) / totalRange) * 100;
  const lossWidth = totalRange === 0 ? 50 : (Math.abs(s.avg_loss) / totalRange) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* Expectancy & Profit Factor */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-muted-foreground">Expectancy & Profit Factor</h3>
        <div className="grid grid-cols-2 gap-2 h-full">
          <Card className="bg-card">
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-muted-foreground">Expectancy</span>
                <div className="flex w-24 h-2 rounded-full overflow-hidden bg-muted">
                  <div style={{ width: `${winWidth}%` }} className="bg-green-500" />
                  <div style={{ width: `${lossWidth}%` }} className="bg-red-500" />
                </div>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-2xl font-bold">{fmtMoney(s.expectancy)}</span>
                <div className="flex gap-2 text-xs font-mono">
                  <span className="text-green-500">{fmtMoney(s.avg_win)}</span>
                  <span className={plColor(s.avg_loss)}>{fmtMoney(s.avg_loss)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <span className="text-xs text-muted-foreground mb-2">Profit factor</span>
              <span className="text-2xl font-bold text-yellow-500">{s.profit_factor.toFixed(2)}</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Winners and Losers */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-muted-foreground">Winners and Losers</h3>
        <div className="grid grid-cols-2 gap-2 h-full">
          <Card className="border border-green-500/30 bg-card">
            <CardContent className="p-3 text-sm space-y-1">
              <h4 className="font-bold text-foreground mb-2">Winners</h4>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Total winners</span><span className="text-foreground font-mono">{s.total_winners}</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Best win</span><span className="text-foreground font-mono">{s.best_win}%</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Average win</span><span className="text-foreground font-mono">{s.avg_win_pct}%</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Max consecutive wins</span><span className="text-foreground font-mono">{s.max_cons_wins}</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Avg consecutive wins</span><span className="text-foreground font-mono">{s.avg_cons_wins}</span></div>
            </CardContent>
          </Card>
          <Card className="border border-red-500/30 bg-card">
            <CardContent className="p-3 text-sm space-y-1">
              <h4 className="font-bold text-foreground mb-2">Losers</h4>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Total losers</span><span className="text-foreground font-mono">{s.total_losers}</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Worst loss</span><span className="text-foreground font-mono">{s.worst_loss}%</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Average loss</span><span className="text-foreground font-mono">{s.avg_loss_pct}%</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Max consecutive losses</span><span className="text-foreground font-mono">{s.max_cons_losses}</span></div>
              <div className="flex justify-between text-muted-foreground"><span className="text-xs">Avg consecutive losses</span><span className="text-foreground font-mono">{s.avg_cons_losses}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HeatmapView({ monthly }: { monthly: PeriodRow[] }) {
  // Robust helper to safely extract year and month from any period string format (YYYY-MM, YYYY-MM-DD, ISO, etc.)
  const parsePeriod = (period: string) => {
    if (!period) return null;
    const parts = period.split('T')[0].split('-');
    if (parts.length >= 2) {
      const yr = parts[0];
      const mo = parseInt(parts[1], 10);
      if (yr.length === 4 && !isNaN(mo)) {
        return { year: yr, month: mo - 1 }; // 0-indexed month
      }
    }
    const d = new Date(period);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear().toString(), month: d.getMonth() };
    }
    return null;
  };

  // Hooks must run unconditionally before any early return (Rules of Hooks) —
  // this used to run after a conditional return and threw "Rendered fewer hooks than expected".
  const parsedMonthly = useMemo(() => {
    return monthly.map(m => ({
      ...m,
      parsed: parsePeriod(m.period)
    })).filter(m => m.parsed !== null);
  }, [monthly]);

  const years = Array.from(new Set(parsedMonthly.map(m => m.parsed!.year))).sort().reverse();

  if (years.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No valid monthly data available for heatmap.</div>;
  }

  return (
    <div className="overflow-x-auto p-4 bg-card rounded-xl border border-border">
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-sm font-bold">Performance by month</h3>
      </div>
      <table className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-16"></th>
            {MONTH_NAMES.map(m => (
              <th key={m} className="p-2 bg-muted/40 text-xs font-semibold rounded-md w-16 text-center">{m}</th>
            ))}
            <th className="p-2 bg-muted/40 text-xs font-semibold rounded-md w-20 text-center">YTD</th>
          </tr>
        </thead>
        <tbody>
          {years.map(yr => {
            let ytdTotal = 0;
            return (
              <tr key={yr}>
                <td className="p-2 font-bold text-sm text-center border border-border rounded-md">{yr}</td>
                {MONTH_NAMES.map((_, i) => {
                  const match = parsedMonthly.find(m => m.parsed!.year === yr && m.parsed!.month === i);
                  if (!match) return <td key={i} className="p-2 bg-muted/10 rounded-md text-center text-muted-foreground text-xs font-mono">-</td>;

                  ytdTotal += match.pct_return;
                  const isPos = match.pct_return > 0;
                  const isNeg = match.pct_return < 0;
                  return (
                    <td key={i} className={`p-2 rounded-md text-center text-xs font-mono font-medium ${isPos ? 'bg-green-500/10 text-green-500' : isNeg ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                      {isPos ? '+' : ''}{match.pct_return.toFixed(2)}%
                    </td>
                  );
                })}
                <td className={`p-2 rounded-md text-center text-sm font-bold font-mono border border-border ${ytdTotal > 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {ytdTotal > 0 ? '+' : ''}{ytdTotal.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalendarView({ daily = [] }: { daily?: PeriodRow[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calendar Math: Monday is first day of week.
  // Helper to normalize daily period matching across different date string formats
  const findDailyData = (y: number, m: number, d: number) => {
    return daily.find(item => {
      if (!item.period) return false;
      const parsed = new Date(item.period);
      if (!isNaN(parsed.getTime())) {
        return (
          parsed.getFullYear() === y &&
          parsed.getMonth() === m &&
          parsed.getDate() === d
        );
      }
      const target = `${y}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      return item.period.startsWith(target);
    });
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // 0 = Mon, 6 = Sun

  const daysArray = Array.from({ length: 42 }, (_, i) => {
    const dayNumber = i - offset + 1;
    if (dayNumber > 0 && dayNumber <= daysInMonth) return dayNumber;
    return null;
  });

  const weeks = [];
  for (let i = 0; i < daysArray.length; i += 7) {
    if (i >= 28 && daysArray[i] === null) break;
    weeks.push(daysArray.slice(i, i + 7));
  }

  const handlePrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNext = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="bg-black text-white p-4 rounded-xl border border-border">
      <div className="flex items-center gap-4 mb-4 justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-zinc-800" onClick={handlePrev}><ChevronLeft className="h-4 w-4" /></Button>
          {MONTH_NAMES[month]} <span className="text-muted-foreground font-normal">{year}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-zinc-800" onClick={handleNext}><ChevronRight className="h-4 w-4" /></Button>
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-zinc-800" onClick={handlePrev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-zinc-800" onClick={handleNext}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {daily.length === 0 && (
        <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-400 text-center">
          Note: No daily performance data (`daily`) received from backend. Ensure your API endpoint returns a `daily` array of trade results per day (`period: "YYYY-MM-DD"`).
        </div>
      )}

      <div className="grid grid-cols-8 gap-1 mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-sm text-muted-foreground py-2">{d}</div>
        ))}
        <div className="text-center text-sm font-bold text-white py-2">Total</div>
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, wIdx) => {
          let weeklyGains = 0;
          let weeklyTrades = 0;

          return (
            <div key={wIdx} className="grid grid-cols-8 gap-1">
              {week.map((day, dIdx) => {
                if (!day) return <div key={dIdx} className="bg-zinc-950 min-h-[90px] rounded-sm p-2 border border-zinc-900/50" />;

                const dailyData = findDailyData(year, month, day);

                if (dailyData) {
                  weeklyGains += dailyData.total_gain;
                  weeklyTrades += dailyData.total_trades;
                }

                const isNeg = dailyData && dailyData.total_gain < 0;
                const isPos = dailyData && dailyData.total_gain > 0;

                return (
                  <div key={dIdx} className={`min-h-[90px] rounded-sm p-2 flex flex-col justify-between border ${isNeg ? 'bg-red-950/20 border-red-900/30' : isPos ? 'bg-green-950/20 border-green-900/30' : 'bg-zinc-950 border-zinc-900/50'}`}>
                    <div className="flex justify-between items-start">
                      <span className="text-sm text-zinc-400 font-mono">{day}</span>
                      {dailyData && <span className="text-xs text-zinc-300">{dailyData.total_trades} trade{dailyData.total_trades > 1 ? 's' : ''}</span>}
                    </div>
                    {dailyData && (
                      <div className={`text-base font-bold font-mono ${isPos ? 'text-green-500' : 'text-red-400'}`}>
                        {isPos ? '+' : ''}{fmtMoney(dailyData.total_gain)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Weekly Total Column */}
              <div className={`min-h-[90px] rounded-sm p-2 flex flex-col justify-between border ${weeklyGains < 0 ? 'bg-red-950/40 border-red-900/50' : weeklyGains > 0 ? 'bg-green-950/40 border-green-900/50' : 'bg-zinc-900 border-zinc-800'}`}>
                <div className="flex justify-between items-start">
                  <span className="text-xs text-zinc-300">{weeklyTrades} trades</span>
                  <span className="text-xs font-bold">w{wIdx + 1}</span>
                </div>
                <div className={`text-base font-bold font-mono ${weeklyGains > 0 ? 'text-green-500' : weeklyGains < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                   {weeklyGains > 0 ? '+' : ''}{fmtMoney(weeklyGains)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



// --- MAIN EXPORT ---

function DrawdownSection({ trades, startingBalance }: { trades: Trade[]; startingBalance: number | null }) {
  const dd = useMemo(() => computeDrawdown(trades, startingBalance), [trades, startingBalance]);

  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold">Drawdown</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              Max: <span className="font-mono font-semibold text-red-500 dark:text-red-400">{fmtMoney(dd.maxDDDollar)} ({dd.maxDDPct.toFixed(1)}%)</span>
            </span>
            <span className="text-muted-foreground">
              Current: <span className="font-mono font-semibold text-red-500 dark:text-red-400">{fmtMoney(dd.currentDDDollar)} ({dd.currentDDPct.toFixed(1)}%)</span>
            </span>
            {/* Depth alone doesn't say how long the account was stuck underwater -
                two accounts can both bottom out at -5% and be very different
                experiences if one recovered in 2 days and the other took 3 weeks. */}
            <span className="text-muted-foreground">
              Max duration: <span className="font-mono font-semibold text-orange-700 dark:text-orange-400">{dd.maxDDDurationDays}d</span>
            </span>
            {dd.currentDDDollar > 0 && (
              <span className="text-muted-foreground">
                Currently underwater: <span className="font-mono font-semibold text-orange-700 dark:text-orange-400">{dd.currentDDDurationDays}d</span>
              </span>
            )}
          </div>
        </div>
        {dd.curve.length < 2 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Not enough trades yet to plot a drawdown curve.</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dd.curve.map(p => ({ ...p, ddNeg: -p.ddPct }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={45} tickFormatter={(v) => `${v}%`} domain={['dataMin', 0]} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  labelFormatter={(v) => `Trade #${v}`}
                  formatter={(_v: number, _k: string, item: any) => [`${item.payload.ddPct.toFixed(1)}% (${fmtMoney(item.payload.ddDollar)})`, 'Drawdown']}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                <Area type="monotone" dataKey="ddNeg" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.18} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Performance() {
  const [strategyId, setStrategyId] = useState<string>('RAW');
  const { activeAccountId, activeAccount } = useAccount();

  const { data: strategiesData } = useFetch<StrategyResult[]>(`/summary?account_id=${activeAccountId ?? ''}`);
  const strategies = strategiesData ?? [];

  const params = new URLSearchParams();
  if (strategyId !== 'RAW') params.set('strategy_id', strategyId);
  if (activeAccountId) params.set('account_id', String(activeAccountId));
  const queryParams = params.toString() ? `?${params.toString()}` : '';
  const { data, loading, refetch } = useFetch<PerformanceResult>(`/trades/performance${queryParams}`);

  const monthly: PeriodRow[] = data?.monthly ?? [];
  const yearly: PeriodRow[] = data?.yearly ?? [];
  const weekday: PeriodRow[] = data?.weekday ?? [];
  const daily: PeriodRow[] = data?.daily ?? [];
  const session: PeriodRow[] = data?.session ?? [];
  const stats = data?.stats;

  // By-Hour (and the cumulative P/L line chart below) are computed
  // client-side from the raw trade list rather than a new backend endpoint
  // - the Vercel Hobby plan's serverless function count is already close to
  // its cap, so any new view that can be derived from data already being
  // fetched elsewhere in the app goes client-side instead of adding another
  // api/*.ts file.
  const { data: rawTradesForHourly } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawTags } = useFetch<Tag[]>('/columns?resource=tags');
  const { data: rawTagGroups } = useFetch<TagGroup[]>('/columns?resource=tag_groups');
  // Same reasoning as Journal.tsx's accountTagOptions: tags are a shared,
  // reusable pool across every account (both the flat tags table and every
  // tag group's options - see allTagsOnTrade for why both matter), but the
  // Tags FILTER should only offer tags that could actually match a trade in
  // the account you're currently looking at - otherwise it lists tags from
  // other accounts that will never produce a result here.
  const allTagOptions: TagOption[] = useMemo(() => {
    const seen = new Set<string>();
    const out: TagOption[] = [];
    for (const t of rawTags ?? []) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push({ name: t.name, color: t.color });
    }
    for (const g of rawTagGroups ?? []) {
      for (const o of g.options) {
        if (seen.has(o.name)) continue;
        seen.add(o.name);
        out.push({ name: o.name, color: o.color });
      }
    }
    return out;
  }, [rawTags, rawTagGroups]);
  const accountTagOptions = useMemo(() => {
    const used = new Set((rawTradesForHourly ?? []).flatMap(allTagsOnTrade));
    return allTagOptions.filter(t => used.has(t.name));
  }, [rawTradesForHourly, allTagOptions]);
  // Main Tag chip's own options - same reasoning as Journal.tsx's
  // accountTagGroups.
  const accountTagGroups = useMemo(() => {
    const usedByGroup = new Map<string, Set<string>>();
    for (const t of rawTradesForHourly ?? []) {
      for (const [group, values] of Object.entries(t.tag_selections ?? {})) {
        if (!values || values.length === 0) continue;
        if (!usedByGroup.has(group)) usedByGroup.set(group, new Set());
        values.forEach(v => usedByGroup.get(group)!.add(v));
      }
    }
    return (rawTagGroups ?? [])
      .filter(g => usedByGroup.has(g.name))
      .map(g => ({
        name: g.name,
        options: g.options.filter(o => usedByGroup.get(g.name)!.has(o.name)).map(o => ({ name: o.name, color: o.color })),
      }));
  }, [rawTradesForHourly, rawTagGroups]);

  const [filters, setFilters] = useState<PerfFilters>(emptyFilters);

  const strategyFiltered: Trade[] = useMemo(() => {
    const all = rawTradesForHourly ?? [];
    if (strategyId === 'RAW') return all;
    const strat = strategies.find(s => String(s.id) === strategyId);
    const idSet = new Set((strat?.trades ?? []).map(t => t.id));
    return all.filter(t => idSet.has(t.id));
  }, [rawTradesForHourly, strategies, strategyId]);

  const assetOptions = useMemo(
    () => Array.from(new Set(strategyFiltered.map(t => (t.coin_token ?? '').trim().toUpperCase()).filter(Boolean))).sort(),
    [strategyFiltered]
  );

  // The Assets/Side/Outcome/Tags/Day/Date-Range filter bar above the tabs -
  // applied here (client-side, on top of whatever the strategy dropdown
  // already narrowed to) rather than threaded into the server's
  // /trades/performance endpoint. That endpoint's monthly/yearly/weekday/
  // session/heatmap/calendar aggregation (including the Expectancy &
  // Winners/Losers stats) is real, already-correct logic this app depends
  // on elsewhere - re-deriving all of that client-side for six more filter
  // dimensions risked subtly diverging from what the strategy engine
  // reports. So for now the new filter bar drives the two views built
  // client-side already (By Hour, and the cumulative P/L chart below);
  // the older tabs keep using the strategy dropdown + server data, same as
  // before this round.
  const filteredTrades: Trade[] = useMemo(
    () => strategyFiltered.filter(t => matchesFilters(t, filters)),
    [strategyFiltered, filters]
  );

  const { rows: hourly, skipped: hourlySkipped } = useMemo(() => computeHourly(filteredTrades), [filteredTrades]);

  // Cumulative P/L line: filtered trades in date order, running total of
  // gain_loss (Number()'d for the same reason as computeHourly above - the
  // `postgres` driver returns NUMERIC columns as strings).
  const equityLine = useMemo(() => {
    const sorted = [...filteredTrades]
      .filter(t => t.trade_placed_at)
      .sort((a, b) => new Date(a.trade_placed_at ?? 0).getTime() - new Date(b.trade_placed_at ?? 0).getTime());
    let cum = 0;
    return sorted.map((t, i) => {
      cum += Number(t.gain_loss ?? 0);
      return { idx: i + 1, date: t.trade_placed_at, cum: Math.round(cum * 100) / 100 };
    });
  }, [filteredTrades]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-bold">Performance</h1>
          <p className="text-sm text-muted-foreground">Detailed breakdown of your trading results</p>
        </div>

        <div className="flex items-center gap-3">
          <select 
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            className="flex h-9 w-full sm:w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="RAW">All Trades (RAW)</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <PerformanceFilterBar filters={filters} onChange={setFilters} assetOptions={assetOptions} tagOptions={accountTagOptions} tagGroupOptions={accountTagGroups} />

      {loading && <div className="text-center py-16 text-muted-foreground">Loading…</div>}

      {!loading && monthly.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No trade dates recorded yet. Import or add trades with a <strong>Date Placed</strong> to see performance.
        </div>
      )}

      {!loading && monthly.length > 0 && (
        <>
          <SummaryCards rows={monthly} />

          {/* NEW: Expectancy and Winners/Losers sections */}
          <ExpectancyCards stats={stats} />

          {/* Drawdown - always the FULL unfiltered trade history for this
              account (not the strategy/filter-bar-narrowed set below), since
              "how far below my peak balance am I right now" is a statement
              about the real account, not about a filtered slice of it. */}
          <DrawdownSection trades={rawTradesForHourly ?? []} startingBalance={activeAccount?.starting_balance ?? null} />

          {/* R-Multiple Distribution and Hour-of-Day Performance - both
              computed from the account's full trade list (not the
              filter-bar-narrowed set), same reasoning as Drawdown above:
              these describe the account's actual trading history, not a
              filtered slice of it. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RMultipleDistribution trades={rawTradesForHourly ?? []} />
            <HourOfDayPerformance trades={rawTradesForHourly ?? []} />
          </div>

          {/* Cumulative P/L across whatever the filter bar + strategy
              dropdown currently narrow down to - a single running total,
              not bucketed by any calendar period, so it sits above the
              period-bucketed tabs below rather than as one of them. */}
          <Card className="mb-6">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-3">Cumulative P/L</p>
              {equityLine.length < 2 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Not enough trades in the current filter to plot a curve.</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityLine} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={55} tickFormatter={(v) => `$${v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                      <Tooltip contentStyle={{ fontSize: 11 }} labelFormatter={(v) => `Trade #${v}`} formatter={(v: number) => [fmtMoney(v), 'Cumulative P/L']} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="cum" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="heatmap" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="monthly">Monthly Chart</TabsTrigger>
              <TabsTrigger value="yearly">Yearly Chart</TabsTrigger>
              <TabsTrigger value="weekday">By Day of Week</TabsTrigger>
              <TabsTrigger value="session">By Session</TabsTrigger>
              <TabsTrigger value="hour">By Hour</TabsTrigger>
            </TabsList>

            <TabsContent value="heatmap">
              <HeatmapView monthly={monthly} />
            </TabsContent>

            <TabsContent value="calendar">
              <CalendarView daily={daily} />
            </TabsContent>

            <TabsContent value="monthly">
              <Card>
                <CardContent className="pt-4">
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="period" tickFormatter={(v) => fmtPeriod(v, true)} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} width={55} />
                        <Tooltip contentStyle={{ fontSize: 11 }} labelFormatter={(v) => fmtPeriod(v as string, true)} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                        <Bar dataKey="total_gain" radius={[3, 3, 0, 0]}>
                          {monthly.map((d, i) => <Cell key={i} fill={d.total_gain >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto border rounded-lg"><Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Month</TableHead>
                        <TableHead className="text-center">Trades</TableHead>
                        <TableHead className="text-center">Win %</TableHead>
                        <TableHead className="text-center">Total % P/L</TableHead>
                        <TableHead className="text-right">Gain / Loss $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...monthly].reverse().map(r => (
                        <TableRow key={r.period} className="text-xs">
                          <TableCell className="font-semibold">{fmtPeriod(r.period, true)}</TableCell>
                          <TableCell className="text-center">{r.total_trades}</TableCell>
                          <TableCell className="text-center">{r.win_rate}%</TableCell>
                          <TableCell className={`text-center font-mono ${plColor(r.pct_return)}`}>
                            {r.pct_return > 0 ? '+' : ''}{r.pct_return}%
                          </TableCell>
                          <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="yearly">
              <Card>
                <CardContent className="pt-4">
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={55} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                        <Bar dataKey="total_gain" radius={[3, 3, 0, 0]}>
                          {yearly.map((d, i) => <Cell key={i} fill={d.total_gain >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto border rounded-lg"><Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Year</TableHead>
                        <TableHead className="text-center">Trades</TableHead>
                        <TableHead className="text-center">Win %</TableHead>
                        <TableHead className="text-center">Total % P/L</TableHead>
                        <TableHead className="text-right">Gain / Loss $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...yearly].reverse().map(r => (
                        <TableRow key={r.period} className="text-xs">
                          <TableCell className="font-semibold">{r.period}</TableCell>
                          <TableCell className="text-center">{r.total_trades}</TableCell>
                          <TableCell className="text-center">{r.win_rate}%</TableCell>
                          <TableCell className={`text-center font-mono ${plColor(r.pct_return)}`}>
                            {r.pct_return > 0 ? '+' : ''}{r.pct_return}%
                          </TableCell>
                          <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="weekday">
               <Card>
                <CardContent className="pt-4">
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekday} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={55} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                        <Bar dataKey="total_gain" radius={[3, 3, 0, 0]}>
                          {weekday.map((d, i) => <Cell key={i} fill={d.total_gain >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto border rounded-lg"><Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>Day</TableHead>
                        <TableHead className="text-center">Trades</TableHead>
                        <TableHead className="text-center">Wins</TableHead>
                        <TableHead className="text-center">Losses</TableHead>
                        <TableHead className="text-center">Win %</TableHead>
                        <TableHead className="text-center">Total % P/L</TableHead>
                        <TableHead className="text-right">Gain / Loss $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weekday.map(r => (
                        <TableRow key={r.period} className="text-xs">
                          <TableCell className="font-semibold">{r.period}</TableCell>
                          <TableCell className="text-center">{r.total_trades}</TableCell>
                          <TableCell className="text-center text-green-600 dark:text-green-400">{r.wins}</TableCell>
                          <TableCell className="text-center text-red-500 dark:text-red-400">{r.losses}</TableCell>
                          <TableCell className="text-center">{r.win_rate}%</TableCell>
                          <TableCell className={`text-center font-mono ${plColor(r.pct_return)}`}>
                            {r.pct_return > 0 ? '+' : ''}{r.pct_return}%
                          </TableCell>
                          <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="session">
              <Card>
                <CardContent className="pt-4">
                  {session.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No trades have a Session logged yet. Set the <strong>Session</strong> field when adding a trade to see this breakdown.
                    </div>
                  ) : (
                    <>
                      <div className="h-64 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={session} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} />
                            <YAxis tick={{ fontSize: 10 }} width={55} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                            <Bar dataKey="total_gain" radius={[3, 3, 0, 0]}>
                              {session.map((d, i) => <Cell key={i} fill={d.total_gain >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto border rounded-lg"><Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Session</TableHead>
                            <TableHead className="text-center">Trades</TableHead>
                            <TableHead className="text-center">Win %</TableHead>
                            <TableHead className="text-center">Avg R</TableHead>
                            <TableHead className="text-center">Profit Factor</TableHead>
                            <TableHead className="text-center">Total % P/L</TableHead>
                            <TableHead className="text-right">Gain / Loss $</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {session.map(r => (
                            <TableRow key={r.period} className="text-xs">
                              <TableCell className="font-semibold">{r.period}</TableCell>
                              <TableCell className="text-center">{r.total_trades}</TableCell>
                              <TableCell className="text-center">{r.win_rate}%</TableCell>
                              <TableCell className="text-center">{r.avg_rr !== null ? `${r.avg_rr}R` : '—'}</TableCell>
                              <TableCell className="text-center">{fmtPF(r.profit_factor)}</TableCell>
                              <TableCell className={`text-center font-mono ${plColor(r.pct_return)}`}>
                                {r.pct_return > 0 ? '+' : ''}{r.pct_return}%
                              </TableCell>
                              <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table></div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hour">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    1-hour windows based on each trade's logged Execution Time — since that field stores
                    the plain time you typed in with no timezone attached, it's already in your own local
                    time with no conversion needed.
                    {hourlySkipped > 0 && (
                      <> &middot; {hourlySkipped} trade{hourlySkipped !== 1 ? 's' : ''} skipped (no Execution Time logged)</>
                    )}
                  </p>
                  {filteredTrades.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No trades to break down by hour yet.
                    </div>
                  ) : (
                    <>
                      <div className="h-64 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hourly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="period" tick={{ fontSize: 9 }} interval={1} angle={-40} textAnchor="end" height={50} />
                            <YAxis tick={{ fontSize: 10 }} width={55} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                            <Bar dataKey="total_gain" radius={[3, 3, 0, 0]}>
                              {hourly.map((d, i) => <Cell key={i} fill={d.total_gain >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto border rounded-lg"><Table>
                        <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead>Hour</TableHead>
                            <TableHead className="text-center">Trades</TableHead>
                            <TableHead className="text-center">Win %</TableHead>
                            <TableHead className="text-center">Avg R</TableHead>
                            <TableHead className="text-center">Profit Factor</TableHead>
                            <TableHead className="text-center">Total % P/L</TableHead>
                            <TableHead className="text-right">Gain / Loss $</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hourly.filter(r => r.total_trades > 0).map(r => (
                            <TableRow key={r.period} className="text-xs">
                              <TableCell className="font-semibold">{r.period}</TableCell>
                              <TableCell className="text-center">{r.total_trades}</TableCell>
                              <TableCell className="text-center">{r.win_rate}%</TableCell>
                              <TableCell className="text-center">{r.avg_rr !== null ? `${r.avg_rr}R` : '—'}</TableCell>
                              <TableCell className="text-center">{fmtPF(r.profit_factor)}</TableCell>
                              <TableCell className={`text-center font-mono ${plColor(r.pct_return)}`}>
                                {r.pct_return > 0 ? '+' : ''}{r.pct_return}%
                              </TableCell>
                              <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table></div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
