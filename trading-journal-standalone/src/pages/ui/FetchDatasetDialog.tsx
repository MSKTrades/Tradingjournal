import { useState } from 'react';
import { Loader2, Download, FileWarning, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select } from '../../lib/ui/form';
import { REPLAY_TIMEFRAMES, COMMON_PAIRS } from '../data/types';
import { api } from '../../lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  onFetched: () => void;
};

// How many days of history to request per server round trip, tuned per
// timeframe so a single call (and the number of hourly Dukascopy files it
// has to download+decompress under the hood) stays comfortably inside the
// serverless function's time budget - 1-minute data is by far the heaviest
// per calendar day, so it gets the smallest chunks; daily candles are tiny
// so one chunk can cover years.
const CHUNK_DAYS: Record<string, number> = {
  '1m': 7, '5m': 14, '15m': 30, '1h': 90, '4h': 180, '1d': 3650,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildChunks(fromStr: string, toStr: string, timeframe: string): Array<{ from: string; to: string }> {
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  const stepDays = CHUNK_DAYS[timeframe] ?? 30;
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = from;
  while (cursor < to) {
    const next = new Date(Math.min(cursor.getTime() + stepDays * 86_400_000, to.getTime()));
    chunks.push({ from: toDateStr(cursor), to: toDateStr(next) });
    if (next <= cursor) break; // safety valve, shouldn't happen with day-granularity inputs
    cursor = next;
  }
  return chunks;
}

// Replaces the old manual CSV-upload flow entirely: pick a pair, timeframe,
// and date range, and this pulls real historical candles straight from
// Dukascopy's free, no-signup public historical feed (via the dukascopy-node
// package server-side in api/backtest.ts) - no exporting/uploading files
// yourself. Wide ranges are split into several smaller date-range requests
// under the hood (see CHUNK_DAYS) so each one finishes quickly and this
// dialog can show real progress instead of one long unexplained spinner.
export default function FetchDatasetDialog({ open, onClose, onFetched }: Props) {
  const [pair, setPair] = useState('');
  const [timeframe, setTimeframe] = useState<string>(REPLAY_TIMEFRAMES[0]);
  const today = toDateStr(new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);

  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totalCandles, setTotalCandles] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setPair(''); setTimeframe(REPLAY_TIMEFRAMES[0]); setFrom(''); setTo(today);
    setFetching(false); setProgress(null); setTotalCandles(0); setError(null); setDone(false);
  }

  async function handleFetch() {
    if (!pair.trim() || !from || !to) return;
    setFetching(true);
    setError(null);
    setDone(false);
    setTotalCandles(0);

    const chunks = buildChunks(from, to, timeframe);
    setProgress({ done: 0, total: chunks.length });

    try {
      for (let i = 0; i < chunks.length; i++) {
        const result = await api.post('/backtest', {
          resource: 'fetch',
          pair: pair.trim().toUpperCase(),
          timeframe,
          from: chunks[i].from,
          to: chunks[i].to,
        });
        setTotalCandles(result?.total ?? 0);
        setProgress({ done: i + 1, total: chunks.length });
      }
      setDone(true);
      onFetched();
    } catch (e: any) {
      setError(e?.message ?? 'Fetch failed. The date range already downloaded stays saved - you can retry to fill in the rest.');
    } finally {
      setFetching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !fetching) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fetch Historical Data</DialogTitle>
          {!fetching && <DialogClose onClose={() => { reset(); onClose(); }} />}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Pulls real candles directly from Dukascopy's free public historical feed - no account, no CSV export.
            Wide ranges download in several smaller chunks, so this can take a minute or two for a multi-month 1-minute pull.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Pair</Label>
              <Input
                list="fetch-pairs"
                placeholder="e.g. GBPUSD"
                value={pair}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPair(e.target.value)}
                disabled={fetching}
              />
              <datalist id="fetch-pairs">
                {COMMON_PAIRS.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Timeframe</Label>
              <Select value={timeframe} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTimeframe(e.target.value)} disabled={fetching}>
                {REPLAY_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} max={to} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} disabled={fetching} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} min={from} max={today} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} disabled={fetching} />
            </div>
          </div>

          {progress && (
            <div className="flex flex-col gap-1.5">
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {fetching && <Loader2 className="w-3 h-3 animate-spin" />}
                {done && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                Chunk {progress.done} of {progress.total}
                {totalCandles > 0 && <span> &middot; {totalCandles.toLocaleString()} candles stored</span>}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={fetching}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleFetch} disabled={!pair.trim() || !from || !to || fetching}>
            {fetching
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Fetching…</>
              : <><Download className="w-3.5 h-3.5 mr-1" /> {error ? 'Retry' : 'Fetch Data'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
