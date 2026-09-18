import { useEffect, useRef } from 'react';
import { Candle, BacktestTrade, ChartDrawing, ChartDrawingType } from '../data/types';
import { createReplayDatafeed, tfToResolution } from './tvDatafeed';
import { api } from '../../lib/api';

// Step 4: trendlines/horizontal lines/rectangles/fib retracements, drawn via
// Advanced Charts' own native drawing toolbar (unlike ReplayChart.tsx, which
// implements its own toolbar + DrawingsPrimitive on top of lightweight-charts
// - there's no equivalent need here since the widget already ships full
// drawing tools). Same create+delete-only persistence scope as ReplayChart's
// own drawings feature (see api/backtest.ts - no PUT/update route exists for
// resource=drawings, so move/resize was never a supported operation there
// either; a user can still drag an existing drawing around during a session,
// it just won't survive a reload here, matching that same limitation).
//
// TradingView's own shape "name" (as returned by getAllShapes()) turns out
// to be exactly the shape string passed to createShape/createMultipointShape
// (confirmed by creating one of each and reading it back - see this file's
// history), so the two directions of this mapping are exact inverses of each
// other, not a guess at some separate human-readable label.
const DRAWING_TYPE_TO_TV_SHAPE: Record<ChartDrawingType, string> = {
  trendline: 'trend_line',
  horizontal: 'horizontal_line',
  rectangle: 'rectangle',
  fib: 'fib_retracement',
};
const TV_SHAPE_TO_DRAWING_TYPE: Record<string, ChartDrawingType> = {
  trend_line: 'trendline',
  horizontal_line: 'horizontal',
  rectangle: 'rectangle',
  fib_retracement: 'fib',
};
// Same per-type defaults ReplayChart.tsx's own toolbar uses (TOOL_COLORS) -
// applied here when re-rendering a saved drawing whose color for some reason
// didn't round-trip, and as the fallback when a freshly user-drawn shape's
// color can't be read back (see colorOverridesFor/extractDrawingColor).
const DEFAULT_DRAWING_COLOR: Record<ChartDrawingType, string> = {
  trendline: '#3b82f6',
  rectangle: '#a855f7',
  fib: '#f59e0b',
  horizontal: '#10b981',
};

type Props = {
  candles: Candle[];
  visibleCount: number;
  // Rendered as entry/exit shapes + entry/SL/TP horizontal price lines -
  // see the trade-marker sync effect below. Same "only what the replay has
  // revealed so far" contract as candles/visibleCount: a trade only shows
  // once its entry_time has been passed by visibleCount, matching
  // ReplayChart.tsx's own markers effect exactly (same filtering rules,
  // just drawn via Advanced Charts' shape API instead of lightweight-charts'
  // setMarkers/createPriceLine - see the sync function's comment on why
  // createOrderLine, the API this was originally built against, turned out
  // not to be usable here).
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
// lightweight-charts. Candles, the replay-driven datafeed, and now trade
// markers (this step). Drawings/indicators/SMC overlay are steps 4-6 in
// advanced-charts-integration-plan.md and land as separate,
// independently-testable changes on top of this once this piece is
// confirmed solid - see that plan's "Suggested sequencing" section.
export default function TradingViewChart({ candles, visibleCount, trades, height = 480, baseTimeframe, datasetId, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const candlesRef = useRef(candles);
  const visibleCountRef = useRef(visibleCount);
  const tradesRef = useRef(trades);
  const notifyRevealRef = useRef<(() => void) | null>(null);
  const syncTradesRef = useRef<(() => void) | null>(null);
  const readyRef = useRef(false);
  // Entities currently drawn for trades - entry/exit markers and the
  // entry/SL/TP price lines for whichever trade is still open, all created
  // via createShape (see the sync function below for why everything ends up
  // going through that one API rather than a dedicated price-line one).
  // Tracked so the next sync can clear exactly what it drew last time,
  // never more or less.
  const shapeIdsRef = useRef<string[]>([]);
  // Bumped on every syncTrades() call so an in-flight call (createShape is
  // async) can tell, once its awaits resolve, whether a newer call has
  // since started - and if so, discard its own results instead of racing
  // the newer call and leaving duplicate markers behind. Matters because
  // visibleCount can change many times a second during fast replay, each
  // one triggering its own sync.
  const syncTokenRef = useRef(0);
  // Step 4 (drawings) bookkeeping - see the block comment above
  // DRAWING_TYPE_TO_TV_SHAPE for the overall approach (debounced diff
  // against getAllShapes() rather than trying to attribute individual
  // drawing_event firings to "us" vs "the user").
  //
  // TradingView entityId -> the persisted ChartDrawing row it represents.
  // Populated both for drawings loaded from the server on mount and for
  // ones the user has since drawn and successfully saved - membership here
  // is what lets a later reconcile tell "already a tracked drawing" apart
  // from "brand new, never seen this id before".
  const drawingsRef = useRef<Map<string, ChartDrawing>>(new Map());
  // Shape ids reconcile has already looked at and decided aren't worth
  // persisting (e.g. a drawing tool that was started but never actually
  // given a second point) - without this, a degenerate shape sitting on the
  // chart would get re-inspected and skipped again on every single
  // reconcile for as long as it stays there.
  const ignoredShapeIdsRef = useRef<Set<string>>(new Set());
  // True for the duration of a syncTrades() call. Trade markers reuse
  // 'horizontal_line' (for Entry/SL/TP), which is also one of the 4
  // user-drawable types - so a reconcile that ran mid-resync could easily
  // mistake a trade marker that's been created but not yet registered in
  // shapeIdsRef for a genuine new user drawing. Reconcile checks this and
  // simply reschedules itself rather than running while it's true, so it
  // only ever diffs against a settled, steady-state shape list.
  const tradeSyncBusyRef = useRef(false);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The drawing_event handler is created inside the async
  // loadChartingLibrary().then(...) closure (same reason notifyRevealRef/
  // syncTradesRef are refs rather than plain closure variables) - the
  // synchronous cleanup function below runs in the outer effect scope and
  // can't see into that closure directly, so it needs the same function
  // reference back out through a ref to unsubscribe the exact callback that
  // was subscribed.
  const onDrawingEventRef = useRef<((sourceId: unknown, drawingEventType: unknown) => void) | null>(null);

  // Mutate-ref-from-effect, not from render - the datafeed's getters run
  // outside React's render cycle (invoked by the widget itself, on its own
  // schedule), so they need to read live values through refs rather than
  // closing over a specific render's props. Same discipline ReplayChart.tsx
  // and resample.ts already use for exactly this reason.
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);
  useEffect(() => { tradesRef.current = trades; }, [trades]);

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
              subscribe: (event: string, callback: (...args: unknown[]) => void) => void;
              unsubscribe: (event: string, callback: (...args: unknown[]) => void) => void;
              activeChart: () => {
                setVisibleRange: (range: { from: number; to: number }, options?: Record<string, unknown>) => Promise<void>;
                onDataLoaded: () => { subscribe: (obj: unknown, cb: () => void, singleshot?: boolean) => void };
                createShape: (
                  point: { time: number; channel?: 'open' | 'high' | 'low' | 'close'; price?: number },
                  options: { shape: string; text?: string; overrides?: Record<string, unknown>; disableSelection?: boolean; disableSave?: boolean; lock?: boolean; zOrder?: string },
                ) => Promise<string>;
                createMultipointShape: (
                  points: Array<{ time: number; price: number }>,
                  options: { shape: string; text?: string; overrides?: Record<string, unknown>; disableSelection?: boolean; disableSave?: boolean; lock?: boolean; zOrder?: string },
                ) => Promise<string>;
                removeEntity: (entityId: string, options?: { disableUndo?: boolean }) => void;
                getAllShapes: () => Array<{ id: string; name: string }>;
                getShapeById: (entityId: string) => {
                  getPoints: () => Array<{ time: number; price: number }>;
                  getProperties: <P = Record<string, unknown>>() => P;
                };
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

        // Trade markers: entry/exit shapes plus entry/SL/TP horizontal price
        // lines for whichever trade is still open, filtered to only what the
        // replay has actually revealed so far - the exact same rules
        // ReplayChart.tsx's own markers effect uses (see its comment above
        // the `placedTrades` filter), just drawn through Advanced Charts'
        // shape API instead of lightweight-charts' setMarkers()/
        // createPriceLine(). A full rebuild every call rather than a diff -
        // trade counts are small (tens, not thousands), same assumption
        // ReplayChart's version makes.
        //
        // Everything here goes through createShape, including the price
        // lines - this was originally built against createOrderLine (the
        // API IPriceLine-equivalent), but that throws "createOrderLine is
        // only available on Trading Platform" on this library edition
        // (Advanced Charts, not the separate Trading Platform product) -
        // discovered by actually running this against the dev build, not
        // just reading the API docs. createShape with shape:'horizontal_line'
        // draws the same full-width dashed price line without needing that
        // feature tier, so that's what's used for Entry/SL/TP below.
        //
        // createShape is async (unlike lightweight-charts' synchronous
        // equivalents), so this can't just clear-then-redraw in one tick.
        // Instead: clear immediately (synchronous, cheap), then await the
        // new shapes and only keep them if nothing newer has started
        // sync-ing in the meantime (see syncTokenRef's comment above) -
        // otherwise discard them, so a burst of visibleCount changes during
        // fast replay can never leave duplicate markers on the chart.
        async function syncTrades() {
          // See tradeSyncBusyRef's declaration above - a drawings reconcile
          // that happens to run mid-resync could misread a trade marker
          // that's been created but not yet registered in shapeIdsRef as a
          // fresh user drawing (they share the 'horizontal_line' shape).
          // Cleared in `finally` so it comes back down regardless of which
          // return path below actually runs.
          tradeSyncBusyRef.current = true;
          try {
            await syncTradesBody();
          } finally {
            tradeSyncBusyRef.current = false;
          }
        }
        async function syncTradesBody() {
          const chart = widget.activeChart();
          const myToken = ++syncTokenRef.current;

          const oldShapeIds = shapeIdsRef.current;
          shapeIdsRef.current = [];
          oldShapeIds.forEach(id => chart.removeEntity(id, { disableUndo: true }));

          const c = candlesRef.current;
          const vc = Math.max(0, Math.min(visibleCountRef.current, c.length));
          const lastVisibleTime = c[vc - 1]?.time ?? -Infinity;
          const placedTrades = tradesRef.current.filter(
            t => Math.floor(new Date(t.entry_time).getTime() / 1000) <= lastVisibleTime,
          );

          // Binary search for the base candle at-or-before a given time -
          // used to read a real OHLC value off our own candle data for each
          // marker's price, rather than anchoring to a chart-loaded bar (see
          // below for why that matters). candles is time-sorted (both the
          // synthetic generator here and a real Dukascopy pull produce
          // strictly increasing time), so this is O(log n) per trade - cheap
          // even called on every replay tick.
          function candleAtOrBefore(timeSec: number): Candle | undefined {
            let lo = 0, hi = vc - 1, best: Candle | undefined;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (c[mid].time <= timeSec) { best = c[mid]; lo = mid + 1; }
              else hi = mid - 1;
            }
            return best;
          }

          // time here is Unix *seconds*, same as periodParams/setVisibleRange
          // (see tvDatafeed.ts's toBar() comment on why that's notable - the
          // one place this datafeed's own Bar objects differ is milliseconds,
          // but shape/order-line positions are seconds like everything else).
          //
          // Explicit `price` rather than a sticky `channel` (e.g. {time,
          // channel: 'low'}) deliberately - a sticky point only resolves
          // against a bar the widget has *already loaded*, and the widget's
          // initial history window is just the last `countBack` bars (see
          // tvDatafeed.ts's firstDataRequest handling), not the full replay
          // history. A trade placed earlier than that window throws
          // ("Value is null") when the library tries to resolve it. Reading
          // the price straight from our own candle data sidesteps the whole
          // problem - no dependency on what the chart happens to have loaded.
          type ShapeSpec = { point: { time: number; price: number }; shape: string; text: string; overrides: Record<string, unknown> };
          const shapeSpecs: ShapeSpec[] = [];
          for (const t of placedTrades) {
            const entryTimeSec = Math.floor(new Date(t.entry_time).getTime() / 1000);
            const entryCandle = candleAtOrBefore(entryTimeSec);
            if (!entryCandle) continue; // trade predates the very first revealed candle - nothing to anchor to
            const isLong = t.direction === 'Long';
            const color = isLong ? '#22c55e' : '#ef4444';
            // Long below the bar (its low), Short above (its high) - the
            // same "belowBar"/"aboveBar" positioning ReplayChart's markers
            // use, just computed from our own data instead of the widget's.
            shapeSpecs.push({
              point: { time: entryTimeSec, price: isLong ? entryCandle.low : entryCandle.high },
              shape: isLong ? 'arrow_up' : 'arrow_down',
              text: isLong ? 'Long' : 'Short',
              overrides: { arrowColor: color, color, showLabel: true },
            });
            if (t.exit_time && Math.floor(new Date(t.exit_time).getTime() / 1000) <= lastVisibleTime) {
              const exitTimeSec = Math.floor(new Date(t.exit_time).getTime() / 1000);
              const exitCandle = candleAtOrBefore(exitTimeSec);
              if (exitCandle) {
                const won = t.result === 'Profit';
                // 'flag' looked like the natural shape for this but throws
                // ("Value is undefined") when created via a single-point
                // createShape call on this library build - found the same
                // way as the createOrderLine issue above, by running it, not
                // by reading the type signatures. 'text' is a plain,
                // well-supported single-point shape that does exactly what's
                // needed here (a short readable label at a point in time).
                shapeSpecs.push({
                  point: { time: exitTimeSec, price: exitCandle.close },
                  shape: 'text',
                  text: won ? 'Win' : 'Loss',
                  overrides: { color: won ? '#22c55e' : '#ef4444', bold: true },
                });
              }
            }
          }

          // Price lines only for a trade still open (no exit yet) at this
          // point in the replay - once closed, the marker above is enough
          // context. Same rule ReplayChart uses for its createPriceLine
          // calls. Anchor time doesn't matter for a horizontal_line (unlike
          // horizontal_ray, it draws across the whole chart regardless of
          // where its one point sits) - lastVisibleTime keeps it anchored
          // somewhere always within the currently-loaded range.
          const openTrade = placedTrades.find(t => !t.exit_time);
          if (openTrade) {
            const lines: Array<{ price: number; text: string; color: string }> = [
              { price: openTrade.entry_price, text: 'Entry', color: '#9ca3af' },
            ];
            if (openTrade.sl_price != null) lines.push({ price: openTrade.sl_price, text: 'SL', color: '#ef4444' });
            if (openTrade.tp_price != null) lines.push({ price: openTrade.tp_price, text: 'TP', color: '#22c55e' });
            for (const l of lines) {
              shapeSpecs.push({
                point: { time: lastVisibleTime, price: l.price },
                shape: 'horizontal_line',
                text: l.text,
                overrides: { linecolor: l.color, textcolor: l.color, linestyle: 2 /* LineStyle.Dashed */, linewidth: 1, showPrice: true },
              });
            }
          }

          const newShapeIds = (
            await Promise.all(
              shapeSpecs.map(s =>
                chart
                  .createShape(s.point, {
                    shape: s.shape, text: s.text, overrides: s.overrides,
                    disableSelection: true, disableSave: true, lock: true, zOrder: 'top',
                  })
                  .catch(() => null),
              ),
            )
          ).filter((id): id is string => id != null);

          if (syncTokenRef.current !== myToken) {
            // A newer sync started while these were being created - our
            // results are already stale; discard rather than leaving
            // duplicates behind alongside whatever the newer call drew.
            newShapeIds.forEach(id => chart.removeEntity(id, { disableUndo: true }));
            return;
          }
          shapeIdsRef.current = newShapeIds;
        }
        syncTradesRef.current = () => { syncTrades().catch(err => console.error('[TradingViewChart] trade marker sync failed', err)); };

        // Best-effort color for a shape of a given TradingView type, read
        // from whatever getProperties() actually exposes for that type -
        // established empirically (see this file's history), not from the
        // .d.ts alone, since only trend_line/horizontal_line document a
        // flat top-level `linecolor` and rectangle's equivalent turned out
        // to be a differently-named `color`. fib_retracement has no single
        // color (each of its ~24 levels carries its own), so it's excluded
        // here and always falls back to DEFAULT_DRAWING_COLOR.fib instead of
        // trying to collapse that into one value.
        function extractDrawingColor(tvShape: string, type: ChartDrawingType, props: Record<string, unknown>): string {
          const raw = tvShape === 'rectangle' ? props.color : tvShape === 'trend_line' || tvShape === 'horizontal_line' ? props.linecolor : undefined;
          return typeof raw === 'string' ? raw : DEFAULT_DRAWING_COLOR[type];
        }

        // The inverse: what to pass as `overrides` when (re)creating a shape
        // for a drawing this app already has a stored color for (a loaded
        // row, or a fallback default). Mirrors the same key-per-shape-type
        // mapping extractDrawingColor reads from.
        function colorOverridesFor(tvShape: string, color: string): Record<string, unknown> {
          if (tvShape === 'trend_line' || tvShape === 'horizontal_line') return { linecolor: color };
          if (tvShape === 'rectangle') return { color, textColor: color };
          return {}; // fib_retracement - let the library use its own default per-level colors
        }

        // Renders this dataset's previously-saved drawings on top of the
        // widget's native drawing layer. Unlike trade markers (disableSave,
        // disableSelection, lock - fully protected from user interaction),
        // these are left selectable/deletable: deleting one through the
        // widget's own UI (Delete key, right-click > Remove) is how the
        // "delete" half of this feature's create+delete scope is meant to
        // be triggered, picked up by the next reconcile. Dragging one to a
        // new position also works (it's native to the tool), it just won't
        // be saved - same limitation ReplayChart.tsx already has, since
        // there's no update route for this resource server-side (see
        // api/backtest.ts).
        async function loadDrawings() {
          if (datasetId == null) return;
          let rows: ChartDrawing[];
          try {
            rows = await api.get(`/backtest?resource=drawings&dataset_id=${datasetId}`);
          } catch (err) {
            console.error('[TradingViewChart] failed to load drawings', err);
            return;
          }
          if (cancelled) return;
          const chart = widget.activeChart();
          for (const d of rows) {
            const tvShape = DRAWING_TYPE_TO_TV_SHAPE[d.type];
            if (!tvShape || d.points.length === 0) continue;
            try {
              const overrides = colorOverridesFor(tvShape, d.color);
              const options = { shape: tvShape, overrides, disableSave: true, disableSelection: false, lock: false, zOrder: 'top' as const };
              const id = d.type === 'horizontal'
                ? await chart.createShape(d.points[0], options)
                : await chart.createMultipointShape(d.points, options);
              if (cancelled) { chart.removeEntity(id, { disableUndo: true }); continue; }
              drawingsRef.current.set(id, d);
            } catch (err) {
              console.error('[TradingViewChart] failed to render saved drawing', d.id, err);
            }
          }
        }

        // Debounced rather than run straight off each drawing_event: the
        // event only tells us *something* changed (create/remove) and an
        // id, not which side caused it or what it now is, so the reliable
        // way to find out is to wait for things to settle and then diff
        // getAllShapes() against what this component already knows about -
        // see the block comment above DRAWING_TYPE_TO_TV_SHAPE for why this
        // replaced trying to attribute individual events in real time.
        function scheduleReconcile(delay = 400) {
          if (reconcileTimerRef.current != null) clearTimeout(reconcileTimerRef.current);
          reconcileTimerRef.current = setTimeout(() => {
            reconcileTimerRef.current = null;
            runReconcile().catch(err => console.error('[TradingViewChart] drawing reconcile failed', err));
          }, delay);
        }

        async function runReconcile() {
          if (datasetId == null || cancelled) return;
          if (tradeSyncBusyRef.current) { scheduleReconcile(250); return; }

          const chart = widget.activeChart();
          const all = chart.getAllShapes();
          const allIds = new Set(all.map(s => s.id));
          const tradeMarkerIds = new Set(shapeIdsRef.current);
          const known = drawingsRef.current;

          // A drawing this component was tracking is no longer on the chart
          // - the user deleted it via the widget's own UI. Persist the
          // deletion. (Our own code never removes a tracked drawing's
          // entity directly, so any disappearance here is genuinely
          // user-initiated.)
          for (const [id, drawing] of Array.from(known.entries())) {
            if (allIds.has(id)) continue;
            known.delete(id);
            api.del(`/backtest?resource=drawings&id=${drawing.id}`).catch(err =>
              console.error('[TradingViewChart] failed to persist drawing delete', drawing.id, err));
          }

          // A shape on the chart this component has never seen before, of a
          // type it persists, that isn't one of its own trade markers - a
          // genuine new user-drawn shape. Anything else (an indicator, a
          // native tool this app doesn't have a ChartDrawingType for, one of
          // our own trade markers still mid-resync) is left alone.
          for (const { id, name } of all) {
            if (tradeMarkerIds.has(id) || known.has(id) || ignoredShapeIdsRef.current.has(id)) continue;
            const type = TV_SHAPE_TO_DRAWING_TYPE[name];
            if (!type) continue;

            let points: Array<{ time: number; price: number }>;
            try {
              points = chart.getShapeById(id).getPoints();
            } catch {
              ignoredShapeIdsRef.current.add(id);
              continue;
            }
            const minPoints = type === 'horizontal' ? 1 : 2;
            const degenerate = points.length < minPoints
              || (points.length >= 2 && points[0].time === points[1].time && points[0].price === points[1].price);
            if (degenerate) {
              // A drawing tool that got selected but never actually given a
              // real second point (e.g. a stray click with no drag) - not
              // worth saving, and not worth re-checking every reconcile
              // either.
              ignoredShapeIdsRef.current.add(id);
              continue;
            }

            let color = DEFAULT_DRAWING_COLOR[type];
            try {
              color = extractDrawingColor(name, type, chart.getShapeById(id).getProperties());
            } catch { /* keep the default */ }

            api.post('/backtest', { resource: 'drawings', dataset_id: datasetId, type, points, color })
              .then((saved: ChartDrawing) => { if (!cancelled) known.set(id, saved); })
              .catch(err => console.error('[TradingViewChart] failed to persist new drawing', err));
          }
        }

        function onDrawingEvent(sourceId: unknown, drawingEventType: unknown) {
          if (drawingEventType === 'create' || drawingEventType === 'remove') scheduleReconcile();
        }
        onDrawingEventRef.current = onDrawingEvent;
        widget.subscribe('drawing_event', onDrawingEvent);

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

          // Covers the same already-mid-replay-on-mount case notifyReveal()
          // does above, for trades this time - without this, a replay that
          // starts partway through (with trades already placed) would show
          // an empty chart until the next visibleCount change.
          syncTradesRef.current?.();

          // Same already-mid-session-on-mount reasoning as notifyReveal()
          // and syncTrades() above, for this dataset's saved drawings -
          // fire-and-forget since nothing else needs to block on it.
          loadDrawings().catch(err => console.error('[TradingViewChart] failed to load drawings', err));

          onReady?.();
        });
      })
      .catch(err => console.error('[TradingViewChart] failed to load Advanced Charts', err));

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (reconcileTimerRef.current != null) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      if (onDrawingEventRef.current) {
        try {
          (widgetRef.current as unknown as { unsubscribe?: (event: string, cb: unknown) => void } | null)?.unsubscribe?.('drawing_event', onDrawingEventRef.current);
        } catch { /* widget may already be mid-teardown - nothing to unsubscribe from */ }
        onDrawingEventRef.current = null;
      }
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      notifyRevealRef.current = null;
      syncTradesRef.current = null;
      // No explicit removeEntity() cleanup needed here - widget.remove()
      // above tears down the whole chart (and everything drawn on it) at
      // once. Just drop the bookkeeping refs so a future widget instance
      // starts from an empty slate.
      shapeIdsRef.current = [];
      drawingsRef.current = new Map();
      ignoredShapeIdsRef.current = new Set();
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

  // Trade markers redrawn on the same triggers as ReplayChart.tsx's own
  // markers effect: the trade list itself changing (a trade placed/closed/
  // edited), or visibleCount advancing past another trade's entry/exit
  // time. Deliberately a separate effect from the reveal one above rather
  // than folded into it - candles/price data and trade annotations are
  // conceptually independent layers, and keeping them separate means a
  // trade-only change (e.g. editing SL on an already-open trade) doesn't
  // have to pretend it's also a candle reveal.
  useEffect(() => {
    if (readyRef.current) syncTradesRef.current?.();
  }, [trades, visibleCount]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
