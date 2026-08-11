import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { TrendingUp, TrendingDown, Target, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { useFetch } from '../lib/api';
import { StrategyResult, Condition, FIELD_LABELS } from './data/types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function condLabel(c: Condition) {
  return `${FIELD_LABELS[c.field] ?? c.field} ${c.op} ${c.value}`;
}

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

function RBadge({ r, size = 'sm' }: { r: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'text-base font-bold px-2 py-0.5' : 'text-xs';
  if (r > 0) return <Badge className={`bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 ${cls}`}>+{r}R</Badge>;
  if (r < 0) return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>{r}R</Badge>;
  return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>0R</Badge>;
}

function EquityCurve({ trades }: { trades: StrategyResult['trades'] }) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const data = sorted.map(t => {
    cum += t.r;
    return { date: t.date.split('T')[0] ?? t.date, r: Math.round(cum * 100) / 100 };
  });

  const positive = cum >= 0;
  const color = positive ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1))';

  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="r" stroke={color} fill={color} fillOpacity={0.2} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StrategyCard({ result }: { result: StrategyResult }) {
  const [expanded, setExpanded] = useState(false);

  const isPositive = result.total_r > 0;
  const borderColor = result.total_trades === 0
    ? 'border-border'
    : isPositive ? 'border-green-500/40' : 'border-red-500/40';

  return (
    <Card className={`border ${borderColor} flex flex-col`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{result.name}</CardTitle>
          <RBadge r={result.total_r} size="lg" />
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {(result.conditions ?? []).map((c, i) => (
            <span key={i} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground font-mono">
              {condLabel(c)}
            </span>
          ))}
          <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono">
            TP1={result.tp1_rr}R
            {result.tp2_rr != null ? ` / TP2=${result.tp2_rr}R (${result.split_percent}% split)` : ''}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="grid grid-cols-5 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Trades</p>
            <p className="text-base font-bold">{result.total_trades}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Wins</p>
            <p className="text-base font-bold text-green-600 dark:text-green-400">{result.wins}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Win %</p>
            <p className="text-base font-bold">{result.win_rate}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Avg R</p>
            <p className={`text-base font-bold ${result.avg_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {result.avg_r > 0 ? '+' : ''}{result.avg_r}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">PF</p>
            <p className={`text-base font-bold ${result.profit_factor !== null && result.profit_factor < 1 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {fmtPF(result.profit_factor)}
            </p>
          </div>
        </div>

        {result.total_trades > 0 && <EquityCurve trades={result.trades} />}

        {result.total_trades === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No trades match this strategy yet.</p>
        )}

        {result.total_trades > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground w-full"
            onClick={() => setExpanded(p => !p)}
          >
            {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            {expanded ? 'Hide' : 'Show'} trades
          </Button>
        )}

        {expanded && (
          <div className="max-h-48 overflow-y-auto rounded border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs py-1">Date</TableHead>
                  <TableHead className="text-xs py-1">Pair</TableHead>
                  <TableHead className="text-xs py-1 text-right">R</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...result.trades]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs py-1 font-mono">{t.date?.split('T')[0] ?? t.date}</TableCell>
                      <TableCell className="text-xs py-1">{t.pair}</TableCell>
                      <TableCell className="text-xs py-1 text-right">
                        <RBadge r={t.r} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Summary() {
  const { data, loading, refetch } = useFetch<StrategyResult[]>('/summary');
  const results: StrategyResult[] = data ?? [];

  const bestR = results.length > 0 ? Math.max(...results.map(r => r.total_r)) : null;
  const bestName = results.find(r => r.total_r === bestR)?.name ?? '—';
  const totalTrades = results.length > 0 ? Math.max(...results.map(r => r.total_trades)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Strategy Summary</h1>
          <p className="text-sm text-muted-foreground">
            Each strategy independently filters &amp; scores your journal trades
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {totalTrades > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Target className="w-8 h-8 text-primary opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Total Journal Trades</p>
                <p className="text-2xl font-bold">{totalTrades}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-500 opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Best Strategy (Total R)</p>
                <p className="text-base font-bold truncate">{bestName}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-muted-foreground opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Active Strategies</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && <div className="text-center py-20 text-muted-foreground">Calculating…</div>}

      {!loading && results.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No active strategies found. Go to <strong>Strategies</strong> to add some.
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mb-6 rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-center">Trades</TableHead>
                <TableHead className="text-center">Wins</TableHead>
                <TableHead className="text-center">Losses</TableHead>
                <TableHead className="text-center">Win %</TableHead>
                <TableHead className="text-center">Profit Factor</TableHead>
                <TableHead className="text-center">Total R</TableHead>
                <TableHead className="text-center">Avg R/Trade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...results].sort((a, b) => b.total_r - a.total_r).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">{r.total_trades}</TableCell>
                  <TableCell className="text-center text-green-600 dark:text-green-400">{r.wins}</TableCell>
                  <TableCell className="text-center text-red-500 dark:text-red-400">{r.losses}</TableCell>
                  <TableCell className="text-center">{r.win_rate}%</TableCell>
                  <TableCell className={`text-center font-mono ${r.profit_factor !== null && r.profit_factor < 1 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmtPF(r.profit_factor)}
                  </TableCell>
                  <TableCell className="text-center"><RBadge r={r.total_r} /></TableCell>
                  <TableCell className="text-center">
                    <span className={r.avg_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                      {r.avg_r > 0 ? '+' : ''}{r.avg_r}R
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {results.map(r => <StrategyCard key={r.id} result={r} />)}
        </div>
      )}
    </div>
  );
}
