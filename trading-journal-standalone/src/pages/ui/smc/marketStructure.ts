import {
  Candle, SwingPoint, StructureEvent, StructureEventType, Direction, OrderBlock, FVG,
  LiquidityLevel, RangeInfo, PdPosition, TimeframeAnalysis, MultiTfAnalysis, SmcTimeframe, SMC_TIMEFRAMES,
} from './types';

// The detection engine behind the SMC Analysis feature. Runs entirely
// client-side (useMemo off the fetched candle arrays, see SmcAnalysis.tsx) -
// nothing here is Node-specific, and keeping it off the API means re-reading
// a markup or flipping timeframe tabs doesn't cost a round trip.
//
// Every function below encodes ONE specific, defensible reading of an SMC
// concept - not "the" definition (multiple legitimate conventions exist for
// most of these). Documented inline at each choice point; see the README
// shipped with this feature for the same list in one place.

// --- Weekly candles: derived client-side, not fetched -----------------------
// dukascopy-node's native Timeframe enum (checked directly against its type
// defs) has m1/m5/m15/m30/h1/h4/d1/mn1 - daily, then it jumps straight to
// monthly with no native weekly granularity. So '1w' is always built here
// from '1d' candles, bucketed to Monday-00:00-UTC weeks (ISO week start).
export function isoWeekStartUtc(unixSec: number): number {
  const d = new Date(unixSec * 1000);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday);
  return Math.floor(monday / 1000);
}

export function resampleWeekly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let current: Candle | null = null;
  let currentStart = -1;
  for (const c of daily) {
    const start = isoWeekStartUtc(c.time);
    if (!current || start !== currentStart) {
      if (current) out.push(current);
      currentStart = start;
      current = { time: start, open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
    }
  }
  if (current) out.push(current);
  return out;
}

// --- Swings: classic 5-bar fractal (2 bars either side) ---------------------
// A swing is only "confirmed" once LOOKBACK bars have closed after it -
// exactly like a human reading a chart can't call a swing high until price
// has actually turned away from it. detectStructureEvents below respects
// this confirmation lag rather than looking into the future.
const SWING_LOOKBACK = 2;

export function findSwings(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = SWING_LOOKBACK; i < candles.length - SWING_LOOKBACK; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - SWING_LOOKBACK; j <= i + SWING_LOOKBACK; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) swings.push({ index: i, time: c.time, price: c.high, kind: 'high', label: null });
    if (isLow) swings.push({ index: i, time: c.time, price: c.low, kind: 'low', label: null });
  }
  // Label HH/HL/LH/LL relative to the previous swing of the SAME kind.
  let prevHigh: number | null = null, prevLow: number | null = null;
  for (const s of swings) {
    if (s.kind === 'high') {
      if (prevHigh != null) s.label = s.price > prevHigh ? 'HH' : 'LH';
      prevHigh = s.price;
    } else {
      if (prevLow != null) s.label = s.price > prevLow ? 'HL' : 'LL';
      prevLow = s.price;
    }
  }
  return swings;
}

// --- Structure: BOS = break in the direction of the current trend
// (continuation), CHoCH = break AGAINST the current trend (the trend
// flips). Both are detected the same way: the CLOSE of a candle trading
// through the most recently CONFIRMED opposite-type swing. Using closes
// (not wicks) is a deliberate, common convention for automated structure
// tools - a wick-through-and-reject doesn't count as a break, only a
// candle that actually closes beyond the level does. Once a level is
// broken it's cleared and needs a fresh confirmed swing before it can be
// broken again, so the same level can't fire the same event twice in a row.
export function detectStructureEvents(candles: Candle[], swings: SwingPoint[]): { events: StructureEvent[]; trend: Direction | 'unknown' } {
  const events: StructureEvent[] = [];
  let refHigh: SwingPoint | null = null;
  let refLow: SwingPoint | null = null;
  let trend: Direction | 'unknown' = 'unknown';
  let swingPtr = 0;

  for (let c = 0; c < candles.length; c++) {
    while (swingPtr < swings.length && swings[swingPtr].index + SWING_LOOKBACK <= c) {
      const s = swings[swingPtr];
      if (s.kind === 'high') refHigh = s; else refLow = s;
      swingPtr++;
    }
    const close = candles[c].close;
    if (refHigh && close > refHigh.price) {
      const type: StructureEventType = trend === 'bullish' ? 'BOS' : 'CHoCH';
      events.push({ type, direction: 'bullish', time: candles[c].time, price: close, brokenLevel: refHigh.price, brokenSwingTime: refHigh.time });
      trend = 'bullish';
      refHigh = null;
    }
    if (refLow && close < refLow.price) {
      const type: StructureEventType = trend === 'bearish' ? 'BOS' : 'CHoCH';
      events.push({ type, direction: 'bearish', time: candles[c].time, price: close, brokenLevel: refLow.price, brokenSwingTime: refLow.time });
      trend = 'bearish';
      refLow = null;
    }
  }
  return { events, trend };
}

// --- Order Blocks: the last opposite-colored candle before the break
// candle, searched back up to OB_SEARCH_WINDOW bars (or the start of the
// series) - "the last down-close candle before an up-move that broke
// structure" is the standard ICT/SMC definition of a bullish (demand) OB,
// and the mirror for bearish (supply). Marked mitigated once any later
// candle trades back into its [low, high] range.
const OB_SEARCH_WINDOW = 15;

export function detectOrderBlocks(candles: Candle[], events: StructureEvent[]): OrderBlock[] {
  const timeToIndex = new Map(candles.map((c, i) => [c.time, i]));
  const obs: OrderBlock[] = [];
  for (const ev of events) {
    const breakIdx = timeToIndex.get(ev.time);
    if (breakIdx == null) continue;
    const floor = Math.max(0, breakIdx - OB_SEARCH_WINDOW);
    let obIdx: number | null = null;
    for (let i = breakIdx - 1; i >= floor; i--) {
      const c = candles[i];
      if (ev.direction === 'bullish' && c.close < c.open) { obIdx = i; break; }
      if (ev.direction === 'bearish' && c.close > c.open) { obIdx = i; break; }
    }
    if (obIdx == null) continue;
    const c = candles[obIdx];
    const ob: OrderBlock = {
      id: `ob-${ev.time}-${obIdx}`, direction: ev.direction,
      time: c.time, high: c.high, low: c.low, open: c.open, close: c.close,
      causedBy: ev.type, causedByTime: ev.time, mitigated: false, mitigatedAt: null,
    };
    for (let j = breakIdx + 1; j < candles.length; j++) {
      const cj = candles[j];
      if (cj.low <= ob.high && cj.high >= ob.low) { ob.mitigated = true; ob.mitigatedAt = cj.time; break; }
    }
    obs.push(ob);
  }
  return obs;
}

// --- Fair Value Gaps: classic 3-candle imbalance - candle[i-1].high below
// candle[i+1].low (bullish gap) or candle[i-1].low above candle[i+1].high
// (bearish gap). Marked filled once price fully trades back through the
// gap's far edge (not just touches it).
export function detectFvgs(candles: Candle[]): FVG[] {
  const fvgs: FVG[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const c0 = candles[i - 1], c1 = candles[i], c2 = candles[i + 1];
    if (c0.high < c2.low) {
      const fvg: FVG = { id: `fvg-${c1.time}-bull`, direction: 'bullish', time: c1.time, top: c2.low, bottom: c0.high, filled: false, filledAt: null };
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].low <= fvg.bottom) { fvg.filled = true; fvg.filledAt = candles[j].time; break; }
      }
      fvgs.push(fvg);
    } else if (c0.low > c2.high) {
      const fvg: FVG = { id: `fvg-${c1.time}-bear`, direction: 'bearish', time: c1.time, top: c0.low, bottom: c2.high, filled: false, filledAt: null };
      for (let j = i + 2; j < candles.length; j++) {
        if (candles[j].high >= fvg.top) { fvg.filled = true; fvg.filledAt = candles[j].time; break; }
      }
      fvgs.push(fvg);
    }
  }
  return fvgs;
}

// --- Active dealing range + Premium/Discount: the most recent confirmed
// swing high and swing low, whichever order they came in, bound the range
// currently being traded. 50% of that range is the equilibrium PD Array
// line - buy setups only valid below it (discount), sell setups only valid
// above it (premium), per the framework as described to us.
export function computeRange(swings: SwingPoint[]): RangeInfo | null {
  const highs = swings.filter(s => s.kind === 'high');
  const lows = swings.filter(s => s.kind === 'low');
  if (!highs.length || !lows.length) return null;
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];
  const high = Math.max(lastHigh.price, lastLow.price);
  const low = Math.min(lastHigh.price, lastLow.price);
  return { high, low, eq: (high + low) / 2, highTime: lastHigh.time, lowTime: lastLow.time };
}

// --- Liquidity pools: Equal Highs / Equal Lows within a small tolerance
// (0.06% of price - roughly 6 pips on a 1.0000-handle FX pair, scaled to
// price so it also works on XAUUSD/JPY pairs) count as one internal-range-
// liquidity pool. Swept once any later candle trades through the pool's
// average price.
const EQ_TOLERANCE_PCT = 0.0006;

function poolLevels(points: SwingPoint[], candles: Candle[], kind: 'EQH' | 'EQL'): LiquidityLevel[] {
  const used = new Set<number>();
  const pools: LiquidityLevel[] = [];
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const group = [points[i]];
    used.add(i);
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(points[j].price - points[i].price) / points[i].price <= EQ_TOLERANCE_PCT) { group.push(points[j]); used.add(j); }
    }
    if (group.length < 2) continue;
    const avg = group.reduce((s, p) => s + p.price, 0) / group.length;
    const lastTouchTime = Math.max(...group.map(p => p.time));
    let swept = false, sweptAt: number | null = null;
    for (const c of candles) {
      if (c.time <= lastTouchTime) continue;
      if (kind === 'EQH' && c.high > avg) { swept = true; sweptAt = c.time; break; }
      if (kind === 'EQL' && c.low < avg) { swept = true; sweptAt = c.time; break; }
    }
    pools.push({ kind, price: avg, touches: group.map(p => p.time), swept, sweptAt });
  }
  return pools;
}

export function detectLiquidity(swings: SwingPoint[], candles: Candle[]): { eqHighs: LiquidityLevel[]; eqLows: LiquidityLevel[] } {
  const highs = swings.filter(s => s.kind === 'high').sort((a, b) => a.time - b.time);
  const lows = swings.filter(s => s.kind === 'low').sort((a, b) => a.time - b.time);
  return { eqHighs: poolLevels(highs, candles, 'EQH'), eqLows: poolLevels(lows, candles, 'EQL') };
}

const EMPTY: Omit<TimeframeAnalysis, 'tf' | 'candles'> = {
  swings: [], structureEvents: [], trend: 'unknown', range: null, position: null,
  orderBlocks: [], fvgs: [], liquidity: { eqHighs: [], eqLows: [] }, lastClose: null, lastTime: null,
};

// Below this many candles there isn't enough context to detect anything
// meaningful (a 5-bar fractal alone needs SWING_LOOKBACK*2+1 just to find
// one swing) - returns an empty-but-valid analysis rather than throwing, so
// a thin dataset (e.g. weekly on a pair just fetched) just shows "not
// enough data yet" instead of crashing the page.
const MIN_CANDLES = 12;

export function analyzeTimeframe(tf: SmcTimeframe, candles: Candle[]): TimeframeAnalysis {
  if (!candles || candles.length < MIN_CANDLES) {
    return { tf, candles: candles ?? [], ...EMPTY };
  }
  const swings = findSwings(candles);
  const { events, trend } = detectStructureEvents(candles, swings);
  const orderBlocks = detectOrderBlocks(candles, events);
  const fvgs = detectFvgs(candles);
  const range = computeRange(swings);
  const last = candles[candles.length - 1];
  let position: PdPosition | null = null;
  if (range) position = last.close > range.eq ? 'premium' : last.close < range.eq ? 'discount' : 'equilibrium';
  const liquidity = detectLiquidity(swings, candles);
  return {
    tf, candles, swings, structureEvents: events, trend, range, position,
    orderBlocks, fvgs, liquidity, lastClose: last.close, lastTime: last.time,
  };
}

export function analyzeAll(pair: string, candlesByTf: Partial<Record<SmcTimeframe, Candle[]>>): MultiTfAnalysis {
  const out: MultiTfAnalysis = { pair };
  for (const tf of SMC_TIMEFRAMES) {
    const c = candlesByTf[tf];
    if (c && c.length) out[tf] = analyzeTimeframe(tf, c);
  }
  return out;
}
