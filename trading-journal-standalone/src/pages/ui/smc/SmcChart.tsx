import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { TimeframeAnalysis, SmcTimeframe, Direction } from './types';
import { SmcOverlayPrimitive } from './smcOverlayPrimitive';

// The SMC Analysis page's chart: one candlestick series for whichever
// timeframe tab is active, plus the auto-detected overlays (Order Blocks,
// FVGs, range/EQ line) and the trader's own Entry/SL/TP markup lines, set by
// clicking the chart. Both layers are drawn by the same SmcOverlayPrimitive
// (see smcOverlayPrimitive.ts for why the markup lines live there instead of
// using lightweight-charts' native series.createPriceLine()).
//
// Deliberately simpler than ReplayChart.tsx: there's no replay/scrubbing
// here (SMC analysis looks at the full live history, not a blind step-
// through), so this remounts fresh whenever the timeframe tab changes
// (parent renders it with key={tf}) rather than trying to update chart data
// incrementally in place - far less state to manage correctly, and a full
// remount is imperceptible for a chart of this size.
//
// Picking a price by clicking the chart (rather than dragging a shape, the
// way the Backtest replay's drawing tools work) is enough for a markup
// that's fundamentally "three price levels" - armField says which of
// entry/sl/tp the next chart click should set; the numeric inputs in
// MarkupPanel.tsx are the alternative/complementary way to set the same
// values by hand.
export default function SmcChart({
  tf, analysis, markup, armField, onChartPriceClick, height = 420, showZones = true,
}: {
  tf: SmcTimeframe;
  analysis: TimeframeAnalysis;
  markup: { entry: number | null; sl: number | null; tp: number | null; direction: Direction };
  armField: 'entry' | 'sl' | 'tp' | null;
  onChartPriceClick: (price: number) => void;
  height?: number;
  // When false, the auto-detected Order Block/FVG boxes are omitted (the
  // Range High/Low/EQ 50% lines and the trader's own Entry/SL/TP markup
  // still show) - lets the "View this setup on chart" flow present just the
  // one trade idea against price action, instead of a chart with dozens of
  // OB/FVG boxes competing for attention. Defaults on so the full auto-read
  // is what a plain visit to a timeframe tab shows.
  showZones?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlayRef = useRef<SmcOverlayPrimitive | null>(null);
  const clickHandlerRef = useRef<(price: number) => void>(onChartPriceClick);
  const armFieldRef = useRef(armField);
  clickHandlerRef.current = onChartPriceClick;
  armFieldRef.current = armField;

  // Chart + series + overlay: created once per mount (per timeframe tab,
  // since the parent keys this component by tf) and torn down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    const isDark = document.documentElement.classList.contains('dark');
    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: isDark ? '#9ca3af' : '#4b5563' },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    series.setData(analysis.candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));

    const overlay = new SmcOverlayPrimitive();
    series.attachPrimitive(overlay);
    overlay.setMarkup(markup.entry, markup.sl, markup.tp);
    // Zone data (OB/FVG boxes) is set by the effect below, keyed on
    // showZones - not here, so toggling it doesn't need a full remount.

    chart.timeScale().fitContent();

    function handleClick(param: any) {
      if (!armFieldRef.current || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price != null) clickHandlerRef.current(price);
    }
    chart.subscribeClick(handleClick);

    chartRef.current = chart;
    seriesRef.current = series;
    overlayRef.current = overlay;

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, height]);

  // Entry/SL/TP markup - pushed into the overlay primitive whenever the
  // values change, so it's drawn by the same canvas pass as the OB/FVG/Range
  // overlay (see smcOverlayPrimitive.ts) instead of via native
  // series.createPriceLine(), which turned out not to render reliably once
  // this primitive is attached.
  useEffect(() => {
    overlayRef.current?.setMarkup(markup.entry, markup.sl, markup.tp);
  }, [markup.entry, markup.sl, markup.tp]);

  // OB/FVG zone boxes - separated from the mount effect so toggling
  // showZones (e.g. via "View this setup on chart") just redraws the
  // overlay's boxes rather than tearing down and recreating the whole
  // chart. Range/EQ lines always pass through since they're much lower
  // clutter and still useful context even in the decluttered view.
  useEffect(() => {
    overlayRef.current?.setData(showZones ? analysis.orderBlocks : [], showZones ? analysis.fvgs : [], analysis.range);
  }, [analysis, showZones]);

  return (
    <div>
      <div ref={containerRef} className="w-full" style={{ cursor: armField ? 'crosshair' : 'default' }} />
      {armField && (
        <p className="text-xs text-primary mt-1">
          Click on the chart to set your {armField === 'entry' ? 'Entry' : armField === 'sl' ? 'Stop Loss' : 'Take Profit'} price.
        </p>
      )}
    </div>
  );
}
