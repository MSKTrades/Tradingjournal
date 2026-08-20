import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, RotateCcw, Download, Loader2, Target } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';
import { Button } from '../lib/ui/button';
import { Select, Input, Label } from '../lib/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../lib/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../lib/ui/tabs';
import { api, useFetch } from '../lib/api';
import { ChartDataset, Candle, BacktestTrade, Tag } from './data/types';
import ReplayChart from './ui/ReplayChart';
import FetchDatasetDialog from './ui/FetchDatasetDialog';
import BacktestLog from './ui/BacktestLog';
import TradeReplayTab from './ui/TradeReplayTab';
import { useReplayPlayback, SPEED_OPTIONS } from './ui/useReplayPlayback';

// Candles that must already be visible before replay can "start" - a chart
// with 3 bars on it isn't useful context to trade against. This is a floor
// (the slider's minimum), not the default - see DEFAULT_LOOKBACK below for
// where a fresh dataset actually starts.
const MIN_LOOKBACK = 50;
// Kept clear of the tail end of the dataset on a random start so there's
// still meaningful runway ahead of you to actually place and resolve trades.
const RANDOM_START_BUFFER = 300;
// Where the starting-point slider defaults to when a dataset first loads.
// Deliberately much deeper than MIN_LOOKBACK: the replay chart can zoom out
// to coarser timeframes (see ReplayChart's resampling), and a coarser view
// only ever shows what's already been revealed - starting right at candle
// 50 of a 371,000-candle dataset means switching to 1h shows a single
// still-forming candle, which reads as broken even though it's technically
// correct (there just isn't more history yet at that point in the replay).
// 30,000 base candles is ~500 hours' worth on a 1-minute dataset - enough
// for a proper-looking zoomed-out view the moment someone starts, while
// still leaving RANDOM_START_BUFFER candles of runway ahead to trade
// against. Only kicks in as a *default* - the slider can still be dragged
// all the way back to MIN_LOOKBACK for anyone who wants to start from the
// very beginning of their history.
const DEFAULT_LOOKBACK = 30000;

function LogTradeForm({ lastClose, onSubmit }: { lastClose: number; onSubmit: (t: { direction: string; entry_price: number; sl_price: number | null; tp_price: number | null; notes: string }) => void }) {
  const [direction, setDirection] = useState<'Long' | 'Short'>('Long');
  const [entry, setEntry] = useState(String(lastClose));
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { setEntry(String(lastClose)); }, [lastClose]);

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">Log Practice Trade</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={direction === 'Long' ? 'default' : 'outline'} onClick={() => setDirection('Long')} className="flex-1">Long</Button>
          <Button type="button" size="sm" variant={direction === 'Short' ? 'default' : 'outline'} onClick={() => setDirection('Short')} className="flex-1">Short</Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Entry</Label>
            <Input value={entry} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEntry(e.target.value)} className="text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">SL</Label>
            <Input value={sl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSl(e.target.value)} placeholder="optional" className="text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">TP</Label>
            <Input value={tp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTp(e.target.value)} placeholder="optional" className="text-xs" />
          </div>
        </div>
        <Input value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Notes (why this setup?)" className="text-xs" />
        <Button
          size="sm"
          disabled={!entry || isNaN(Number(entry))}
          onClick={() => {
            onSubmit({
              direction,
              entry_price: Number(entry),
              sl_price: sl.trim() ? Number(sl) : null,
              tp_price: tp.trim() ? Number(tp) : null,
              notes: notes.trim() || '',
            });
            setSl(''); setTp(''); setNotes('');
          }}
        >
          <Target className="w-3.5 h-3.5 mr-1" /> Log Trade
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Backtest() {
  const { data: rawDatasets, refetch: refetchDatasets } = useFetch<ChartDataset[]>('/backtest?resource=datasets');
  const datasets = rawDatasets ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fetchOpen, setFetchOpen] = useState(false);

  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [startIndex, setStartIndex] = useState(MIN_LOOKBACK);
  const [closingTrade, setClosingTrade] = useState<BacktestTrade | null>(null);
  const [closePrice, setClosePrice] = useState('');

  const { visibleCount, setVisibleCount, playing, setPlaying, speedIdx, setSpeedIdx, reset: resetPlayback } = useReplayPlayback(candles?.length ?? 0);

  const selectedDataset = datasets.find(d => d.id === selectedId) ?? null;

  const { data: rawTrades, refetch: refetchTrades } = useFetch<BacktestTrade[]>(
    `/backtest?resource=trades${selectedId ? `&dataset_id=${selectedId}` : ''}`
  );
  const trades = (rawTrades ?? []).filter(t => t.dataset_id === selectedId);

  const { data: rawTags, refetch: refetchTags } = useFetch<Tag[]>('/columns?resource=tags');
  const allTags: Tag[] = rawTags ?? [];

  useEffect(() => {
    if (selectedId == null && datasets.length > 0) setSelectedId(datasets[0].id);
  }, [datasets, selectedId]);

  // Load the candle JSON straight from Blob (not through a serverless
  // function - it can be tens of MB for months of 1-minute data, and a
  // static Blob fetch has none of the payload/timeout limits a function
  // invocation would).
  useEffect(() => {
    if (!selectedDataset) { setCandles(null); return; }
    let cancelled = false;
    setCandlesLoading(true);
    setCandlesError(null);
    setStarted(false);
    setPlaying(false);
    setVisibleCount(0);
    fetch(selectedDataset.blob_url)
      .then(r => { if (!r.ok) throw new Error('Failed to load candle data from storage.'); return r.json(); })
      .then((data: Candle[]) => {
        if (cancelled) return;
        setCandles(data);
        // Deepest point that still leaves RANDOM_START_BUFFER candles of
        // runway ahead, capped at DEFAULT_LOOKBACK, floored at MIN_LOOKBACK
        // (and never past the end of a short dataset) - see the constants'
        // comments above for why this isn't just MIN_LOOKBACK anymore.
        const withRunway = Math.max(MIN_LOOKBACK, data.length - RANDOM_START_BUFFER);
        setStartIndex(Math.max(1, Math.min(DEFAULT_LOOKBACK, withRunway, data.length - 1)));
      })
      .catch(e => { if (!cancelled) setCandlesError(e.message); })
      .finally(() => { if (!cancelled) setCandlesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset?.id]);

  // Auto-resolve open practice trades the instant the newly-revealed candle
  // touches their SL or TP - the whole point of replaying against real
  // candles instead of just eyeballing a static chart.
  useEffect(() => {
    if (!candles || visibleCount === 0 || !selectedId) return;
    const candle = candles[visibleCount - 1];
    const openTrades = trades.filter(
      t => t.result == null && Math.floor(new Date(t.entry_time).getTime() / 1000) < candle.time
    );
    openTrades.forEach(t => {
      const isLong = t.direction === 'Long';
      const sl = t.sl_price != null ? Number(t.sl_price) : null;
      const tp = t.tp_price != null ? Number(t.tp_price) : null;
      const hitSl = sl != null && (isLong ? candle.low <= sl : candle.high >= sl);
      const hitTp = tp != null && (isLong ? candle.high >= tp : candle.low <= tp);
      if (!hitSl && !hitTp) return;
      // Both touched in the same candle -> assume the stop went first, the
      // standard conservative convention for manual bar-replay backtesting
      // (we don't have intra-candle tick order to know for sure).
      const result = hitSl ? 'Loss' : 'Profit';
      const exitPrice = hitSl ? sl! : tp!;
      const entry = Number(t.entry_price);
      const risk = Math.abs(entry - (sl ?? entry));
      const reward = Math.abs(exitPrice - entry);
      const rr = risk > 0 ? Math.round((reward / risk) * (result === 'Profit' ? 1 : -1) * 100) / 100 : (result === 'Profit' ? 1 : -1);
      api.put(`/backtest?resource=trades&id=${t.id}`, {
        direction: t.direction, entry_price: t.entry_price, sl_price: t.sl_price, tp_price: t.tp_price,
        entry_time: t.entry_time, exit_time: new Date(candle.time * 1000).toISOString(),
        exit_price: exitPrice, result, rr, notes: t.notes, tags: t.tags,
      }).then(() => refetchTrades()).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, candles, selectedId]);

  function startReplay(atIndex: number) {
    if (!candles) return;
    setVisibleCount(Math.min(atIndex + 1, candles.length));
    setStarted(true);
    setPlaying(false);
  }

  function randomStart() {
    if (!candles || candles.length < MIN_LOOKBACK + RANDOM_START_BUFFER) { startReplay(startIndex); return; }
    const idx = MIN_LOOKBACK + Math.floor(Math.random() * (candles.length - MIN_LOOKBACK - RANDOM_START_BUFFER));
    startReplay(idx);
  }

  function resetReplay() {
    setStarted(false);
    resetPlayback();
  }

  async function handleLogTrade(t: { direction: string; entry_price: number; sl_price: number | null; tp_price: number | null; notes: string }) {
    if (!candles || !selectedId || visibleCount === 0) return;
    const candle = candles[visibleCount - 1];
    await api.post('/backtest', {
      resource: 'trades',
      dataset_id: selectedId,
      direction: t.direction,
      entry_price: t.entry_price,
      sl_price: t.sl_price,
      tp_price: t.tp_price,
      entry_time: new Date(candle.time * 1000).toISOString(),
      notes: t.notes,
    });
    refetchTrades();
  }

  async function handleManualClose() {
    if (!closingTrade || !closePrice.trim() || isNaN(Number(closePrice)) || !candles || visibleCount === 0) return;
    const exitPrice = Number(closePrice);
    const entry = Number(closingTrade.entry_price);
    const isLong = closingTrade.direction === 'Long';
    const favorable = isLong ? exitPrice > entry : exitPrice < entry;
    const result = favorable ? 'Profit' : 'Loss';
    const risk = Math.abs(entry - Number(closingTrade.sl_price ?? entry));
    const reward = Math.abs(exitPrice - entry);
    const rr = risk > 0 ? Math.round((reward / risk) * (result === 'Profit' ? 1 : -1) * 100) / 100 : (result === 'Profit' ? 1 : -1);
    const candle = candles[visibleCount - 1];
    await api.put(`/backtest?resource=trades&id=${closingTrade.id}`, {
      direction: closingTrade.direction, entry_price: closingTrade.entry_price, sl_price: closingTrade.sl_price, tp_price: closingTrade.tp_price,
      entry_time: closingTrade.entry_time, exit_time: new Date(candle.time * 1000).toISOString(),
      exit_price: exitPrice, result, rr, notes: closingTrade.notes, tags: closingTrade.tags,
    });
    setClosingTrade(null);
    setClosePrice('');
    refetchTrades();
  }

  async function handleDeleteTrade(id: number) {
    await api.del(`/backtest?resource=trades&id=${id}`);
    refetchTrades();
  }

  async function handleUpdateTags(trade: BacktestTrade, tags: string[]) {
    await api.put(`/backtest?resource=trades&id=${trade.id}`, {
      direction: trade.direction, entry_price: trade.entry_price, sl_price: trade.sl_price, tp_price: trade.tp_price,
      entry_time: trade.entry_time, exit_time: trade.exit_time, exit_price: trade.exit_price,
      result: trade.result, rr: trade.rr, notes: trade.notes, tags,
    });
    refetchTrades();
  }

  function handleCreateTag(name: string) {
    api.post('/columns', { resource: 'tags', name }).then(() => refetchTags()).catch(() => {});
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold">Chart Replay &amp; Backtesting</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Step or play through historical candles bar-by-bar and log practice trades - kept separate from your real Journal.
          </p>
        </div>
        <Button size="sm" onClick={() => setFetchOpen(true)}>
          <Download className="w-3.5 h-3.5 mr-1" /> Fetch Data
        </Button>
      </div>

      <Tabs defaultValue="practice" className="mt-5">
        <TabsList>
          <TabsTrigger value="practice">Practice Backtest</TabsTrigger>
          <TabsTrigger value="replay">Trade Replay</TabsTrigger>
        </TabsList>

        <TabsContent value="practice">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-56">
              <Select
                value={selectedId ?? ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedId(Number(e.target.value))}
                disabled={datasets.length === 0}
              >
                {datasets.length === 0 && <option value="">No datasets uploaded yet</option>}
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>{d.pair} · {d.timeframe} ({d.candle_count.toLocaleString()} candles)</option>
                ))}
              </Select>
            </div>
            {selectedDataset && (
              <p className="text-xs text-muted-foreground">
                {selectedDataset.start_time && new Date(selectedDataset.start_time).toLocaleDateString()} &rarr; {selectedDataset.end_time && new Date(selectedDataset.end_time).toLocaleDateString()}
              </p>
            )}
          </div>

          {datasets.length === 0 && (
            <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No candle data yet. Click <span className="font-medium text-foreground">Fetch Data</span> to pull real history for a pair straight from Dukascopy - no file exports needed.
            </CardContent></Card>
          )}

          {candlesLoading && (
            <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading candle data…
            </CardContent></Card>
          )}

          {candlesError && (
            <Card><CardContent className="pt-6 pb-6 text-center text-sm text-destructive">{candlesError}</CardContent></Card>
          )}

          {candles && !candlesLoading && !started && (
            <Card>
              <CardContent className="pt-5 pb-5 flex flex-col gap-4">
                <p className="text-sm font-semibold">Choose a starting point</p>
                <p className="text-xs text-muted-foreground">
                  Replay reveals candles one at a time from here forward - everything after your start point stays hidden until you step or play into it, so you're trading blind just like the real thing.
                  Defaults partway into your data (not the very beginning) so there's already enough history behind you to look reasonable if you zoom out to a bigger timeframe right away - drag all the way left for a clean-slate start with no prior history.
                </p>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="range"
                    min={MIN_LOOKBACK}
                    max={Math.max(MIN_LOOKBACK, candles.length - 1)}
                    value={startIndex}
                    onChange={(e) => setStartIndex(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">Starts at {new Date(candles[Math.min(startIndex, candles.length - 1)].time * 1000).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => startReplay(startIndex)}>Start Replay Here</Button>
                  <Button size="sm" variant="outline" onClick={randomStart}>
                    <Shuffle className="w-3.5 h-3.5 mr-1" /> Random Start
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {candles && started && (
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" onClick={() => setVisibleCount(v => Math.max(1, v - 1))} disabled={visibleCount <= 1}>
                        <SkipBack className="w-4 h-4" />
                      </Button>
                      <Button size="icon" onClick={() => setPlaying(p => !p)} disabled={visibleCount >= candles.length}>
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => setVisibleCount(v => Math.min(candles.length, v + 1))} disabled={visibleCount >= candles.length}>
                        <SkipForward className="w-4 h-4" />
                      </Button>
                      <Select value={speedIdx} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSpeedIdx(Number(e.target.value))} className="w-20 ml-1">
                        {SPEED_OPTIONS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                      </Select>
                      <Button size="sm" variant="ghost" onClick={resetReplay}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {new Date(candles[Math.max(0, visibleCount - 1)].time * 1000).toLocaleString()} &middot; {visibleCount.toLocaleString()} / {candles.length.toLocaleString()}
                    </p>
                  </div>
                  <ReplayChart candles={candles} visibleCount={visibleCount} trades={trades} baseTimeframe={selectedDataset?.timeframe} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                <LogTradeForm lastClose={candles[Math.max(0, visibleCount - 1)].close} onSubmit={handleLogTrade} />
                <BacktestLog
                  trades={trades}
                  allTags={allTags}
                  onCloseTrade={(t) => { setClosingTrade(t); setClosePrice(''); }}
                  onDeleteTrade={handleDeleteTrade}
                  onUpdateTags={handleUpdateTags}
                  onCreateTag={handleCreateTag}
                />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="replay">
          <TradeReplayTab datasets={datasets} />
        </TabsContent>
      </Tabs>

      <FetchDatasetDialog open={fetchOpen} onClose={() => setFetchOpen(false)} onFetched={refetchDatasets} />

      <Dialog open={!!closingTrade} onOpenChange={(v) => { if (!v) setClosingTrade(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Trade</DialogTitle>
            <DialogClose onClose={() => setClosingTrade(null)} />
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Exit Price</Label>
              <Input value={closePrice} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClosePrice(e.target.value)} placeholder="e.g. 1.2745" />
            </div>
            {closingTrade?.sl_price != null && (
              <Button variant="outline" size="sm" onClick={() => setClosePrice(String(closingTrade.sl_price))}>Use SL ({Number(closingTrade.sl_price).toFixed(5)})</Button>
            )}
            {closingTrade?.tp_price != null && (
              <Button variant="outline" size="sm" onClick={() => setClosePrice(String(closingTrade.tp_price))}>Use TP ({Number(closingTrade.tp_price).toFixed(5)})</Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingTrade(null)}>Cancel</Button>
            <Button onClick={handleManualClose} disabled={!closePrice.trim() || isNaN(Number(closePrice))}>Close Trade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
