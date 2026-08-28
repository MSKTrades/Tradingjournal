import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Button } from '../lib/ui/button';
import { api, useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import {
  StrategyResult, Trade, CustomColumn, Checklist, Condition, FIELD_LABELS, WEEKDAYS, TAG_CONDITION_FIELD, fmtMoney, plColor,
} from './data/types';
import TradeDetailPanel, { TradePayload } from './ui/TradeDetailPanel';

function condLabel(c: Condition): string {
  if (c.field === TAG_CONDITION_FIELD) {
    // Naming the group when the condition is scoped to one - "EMA9" alone
    // is ambiguous once the same option name exists under several groups.
    const suffix = c.group ? ` in "${c.group}"` : '';
    return c.op === '!has' ? `Not tagged "${c.value}"${suffix}` : `Tagged "${c.value}"${suffix}`;
  }
  const field = FIELD_LABELS[c.field] ?? c.field;
  return `${field} ${c.op} ${c.value}`;
}

function fmtPF(v: number | null): string {
  return v === null ? '∞' : v.toFixed(2);
}

// Clicking a strategy row on the Summary page lands here: the same
// filter/TP rules that produced the strategy's aggregate stats, plus
// every trade that matched them, plus a running cumulative-R curve so you
// can see whether the edge is steady or lumpy across those trades. Row
// clicks in the trades table reuse the same TradeDetailPanel Journal
// uses, rather than a second trade-editing UI - one place that knows how
// to edit a trade.
export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeAccountId, activeAccount } = useAccount();

  const { data: resultsData, loading: resultsLoading } = useFetch<StrategyResult[]>(`/summary?account_id=${activeAccountId ?? ''}`);
  const { data: rawTrades, refetch: refetchTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawCols, refetch: refetchCols } = useFetch<CustomColumn[]>(`/columns?account_id=${activeAccountId ?? ''}`);
  const { data: rawChecklists } = useFetch<Checklist[]>(`/checklist?account_id=${activeAccountId ?? ''}`);

  const results: StrategyResult[] = resultsData ?? [];
  const strategy = results.find(r => String(r.id) === id);
  const allTrades: Trade[] = rawTrades ?? [];
  const customCols: CustomColumn[] = rawCols ?? [];
  const checklists: Checklist[] = rawChecklists ?? [];

  const matchedIds = useMemo(() => new Set((strategy?.trades ?? []).map(t => t.id)), [strategy]);
  const matchedTrades = useMemo(
    () => allTrades
      .filter(t => matchedIds.has(t.id))
      .sort((a, b) => new Date(b.trade_placed_at ?? 0).getTime() - new Date(a.trade_placed_at ?? 0).getTime()),
    [allTrades, matchedIds]
  );

  // Group the already-sorted (newest-first) matched trades by calendar
  // month so the table can show a small "August 2026"-style heading with
  // that month's total Gain/Loss before its rows, without touching the
  // row rendering itself. Map preserves insertion order, so months come
  // out newest-first and trades stay newest-first within each month.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; trades: Trade[]; total: number }>();
    for (const t of matchedTrades) {
      const d = t.trade_placed_at ? new Date(t.trade_placed_at) : null;
      const valid = d && !isNaN(d.getTime());
      const key = valid ? `${d!.getFullYear()}-${String(d!.getMonth() + 1).padStart(2, '0')}` : 'unknown';
      const label = valid ? d!.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown Date';
      if (!groups.has(key)) groups.set(key, { label, trades: [], total: 0 });
      const g = groups.get(key)!;
      g.trades.push(t);
      g.total += Number(t.gain_loss ?? 0);
    }
    return Array.from(groups.values());
  }, [matchedTrades]);

  // Cumulative R across the strategy's own scored trades (strategy.trades
  // carries the R the strategy's TP rules actually produced for each
  // trade), in date order - oldest first, so the line reads left-to-right
  // as "how the edge played out over time".
  const equityCurve = useMemo(() => {
    if (!strategy) return [];
    const sortedByDate = [...strategy.trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cum = 0;
    return sortedByDate.map((t, i) => {
      cum += t.r;
      return { idx: i + 1, date: t.date, pair: t.pair, r: t.r, cumR: Math.round(cum * 100) / 100 };
    });
  }, [strategy]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const nextTradeNumber = allTrades.length === 0 ? 1 : Math.max(0, ...allTrades.map(t => t.trade_number ?? 0)) + 1;

  async function handleSave(payload: TradePayload) {
    if (payload.id != null) await api.put(`/trades/${payload.id}`, payload);
    else await api.post('/trades', payload);
    refetchTrades();
  }

  async function handleAddCol(name: string, type: string, accountIds?: number[]) {
    const col_key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (accountIds && accountIds.length > 0) {
      await api.post('/columns', { name, col_key, data_type: type, account_ids: accountIds });
    } else {
      await api.post('/columns', { name, col_key, data_type: type, account_id: activeAccountId });
    }
    refetchCols();
  }
  async function handleRenameCol(id: number, name: string) {
    await api.put('/columns', { id, name });
    refetchCols();
  }
  async function handleDeleteCol(id: number) {
    await api.del(`/columns?id=${id}`);
    refetchCols();
  }

  if (resultsLoading) {
    return <div className="text-center py-20 text-muted-foreground">Loading…</div>;
  }

  if (!strategy) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Summary
        </Button>
        <div className="text-center py-20 text-muted-foreground">
          Strategy not found — it may have been deleted, deactivated, or belong to a different account.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Button variant="outline" size="sm" className="mb-4" onClick={() => navigate('/')}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Summary
      </Button>

      <div className="mb-4">
        <h1 className="text-xl font-bold">{strategy.name}</h1>
        <p className="text-sm text-muted-foreground">
          {strategy.total_trades} matched trade{strategy.total_trades !== 1 ? 's' : ''}
          {activeAccount && <> &middot; <span className="font-medium text-foreground">{activeAccount.name}</span></>}
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-4 pb-4 flex flex-col gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Filter Conditions</p>
            {(!strategy.conditions || strategy.conditions.length === 0) ? (
              <p className="text-xs text-muted-foreground italic">All trades qualify (no conditions)</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {strategy.conditions.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-mono">{condLabel(c)}</Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Days Traded</p>
            {(!strategy.days || strategy.days.length === 0) ? (
              <p className="text-xs text-muted-foreground italic">All days</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.filter(d => strategy.days!.includes(d.value)).map(d => (
                  <Badge key={d.value} variant="outline" className="text-xs">{d.label}</Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Take Profit Rules</p>
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-mono">TP1 = 1:{strategy.tp1_rr}</Badge>
              {strategy.tp2_rr != null && (
                <>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-mono">TP2 = 1:{strategy.tp2_rr}</Badge>
                  <Badge variant="outline" className="text-xs font-mono">{strategy.split_percent}% at TP1</Badge>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-2xl font-bold">{strategy.win_rate}%</p>
            <p className="text-xs text-muted-foreground">{strategy.wins}W / {strategy.losses}L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total R</p>
            <p className={`text-2xl font-bold ${plColor(strategy.total_r)}`}>
              {strategy.total_r > 0 ? '+' : ''}{strategy.total_r}R
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Avg R / Trade</p>
            <p className={`text-2xl font-bold ${plColor(strategy.avg_r)}`}>
              {strategy.avg_r > 0 ? '+' : ''}{strategy.avg_r}R
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className="text-2xl font-bold">{fmtPF(strategy.profit_factor)}</p>
          </CardContent>
        </Card>
      </div>

      {equityCurve.length > 1 && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <p className="text-sm font-semibold mb-3">Cumulative R</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} label={{ value: 'Trade #', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={45} />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    labelFormatter={(v) => `Trade #${v}`}
                    formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}R`, 'Cumulative R']}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="cumR" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-semibold mb-3">Matched Trades</p>
          {matchedTrades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No matched trades found for this strategy.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Date</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-center">Result</TableHead>
                    <TableHead className="text-right">Gain / Loss</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthGroups.map(group => (
                    <>
                      <TableRow key={`month-${group.label}`} className="hover:bg-transparent">
                        <TableCell colSpan={4} className="text-xs font-semibold text-muted-foreground bg-muted/40 py-1.5">
                          {group.label}
                        </TableCell>
                        <TableCell className={`text-right text-xs font-semibold bg-muted/40 py-1.5 font-mono ${plColor(group.total)}`}>
                          {fmtMoney(group.total)}
                        </TableCell>
                      </TableRow>
                      {group.trades.map(t => (
                        <TableRow
                          key={t.id}
                          className="text-xs cursor-pointer"
                          onClick={() => { setEditTrade(t); setDialogOpen(true); }}
                        >
                          <TableCell>{t.trade_placed_at ?? '—'}</TableCell>
                          <TableCell className="font-medium">{t.coin_token ?? '—'}</TableCell>
                          <TableCell>{t.direction}</TableCell>
                          <TableCell className="text-center">
                            {t.profit_loss === 'Profit' && <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 text-xs">Win</Badge>}
                            {t.profit_loss === 'Loss' && <Badge className="bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 text-xs">Loss</Badge>}
                            {!t.profit_loss && <Badge variant="secondary" className="text-xs">—</Badge>}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${plColor(Number(t.gain_loss ?? 0))}`}>
                            {fmtMoney(t.gain_loss)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <TradeDetailPanel
        open={dialogOpen}
        trade={editTrade}
        customColumns={customCols}
        checklists={checklists}
        nextTradeNumber={nextTradeNumber}
        trades={allTrades}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
        onAddCustomColumn={handleAddCol}
        onDeleteCustomColumn={handleDeleteCol}
        onRenameCustomColumn={handleRenameCol}
      />
    </div>
  );
}
