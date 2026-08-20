import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../lib/ui/card';
import { Badge } from '../../lib/ui/form';
import { Button } from '../../lib/ui/button';
import { Select } from '../../lib/ui/form';
import { useAccount } from '../../lib/accounts';
import { useFetch } from '../../lib/api';
import { ChartDataset, Candle, Trade, BacktestTrade, fmtMoney } from '../data/types';
import ReplayChart from './ReplayChart';
import { useReplayPlayback, SPEED_OPTIONS } from './useReplayPlayback';

type Props = { datasets: ChartDataset[] };

// Candles of context kept visible before the entry and after the exit, so
// the replay isn't just the trade in total isolation.
const WINDOW_PADDING = 40;

function combineDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const t = time && /^\d{1,2}:\d{2}/.test(time) ? (time.length === 5 ? `${time}:00` : time) : '00:00:00';
  const d = new Date(`${date}T${t}Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function tradeToReplayShape(trade: Trade, datasetId: number): BacktestTrade {
  return {
    id: trade.id,
    dataset_id: datasetId,
    direction: trade.direction,
    entry_price: trade.entry_price ?? 0,
    sl_price: trade.sl_price,
    tp_price: trade.tp_price,
    entry_time: combineDateTime(trade.trade_placed_at, trade.trade_executed_at) ?? new Date(0).toISOString(),
    exit_time: combineDateTime(trade.date_closed, trade.time_closed),
    exit_price: null,
    result: trade.profit_loss,
    rr: trade.rr,
    notes: trade.comments,
    tags: trade.tags,
    created_at: trade.created_at,
  };
}

// Relives one of your ACTUAL Journal trades against the real candles from
// when you took it - unlike the Practice Backtest tab (blind, hypothetical
// setups on history), this is read-only history review: no new trade
// logging, just watching your own entry/exit play out second by second
// against real price action, the way TradeZella's "Trade Replay" works.
export default function TradeReplayTab({ datasets }: Props) {
  const { activeAccountId } = useAccount();
  const { data: rawTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const allTrades: Trade[] = rawTrades ?? [];

  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [datasetCandles, setDatasetCandles] = useState<Record<number, Candle[]>>({});
  const [loadingDatasetId, setLoadingDatasetId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A real trade is "replayable" if some uploaded dataset covers both its
  // pair and the date it was placed - otherwise there's no candle data to
  // show it against.
  const eligible = useMemo(() => {
    return allTrades
      .map(t => {
        if (!t.entry_price || !t.trade_placed_at || !t.coin_token) return null;
        const dataset = datasets.find(d =>
          d.pair.toUpperCase() === t.coin_token!.toUpperCase() &&
          d.start_time && d.end_time &&
          t.trade_placed_at! >= d.start_time.slice(0, 10) &&
          t.trade_placed_at! <= d.end_time.slice(0, 10)
        );
        return dataset ? { trade: t, dataset } : null;
      })
      .filter((x): x is { trade: Trade; dataset: ChartDataset } => x !== null)
      .sort((a, b) => (b.trade.trade_placed_at ?? '').localeCompare(a.trade.trade_placed_at ?? ''));
  }, [allTrades, datasets]);

  const selected = eligible.find(e => e.trade.id === selectedTradeId) ?? null;

  // Load (and cache) the full candle JSON for whichever dataset the
  // selected trade needs - same direct-Blob-fetch pattern as the Practice
  // Backtest tab.
  useEffect(() => {
    if (!selected) return;
    const datasetId = selected.dataset.id;
    if (datasetCandles[datasetId]) return;
    setLoadingDatasetId(datasetId);
    setLoadError(null);
    fetch(selected.dataset.blob_url)
      .then(r => { if (!r.ok) throw new Error('Failed to load candle data from storage.'); return r.json(); })
      .then((data: Candle[]) => setDatasetCandles(prev => ({ ...prev, [datasetId]: data })))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoadingDatasetId(null));
  }, [selected, datasetCandles]);

  const windowed = useMemo(() => {
    if (!selected) return null;
    const full = datasetCandles[selected.dataset.id];
    if (!full || full.length === 0) return null;

    const reviewTrade = tradeToReplayShape(selected.trade, selected.dataset.id);
    const entrySec = Math.floor(new Date(reviewTrade.entry_time).getTime() / 1000);
    const exitSec = reviewTrade.exit_time ? Math.floor(new Date(reviewTrade.exit_time).getTime() / 1000) : null;

    let entryIdx = full.findIndex(c => c.time >= entrySec);
    if (entryIdx === -1) entryIdx = full.length - 1;
    let exitIdx = exitSec != null ? full.findIndex(c => c.time >= exitSec) : entryIdx;
    if (exitIdx === -1) exitIdx = full.length - 1;
    if (exitIdx < entryIdx) exitIdx = entryIdx;

    const windowStart = Math.max(0, entryIdx - WINDOW_PADDING);
    const windowEnd = Math.min(full.length, exitIdx + WINDOW_PADDING + 1);
    const slice = full.slice(windowStart, windowEnd);
    const entryOffsetInSlice = entryIdx - windowStart;

    return { slice, reviewTrade, entryOffsetInSlice };
  }, [selected, datasetCandles]);

  const { visibleCount, setVisibleCount, playing, setPlaying, speedIdx, setSpeedIdx, reset: resetPlayback } = useReplayPlayback(windowed?.slice.length ?? 0);

  // Re-anchor to just before the entry whenever a new trade/window loads.
  useEffect(() => {
    if (!windowed) return;
    resetPlayback();
    setVisibleCount(Math.max(1, windowed.entryOffsetInSlice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed?.reviewTrade.id]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Times are matched at face value between your Journal entries and the uploaded candle data - if your broker/platform clock and the CSV export use different timezones, the marker may land a candle or two off from where you remember it.
      </p>

      {eligible.length === 0 ? (
        <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
          None of your real trades can be replayed yet - upload candle data (Upload Data button above) covering the pair and dates of trades you've logged in the Journal.
        </CardContent></Card>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-80">
            <Select value={selectedTradeId ?? ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTradeId(Number(e.target.value))}>
              <option value="">Select a trade to relive…</option>
              {eligible.map(({ trade }) => (
                <option key={trade.id} value={trade.id}>
                  {trade.coin_token} · {trade.direction} · {trade.trade_placed_at} {trade.trade_executed_at ?? ''} · {trade.profit_loss ?? 'open'}{trade.rr != null ? ` (${trade.rr > 0 ? '+' : ''}${trade.rr}R)` : ''}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{eligible.length} of {allTrades.length} Journal trades can be replayed</p>
        </div>
      )}

      {selected && loadingDatasetId === selected.dataset.id && (
        <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading candle data…
        </CardContent></Card>
      )}

      {loadError && <Card><CardContent className="pt-6 pb-6 text-center text-sm text-destructive">{loadError}</CardContent></Card>}

      {selected && windowed && (
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => setVisibleCount(v => Math.max(1, v - 1))} disabled={visibleCount <= 1}>
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button size="icon" onClick={() => setPlaying(p => !p)} disabled={visibleCount >= windowed.slice.length}>
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={() => setVisibleCount(v => Math.min(windowed.slice.length, v + 1))} disabled={visibleCount >= windowed.slice.length}>
                  <SkipForward className="w-4 h-4" />
                </Button>
                <Select value={speedIdx} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSpeedIdx(Number(e.target.value))} className="w-20 ml-1">
                  {SPEED_OPTIONS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => { resetPlayback(); setVisibleCount(Math.max(1, windowed.entryOffsetInSlice)); }}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Back to Entry
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {selected.trade.profit_loss === 'Profit' && <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 text-xs">Win</Badge>}
                {selected.trade.profit_loss === 'Loss' && <Badge className="bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 text-xs">Loss</Badge>}
                {selected.trade.rr != null && <span className="font-mono text-muted-foreground">{selected.trade.rr > 0 ? '+' : ''}{selected.trade.rr}R</span>}
                {selected.trade.gain_loss != null && <span className="font-mono text-muted-foreground">{fmtMoney(selected.trade.gain_loss)}</span>}
              </div>
            </div>
            <ReplayChart candles={windowed.slice} visibleCount={visibleCount} trades={[windowed.reviewTrade]} baseTimeframe={selected.dataset.timeframe} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
