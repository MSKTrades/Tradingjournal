import { useEffect, useRef } from 'react';
import { Candle, BacktestTrade } from '../data/types';
import { createReplayDatafeed, tfToResolution } from './tvDatafeed';

type Props = {
  candles: Candle[];
  visibleCount: number;
  // Accepted for prop-shape parity with ReplayChart - not yet rendered.
  // Trade markers (createExecutionShape/createOrderLine) are step 3 of
  // advanced-charts-integration-plan.md; this component only proves the
  // candle/datafeed/replay wiring for now.
  trades: BacktestTrade[];
  height?: number;
  baseTimeframe?: string;
  datasetId?: number | null;
  // Fires once the widget has finished its own async setup and the first
  // notifyReveal() has gone out - useful for callers that want to know the
  // chart is actually interactive yet (e.g. a loading spinner, or a test
  // harness waiting to assert against it), without reaching into the
  // widget's internals themselves.
  onReady?: () => void;
};

const LIBRARY_SCRIPT_SRC = '/charting_library/charting_library.standalone.js';

// Loaded once per page, shared across every mount - re-injecting the
// <script> tag on every chart instance would re-parse a ~1.5MB bundle for
// no reason, and TradingView.widget is a single global regardless of how
// many chart instances use it.
let libraryLoadPromise: Promise<void> | null = null;
function loadChartingLibrary(): Promise<void> {
  const w = window as typeof window & { TradingView?: { widget: unknown } };
  if (w.TradingView?.widget) return Promise.resolve();
  if (libraryLoadPromise) return libraryLoadPromise;
  libraryLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIBRARY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Advanced Charts library')));
      return;
    }
    const script = document.createElement('script');
    script.src = LIBRARY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Advanced Charts library'));
    document.head.appendChild(script);
  });
  return libraryLoadPromise;
}

// Advanced Charts equivalent of ReplayChart.tsx - same props, same
// "Backtest.tsx just hands down how many candles are revealed right now"
// contract, but rendering via TradingView's widget instead of
// lightweight-charts. Deliberately minimal at this step: candles + the
// replay-driven datafeed only. Drawings/indicators/trade markers/SMC are
// steps 3-6 in advanced-charts-integration-plan.md and land as separate,
// independently-testable changes on top of this once this piece is
// confirmed solid - see that plan's "Suggested sequencing" section.
export default function TradingViewChart({ candles, visibleCount, height = 480, baseTimeframe, datasetId, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const candlesRef = useRef(candles);
  const visibleCountRef = useRef(visibleCount);
  const notifyRevealRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);

  // Mutate-ref-from-effect, not from render - the datafeed's getters run
  // outside React's render cycle (invoked by the widget itself, on its own
  // schedule), so they need to read live values through refs rather than
  // closing over a specific render's props. Same discipline ReplayChart.tsx
  // and resample.ts already use for exactly this reason.
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);

  // (Re)create the widget once per dataset - not per candle/visibleCount
  // change, which are applied imperatively via notifyReveal() below instead
  // of tearing the chart down. Mirrors ReplayChart's own chart-creation
  // effect (empty deps there; [datasetId] here since, unlike a from-scratch
  // lightweight-charts instance, a fresh widget is also the simplest way to
  // hand it a brand new datafeed bound to the newly selected dataset).
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    readyRef.current = false;

    const { datafeed, notifyReveal } = createReplayDatafeed({
      getCandles: () => candlesRef.current,
      getVisibleCount: () => visibleCountRef.current,
      getBaseTimeframe: () => baseTimeframe ?? '1m',
    });
    notifyRevealRef.current = notifyReveal;

    loadChartingLibrary()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const isDark = document.documentElement.classList.contains('dark');
        const TradingViewGlobal = (window as unknown as {
          TradingView: {
            widget: new (opts: Record<string, unknown>) => {
              remove?: () => void;
              onChartReady: (cb: () => void) => void;
              activeChart: () => {
                setVisibleRange: (range: { from: number; to: number }, options?: Record<string, unknown>) => Promise<void>;
                onDataLoaded: () => { subscribe: (obj: unknown, cb: () => void, singleshot?: boolean) => void };
              };
            };
          };
        }).TradingView;
        const widget = new TradingViewGlobal.widget({
          symbol: 'REPLAY',
          interval: tfToResolution(baseTimeframe ?? '1m'),
          datafeed,
          container: containerRef.current,
          library_path: '/charting_library/',
          locale: 'en',
          autosize: true,
          theme: isDark ? 'dark' : 'light',
          disabled_features: ['use_localstorage_for_settings'],
        });
        widgetRef.current = widget;
        widget.onChartReady(() => {
          if (cancelled) return;
          readyRef.current = true;
          // Covers the case where visibleCount was already > 0 before the
          // widget finished loading (e.g. replay was already mid-way
          // through when this component mounted) - without this, the chart
          // would sit empty until the next visibleCount change.
          notifyRevealRef.current?.();

          // The widget's own default zoom assumes a live symbol trading up
          // to real wall-clock "now" (same reasoning as getBars'
          // firstDataRequest handling in tvDatafeed.ts) - left uncorrected,
          // a historical replay's actual bars end up squeezed into a few
          // pixels at the very edge of a much wider default view, which
          // reads as "only one candle" even though the data is all there
          // (ReplayChart.tsx avoids this the same way, via
          // chart.timeScale().fitContent() after every setData()).
          //
          // Calling setVisibleRange() here, synchronously inside
          // onChartReady, turned out not to be enough: onChartReady fires
          // once the chart UI itself exists, but the datafeed's actual
          // getBars() call (the one that resolves periodParams.firstDataRequest
          // and hands back real bars) happens asynchronously afterwards -
          // and when that data finishes loading, the widget re-applies its
          // own default auto-range, silently clobbering whatever range we'd
          // just set. onDataLoaded() is the event that fires *after* that
          // happens, so setting the range there (once, via the `true`
          // singleshot flag - this only needs to happen for the initial
          // load, not every subsequent live tick) is what actually sticks.
          const fitToRevealed = () => {
            const c = candlesRef.current;
            const vc = Math.max(0, Math.min(visibleCountRef.current, c.length));
            if (vc > 0) {
              const from = c[Math.max(0, vc - 200)].time;
              const to = c[vc - 1].time;
              widget.activeChart().setVisibleRange({ from, to }, { percentRightMargin: 20 }).catch(() => {});
            }
          };
          widget.activeChart().onDataLoaded().subscribe(null, fitToRevealed, true);
          // Also fire once immediately, in case onDataLoaded already fired
          // before this subscription was registered (e.g. a very fast
          // synchronous datafeed) - redundant with the subscription above in
          // the normal case, harmless if both end up running.
          fitToRevealed();

          onReady?.();
        });
      })
      .catch(err => console.error('[TradingViewChart] failed to load Advanced Charts', err));

    return () => {
      cancelled = true;
      readyRef.current = false;
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      notifyRevealRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  // The replay-driven piece this component exists to prove: PipEcho's
  // existing useReplayPlayback hook (completely unchanged) drives
  // visibleCount exactly as it always has for ReplayChart; this effect is
  // the only new code translating that into an Advanced Charts update, via
  // the datafeed's stored subscribeBars callback rather than a direct
  // series.update() call (lightweight-charts' API, which the Advanced
  // Charts widget doesn't expose - the datafeed's own live subscription is
  // the equivalent hook for this library).
  useEffect(() => {
    if (readyRef.current) notifyRevealRef.current?.();
  }, [visibleCount]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
