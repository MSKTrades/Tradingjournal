import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/ui/tabs';
import { Badge } from '../lib/ui/form';
import { RefreshCw, TrendingUp, TrendingDown, Calendar, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../lib/ui/button';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useFetch } from '../lib/api';
import { fmtMoney, plColor, StrategyResult } from './data/types';

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
            <c.icon className={`w-8 h-8 opacity-60 ${c.pos ? 'text-green-500' : 'text-red-500'}`} />
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
                  <span className="text-red-500">{fmtMoney(s.avg_loss)}</span>
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
  // Extract unique years from the 'YYYY-MM' period strings
  const years = Array.from(new Set(monthly.map(m => m.period.split('-')[0]))).filter(Boolean).sort().reverse();
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

  if (years.length === 0) return <div className="p-8 text-center text-muted-foreground">No monthly data available for heatmap.</div>;
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
                  const moString = (i + 1).toString().padStart(2, '0');
                  const match = monthly.find(m => m.period === `${yr}-${moString}`);
                  const match = parsedMonthly.find(m => m.parsed!.year === yr && m.parsed!.month === i);
                  if (!match) return <td key={i} className="p-2 bg-muted/10 rounded-md text-center text-muted-foreground text-xs font-mono">-</td>;

                  ytdTotal += match.pct_return;
                  const isPos = match.pct_return > 0;
                  const isNeg = match.pct_return < 0;
                  return (
                    <td key={i} className={`p-2 rounded-md text-center text-xs font-mono font-medium ${isPos ? 'bg-green-500/10 text-green-500' : isNeg ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground'}`}>
                      {isPos ? '+' : ''}{match.pct_return.toFixed(2)}%
                    </td>
                  );
                })}
                <td className={`p-2 rounded-md text-center text-sm font-bold font-mono border border-border ${ytdTotal > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {ytdTotal > 0 ? '+' : ''}{ytdTotal.toFixed(2)}%
                </td>
              </tr>
            )
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
      <div className="flex items-center gap-4 mb-4">
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
          <div key={d} className="text-center text-xs text-muted-foreground py-2">{d}</div>
        ))}
        <div className="text-center text-xs font-bold text-white py-2">Total</div>
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week, wIdx) => {
          let weeklyGains = 0;
          let weeklyTrades = 0;

          return (
            <div key={wIdx} className="grid grid-cols-8 gap-1">
              {week.map((day, dIdx) => {
                if (!day) return <div key={dIdx} className="bg-zinc-950 min-h-[80px] rounded-sm p-2 border border-zinc-900/50" />;

                const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                const dailyData = daily.find(d => d.period === dateStr);
                const dailyData = findDailyData(year, month, day);

                if (dailyData) {
                  weeklyGains += dailyData.total_gain;
                  weeklyTrades += dailyData.total_trades;
                }

                const isNeg = dailyData && dailyData.total_gain < 0;
                const isPos = dailyData && dailyData.total_gain > 0;

                return (
                  <div key={dIdx} className={`min-h-[80px] rounded-sm p-2 flex flex-col justify-between border ${isNeg ? 'bg-red-950/20 border-red-900/30' : isPos ? 'bg-green-950/20 border-green-900/30' : 'bg-zinc-950 border-zinc-900/50'}`}>
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-zinc-500 font-mono">{day}</span>
                      {dailyData && <span className="text-[10px] text-zinc-400">{dailyData.total_trades} trade{dailyData.total_trades > 1 ? 's' : ''}</span>}
                    </div>
                    {dailyData && (
                      <div className={`text-xs font-bold font-mono ${isPos ? 'text-green-500' : 'text-red-500'}`}>
                        {isPos ? '+' : ''}{fmtMoney(dailyData.total_gain)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Weekly Total Column */}
              <div className={`min-h-[80px] rounded-sm p-2 flex flex-col justify-between border ${weeklyGains < 0 ? 'bg-red-950/40 border-red-900/50' : weeklyGains > 0 ? 'bg-green-950/40 border-green-900/50' : 'bg-zinc-900 border-zinc-800'}`}>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-zinc-400">{weeklyTrades} trades</span>
                  <span className="text-[10px] font-bold">w{wIdx + 1}</span>
                </div>
                <div className={`text-xs font-bold font-mono ${weeklyGains > 0 ? 'text-green-500' : weeklyGains < 0 ? 'text-red-500' : 'text-zinc-500'}`}>
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

export default function Performance() {
  const [strategyId, setStrategyId] = useState<string>('RAW');

  const { data: strategiesData } = useFetch<StrategyResult[]>('/summary');
  const strategies = strategiesData ?? [];

  const queryParams = strategyId !== 'RAW' ? `?strategy_id=${strategyId}` : '';
  const { data, loading, refetch } = useFetch<PerformanceResult>(`/trades/performance${queryParams}`);

  const monthly: PeriodRow[] = data?.monthly ?? [];
  const yearly: PeriodRow[] = data?.yearly ?? [];
  const weekday: PeriodRow[] = data?.weekday ?? [];
  const daily: PeriodRow[] = data?.daily ?? [];
  const stats = data?.stats; 

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

          <Tabs defaultValue="heatmap" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="monthly">Monthly Chart</TabsTrigger>
              <TabsTrigger value="yearly">Yearly Chart</TabsTrigger>
              <TabsTrigger value="weekday">By Day of Week</TabsTrigger>
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
                        <TableHead className="text-right">Gain / Loss $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...monthly].reverse().map(r => (
                        <TableRow key={r.period} className="text-xs">
                          <TableCell className="font-semibold">{fmtPeriod(r.period, true)}</TableCell>
                          <TableCell className="text-center">{r.total_trades}</TableCell>
                          <TableCell className="text-center">{r.win_rate}%</TableCell>
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
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
