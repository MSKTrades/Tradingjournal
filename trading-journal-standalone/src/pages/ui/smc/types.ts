// Domain model for the Smart Money Concepts (SMC) Analysis feature, built
// around a standard ICT/SMC market-structure-hierarchy framework:
// market structure hierarchy (Orderflow/External -> Trend/Internal ->
// Sub-structure), liquidity dynamics (ERL vs IRL: EQH/EQL, FVGs,
// inducement), and Premium/Discount arrays (50% equilibrium on the active
// dealing range). Every type here is what the detection engine in
// marketStructure.ts produces and what strategyModels.ts/markupGrading.ts
// consume - kept in one place so the "what does the app actually think is
// happening on this chart" shape is defined once.
//
// IMPORTANT HONESTY NOTE (also repeated in the README shipped with this
// feature): this is a best-effort, rules-based READING of price action, not
// a guarantee of what "real" smart money is doing. Swing detection, BOS/
// CHoCH labeling, OB/FVG marking, and the six strategy checklists below all
// encode specific, documented interpretations of ICT/SMC concepts that a
// human trader would apply with more nuance and context than a fixed
// algorithm ever can. Treat every entry/SL/TP this feature suggests as a
// second opinion to check your own read against, never as a signal to
// blindly execute - especially with real prop-firm capital on the line.

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

// Ordered fine -> coarse. '1w' is never fetched directly (dukascopy-node has
// no native weekly granularity - only up to d1/mn1, see marketStructure.ts's
// resampleWeekly) - it's always derived client/server-side from '1d'.
export const SMC_TIMEFRAMES = ['1w', '1d', '4h', '1h', '15m', '5m', '1m'] as const;
export type SmcTimeframe = typeof SMC_TIMEFRAMES[number];

export const SMC_TIMEFRAME_LABELS: Record<SmcTimeframe, string> = {
  '1w': 'Weekly', '1d': 'Daily', '4h': '4H', '1h': '1H', '15m': '15M', '5m': '5M', '1m': '1M',
};

export type SwingKind = 'high' | 'low';

export type SwingPoint = {
  index: number;        // index into the candle array this was detected from
  time: number;
  price: number;
  kind: SwingKind;
  // Structure label relative to the previous swing of the SAME kind - only
  // set once there's a prior swing of that kind to compare against.
  label: 'HH' | 'HL' | 'LH' | 'LL' | null;
};

export type StructureEventType = 'BOS' | 'CHoCH';
export type Direction = 'bullish' | 'bearish';

export type StructureEvent = {
  type: StructureEventType;
  direction: Direction;   // direction of the break (bullish = broke up through resistance)
  time: number;           // time of the candle whose CLOSE produced the break
  price: number;          // the close that produced it
  brokenLevel: number;    // the swing price that was broken
  brokenSwingTime: number; // time of the swing point that got broken (= the invalidation reference for SL placement)
};

export type OrderBlock = {
  id: string;
  direction: Direction;   // 'bullish' = demand (buy) OB, 'bearish' = supply (sell) OB
  time: number;           // time of the OB candle itself
  high: number;
  low: number;
  open: number;
  close: number;
  causedBy: StructureEventType; // the break this OB is responsible for
  causedByTime: number;         // time of that break, so "formed after event X" checks are possible
  mitigated: boolean;           // has price traded back into [low, high] since forming
  mitigatedAt: number | null;
};

export type FVG = {
  id: string;
  direction: Direction;   // 'bullish' = gap up (support), 'bearish' = gap down (resistance)
  time: number;           // time of the middle candle (the one that "caused" the gap)
  top: number;
  bottom: number;
  filled: boolean;        // has price fully traded back through [bottom, top]
  filledAt: number | null;
};

export type LiquidityLevel = {
  kind: 'EQH' | 'EQL';
  price: number;          // average price of the equal highs/lows forming this pool
  touches: number[];      // times of the swings that make up this pool
  swept: boolean;         // has price since traded through it
  sweptAt: number | null;
};

export type RangeInfo = {
  high: number;
  low: number;
  eq: number;              // 50% equilibrium
  highTime: number;
  lowTime: number;
};

export type PdPosition = 'premium' | 'discount' | 'equilibrium';

export type TimeframeAnalysis = {
  tf: SmcTimeframe;
  candles: Candle[];
  swings: SwingPoint[];
  structureEvents: StructureEvent[];
  trend: Direction | 'unknown';
  range: RangeInfo | null;
  position: PdPosition | null; // where the LAST close sits relative to `range`
  orderBlocks: OrderBlock[];
  fvgs: FVG[];
  liquidity: { eqHighs: LiquidityLevel[]; eqLows: LiquidityLevel[] };
  lastClose: number | null;
  lastTime: number | null;
};

export type MultiTfAnalysis = Partial<Record<SmcTimeframe, TimeframeAnalysis>> & { pair: string };

export type RuleCheck = {
  id: string;
  label: string;
  // true = met, false = not met, null = can't be evaluated yet (waiting on a
  // later step that depends on an earlier one that hasn't happened).
  pass: boolean | null;
  detail: string;
};

export type TradeSetup = {
  direction: Direction;
  entry: number;
  sl: number;
  tp: number;    // first partial target
  tp2: number | null;
  rr: number;    // risk:reward of `tp` vs `entry`/`sl`
  note: string;
};

export const STRATEGY_MODEL_KEYS = [
  'pro_trend_m15_m1',
  'session_liquidity_sweep',
  'candle2_sweep',
  'structural_pullback',
  'inducement_sweep',
  'htf_continuation',
] as const;
export type StrategyModelKey = typeof STRATEGY_MODEL_KEYS[number];

export type StrategyEvaluation = {
  modelKey: StrategyModelKey;
  modelName: string;
  rules: RuleCheck[];
  status: 'valid' | 'invalid' | 'partial'; // valid = every rule passed; partial = some pending (null), none failed
  setup: TradeSetup | null;
  summary: string;
};

// A user-drawn markup: their own idea of an entry/SL/TP for a given pair,
// optionally against a specific model, which gets graded against that
// model's rule checklist (see markupGrading.ts) the same way a live scan
// would be. `points` holds any freeform drawing shapes (rectangles/lines
// the user drew to mark their own OB/FVG/range read) purely for their own
// visual reference on the chart - grading itself is driven off the
// entry/sl/tp/direction/timeframe/model fields, not off shape geometry.
export type SmcMarkup = {
  id: number | string;
  pair: string;
  timeframe: SmcTimeframe;
  model_key: StrategyModelKey | null;
  direction: Direction;
  entry_price: number;
  sl_price: number;
  tp_price: number;
  entry_time: string | null; // ISO - when in the visible history this entry would have triggered; null = "right now"
  points: { time: number; price: number }[]; // freeform drawing shapes, same shape as ChartDrawing.points
  notes: string;
  grade: StrategyEvaluation | null;
  created_at: string;
};

// A pasted/uploaded chart screenshot for a given pair+timeframe, paired with
// an AI vision read of it (see resource=smc_chart_analyze in
// api/backtest.ts). This is deliberately separate from SmcMarkup above:
// SmcMarkup is a precise entry/SL/TP idea graded against a model's exact
// rules using real candle data; a chart image markup is a much fuzzier
// "here's a picture, what do you make of it" second opinion that can never
// be as numerically precise as the live-data path, and is presented that way
// in the UI.
export type SmcChartAnalysis = {
  visual_read: string;
  cross_check: string;
  possible_bias: 'bullish' | 'bearish' | 'neutral' | 'unclear';
  confidence: 'low' | 'medium' | 'high';
  caveats: string;
};

export type SmcChartMarkup = {
  id: number | string;
  pair: string;
  timeframe: SmcTimeframe;
  image_url: string;
  live_context: any;
  analysis: SmcChartAnalysis | null;
  raw_response: string | null;
  created_at: string;
};
