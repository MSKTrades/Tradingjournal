import { Candle } from '../data/types';
import { TIMEFRAME_SECONDS, derivableTimeframes, createResampleCache, resampleIncremental, ResampleCache } from './resample';

// Advanced Charts' own IDatafeedChartApi/IExternalDatafeed interfaces (from
// charting_library/datafeed-api.d.ts in the private repo) aren't available
// as an importable type here - the library ships as a static bundle under
// public/, not an npm package (see fetch-charting-library.mjs's header
// comment for why). Rather than hand-copy those interfaces into this repo
// (drift risk every time the library updates), the shapes below are
// structurally compatible with what the widget expects at runtime and typed
// loosely; the widget itself is the real contract check.

type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type OnTick = (bar: Bar) => void;
type GetBarsCallback = (bars: Bar[], meta: { noData: boolean }) => void;
type ErrorCallback = (reason: string) => void;

// TradingView's own resolution string format - bare minute counts ('1',
// '5', '60') plus 'D'/'W'/'M' for daily-and-up - mapped onto PipEcho's own
// timeframe keys ('1m', '5m', '1h', ...). Built directly from
// TIMEFRAME_SECONDS (resample.ts's single source of truth for bucket
// sizes) so the two representations can never drift out of sync with each
// other.
const TF_TO_RESOLUTION: Record<string, string> = Object.fromEntries(
  Object.entries(TIMEFRAME_SECONDS).map(([tf, sec]) => [tf, sec >= 86400 ? 'D' : String(sec / 60)])
);
const RESOLUTION_TO_SECONDS: Record<string, number> = Object.fromEntries(
  Object.entries(TF_TO_RESOLUTION).map(([tf, res]) => [res, TIMEFRAME_SECONDS[tf]])
);

export function tfToResolution(tf: string): string {
  return TF_TO_RESOLUTION[tf] ?? tf;
}

// Falls back to parsing the resolution string directly (rather than only
// trusting the lookup table above) because the widget can in principle ask
// for a resolution PipEcho didn't explicitly advertise in
// supported_resolutions (e.g. a saved layout from a previous session) -
// better to serve a best-effort bucket size than to throw.
function resolutionToSeconds(resolution: string): number {
  if (RESOLUTION_TO_SECONDS[resolution] != null) return RESOLUTION_TO_SECONDS[resolution];
  if (resolution.endsWith('W')) return (parseInt(resolution, 10) || 1) * 7 * 86400;
  if (resolution.endsWith('D') || resolution.endsWith('M')) return (parseInt(resolution, 10) || 1) * 86400;
  const mins = parseInt(resolution, 10);
  return isNaN(mins) ? 60 : mins * 60;
}

// Builds a datafeed backed entirely by an in-memory candle array PipEcho
// already has (no live/remote fetching, ever - see §3 of
// advanced-charts-integration-plan.md). `getCandles`/`getVisibleCount`/
// `getBaseTimeframe` are getters rather than plain values so the datafeed
// always reads whatever the owning component's refs currently hold,
// without needing to be re-created every time a prop changes (mirrors how
// ReplayChart's own resample cache is a ref that outlives individual
// renders).
//
// `notifyReveal()` is the other half of the contract: call it whenever
// `getVisibleCount()` would now return something different (i.e. whenever
// the owning component's `visibleCount` prop changes) - this is what turns
// PipEcho's existing replay-scrubbing state into chart updates, via the
// same subscribeBars/onTick mechanism the library would otherwise use for
// live ticks. Nothing here talks to the network or a live feed; "the tick"
// is just "one more bar of history got revealed."
export function createReplayDatafeed(opts: {
  getCandles: () => Candle[];
  getVisibleCount: () => number;
  getBaseTimeframe: () => string;
}) {
  const cache: ResampleCache = createResampleCache();
  let activeSub: {
    toTfSeconds: number;
    onTick: OnTick;
    onResetCacheNeededCallback: () => void;
    guid: string;
  } | null = null;

  function visibleSlice() {
    const candles = opts.getCandles();
    const visibleCount = Math.max(0, Math.min(opts.getVisibleCount(), candles.length));
    return { candles, visibleCount };
  }

  const datafeed = {
    onReady(callback: (config: { supported_resolutions: string[] }) => void) {
      const resolutions = derivableTimeframes(opts.getBaseTimeframe()).map(tfToResolution);
      // Per the datafeed-api contract, onReady's callback must fire
      // asynchronously (a bare setTimeout is the documented pattern) - the
      // widget hasn't finished its own setup yet if this resolves
      // synchronously during widget construction.
      setTimeout(() => callback({ supported_resolutions: resolutions }), 0);
    },

    searchSymbols(
      _userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (symbols: unknown[]) => void,
    ) {
      onResult([]); // single-symbol datafeed - nothing to search
    },

    resolveSymbol(
      _symbolName: string,
      onResolve: (symbolInfo: Record<string, unknown>) => void,
      _onError?: ErrorCallback,
    ) {
      const resolutions = derivableTimeframes(opts.getBaseTimeframe()).map(tfToResolution);
      setTimeout(() => onResolve({
        name: 'REPLAY',
        ticker: 'REPLAY',
        description: 'PipEcho replay',
        type: 'forex',
        session: '24x7',
        exchange: 'PipEcho',
        listed_exchange: 'PipEcho',
        timezone: 'Etc/UTC',
        minmov: 1,
        pricescale: 100000,
        has_intraday: true,
        has_seconds: false,
        supported_resolutions: resolutions,
        volume_precision: 2,
        data_status: 'streaming',
      }), 0);
    },

    getBars(
      _symbolInfo: unknown,
      resolution: string,
      periodParams: { from: number; to: number; countBack?: number; firstDataRequest?: boolean },
      onResult: GetBarsCallback,
      onError: ErrorCallback,
    ) {
      try {
        const toTfSeconds = resolutionToSeconds(resolution);
        const { candles, visibleCount } = visibleSlice();
        const { candles: resampled } = resampleIncremental(cache, candles, visibleCount, toTfSeconds);

        let bars: Bar[];
        if (periodParams.firstDataRequest) {
          // The widget's very first request for a symbol/resolution doesn't
          // know what "the latest" data looks like yet - per the datafeed
          // API contract, `firstDataRequest` means "ignore from/to, just
          // hand back the most recent countBack bars." This matters a lot
          // here specifically: resolveSymbol marks this a 'streaming'
          // symbol, so the widget's default from/to on that first call is
          // anchored near real wall-clock "now" - which has nothing to do
          // with where a historical replay currently sits. Without this
          // branch, periodParams.to would almost never overlap a replay
          // that's stopped somewhere in the past, and the chart would load
          // empty until the first live subscribeBars push arrived.
          const count = periodParams.countBack ?? 300;
          bars = resampled.slice(Math.max(0, resampled.length - count));
        } else {
          bars = resampled.filter(c => c.time >= periodParams.from && c.time <= periodParams.to);
        }
        onResult(bars, { noData: bars.length === 0 });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },

    // Never pushes anything on its own - there is no live feed. This just
    // remembers the widget's tick callback for the currently displayed
    // resolution so `notifyReveal()` (below) has somewhere to push into.
    subscribeBars(
      _symbolInfo: unknown,
      resolution: string,
      onTick: OnTick,
      guid: string,
      onResetCacheNeededCallback: () => void,
    ) {
      activeSub = { toTfSeconds: resolutionToSeconds(resolution), onTick, onResetCacheNeededCallback, guid };
    },

    unsubscribeBars(guid: string) {
      if (activeSub?.guid === guid) activeSub = null;
    },
  };

  // The replay-driven push: same incremental-vs-reset branch ReplayChart's
  // own candle effect uses (series.update() vs series.setData()) - here,
  // "update" is subscribeBars' onTick with just the latest bar, and "reset"
  // is telling the widget its cache is stale via
  // onResetCacheNeededCallback(), which makes it call getBars() again from
  // scratch. Safe to call with nothing revealed yet, with no active
  // subscription (e.g. before the widget's finished mounting), or more than
  // once with an unchanged visibleCount (resampleIncremental's own
  // idempotency guarantee - see resample.ts).
  function notifyReveal() {
    if (!activeSub) return;
    const { candles, visibleCount } = visibleSlice();
    const { candles: resampled, wasReset } = resampleIncremental(cache, candles, visibleCount, activeSub.toTfSeconds);
    if (wasReset) {
      activeSub.onResetCacheNeededCallback();
      return;
    }
    const last = resampled[resampled.length - 1];
    if (last) activeSub.onTick({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
  }

  return { datafeed, notifyReveal };
}
