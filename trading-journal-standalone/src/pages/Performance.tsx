import { Card, CardContent } from '../lib/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/ui/tabs';
import { Badge } from '../lib/ui/form';
import { RefreshCw, TrendingUp, TrendingDown, Calendar, BarChart2 } from 'lucide-react';
import { Button } from '../lib/ui/button';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useFetch } from '../lib/api';
import { fmtMoney, plColor } from './data/types';

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

type PerformanceResult = { monthly: PeriodRow[]; yearly: PeriodRow[]; weekday: PeriodRow[] };

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtPeriod(p: string, isMonthly: boolean): string {
  if (!isMonthly) return p;
  const [yr, mo] = p.split('-');
  return `${MONTH_NAMES[Number(mo) - 1] ?? mo} ${yr?.slice(2)}`;
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

function PerfChart({ rows, isMonthly }: { rows: PeriodRow[]; isMonthly: boolean }) {
  if (rows.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No data to chart.</div>;

  const GREEN = 'hsl(var(--chart-2))';
  const RED = 'hsl(var(--chart-1))';
  const data = rows.map(r => ({ label: fmtPeriod(r.period, isMonthly), gain: r.total_gain, pct: r.pct_return }));

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-2">Gain / Loss per period ($)</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} width={55} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <Bar dataKey="gain" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.gain >= 0 ? GREEN : RED} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerfTable({ rows, isMonthly, preserveOrder = false }: { rows: PeriodRow[]; isMonthly: boolean; preserveOrder?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No periods to display.</p>;
  const displayRows = preserveOrder ? rows : [...rows].reverse();

  return (
    <div className="rounded-lg border border-border overflow-x-auto mt-4">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead>{isMonthly ? 'Month' : 'Year'}</TableHead>
            <TableHead className="text-center">Trades</TableHead>
            <TableHead className="text-center">Wins</TableHead>
            <TableHead className="text-center">Losses</TableHead>
            <TableHead className="text-center">Win %</TableHead>
            <TableHead className="text-center">Profit Factor</TableHead>
            <TableHead className="text-right">Gain / Loss $</TableHead>
            <TableHead className="text-right">Return %</TableHead>
            <TableHead className="text-right">Start Capital</TableHead>
            <TableHead className="text-right">End Capital</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map(r => (
            <TableRow key={r.period} className="text-xs">
              <TableCell className="font-semibold">{fmtPeriod(r.period, isMonthly)}</TableCell>
              <TableCell className="text-center">{r.total_trades}</TableCell>
              <TableCell className="text-center text-green-600 dark:text-green-400">{r.wins}</TableCell>
              <TableCell className="text-center text-red-500 dark:text-red-400">{r.losses}</TableCell>
              <TableCell className="text-center">{r.win_rate}%</TableCell>
              <TableCell className={`text-center font-mono ${r.profit_factor !== null && r.profit_factor < 1 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {fmtPF(r.profit_factor)}
              </TableCell>
              <TableCell className="text-right"><PerfBadge v={r.total_gain} /></TableCell>
              <TableCell className={`text-right font-semibold ${plColor(r.pct_return)}`}>
                {r.pct_return > 0 ? '+' : ''}{r.pct_return.toFixed(2)}%
              </TableCell>
              <TableCell className="text-right font-mono">{fmtMoney(r.start_capital)}</TableCell>
              <TableCell className="text-right font-mono">{fmtMoney(r.end_capital)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Performance() {
  const { data, loading, refetch } = useFetch<PerformanceResult>('/trades/performance');

  const monthly: PeriodRow[] = data?.monthly ?? [];
  const yearly: PeriodRow[] = data?.yearly ?? [];
  const weekday: PeriodRow[] = data?.weekday ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Performance</h1>
          <p className="text-sm text-muted-foreground">Monthly and yearly breakdown of your trading results</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
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

          <Tabs defaultValue="monthly" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
              <TabsTrigger value="weekday">By Day of Week</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly">
              <Card>
                <CardContent className="pt-4">
                  <PerfChart rows={monthly} isMonthly={true} />
                  <PerfTable rows={monthly} isMonthly={true} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="yearly">
              <Card>
                <CardContent className="pt-4">
                  <PerfChart rows={yearly} isMonthly={false} />
                  <PerfTable rows={yearly} isMonthly={false} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="weekday">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Which days of the week you actually trade best on — sorted Monday through Sunday, not by size.
                  </p>
                  <PerfChart rows={weekday} isMonthly={false} />
                  <PerfTable rows={weekday} isMonthly={false} preserveOrder />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
