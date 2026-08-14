import { useMemo, useState } from 'react';
import { Card, CardContent } from '../lib/ui/card';
import { Badge, Switch } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { TrendingUp, TrendingDown, Target, RefreshCw, ListChecks, Newspaper } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { StrategyResult, Trade, Checklist, NewsEvent } from './data/types';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

function RBadge({ r, size = 'sm' }: { r: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'text-base font-bold px-2 py-0.5' : 'text-xs';
  if (r > 0) return <Badge className={`bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 ${cls}`}>+{r}R</Badge>;
  if (r < 0) return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>{r}R</Badge>;
  return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>0R</Badge>;
}

// Compliance is computed per checklist, not pooled together — with several
// named checklists (one per setup), a rule that's "broken often" only means
// something in the context of the checklist it belongs to. Only trades that
// explicitly recorded a true/false for a given rule count toward that
// rule's denominator — a rule added after a trade was graded has no
// opinion on it, so it's excluded rather than silently counted as broken.
function useChecklistCompliance(trades: Trade[], checklists: Checklist[]) {
  return useMemo(() => {
    return checklists
      .map(cl => {
        const clTrades = trades.filter(t => t.checklist_enabled && t.checklist_id === cl.id);
        const ruleStats = cl.items.map(item => {
          let followed = 0, broken = 0;
          clTrades.forEach(t => {
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
        return { checklist: cl, enabledCount: clTrades.length, ruleStats, overallPct };
      })
      .filter(s => s.enabledCount > 0);
  }, [trades, checklists]);
}

function ChecklistCompliance({ trades, checklists }: { trades: Trade[]; checklists: Checklist[] }) {
  const stats = useChecklistCompliance(trades, checklists);

  if (stats.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Checklist Compliance</h2>
      </div>
      {stats.map(({ checklist, enabledCount, ruleStats, overallPct }) => {
        const sorted = [...ruleStats].sort((a, b) => b.broken - a.broken);
        return (
          <div key={checklist.id}>
            <p className="text-xs text-muted-foreground mb-2">
              <span className="font-medium text-foreground">{checklist.name}</span>
              {' '}&middot; {enabledCount} trade{enabledCount !== 1 ? 's' : ''} graded
            </p>
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
      })}
    </div>
  );
}

function NewsImpactBadge({ impact }: { impact: string }) {
  const cls = 'text-xs shrink-0';
  const lower = impact.toLowerCase();
  if (lower === 'high') return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>High</Badge>;
  if (lower === 'medium') return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>Medium</Badge>;
  if (lower === 'holiday') return <Badge className={`bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/30 ${cls}`}>Holiday</Badge>;
  return <Badge variant="secondary" className={cls}>Low</Badge>;
}

// Today is computed from the browser's local clock and compared against
// each event's own ISO timestamp (which carries its source timezone) — so
// "today" always means the trader's today, not the feed's or the server's.
function useTodayNews(events: NewsEvent[]) {
  return useMemo(() => {
    const todayStr = new Date().toDateString();
    return events
      .filter(e => {
        const d = new Date(e.date);
        return !isNaN(d.getTime()) && d.toDateString() === todayStr;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);
}

function NewsWidget() {
  const { data, loading } = useFetch<{ events: NewsEvent[]; error: string | null }>('/summary?resource=news');
  const [showAll, setShowAll] = useState(false);
  const todayEvents = useTodayNews(data?.events ?? []);
  const visible = showAll ? todayEvents : todayEvents.filter(e => e.impact.toLowerCase() !== 'low');

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Today's Market News</h2>
            <span className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show low impact</span>
            <Switch checked={showAll} onCheckedChange={setShowAll} />
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground py-2">Loading market news…</p>}

        {!loading && data?.error && (
          <p className="text-sm text-muted-foreground py-2">{data.error}</p>
        )}

        {!loading && !data?.error && visible.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            {showAll ? 'No economic events scheduled for today.' : 'No high/medium impact events scheduled for today.'}
          </p>
        )}

        {!loading && !data?.error && visible.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {visible.map((e, i) => (
              <div key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">
                  {new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">{e.country}</span>
                <NewsImpactBadge impact={e.impact} />
                <span className="flex-1 truncate">{e.title}</span>
                {(e.forecast || e.previous || e.actual) && (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                    {e.actual && <>A: {e.actual} </>}
                    {e.forecast && <>F: {e.forecast} </>}
                    {e.previous && <>P: {e.previous}</>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Summary() {
  const { activeAccountId, activeAccount } = useAccount();
  const { data, loading, refetch } = useFetch<StrategyResult[]>(`/summary?account_id=${activeAccountId ?? ''}`);
  const results: StrategyResult[] = data ?? [];
  const { data: rawTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawChecklists } = useFetch<Checklist[]>('/checklist');
  const trades: Trade[] = rawTrades ?? [];
  const checklists: Checklist[] = rawChecklists ?? [];

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

      <NewsWidget />

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

      <ChecklistCompliance trades={trades} checklists={checklists} />

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
