import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Download, Loader2, Target, PlusCircle, Settings2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';
import { Button } from '../lib/ui/button';
import { Select, Input, Label } from '../lib/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../lib/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../lib/ui/tabs';
import { api, useFetch } from '../lib/api';
import { ChartDataset, Candle, BacktestTrade, BacktestSession, Tag } from './data/types';
import TradingViewChart from './ui/TradingViewChart';
import FetchDatasetDialog from './ui/FetchDatasetDialog';
import CreateSessionDialog from './ui/CreateSessionDialog';
import BacktestLog from './ui/BacktestLog';
import TradeReplayTab from './ui/TradeReplayTab';
import { useReplayPlayback, SPEED_OPTIONS } from './ui/useReplayPlayback';

// Candles that must already be visible before replay can "start" - a chart
// with 3 bars on it isn't useful context to trade against. Also the floor a
// session's chosen start date gets clamped to, so a session created right at
// the very beginning of a dataset still has a sane amount of runway behind it.
const MIN_LOOKBACK = 50;
// Kept clear of the tail end of the dataset so there's still meaningful
// runway ahead of a session's start point to actually place and resolve
// trades against.
const RANDOM_START_BUFFER = 300;
// Fallback starting depth for legacy (pre-session) sessions only, which have
// no real chosen start_time to recover - see computeStartIndex below. Same
// reasoning as the old default this replaced: deep enough that zooming out
// to a coarser timeframe the moment you open one doesn't look broken.
const DEFAULT_LOOKBACK = 30000;

// Where a session's replay should begin revealing candles from. A normal
// session's start_time was chosen explicitly at creation (Create Backtest
// Session's Start Date field) - find the first candle at or after it. A
// legacy session (auto-created for practice trades logged before sessions
// existed - see the migration in api/backtest.ts) has no real single start
// point to recover, so it falls back to the same "deep enough to look right
// zoomed out, with runway ahead" heuristic the old dataset-only flow used.
function computeStartIndex(candles: Candle[], session: BacktestSession): number {
  if (session.is_legacy) {
    const withRunway = Math.max(MIN_LOOKBACK, candles.length - RANDOM_START_BUFFER);
    return Math.max(1, Math.min(DEFAULT_LOOKBACK, withRunway, candles.length - 1));
  }
  const startSec = Math.floor(new Date(session.start_time).getTime() / 1000);
  const found = candles.findIndex(c => c.time >= startSec);
  const idx = found === -1 ? candles.length - 1 : found;
  return Math.max(MIN_LOOKBACK, Math.min(idx, candles.length - 1));
}

function LogTradeForm({ lastClose, defaultRiskPct, currentBalance, onSubmit }: {
  lastClose: number;
  defaultRiskPct: number | null;
  currentBalance: number | null;
  onSubmit: (t: { direction: string; entry_price: number; sl_price: number | null; tp_price: number | null; position_size: number | null; notes: string }) => void;
}) {
  const [direction, setDirection] = useState<'Long' | 'Short'>('Long');
  const [entry, setEntry] = useState(String(lastClose));
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [positionSize, setPositionSize] = useState(defaultRiskPct != null ? String(defaultRiskPct) : '');
  const [notes, setNotes] = useState('');

  useEffect(() => { setEntry(String(lastClose)); }, [lastClose]);

  const sizeNum = positionSize.trim() ? Number(positionSize) : null;
  const riskDollar = currentBalance != null && sizeNum != null && !isNaN(sizeNum)
    ? Math.round(currentBalance * (sizeNum / 100) * 100) / 100
    : null;

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
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Position Size (% of capital)</Label>
          <Input
            type="number" min={0} step={0.1}
            value={positionSize}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPositionSize(e.target.value)}
            placeholder="e.g. 1"
            className="text-xs"
          />
          {riskDollar != null && (
            <p className="text-[11px] text-muted-foreground">
              Risking ~${riskDollar.toLocaleString()} of ${currentBalance!.toLocaleString()}
            </p>
          )}
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
              position_size: sizeNum != null && !isNaN(sizeNum) ? sizeNum : null,
              notes: notes.trim() || '',
            });
            setSl(''); setTp(''); setNotes('');
            setPositionSize(defaultRiskPct != null ? String(defaultRiskPct) : '');
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

  const { data: rawSessions, refetch: refetchSessions } = useFetch<BacktestSession[]>('/backtest?resource=sessions');
  const sessions = rawSessions ?? [];

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [fetchOpen, setFetchOpen] = useState(false);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<BacktestSession | null>(null);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<BacktestSession | null>(null);

  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [candlesDatasetId, setCandlesDatasetId] = useState<number | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [closingTrade, setClosingTrade] = useState<BacktestTrade | null>(null);
  const [closePrice, setClosePrice] = useState('');
  // Surfaces a failed trade log/close/delete/tag-update instead of the
  // silent no-op it used to be: every handler below used to let a rejected
  // api.post/put/del just vanish as an unhandled promise rejection - visible
  // in the browser console if you knew to look, invisible otherwise, which
  // is exactly what "I clicked Log Trade and nothing happened" looks like
  // from the outside. One shared banner (rather than a field per handler)
  // since only one of these actions can realistically be in flight at once.
  const [actionError, setActionError] = useState<string | null>(null);

  const { visibleCount, setVisibleCount, playing, setPlaying, speedIdx, setSpeedIdx } = useReplayPlayback(candles?.length ?? 0);

  const selectedSession = sessions.find(s => s.id === selectedSessionId) ?? null;
  const selectedDataset = datasets.find(d => d.id === selectedSession?.dataset_id) ?? null;

  const { data: rawTrades, refetch: refetchTrades } = useFetch<BacktestTrade[]>(
    `/backtest?resource=trades${selectedSessionId ? `&session_id=${selectedSessionId}` : ''}`
  );
  const trades = (rawTrades ?? []).filter(t => t.session_id === selectedSessionId);

  const { data: rawTags, refetch: refetchTags } = useFetch<Tag[]>('/columns?resource=tags');
  const allTags: Tag[] = rawTags ?? [];

  // A trade log/close/delete changes the session's realized P&L, which
  // changes current_balance (and therefore the Position Size $ preview and
  // every session performance stat) - refetch both after any trade mutation
  // rather than just trades, so the picker/settings/log all stay in sync
  // with what the server just recalculated.
  function refetchAfterTradeChange() {
    refetchTrades();
    refetchSessions();
  }

  useEffect(() => {
    if (selectedSessionId == null && sessions.length > 0) setSelectedSessionId(sessions[0].id);
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId != null && sessions.length > 0 && !sessions.some(s => s.id === selectedSessionId)) {
      // The selected session no longer exists (deleted, e.g. from another tab).
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
  }, [sessions, selectedSessionId]);

  // Load the candle JSON straight from Blob (not through a serverless
  // function - it can be tens of MB for months of 1-minute data, and a
  // static Blob fetch has none of the payload/timeout limits a function
  // invocation would). Keyed off the dataset, not the session, so switching
  // between two sessions on the same pair doesn't re-download anything.
  useEffect(() => {
    if (!selectedDataset) { setCandles(null); setCandlesDatasetId(null); return; }
    let cancelled = false;
    setCandlesLoading(true);
    setCandlesError(null);
    fetch(selectedDataset.blob_url)
      .then(r => { if (!r.ok) throw new Error('Failed to load candle data from storage.'); return r.json(); })
      .then((data: Candle[]) => {
        if (cancelled) return;
        setCandles(data);
        setCandlesDatasetId(selectedDataset.id);
      })
      .catch(e => { if (!cancelled) setCandlesError(e.message); })
      .finally(() => { if (!cancelled) setCandlesLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset?.id]);

  // Positions the replay the moment both the selected session AND its
  // dataset's candles are ready - this is what replaces the old "choose a
  // starting point" card. A session's start point was already decided once,
  // at creation, so opening (or reopening) a session just resumes the
  // replay from that exact same point every time, instead of asking you to
  // pick it again.
  useEffect(() => {
    if (!selectedSession) { setStarted(false); return; }
    if (!candles || candlesDatasetId !== selectedSession.dataset_id) return;
    setPlaying(false);
    const idx = computeStartIndex(candles, selectedSession);
    setVisibleCount(Math.min(idx + 1, candles.length));
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, candles, candlesDatasetId]);

  // Auto-resolve open practice trades the instant the newly-revealed candle
  // touches their SL or TP - the whole point of replaying against real
  // candles instead of just eyeballing a static chart.
  useEffect(() => {
    if (!candles || visibleCount === 0 || !selectedSessionId) return;
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
        exit_price: exitPrice, result, rr, position_size: t.position_size, notes: t.notes, tags: t.tags,
      }).then(() => refetchAfterTradeChange()).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount, candles, selectedSessionId]);

  function resetReplay() {
    if (!candles || !selectedSession) return;
    setPlaying(false);
    const idx = computeStartIndex(candles, selectedSession);
    setVisibleCount(Math.min(idx + 1, candles.length));
  }

  async function handleLogTrade(t: { direction: string; entry_price: number; sl_price: number | null; tp_price: number | null; position_size: number | null; notes: string }) {
    if (!candles || !selectedSessionId || !selectedDataset || visibleCount === 0) return;
    setActionError(null);
    const candle = candles[visibleCount - 1];
    try {
      await api.post('/backtest', {
        resource: 'trades',
        dataset_id: selectedDataset.id,
        session_id: selectedSessionId,
        direction: t.direction,
        entry_price: t.entry_price,
        sl_price: t.sl_price,
        tp_price: t.tp_price,
        position_size: t.position_size,
        entry_time: new Date(candle.time * 1000).toISOString(),
        notes: t.notes,
      });
      refetchAfterTradeChange();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to log trade.');
    }
  }

  async function handleManualClose() {
    if (!closingTrade || !closePrice.trim() || isNaN(Number(closePrice)) || !candles || visibleCount === 0) return;
    setActionError(null);
    const exitPrice = Number(closePrice);
    const entry = Number(closingTrade.entry_price);
    const isLong = closingTrade.direction === 'Long';
    const favorable = isLong ? exitPrice > entry : exitPrice < entry;
    const result = favorable ? 'Profit' : 'Loss';
    const risk = Math.abs(entry - Number(closingTrade.sl_price ?? entry));
    const reward = Math.abs(exitPrice - entry);
    const rr = risk > 0 ? Math.round((reward / risk) * (result === 'Profit' ? 1 : -1) * 100) / 100 : (result === 'Profit' ? 1 : -1);
    const candle = candles[visibleCount - 1];
    try {
      await api.put(`/backtest?resource=trades&id=${closingTrade.id}`, {
        direction: closingTrade.direction, entry_price: closingTrade.entry_price, sl_price: closingTrade.sl_price, tp_price: closingTrade.tp_price,
        entry_time: closingTrade.entry_time, exit_time: new Date(candle.time * 1000).toISOString(),
        exit_price: exitPrice, result, rr, position_size: closingTrade.position_size, notes: closingTrade.notes, tags: closingTrade.tags,
      });
      setClosingTrade(null);
      setClosePrice('');
      refetchAfterTradeChange();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to close trade.');
    }
  }

  async function handleDeleteTrade(id: number) {
    setActionError(null);
    try {
      await api.del(`/backtest?resource=trades&id=${id}`);
      refetchAfterTradeChange();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to delete trade.');
    }
  }

  async function handleUpdateTags(trade: BacktestTrade, tags: string[]) {
    setActionError(null);
    try {
      await api.put(`/backtest?resource=trades&id=${trade.id}`, {
        direction: trade.direction, entry_price: trade.entry_price, sl_price: trade.sl_price, tp_price: trade.tp_price,
        entry_time: trade.entry_time, exit_time: trade.exit_time, exit_price: trade.exit_price,
        result: trade.result, rr: trade.rr, position_size: trade.position_size, notes: trade.notes, tags,
      });
      refetchTrades();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to update tags.');
    }
  }

  function handleCreateTag(name: string) {
    api.post('/columns', { resource: 'tags', name }).then(() => refetchTags()).catch(() => {});
  }

  async function handleDeleteSession() {
    if (!deleteConfirmSession) return;
    try {
      await api.del(`/backtest?resource=sessions&id=${deleteConfirmSession.id}`);
      if (selectedSessionId === deleteConfirmSession.id) setSelectedSessionId(null);
      setDeleteConfirmSession(null);
      refetchSessions();
    } catch (e: any) {
      setActionError(e?.message ?? 'Failed to delete session.');
    }
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
          <div className="flex flex-col gap-2 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-64">
                <Select
                  value={selectedSessionId ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedSessionId(Number(e.target.value))}
                  disabled={sessions.length === 0}
                >
                  {sessions.length === 0 && <option value="">No backtest sessions yet</option>}
                  {sessions.map(s => {
                    const pair = datasets.find(d => d.id === s.dataset_id)?.pair ?? '?';
                    const label = s.name?.trim() || `${pair} session`;
                    return <option key={s.id} value={s.id}>{label}{s.is_legacy ? ' (Legacy)' : ''} &middot; ${s.current_balance.toLocaleString()}</option>;
                  })}
                </Select>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEditingSession(null); setSessionDialogOpen(true); }} disabled={datasets.length === 0}>
                <PlusCircle className="w-3.5 h-3.5 mr-1" /> Create Backtest Session
              </Button>
              {selectedSession && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingSession(selectedSession); setSessionDialogOpen(true); }}>
                    <Settings2 className="w-3.5 h-3.5 mr-1" /> Session Settings
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteConfirmSession(selectedSession)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                  </Button>
                </>
              )}
            </div>
            {selectedSession && selectedDataset && (
              <p className="text-xs text-muted-foreground">
                {selectedDataset.pair} &middot; started {new Date(selectedSession.start_time).toLocaleDateString()} &middot;{' '}
                initial ${selectedSession.initial_capital.toLocaleString()}
                {selectedSession.default_risk_pct != null ? ` · default risk ${selectedSession.default_risk_pct}%` : ' · no default risk %'}
                {' '}&middot; {selectedSession.trade_count} trade{selectedSession.trade_count === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {datasets.length === 0 && (
            <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No candle data yet. Click <span className="font-medium text-foreground">Fetch Data</span> to pull real history for a pair straight from Dukascopy, then create a backtest session against it.
            </CardContent></Card>
          )}

          {datasets.length > 0 && sessions.length === 0 && (
            <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No backtest sessions yet. Click <span className="font-medium text-foreground">Create Backtest Session</span> to pick a pair, start date, and starting capital.
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

          {candles && started && selectedSession && (
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
                  <TradingViewChart candles={candles} visibleCount={visibleCount} trades={trades} baseTimeframe={selectedDataset?.timeframe} datasetId={selectedDataset?.id ?? null} />
                </CardContent>
              </Card>

              {actionError && (
                <Card className="border-destructive/40">
                  <CardContent className="pt-3 pb-3 text-sm text-destructive flex items-center justify-between gap-3">
                    <span>{actionError}</span>
                    <Button size="sm" variant="ghost" onClick={() => setActionError(null)}>Dismiss</Button>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
                <LogTradeForm
                  key={selectedSessionId}
                  lastClose={candles[Math.max(0, visibleCount - 1)].close}
                  defaultRiskPct={selectedSession.default_risk_pct}
                  currentBalance={selectedSession.current_balance}
                  onSubmit={handleLogTrade}
                />
                <BacktestLog
                  trades={trades}
                  session={selectedSession}
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

      <CreateSessionDialog
        open={sessionDialogOpen}
        onClose={() => setSessionDialogOpen(false)}
        datasets={datasets}
        editingSession={editingSession}
        onSaved={(session) => { refetchSessions(); setSelectedSessionId(session.id); }}
      />

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

      <Dialog open={!!deleteConfirmSession} onOpenChange={(v) => { if (!v) setDeleteConfirmSession(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogClose onClose={() => setDeleteConfirmSession(null)} />
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently deletes "{deleteConfirmSession?.name?.trim() || (datasets.find(d => d.id === deleteConfirmSession?.dataset_id)?.pair ?? 'this session')}"
            {' '}and all {deleteConfirmSession?.trade_count ?? 0} practice trade{deleteConfirmSession?.trade_count === 1 ? '' : 's'} logged in it. This can't be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmSession(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSession}>Delete Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
