import { StrategyModelKey } from './types';

// Plain-English "what is this actually doing" copy for each strategy model,
// plus a small schematic candle sequence used to draw an illustrative
// example chart (see StrategyDiagram.tsx) - NOT live data, just a stylized
// long/bullish walkthrough of the pattern so a trader can see the shape of
// the setup at a glance before reading the live rule checklist below it.
// Every model works symmetrically short (mirror image) - the diagrams only
// show the long case to keep six diagrams visually comparable.

export type DiagramCandle = { o: number; h: number; l: number; c: number };
export type DiagramZone = { fromIdx: number; toIdx: number; top: number; bottom: number; label: string; tone: 'bull' | 'bear' };
export type DiagramMarker = { idx: number; value: number; label: string; below?: boolean };
export type DiagramHLine = { value: number; label: string; fromIdx: number; tone: 'sl' | 'tp' | 'eq' };

export type StrategyDiagramSpec = {
  candles: DiagramCandle[];
  zones?: DiagramZone[];
  markers?: DiagramMarker[];
  hLines?: DiagramHLine[];
};

export type StrategyInfo = {
  whatItDoes: string;
  timeframeNote: string;
  diagram: StrategyDiagramSpec;
};

export const STRATEGY_MODEL_INFO: Record<StrategyModelKey, StrategyInfo> = {
  pro_trend_m15_m1: {
    whatItDoes:
      "Trades with the higher-timeframe trend. Once the 15-minute chart is making higher-highs/higher-lows (or the reverse), it waits for price to pull back into an unmitigated 15M Order Block or Fair Value Gap sitting on the discount side (premium for shorts) - then drops down to the 1-minute chart for a change-of-character and a fresh entry zone to trigger the trade in the direction of that bigger trend.",
    timeframeNote: 'Direction & zone read on 15M · confirmation & entry on 1M',
    diagram: {
      candles: [
        { o: 20, h: 26, l: 18, c: 25 },
        { o: 25, h: 34, l: 24, c: 32 },
        { o: 32, h: 33, l: 27, c: 29 },
        { o: 29, h: 31, l: 22, c: 24 },
        { o: 24, h: 25, l: 19, c: 21 },
        { o: 21, h: 23, l: 19, c: 22 },
        { o: 22, h: 36, l: 21, c: 35 },
        { o: 35, h: 38, l: 33, c: 37 },
        { o: 37, h: 46, l: 36, c: 45 },
        { o: 45, h: 48, l: 43, c: 47 },
        { o: 47, h: 58, l: 46, c: 56 },
        { o: 56, h: 62, l: 55, c: 60 },
      ],
      zones: [{ fromIdx: 3, toIdx: 5, top: 25, bottom: 19, label: '15M OB/FVG (discount)', tone: 'bull' }],
      markers: [
        { idx: 4, value: 19, label: 'POI tap', below: true },
        { idx: 6, value: 36, label: '1M CHoCH + entry' },
      ],
      hLines: [
        { value: 17, label: 'SL', fromIdx: 5, tone: 'sl' },
        { value: 42, label: 'TP', fromIdx: 5, tone: 'tp' },
      ],
    },
  },
  session_liquidity_sweep: {
    whatItDoes:
      "Marks the Asian session's high and low, then waits for London to open and run one side of that range - ideally sweeping straight into a higher-timeframe (1H/4H) point of interest. A 1-minute change of character, or simply a candle closing back inside the Asian range, confirms the reversal - entry triggers off the fresh displacement zone that prints on the move back through the range.",
    timeframeNote: 'Range built on 15M · confirmation & entry on 1M · best inside the 07:00–09:00 UTC London open window',
    diagram: {
      candles: [
        { o: 42, h: 45, l: 40, c: 44 },
        { o: 44, h: 46, l: 41, c: 42 },
        { o: 42, h: 44, l: 39, c: 41 },
        { o: 41, h: 43, l: 38, c: 40 },
        { o: 40, h: 42, l: 37, c: 39 },
        { o: 39, h: 40, l: 28, c: 38 },
        { o: 38, h: 44, l: 37, c: 43 },
        { o: 43, h: 52, l: 42, c: 50 },
        { o: 50, h: 53, l: 47, c: 48 },
        { o: 48, h: 60, l: 47, c: 58 },
        { o: 58, h: 64, l: 56, c: 62 },
        { o: 62, h: 68, l: 61, c: 66 },
      ],
      zones: [{ fromIdx: 0, toIdx: 4, top: 46, bottom: 37, label: 'Asian range', tone: 'bear' }, { fromIdx: 7, toIdx: 8, top: 53, bottom: 47, label: 'Displacement FVG', tone: 'bull' }],
      markers: [
        { idx: 5, value: 28, label: 'Sweep Asian Low', below: true },
        { idx: 8, value: 53, label: 'Entry' },
      ],
      hLines: [
        { value: 26, label: 'SL', fromIdx: 5, tone: 'sl' },
        { value: 64, label: 'TP', fromIdx: 8, tone: 'tp' },
      ],
    },
  },
  candle2_sweep: {
    whatItDoes:
      "A fast 3-candle read on the 15-minute chart. Candle 1 taps an existing Order Block or FVG. Candle 2 sweeps candle 1's high or low but closes back inside it - the liquidity grab. Candle 3 then displaces aggressively past candle 2's extreme, confirming the reversal (CISD) - entry triggers off the fresh FVG or breaker block that move prints.",
    timeframeNote: 'Entirely a 15M pattern - no higher or lower timeframe needed',
    diagram: {
      candles: [
        { o: 60, h: 62, l: 55, c: 57 },
        { o: 57, h: 58, l: 50, c: 52 },
        { o: 52, h: 54, l: 46, c: 48 },
        { o: 48, h: 49, l: 42, c: 44 },
        { o: 44, h: 45, l: 34, c: 43 },
        { o: 43, h: 53, l: 42, c: 52 },
        { o: 52, h: 54, l: 49, c: 50 },
        { o: 50, h: 60, l: 49, c: 58 },
        { o: 58, h: 61, l: 56, c: 57 },
        { o: 57, h: 66, l: 56, c: 65 },
        { o: 65, h: 70, l: 63, c: 68 },
        { o: 68, h: 72, l: 66, c: 70 },
      ],
      zones: [{ fromIdx: 3, toIdx: 3, top: 49, bottom: 42, label: 'C1 taps POI', tone: 'bull' }, { fromIdx: 5, toIdx: 6, top: 54, bottom: 49, label: 'Entry FVG/breaker', tone: 'bull' }],
      markers: [
        { idx: 4, value: 34, label: 'C2 sweep', below: true },
        { idx: 5, value: 54, label: 'C3 CISD' },
        { idx: 6, value: 54, label: 'Entry' },
      ],
      hLines: [
        { value: 34, label: 'SL', fromIdx: 4, tone: 'sl' },
        { value: 68, label: 'TP', fromIdx: 6, tone: 'tp' },
      ],
    },
  },
  structural_pullback: {
    whatItDoes:
      "Maps the 50% equilibrium of the active 1-hour expansion leg, then waits for the pullback to stay on the correct side of it - discount for longs, premium for shorts. Once a 15-minute displacement candle closes beyond minor swing structure (confirming the pullback is actually over), entry triggers at the top or bottom of the fresh FVG that candle prints.",
    timeframeNote: 'Range & 50% EQ from 1H · displacement & entry on 15M',
    diagram: {
      candles: [
        { o: 20, h: 24, l: 19, c: 23 },
        { o: 23, h: 30, l: 22, c: 29 },
        { o: 29, h: 38, l: 28, c: 37 },
        { o: 37, h: 46, l: 36, c: 45 },
        { o: 45, h: 46, l: 39, c: 40 },
        { o: 40, h: 41, l: 34, c: 35 },
        { o: 35, h: 36, l: 29, c: 33 },
        { o: 33, h: 43, l: 32, c: 42 },
        { o: 42, h: 44, l: 39, c: 40 },
        { o: 40, h: 50, l: 39, c: 49 },
        { o: 49, h: 56, l: 48, c: 55 },
        { o: 55, h: 60, l: 54, c: 59 },
      ],
      zones: [{ fromIdx: 7, toIdx: 8, top: 44, bottom: 39, label: 'FVG entry', tone: 'bull' }],
      markers: [{ idx: 6, value: 29, label: '50% EQ pullback', below: true }, { idx: 8, value: 44, label: 'Entry' }],
      hLines: [
        { value: 32.5, label: '1H 50% EQ', fromIdx: 0, tone: 'eq' },
        { value: 29, label: 'SL', fromIdx: 6, tone: 'sl' },
        { value: 58, label: 'TP', fromIdx: 8, tone: 'tp' },
      ],
    },
  },
  inducement_sweep: {
    whatItDoes:
      "Starts from an unmitigated 1H/4H point of interest. Price usually sweeps a smaller 'inducement' swing first - a minor high or low positioned just before the real zone, designed to trap early entries - before actually reaching it. Once that inducement is swept and a 1-minute change of character confirms the shift, entry triggers on the breaker block or zone responsible for it.",
    timeframeNote: '1H/4H for the target zone · 15M for the inducement swing · 1M for confirmation & entry',
    diagram: {
      candles: [
        { o: 50, h: 53, l: 48, c: 52 },
        { o: 52, h: 54, l: 47, c: 49 },
        { o: 49, h: 52, l: 48, c: 51 },
        { o: 51, h: 52, l: 44, c: 46 },
        { o: 46, h: 47, l: 38, c: 40 },
        { o: 40, h: 41, l: 33, c: 36 },
        { o: 36, h: 38, l: 32, c: 34 },
        { o: 34, h: 46, l: 33, c: 45 },
        { o: 45, h: 47, l: 41, c: 42 },
        { o: 42, h: 52, l: 41, c: 50 },
        { o: 50, h: 58, l: 49, c: 56 },
        { o: 56, h: 62, l: 55, c: 60 },
      ],
      zones: [{ fromIdx: 5, toIdx: 6, top: 41, bottom: 32, label: 'HTF POI', tone: 'bull' }, { fromIdx: 7, toIdx: 8, top: 47, bottom: 41, label: 'Breaker entry', tone: 'bull' }],
      markers: [
        { idx: 1, value: 54, label: 'Inducement swing' },
        { idx: 3, value: 44, label: 'IDM swept', below: true },
        { idx: 8, value: 47, label: 'Entry' },
      ],
      hLines: [
        { value: 30, label: 'SL', fromIdx: 3, tone: 'sl' },
        { value: 58, label: 'TP', fromIdx: 8, tone: 'tp' },
      ],
    },
  },
  htf_continuation: {
    whatItDoes:
      "Trades with the daily bias, filtered so price hasn't retraced past the halfway point of the prior day's expansion leg. During the London/NY session it waits for a minor 15-minute liquidity sweep, followed by a continuation break in the direction of that daily bias - entry triggers on the fresh 15M Order Block/FVG that break creates.",
    timeframeNote: 'Bias from Daily · sweep, continuation break & entry on 15M · London/NY session hours only',
    diagram: {
      candles: [
        { o: 30, h: 33, l: 29, c: 32 },
        { o: 32, h: 36, l: 31, c: 35 },
        { o: 35, h: 36, l: 30, c: 31 },
        { o: 31, h: 33, l: 24, c: 28 },
        { o: 28, h: 38, l: 27, c: 37 },
        { o: 37, h: 39, l: 34, c: 35 },
        { o: 35, h: 45, l: 34, c: 44 },
        { o: 44, h: 46, l: 41, c: 42 },
        { o: 42, h: 52, l: 41, c: 50 },
        { o: 50, h: 53, l: 48, c: 49 },
        { o: 49, h: 58, l: 48, c: 56 },
        { o: 56, h: 61, l: 55, c: 59 },
      ],
      zones: [{ fromIdx: 5, toIdx: 5, top: 39, bottom: 34, label: 'Continuation OB/FVG', tone: 'bull' }],
      markers: [
        { idx: 3, value: 24, label: '15M sweep', below: true },
        { idx: 5, value: 39, label: 'Entry' },
      ],
      hLines: [
        { value: 24, label: 'SL', fromIdx: 3, tone: 'sl' },
        { value: 55, label: 'TP', fromIdx: 5, tone: 'tp' },
      ],
    },
  },
};
