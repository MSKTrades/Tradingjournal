import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from 'lightweight-charts';
import { Candle, BacktestTrade } from '../data/types';
import { computeSMA, computeEMA, computeRSI, IndicatorPoint } from './indicators';
import { TIMEFRAME_SECONDS, derivableTimeframes, createResampleCache, resampleIncremental, ResampleCache } from './resample';
import { Button } from '../../lib/ui/button';
import { cn } from '../../lib/utils';

type Props = {
  candles: Candle[];
  visibleCount: number;
  trades: BacktestTrade[];
  height?: number;
  // The timeframe `candles` was actually fetched at (e.g. '1m'). Optional -
  // when omitted the timeframe switcher is hidden and the chart just shows
  // `candles` as-is, same as before this existed. When present, anything
  // equal-or-coarser is selectable and gets resampled client-side from this
  // base series (see resample.ts) - no re-fetch needed to look at the same
  // history zoomed out.
  baseTimeframe?: string;
};

// Fixed periods rather than user-adjustable ones - keeps this a "the basics
// are here" addition rather than a full indicator-configuration feature.
// These are the standard defaults most traders already expect (EMA 50 as a
// trend filter, SMA 20 as a faster mean, RSI 14 as the textbook momentum
// read) - worth revisiting if custom periods ever get asked for.
const SMA_PERIOD = 20;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;

// Indicator points are aligned to a specific candle index by convention
// (see indicators.ts) - these offsets convert "how many candles are
// visible" into "how many indicator points are visible" without
// recomputing anything. Only used for the un-resampled (base timeframe)
// case - resampled indicator series are already clipped to exactly what's
// revealed, so they don't need an offset (see the indicator effect below).
const smaVisibleLen = (visibleCount: number) => Math.max(0, visibleCount - (SMA_PERIOD - 1));
const emaVisibleLen = (visibleCount: number) => Math.max(0, visibleCount - (EMA_PERIOD - 1));
const rsiVisibleLen = (visibleCount: number) => Math.max(0, visibleCount - RSI_PERIOD);

// Same incremental-vs-reset logic the main candle series uses (see the
// comment on the candle effect below) - a line series with tens of
// thousands of points shouldn't get a full setData() on every single-step
// replay tick, just the one new point via update().
function pushIncremental(
  series: ISeriesApi<'Line'>,
  points: IndicatorPoint[],
  visibleLen: number,
  prevLenRef: { current: number },
) {
  const clamped = Math.max(0, Math.min(visibleLen, points.length));
  const prevLen = prevLenRef.current;
  if (clamped === 0) {
    series.setData([]);
  } else if (clamped === prevLen + 1 && prevLen > 0) {
    const p = points[clamped - 1];
    series.update({ time: p.time as UTCTimestamp, value: p.value });
  } else {
    series.setData(points.slice(0, clamped).map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
  }
  prevLenRef.current = clamped;
}

// Wraps TradingView's lightweight-charts. Kept as its own component so the
// imperative chart lifecycle (create once, mutate in place afterward) is
// fully isolated from React's render cycle - Backtest.tsx just hands down
// "how many candles are revealed right now" and this component figures out
// whether that's a single step forward (series.update - cheap, O(1)) or a
// jump/reset (series.setData - rebuilds the visible series). Re-creating
// the whole chart on every replay tick would both be slow for a dataset
// with 100k+ candles and would reset the user's zoom/pan on every step.
export default function ReplayChart({ candles, visibleCount, trades, height = 480, baseTimeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const prevLenRef = useRef(0);
  const resampleCacheRef = useRef<ResampleCache>(createResampleCache());

  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rsiLinesRef = useRef<IPriceLine[]>([]);
  const prevSmaLenRef = useRef(0);
  const prevEmaLenRef = useRef(0);
  const prevRsiLenRef = useRef(0);

  // Overlay visibility lives here rather than being threaded down from
  // Backtest.tsx / TradeReplayTab.tsx, so both places that render a replay
  // chart get the same toggles for free instead of duplicating the control
  // row in each parent. EMA defaults on (a moving average is the one thing
  // almost everyone glances for); SMA and RSI are a click away.
  const [showEma, setShowEma] = useState(true);
  const [showSma, setShowSma] = useState(false);
  const [showRsi, setShowRsi] = useState(false);

  // Which timeframe is currently displayed - defaults to (and resets to
  // whenever it changes) the base timeframe the data was actually fetched
  // at. Only timeframes derivable from that base are ever selected (see
  // derivableTimeframes) - you can zoom OUT to 1h from a 1m dataset, not
  // in to 1m from an hourly one.
  const [displayTf, setDisplayTf] = useState(baseTimeframe ?? '1m');
  useEffect(() => { setDisplayTf(baseTimeframe ?? '1m'); }, [baseTimeframe]);

  const isResampling = !!baseTimeframe && displayTf !== baseTimeframe;

  useEffect(() => {
    if (!containerRef.current) return;
    const isDark = document.documentElement.classList.contains('dark');
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: isDark ? '#9ca3af' : '#4b5563',
        // attributionLogo is intentionally left unset (defaults to true) -
        // this is lightweight-charts' own free/open-source Apache-2.0
        // library, and their license requires a visible "Powered by
        // TradingView" link somewhere the user can see; this built-in
        // badge satisfies that automatically. Don't set this to false
        // unless there's an equivalent tradingview.com link/attribution
        // elsewhere in the app instead - see the NOTICE file in the
        // lightweight-charts package for the exact requirement.
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightBarStaysOnScroll: true, // keeps the latest bar in view as replay steps forward via .update()
      },
      rightPriceScale: { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    prevLenRef.current = 0;

    // SMA/EMA overlay the main price scale directly (same axis as candles).
    const smaSeries = chart.addLineSeries({
      color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    const emaSeries = chart.addLineSeries({
      color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    smaSeriesRef.current = smaSeries;
    emaSeriesRef.current = emaSeries;

    // RSI gets its own price scale pinned to the bottom ~22% of the chart -
    // the standard "indicator pane under the price chart" look, without
    // needing a second chart instance (lightweight-charts supports multiple
    // price scales sharing one time axis, which is exactly this case).
    const rsiSeries = chart.addLineSeries({
      color: isDark ? '#facc15' : '#b45309', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      priceScaleId: 'rsi',
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    chart.priceScale('rsi').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    });
    rsiLinesRef.current = [
      rsiSeries.createPriceLine({ price: 70, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'RSI 70' }),
      rsiSeries.createPriceLine({ price: 30, color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'RSI 30' }),
    ];
    rsiSeriesRef.current = rsiSeries;
    prevSmaLenRef.current = 0;
    prevEmaLenRef.current = 0;
    prevRsiLenRef.current = 0;

    const resizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: Math.floor(w) });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      rsiSeriesRef.current = null;
      rsiLinesRef.current = [];
    };
    // Intentionally created once - candles/visibleCount changes are applied
    // imperatively below, not by tearing down and recreating the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle visibility without touching data - avoids recomputing/resetting
  // series just because a user clicked a chip.
  useEffect(() => { smaSeriesRef.current?.applyOptions({ visible: showSma }); }, [showSma]);
  useEffect(() => { emaSeriesRef.current?.applyOptions({ visible: showEma }); }, [showEma]);
  useEffect(() => {
    rsiSeriesRef.current?.applyOptions({ visible: showRsi });
    rsiLinesRef.current.forEach(l => l.applyOptions({ axisLabelVisible: showRsi }));
  }, [showRsi]);

  // What the candle series should actually render right now: either the
  // base series (fast path, unchanged from before resampling existed) or a
  // resampled-and-already-revealed-only series for a coarser display
  // timeframe. Resampling only ever folds in *already-revealed* base
  // candles (baseCandles.slice(0, visibleCount) conceptually - the
  // incremental cache does this without re-slicing) - a bucket that's
  // still forming shows only the wicks that have actually happened so far
  // in the replay, same as the base series never showing future candles.
  const resampled = useMemo(() => {
    if (!isResampling) return null;
    return resampleIncremental(resampleCacheRef.current, candles, Math.max(0, Math.min(visibleCount, candles.length)), TIMEFRAME_SECONDS[displayTf]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResampling, candles, visibleCount, displayTf]);

  // Push new bars into the series: a single-step increment uses .update()
  // (cheap, preserves zoom/pan), anything else (initial load, jump-to-point,
  // reset, timeframe switch) uses .setData() and re-fits the view.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (isResampling && resampled) {
      if (resampled.wasReset) {
        series.setData(resampled.candles.map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
        chart.timeScale().fitContent();
      } else if (resampled.candles.length > 0) {
        const c = resampled.candles[resampled.candles.length - 1];
        series.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
      }
      prevLenRef.current = -1; // force a full setData() if we drop back to the base (non-resampled) path
      return;
    }

    const clamped = Math.max(0, Math.min(visibleCount, candles.length));
    const prevLen = prevLenRef.current;

    if (clamped === 0) {
      series.setData([]);
    } else if (clamped === prevLen + 1 && prevLen > 0) {
      const c = candles[clamped - 1];
      series.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      const slice = candles.slice(0, clamped).map(c => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
      series.setData(slice);
      chart.timeScale().fitContent();
    }
    prevLenRef.current = clamped;
  }, [candles, visibleCount, isResampling, resampled]);

  // Indicators are computed from whatever's actually on screen right now -
  // the base series (full array, backward-looking math means precomputing
  // on the full array and only *displaying* a prefix is equivalent to
  // computing on just the revealed portion) or, when resampling, the
  // already-revealed-only resampled series directly (no separate offset
  // needed - it's pre-clipped, see the comment above).
  const effectiveForIndicators = isResampling && resampled ? resampled.candles : candles;
  const smaPoints = useMemo(() => computeSMA(effectiveForIndicators, SMA_PERIOD), [effectiveForIndicators]);
  const emaPoints = useMemo(() => computeEMA(effectiveForIndicators, EMA_PERIOD), [effectiveForIndicators]);
  const rsiPoints = useMemo(() => computeRSI(effectiveForIndicators, RSI_PERIOD), [effectiveForIndicators]);

  useEffect(() => {
    if (isResampling) {
      // Resampled indicator series are always exactly-visible already, so
      // there's no incremental case to preserve across a timeframe switch
      // - just draw the current point-in-time set fresh each time.
      prevSmaLenRef.current = 0;
      prevEmaLenRef.current = 0;
      prevRsiLenRef.current = 0;
    }
  }, [isResampling, smaPoints, emaPoints, rsiPoints]);

  useEffect(() => {
    prevSmaLenRef.current = 0;
    prevEmaLenRef.current = 0;
    prevRsiLenRef.current = 0;
  }, [candles]);

  useEffect(() => {
    const smaLen = isResampling ? smaPoints.length : smaVisibleLen(visibleCount);
    const emaLen = isResampling ? emaPoints.length : emaVisibleLen(visibleCount);
    const rsiLen = isResampling ? rsiPoints.length : rsiVisibleLen(visibleCount);
    if (smaSeriesRef.current) pushIncremental(smaSeriesRef.current, smaPoints, smaLen, prevSmaLenRef);
    if (emaSeriesRef.current) pushIncremental(emaSeriesRef.current, emaPoints, emaLen, prevEmaLenRef);
    if (rsiSeriesRef.current) pushIncremental(rsiSeriesRef.current, rsiPoints, rsiLen, prevRsiLenRef);
  }, [visibleCount, smaPoints, emaPoints, rsiPoints, isResampling]);

  // Markers (entry/exit arrows) + price lines (entry/SL/TP for any trade
  // still open at the current point in the replay) - recomputed whenever
  // the trade list or the visible window changes. Cheap: trade counts are
  // small (tens, not thousands), unlike the candle series itself. Always
  // driven off the base candles/visibleCount (not the resampled display
  // series) - a trade's real entry/exit time doesn't change based on which
  // timeframe you're currently looking at it through.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    priceLinesRef.current.forEach(l => series.removePriceLine(l));
    priceLinesRef.current = [];

    const lastVisibleTime = candles[Math.max(0, Math.min(visibleCount, candles.length) - 1)]?.time ?? -Infinity;
    const placedTrades = trades.filter(t => Math.floor(new Date(t.entry_time).getTime() / 1000) <= lastVisibleTime);

    const markers = placedTrades.flatMap(t => {
      const entryTimeSec = Math.floor(new Date(t.entry_time).getTime() / 1000) as UTCTimestamp;
      const isLong = t.direction === 'Long';
      const entryMarker = {
        time: entryTimeSec,
        position: (isLong ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color: isLong ? '#22c55e' : '#ef4444',
        shape: (isLong ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: isLong ? 'Long' : 'Short',
      };
      if (t.exit_time && Math.floor(new Date(t.exit_time).getTime() / 1000) <= lastVisibleTime) {
        const exitTimeSec = Math.floor(new Date(t.exit_time).getTime() / 1000) as UTCTimestamp;
        return [entryMarker, {
          time: exitTimeSec,
          position: 'inBar' as const,
          color: t.result === 'Profit' ? '#22c55e' : '#ef4444',
          shape: 'circle' as const,
          text: t.result === 'Profit' ? 'Win' : 'Loss',
        }];
      }
      return [entryMarker];
    }).sort((a, b) => (a.time as number) - (b.time as number));
    series.setMarkers(markers);

    // Price lines only for trades still open (no exit yet) at this point
    // in the replay - once closed, the marker above is enough context.
    const openTrade = placedTrades.find(t => !t.exit_time);
    if (openTrade) {
      priceLinesRef.current.push(series.createPriceLine({
        price: openTrade.entry_price, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Entry',
      }));
      if (openTrade.sl_price != null) {
        priceLinesRef.current.push(series.createPriceLine({
          price: openTrade.sl_price, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'SL',
        }));
      }
      if (openTrade.tp_price != null) {
        priceLinesRef.current.push(series.createPriceLine({
          price: openTrade.tp_price, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'TP',
        }));
      }
    }
  }, [trades, candles, visibleCount]);

  const timeframeOptions = baseTimeframe ? derivableTimeframes(baseTimeframe) : [];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        {timeframeOptions.length > 1 ? (
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            {timeframeOptions.map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setDisplayTf(tf)}
                className={cn(
                  'h-6 px-2 rounded text-[11px] font-medium transition-colors',
                  tf === displayTf ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="flex items-center gap-1.5">
          <IndicatorChip label="EMA 50" active={showEma} dotClassName="bg-blue-500" onClick={() => setShowEma(v => !v)} />
          <IndicatorChip label="SMA 20" active={showSma} dotClassName="bg-purple-500" onClick={() => setShowSma(v => !v)} />
          <IndicatorChip label="RSI 14" active={showRsi} dotClassName="bg-amber-500" onClick={() => setShowRsi(v => !v)} />
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}

function IndicatorChip({ label, active, dotClassName, onClick }: { label: string; active: boolean; dotClassName: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant={active ? 'secondary' : 'outline'} onClick={onClick} className="h-6 px-2 text-[11px] gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', active ? dotClassName : 'bg-muted-foreground/40')} />
      {label}
    </Button>
  );
}
