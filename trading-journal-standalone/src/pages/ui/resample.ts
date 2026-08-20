import { Candle } from '../data/types';
import { REPLAY_TIMEFRAMES } from '../data/types';

// Bucket size in seconds per timeframe - the only thing needed to fold a
// finer series (e.g. 1m, whatever was actually fetched from Dukascopy) up
// into a coarser one (5m/15m/1h/4h/1d) entirely client-side. This is what
// lets the replay chart offer a timeframe switcher without a fresh fetch
// for every granularity someone wants to look at.
export const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};

// Which timeframes can be *displayed* given a dataset actually fetched at
// `baseTf` - only equal-or-coarser ones, since you can't derive 1-minute
// detail out of hourly candles. Ordered same as REPLAY_TIMEFRAMES so the
// selector renders left-to-right fine-to-coarse.
export function derivableTimeframes(baseTf: string): string[] {
  const baseSec = TIMEFRAME_SECONDS[baseTf];
  if (!baseSec) return [baseTf];
  return REPLAY_TIMEFRAMES.filter(tf => TIMEFRAME_SECONDS[tf] >= baseSec);
}

// Incremental resample cache: folds newly-revealed base candles into
// coarser buckets one at a time, rather than re-scanning the whole history
// on every replay tick. This matters at the scale a real backtest dataset
// reaches (a year of 1-minute data is 300k+ candles) - rebuilding a 1h
// series from scratch 8 times a second (the fastest replay speed) would
// mean repeatedly walking the entire revealed history just to fold in the
// one new candle that actually changed.
//
// The tradeoff: a *rewind* (skip back, restart, random start, or switching
// which timeframe/dataset is displayed) can't be done incrementally - the
// cache detects that case (via toTfSeconds/candles-identity/backwards
// progress) and rebuilds from scratch. That's the same cost the base
// candle series already accepts for its own jump/reset case, so it's not
// a new tradeoff, just the same one applied one level up.
export type ResampleCache = {
  toTfSeconds: number;
  candles: Candle[] | null;
  builtUpTo: number;
  buckets: Candle[];
  current: Candle | null;
  currentStart: number;
  // Whether the most recent *state-changing* call was a full rebuild (vs an
  // incremental fold-in) - persisted on the cache itself, not computed
  // fresh per call. This is what makes the function safe to call more than
  // once with identical arguments and get the identical answer back both
  // times (see the comment below on why that matters).
  lastWasReset: boolean;
};

export function createResampleCache(): ResampleCache {
  return { toTfSeconds: 0, candles: null, builtUpTo: 0, buckets: [], current: null, currentStart: -1, lastWasReset: true };
}

// Returns the resampled candles visible right now (all of it - the array
// this returns is already clipped to exactly what's been revealed, so
// nothing downstream needs a separate "how much of this is visible" offset
// the way the un-resampled base series does) plus whether the cache needed
// a full rebuild to get here (so the caller knows to setData()+fitContent()
// instead of a cheap update() with just the tail candle).
//
// Must be safe to call more than once with the exact same arguments and
// return the exact same result both times, with no double-counting - this
// gets invoked from a useMemo, and React 18 StrictMode deliberately
// double-invokes render (and anything called during render, including
// useMemo factories) to catch exactly this class of bug: a naive
// "did I just do a rebuild" flag computed fresh each call would see the
// first (thrown-away) invocation already advance builtUpTo, then report
// `wasReset: false` on the second (real, committed) invocation even though
// no setData() had actually reached the chart yet - which is what caused
// lightweight-charts' "Cannot update oldest data" crash the first time
// this shipped without this guard.
export function resampleIncremental(
  cache: ResampleCache,
  baseCandles: Candle[],
  baseVisibleCount: number,
  toTfSeconds: number,
): { candles: Candle[]; wasReset: boolean } {
  const needsReset =
    cache.toTfSeconds !== toTfSeconds ||
    cache.candles !== baseCandles ||
    baseVisibleCount < cache.builtUpTo;

  if (needsReset) {
    cache.toTfSeconds = toTfSeconds;
    cache.candles = baseCandles;
    cache.builtUpTo = 0;
    cache.buckets = [];
    cache.current = null;
    cache.currentStart = -1;
    cache.lastWasReset = true;
  } else if (baseVisibleCount > cache.builtUpTo) {
    cache.lastWasReset = false;
  }
  // else: baseVisibleCount === cache.builtUpTo and no reset needed - this is
  // a repeat call with nothing new to fold in (e.g. StrictMode's throwaway
  // double-render, or just a re-render with unchanged inputs). Leave
  // lastWasReset exactly as it was set by the last call that actually
  // changed something, and skip the fold loop below entirely.

  for (let i = cache.builtUpTo; i < baseVisibleCount; i++) {
    const c = baseCandles[i];
    const bucketStart = Math.floor(c.time / toTfSeconds) * toTfSeconds;
    if (!cache.current || bucketStart !== cache.currentStart) {
      if (cache.current) cache.buckets.push(cache.current);
      cache.currentStart = bucketStart;
      cache.current = { time: bucketStart, open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      cache.current.high = Math.max(cache.current.high, c.high);
      cache.current.low = Math.min(cache.current.low, c.low);
      cache.current.close = c.close;
    }
  }
  cache.builtUpTo = baseVisibleCount;

  const candles = cache.current ? [...cache.buckets, cache.current] : cache.buckets.slice();
  return { candles, wasReset: cache.lastWasReset };
}
