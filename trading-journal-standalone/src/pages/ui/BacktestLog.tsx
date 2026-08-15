import { useMemo } from 'react';
import { Card, CardContent } from '../../lib/ui/card';
import { Badge } from '../../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../lib/ui/table';
import { Button } from '../../lib/ui/button';
import { X } from 'lucide-react';
import { BacktestTrade } from '../data/types';

type Props = {
  trades: BacktestTrade[];
  onCloseTrade: (trade: BacktestTrade) => void;
  onDeleteTrade: (id: number) => void;
};

// Practice-trade log for the currently selected dataset - deliberately
// styled distinctly from the real Journal/Performance tables (same amber
// "practice" accent used on the page header) so it never reads as if it's
// part of the live trading record.
export default function BacktestLog({ trades, onCloseTrade, onDeleteTrade }: Props) {
  const stats = useMemo(() => {
    const closed = trades.filter(t => t.result != null);
    const wins = closed.filter(t => t.result === 'Profit').length;
    const totalR = closed.reduce((sum, t) => sum + Number(t.rr ?? 0), 0);
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 1000) / 10 : 0;
    return {
      total: trades.length,
      open: trades.filter(t => t.result == null).length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      winRate,
      totalR: Math.round(totalR * 100) / 100,
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
          <p className={`text-xl font-bold ${stats.totalR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {stats.totalR > 0 ? '+' : ''}{stats.totalR}R
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-3 pb-2.5">
          <p className="text-xs text-muted-foreground">Avg R / Trade</p>
          <p className="text-xl font-bold">
            {stats.closed > 0 ? `${(stats.totalR / stats.closed) >= 0 ? '+' : ''}${Math.round((stats.totalR / stats.closed) * 100) / 100}R` : '—'}
          </p>
        </CardContent></Card>
      </div>

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
                      <TableCell className={`text-right font-mono ${t.rr == null ? 'text-muted-foreground' : Number(t.rr) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {t.rr != null ? `${Number(t.rr) > 0 ? '+' : ''}${Number(t.rr).toFixed(2)}R` : '—'}
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
