import { useMemo, useState } from 'react';
import { Card, CardContent } from '../../lib/ui/card';
import { Badge } from '../../lib/ui/form';
import { Input } from '../../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../lib/ui/table';
import { Button } from '../../lib/ui/button';
import { X, Plus } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip,
} from 'recharts';
import { BacktestTrade, BacktestSession, Tag, plColor, fmtMoney } from '../data/types';

type Props = {
  trades: BacktestTrade[];
  // Optional - when present, the trades are known to belong to one session
  // with real starting capital, and the log adds a $ performance panel
  // (current balance, $ P&L, $ profit factor, equity curve) alongside the
  // existing R-based stats, plus Size %/P&L $ columns on the table. Without
  // it (or for a session with zero closed trades) the log falls back to
  // exactly its old R-only behavior.
  session?: BacktestSession | null;
  allTags: Tag[];
  onCloseTrade: (trade: BacktestTrade) => void;
  onDeleteTrade: (id: number) => void;
  onUpdateTags: (trade: BacktestTrade, tags: string[]) => void;
  onCreateTag: (name: string) => void;
};

const FALLBACK_COLOR = '#f59e0b';

// Compact tag editor for a table row - same "grade the trade" idea as
// TradeZella's quality/mistake tags (A+, Off-Plan, FOMO), but sharing this
// app's existing flat `tags` vocabulary rather than a separate list, so a
// tag you already use on real Journal trades is just as available here.
// Lives directly in the row (not the entry form) so it works the same way
// regardless of how the trade closed - auto SL/TP hit, manual close, or
// still open - you can grade it whenever you're ready to.
function InlineTagEditor({ value, allTags, onChange, onCreateTag }: {
  value: string[]; allTags: Tag[]; onChange: (names: string[]) => void; onCreateTag: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  function colorFor(name: string): string {
    return allTags.find(t => t.name.toLowerCase() === name.toLowerCase())?.color ?? FALLBACK_COLOR;
  }

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!value.some(v => v.toLowerCase() === trimmed.toLowerCase())) onChange([...value, trimmed]);
    if (!allTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) onCreateTag(trimmed);
    setInput('');
    setOpen(false);
  }

  const suggestions = allTags
    .filter(t => !value.some(v => v.toLowerCase() === t.name.toLowerCase()))
    .filter(t => input.trim() === '' || t.name.toLowerCase().includes(input.trim().toLowerCase()))
    .slice(0, 6);

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {value.map(name => {
        const color = colorFor(name);
        return (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${color}25`, color, border: `1px solid ${color}55` }}
          >
            {name}
            <button type="button" onClick={() => onChange(value.filter(v => v !== name))} className="hover:opacity-70">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}
      <button type="button" onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
        <Plus className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-48 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2">
            <Input
              autoFocus
              value={input}
              placeholder="Search or add a tag…"
              className="text-xs mb-1.5"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' && input.trim()) addTag(input); }}
            />
            <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
              {suggestions.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => addTag(t.name)}
                  className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs text-left hover:bg-accent"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                </button>
              ))}
              {suggestions.length === 0 && input.trim() === '' && <p className="text-[11px] text-muted-foreground px-1.5 py-1">No other tags yet.</p>}
              {input.trim() !== '' && !allTags.some(t => t.name.toLowerCase() === input.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => addTag(input)}
                  className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs text-left hover:bg-accent text-primary"
                >
                  <Plus className="w-3 h-3" /> Create "{input.trim()}"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Practice-trade log for the currently selected dataset - deliberately
// styled distinctly from the real Journal/Performance tables (same amber
// "practice" accent used on the page header) so it never reads as if it's
// part of the live trading record.
export default function BacktestLog({ trades, session, allTags, onCloseTrade, onDeleteTrade, onUpdateTags, onCreateTag }: Props) {
  // $-based performance, computed from each trade's own server-recalculated
  // gain_loss/end_capital (see recalcSessionCapital in api/_db.js) rather
  // than re-deriving dollars from rr here - this can never disagree with
  // what the session picker or Session Settings dialog shows, since they
  // all read the same recalculated numbers.
  const dollarStats = useMemo(() => {
    if (!session) return null;
    const closed = trades.filter(t => t.result != null && t.gain_loss != null);
    if (closed.length === 0) {
      return { currentBalance: session.current_balance, totalPnL: 0, profitFactor: null as number | null, curve: [] as { idx: number; balance: number }[] };
    }
    const chronological = [...closed].sort((a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime());
    let totalPnL = 0;
    let grossWin = 0;
    let grossLoss = 0;
    const curve: { idx: number; balance: number }[] = [{ idx: 0, balance: Number(session.initial_capital) }];
    chronological.forEach((t, i) => {
      const gl = Number(t.gain_loss ?? 0);
      totalPnL += gl;
      if (gl > 0) grossWin += gl; else grossLoss += Math.abs(gl);
      curve.push({ idx: i + 1, balance: Number(t.end_capital ?? session.current_balance) });
    });
    const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
    return { currentBalance: session.current_balance, totalPnL: Math.round(totalPnL * 100) / 100, profitFactor, curve };
  }, [trades, session]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.result != null);
    const wins = closed.filter(t => t.result === 'Profit');
    const losses = closed.filter(t => t.result === 'Loss');
    const totalR = closed.reduce((sum, t) => sum + Number(t.rr ?? 0), 0);
    const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 1000) / 10 : 0;

    const grossWinR = wins.reduce((s, t) => s + Number(t.rr ?? 0), 0);
    const grossLossR = Math.abs(losses.reduce((s, t) => s + Number(t.rr ?? 0), 0));
    const profitFactor = grossLossR > 0 ? Math.round((grossWinR / grossLossR) * 100) / 100 : (grossWinR > 0 ? null : 0);

    // Max drawdown on the R equity curve, walked in the order trades were
    // actually entered (not insertion order) - the closed-trade sequence is
    // what a real drawdown would have followed.
    const chronological = [...closed].sort((a, b) => new Date(a.entry_time).getTime() - new Date(b.entry_time).getTime());
    let equity = 0, peak = 0, maxDrawdown = 0;
    for (const t of chronological) {
      equity += Number(t.rr ?? 0);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    }

    const bySide = (dir: string) => {
      const sideClosed = closed.filter(t => t.direction === dir);
      const sideWins = sideClosed.filter(t => t.result === 'Profit').length;
      return {
        count: sideClosed.length,
        winRate: sideClosed.length > 0 ? Math.round((sideWins / sideClosed.length) * 1000) / 10 : null,
        totalR: Math.round(sideClosed.reduce((s, t) => s + Number(t.rr ?? 0), 0) * 100) / 100,
      };
    };

    return {
      total: trades.length,
      open: trades.filter(t => t.result == null).length,
      closed: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalR: Math.round(totalR * 100) / 100,
      profitFactor,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      long: bySide('Long'),
      short: bySide('Short'),
    };
  }, [trades]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Practice Trades</p>
          <p className="text-xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{stats.open} open</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-xl font-bold">{stats.closed > 0 ? `${stats.winRate}%` : '—'}</p>
          <p className="text-xs text-muted-foreground">{stats.wins}W / {stats.losses}L</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Total R</p>
          <p className={`text-xl font-bold ${plColor(stats.totalR)}`}>
            {stats.totalR > 0 ? '+' : ''}{stats.totalR}R
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Avg R / Trade</p>
          <p className="text-xl font-bold">
            {stats.closed > 0 ? `${(stats.totalR / stats.closed) >= 0 ? '+' : ''}${Math.round((stats.totalR / stats.closed) * 100) / 100}R` : '—'}
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Profit Factor</p>
          <p className="text-xl font-bold">{stats.profitFactor == null ? '∞' : stats.closed > 0 ? stats.profitFactor.toFixed(2) : '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Max Drawdown</p>
          <p className="text-xl font-bold text-red-500 dark:text-red-400">{stats.closed > 0 ? `-${stats.maxDrawdown}R` : '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Long</p>
          <p className="text-xl font-bold">{stats.long.count > 0 ? `${stats.long.winRate}%` : '—'}</p>
          <p className={`text-xs ${plColor(stats.long.totalR)}`}>{stats.long.count > 0 ? `${stats.long.totalR > 0 ? '+' : ''}${stats.long.totalR}R (${stats.long.count})` : '0 trades'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Short</p>
          <p className="text-xl font-bold">{stats.short.count > 0 ? `${stats.short.winRate}%` : '—'}</p>
          <p className={`text-xs ${plColor(stats.short.totalR)}`}>{stats.short.count > 0 ? `${stats.short.totalR > 0 ? '+' : ''}${stats.short.totalR}R (${stats.short.count})` : '0 trades'}</p>
        </CardContent></Card>
      </div>

      {dollarStats && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card><CardContent className="pt-3 pb-2.5">
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className="text-xl font-bold">{fmtMoney(dollarStats.currentBalance)}</p>
              <p className="text-xs text-muted-foreground">started at {fmtMoney(session!.initial_capital)}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2.5">
              <p className="text-xs text-muted-foreground">Total P&amp;L ($)</p>
              <p className={`text-xl font-bold ${plColor(dollarStats.totalPnL)}`}>
                {dollarStats.totalPnL > 0 ? '+' : ''}{fmtMoney(dollarStats.totalPnL)}
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-2.5">
              <p className="text-xs text-muted-foreground">Profit Factor ($)</p>
              <p className="text-xl font-bold">{dollarStats.profitFactor == null ? '∞' : dollarStats.curve.length > 1 ? dollarStats.profitFactor.toFixed(2) : '—'}</p>
            </CardContent></Card>
          </div>

          {dollarStats.curve.length > 2 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-semibold mb-2">Session Equity Curve</p>
                <div style={{ width: '100%', height: 160 }}>
                  <ResponsiveContainer>
                    <AreaChart data={dollarStats.curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="backtestEquityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="currentColor" className="text-primary" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="currentColor" className="text-primary" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="idx" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmtMoney(v)} domain={['auto', 'auto']} />
                      <RTooltip formatter={(v: number) => [fmtMoney(v), 'Balance']} labelFormatter={(idx) => idx === 0 ? 'Start' : `After trade ${idx}`} />
                      <Area type="monotone" dataKey="balance" stroke="currentColor" className="text-primary" strokeWidth={2} fill="url(#backtestEquityFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-semibold mb-3">Trade Log</p>
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No practice trades logged yet for this dataset - step through the replay and log one when you see a setup.</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Entry Time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">TP</TableHead>
                    <TableHead className="text-center">Result</TableHead>
                    <TableHead className="text-right">R</TableHead>
                    <TableHead className="text-right">Size %</TableHead>
                    {session && <TableHead className="text-right">P&amp;L $</TableHead>}
                    <TableHead>Tags</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map(t => (
                    <TableRow key={t.id} className="text-xs">
                      <TableCell>{new Date(t.entry_time).toLocaleString()}</TableCell>
                      <TableCell>{t.direction}</TableCell>
                      <TableCell className="text-right font-mono">{Number(t.entry_price).toFixed(5)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{t.sl_price != null ? Number(t.sl_price).toFixed(5) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{t.tp_price != null ? Number(t.tp_price).toFixed(5) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {t.result === 'Profit' && <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 text-xs">Win</Badge>}
                        {t.result === 'Loss' && <Badge className="bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 text-xs">Loss</Badge>}
                        {!t.result && (
                          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => onCloseTrade(t)}>Close</Button>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${plColor(t.rr)}`}>
                        {t.rr != null ? `${Number(t.rr) > 0 ? '+' : ''}${Number(t.rr).toFixed(2)}R` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {t.position_size != null ? `${Number(t.position_size)}%` : '—'}
                      </TableCell>
                      {session && (
                        <TableCell className={`text-right font-mono ${plColor(t.gain_loss)}`}>
                          {t.gain_loss != null ? `${Number(t.gain_loss) > 0 ? '+' : ''}${fmtMoney(t.gain_loss)}` : '—'}
                        </TableCell>
                      )}
                      <TableCell className="min-w-[140px]">
                        <InlineTagEditor value={t.tags ?? []} allTags={allTags} onChange={(tags) => onUpdateTags(t, tags)} onCreateTag={onCreateTag} />
                      </TableCell>
                      <TableCell>
                        <button onClick={() => onDeleteTrade(t.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete trade">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
