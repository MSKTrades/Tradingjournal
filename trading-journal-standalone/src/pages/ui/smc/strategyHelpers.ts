import { Candle, TimeframeAnalysis, MultiTfAnalysis, Direction, OrderBlock, FVG, StructureEvent, SwingPoint, SmcTimeframe, TradeSetup, SMC_TIMEFRAMES } from './types';
import { analyzeTimeframe } from './marketStructure';

// Shared building blocks for strategyModels.ts's six rule engines. Kept
// separate so markupGrading.ts can reuse the exact same "what does the
// current structure/POI/liquidity state say" logic a live scan uses,
// instead of re-implementing a parallel set of checks for graded markups.

export type Zone = {
  kind: 'OB' | 'FVG';
  direction: Direction;
  high: number;
  low: number;
  time: number;
  resolved: boolean; // mitigated (OB) or filled (FVG)
  ref: OrderBlock | FVG;
};

export function zonesFor(tfa: TimeframeAnalysis, direction: Direction): Zone[] {
  const obZones: Zone[] = tfa.orderBlocks
    .filter(o => o.direction === direction)
    .map(o => ({ kind: 'OB' as const, direction, high: o.high, low: o.low, time: o.time, resolved: o.mitigated, ref: o }));
  const fvgZones: Zone[] = tfa.fvgs
    .filter(f => f.direction === direction)
    .map(f => ({ kind: 'FVG' as const, direction, high: f.top, low: f.bottom, time: f.time, resolved: f.filled, ref: f }));
  return [...obZones, ...fvgZones].sort((a, b) => a.time - b.time);
}

// The most recent, still-unmitigated/unfilled POI of `direction` that sits
// in the correct side of the active PD range (buy POIs must be in discount,
// sell POIs in premium - "Filter Out Counter-Trend Traps" from Model 4,
// applied everywhere a POI is picked, not just there).
export function latestPoiInPd(tfa: TimeframeAnalysis, direction: Direction): Zone | null {
  if (!tfa.range) return null;
  const wantSide = direction === 'bullish' ? 'discount' : 'premium';
  const candidates = zonesFor(tfa, direction).filter(z => {
    if (z.resolved) return false;
    const mid = (z.high + z.low) / 2;
    const side = mid > tfa.range!.eq ? 'premium' : mid < tfa.range!.eq ? 'discount' : 'equilibrium';
    return side === wantSide || side === 'equilibrium';
  });
  return candidates.length ? candidates[candidates.length - 1] : null;
}

export function zoneTappedSince(candles: Candle[], zone: Zone, sinceTime: number): boolean {
  return candles.some(c => c.time > Math.max(zone.time, sinceTime) && c.low <= zone.high && c.high >= zone.low);
}

export function firstStructureEventAfter(tfa: TimeframeAnalysis, afterTime: number, type: 'BOS' | 'CHoCH', direction: Direction): StructureEvent | null {
  return tfa.structureEvents.find(e => e.time > afterTime && e.type === type && e.direction === direction) ?? null;
}

// The earliest still-open zone of `direction` formed at/after `afterTime` -
// i.e. "the POI this break/sweep created", used for "entry at the OB/FVG
// formed after the CHoCH" style rules across several of the six models.
export function zoneFormedAfter(tfa: TimeframeAnalysis, afterTime: number, direction: Direction): Zone | null {
  const zones = zonesFor(tfa, direction).filter(z => z.time >= afterTime);
  return zones.length ? zones[0] : null;
}

// Nearest confirmed swing of `kind` at or before `atOrBeforeTime` - the
// invalidation reference for SL placement ("SL above/below the invalidation
// swing point"): a long's invalidation is the swing LOW that must hold, a
// short's is the swing HIGH that must hold.
export function invalidationSwing(tfa: TimeframeAnalysis, atOrBeforeTime: number, kind: 'high' | 'low'): SwingPoint | null {
  const candidates = tfa.swings.filter(s => s.kind === kind && s.time <= atOrBeforeTime);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

// Small safety buffer beyond an invalidation swing/zone edge for SL
// placement, scaled to price (5 bps) rather than a fixed pip count so it
// behaves sanely across FX majors, JPY pairs, and metals alike. A real
// trader would size this off spread/ATR/structure - this is a deliberate
// simplification, called out in the shipped README.
export function slBuffer(price: number): number {
  return price * 0.0005;
}

export function buildSetup(direction: Direction, entry: number, sl: number, rr1 = 3, rr2: number | null = 5, note = ''): TradeSetup {
  const risk = Math.abs(entry - sl);
  const tp = direction === 'bullish' ? entry + risk * rr1 : entry - risk * rr1;
  const tp2 = rr2 != null ? (direction === 'bullish' ? entry + risk * rr2 : entry - risk * rr2) : null;
  return { direction, entry, sl, tp, tp2, rr: rr1, note };
}

// Approximates "London session open window" (07:00-09:00) and the broader
// London/NY execution window used by a couple of the models, in UTC -
// London is UTC in winter and UTC+1 in summer (BST), and DST-correcting
// this properly needs a timezone library; treating London time as UTC
// year-round is a known, documented simplification (off by at most an hour
// during BST) rather than silently guessing.
export function hourUtc(unixSec: number): number {
  return new Date(unixSec * 1000).getUTCHours();
}

export function isLondonOpenWindow(unixSec: number): boolean {
  const h = hourUtc(unixSec);
  return h >= 7 && h < 9;
}

export function isLondonOrNySession(unixSec: number): boolean {
  const h = hourUtc(unixSec);
  return h >= 7 && h < 17; // London 07-16, NY overlap 12-16 UTC - covers both
}

export function isAsianSession(unixSec: number): boolean {
  const h = hourUtc(unixSec);
  return h >= 0 && h < 7;
}

// Asian session high/low for the trading day containing `asOfTime` (or the
// most recently completed one if `asOfTime` falls inside/after London
// open) - Model 2's "mark High/Low of Asian consolidation range" step.
export function asianRange(candles: Candle[], asOfTime: number): { high: number; low: number; dayStart: number } | null {
  const dayStart = Math.floor(asOfTime / 86400) * 86400;
  // If we're before the Asian session has even started today, use yesterday's.
  const sessionDayStart = hourUtc(asOfTime) < 7 && asOfTime - dayStart < 7 * 3600 ? dayStart : dayStart;
  const windowCandles = candles.filter(c => c.time >= sessionDayStart && c.time < sessionDayStart + 7 * 3600);
  if (!windowCandles.length) return null;
  return {
    high: Math.max(...windowCandles.map(c => c.high)),
    low: Math.min(...windowCandles.map(c => c.low)),
    dayStart: sessionDayStart,
  };
}

// Truncates a timeframe's candle series to everything at/before `asOfTime`
// and re-runs the full detection engine on just that slice - this is what
// lets markupGrading.ts ask "what did structure/POIs/liquidity actually
// look like at the moment this markup's entry was meant to trigger", rather
// than grading a past idea against hindsight (lookahead bias).
export function truncateAnalysis(tfa: TimeframeAnalysis, asOfTime: number): TimeframeAnalysis {
  const sliced = tfa.candles.filter(c => c.time <= asOfTime);
  return analyzeTimeframe(tfa.tf, sliced);
}

export function truncateBundle(bundle: MultiTfAnalysis, asOfTime: number): MultiTfAnalysis {
  const out: MultiTfAnalysis = { pair: bundle.pair };
  // Object.keys(bundle) also includes 'pair' itself (a string, not a
  // TimeframeAnalysis) - iterate the known timeframe keys explicitly rather
  // than every key on the bundle object, or `tfa.candles` below blows up on
  // the 'pair' string.
  for (const tf of SMC_TIMEFRAMES) {
    const tfa = bundle[tf];
    if (tfa) (out as any)[tf] = truncateAnalysis(tfa, asOfTime);
  }
  return out;
}
