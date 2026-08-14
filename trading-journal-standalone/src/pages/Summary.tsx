import { useMemo } from 'react';
import { Card, CardContent } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { TrendingUp, TrendingDown, Target, RefreshCw, ListChecks } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { StrategyResult, Trade, ChecklistItem } from './data/types';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

function RBadge({ r, size = 'sm' }: { r: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'text-base font-bold px-2 py-0.5' : 'text-xs';
  if (r > 0) return <Badge className={`bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 ${cls}`}>+{r}R</Badge>;
  if (r < 0) return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>{r}R</Badge>;
  return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>0R</Badge>;
}

// Compliance is only computed from trades that explicitly recorded a
// true/false for a given rule — a rule added after older trades were
// logged has no opinion on them, so it's excluded from that rule's
// denominator rather than silently counted as "broken".
function useChecklistCompliance(trades: Trade[], items: ChecklistItem[]) {
  return useMemo(() => {
    const enabledTrades = trades.filter(t => t.checklist_enabled);
    const ruleStats = items.map(item => {
      let followed = 0, broken = 0;
      enabledTrades.forEach(t => {
        const v = t.checklist_results?.[String(item.id)];
        if (v === true) followed++;
        else if (v === false) broken++;
      });
      const total = followed + broken;
      const pct = total > 0 ? Math.round((followed / total) * 100) : null;
      return { item, followed, broken, total, pct };
    });
    const totalChecks = ruleStats.reduce((s, r) => s + r.total, 0);
    const totalFollowed = ruleStats.reduce((s, r) => s + r.followed, 0);
    const overallPct = totalChecks > 0 ? Math.round((totalFollowed / totalChecks) * 100) : null;
    return { enabledCount: enabledTrades.length, ruleStats, overallPct };
  }, [trades, items]);
}

function ChecklistCompliance({ trades, items }: { trades: Trade[]; items: ChecklistItem[] }) {
  const { enabledCount, ruleStats, overallPct } = useChecklistCompliance(trades, items);

  if (items.length === 0 || enabledCount === 0) return null;

  const sorted = [...ruleStats].sort((a, b) => b.broken - a.broken);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Checklist Compliance</h2>
        <span className="text-xs text-muted-foreground">
          {enabledCount} trade{enabledCount !== 1 ? 's' : ''} graded against your rules
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Overall Follow Rate</p>
            <p className="text-2xl font-bold">{overallPct === null ? '—' : `${overallPct}%`}</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-3">
          <CardContent className="pt-4 pb-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead className="text-center">Followed</TableHead>
                  <TableHead className="text-center">Broken</TableHead>
                  <TableHead className="text-center">Follow %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(r => (
                  <TableRow key={r.item.id}>
                    <TableCell className="text-sm">{r.item.text}</TableCell>
                    <TableCell className="text-center text-green-600 dark:text-green-400">{r.followed}</TableCell>
                    <TableCell className="text-center text-red-500 dark:text-red-400">{r.broken}</TableCell>
                    <TableCell className="text-center">{r.pct === null ? '—' : `${r.pct}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Summary() {
  const { activeAccountId, activeAccount } = useAccount();
  const { data, loading, refetch } = useFetch<StrategyResult[]>(`/summary?account_id=${activeAccountId ?? ''}`);
  const results: StrategyResult[] = data ?? [];
  const { data: rawTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawChecklist } = useFetch<ChecklistItem[]>('/checklist');
  const trades: Trade[] = rawTrades ?? [];
  const checklistItems: ChecklistItem[] = rawChecklist ?? [];

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
            {activeAccount && <> &middot; <span className="font-medium text-foreground">{activeAccount.name}</span></>}
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

      <ChecklistCompliance trades={trades} items={checklistItems} />

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

    </div>
  );
}
