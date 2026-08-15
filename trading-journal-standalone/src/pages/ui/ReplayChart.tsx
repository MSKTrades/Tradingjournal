import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from 'lightweight-charts';
import { Candle, BacktestTrade } from '../data/types';

type Props = {
  candles: Candle[];
  visibleCount: number;
  trades: BacktestTrade[];
  height?: number;
};

// Wraps TradingView's lightweight-charts. Kept as its own component so the
// imperative chart lifecycle (create once, mutate in place afterward) is
// fully isolated from React's render cycle - Backtest.tsx just hands down
// "how many candles are revealed right now" and this component figures out
// whether that's a single step forward (series.update - cheap, O(1)) or a
// jump/reset (series.setData - rebuilds the visible series). Re-creating
// the whole chart on every replay tick would both be slow for a dataset
// with 100k+ candles and would reset the user's zoom/pan on every step.
export default function ReplayChart({ candles, visibleCount, trades, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const isDark = document.documentElement.classList.contains('dark');
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: isDark ? '#9ca3af' : '#4b5563',
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
    };
    // Intentionally created once - candles/visibleCount changes are applied
    // imperatively below, not by tearing down and recreating the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new bars into the series: a single-step increment uses .update()
  // (cheap, preserves zoom/pan), anything else (initial load, jump-to-point,
  // reset) uses .setData() and re-fits the view.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

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
  }, [candles, visibleCount]);

  // Markers (entry/exit arrows) + price lines (entry/SL/TP for any trade
  // still open at the current point in the replay) - recomputed whenever
  // the trade list or the visible window changes. Cheap: trade counts are
  // small (tens, not thousands), unlike the candle series itself.
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

  return <div ref={containerRef} className="w-full" />;
}
