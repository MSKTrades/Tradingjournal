import {
  MultiTfAnalysis, Direction, RuleCheck, StrategyEvaluation, StrategyModelKey, STRATEGY_MODEL_KEYS, TradeSetup, SwingPoint,
} from './types';
import {
  Zone, zonesFor, latestPoiInPd, zoneTappedSince, firstStructureEventAfter, zoneFormedAfter,
  invalidationSwing, slBuffer, buildSetup, isLondonOrNySession, asianRange,
} from './strategyHelpers';

// The six execution models exactly as specified, each turned into a rule
// checklist evaluated against the live multi-timeframe analysis bundle.
// Every model's checklist is ALWAYS returned at full length (padRules fills
// in any step that couldn't be reached yet as "pending") - this is what
// lets the UI (and markupGrading.ts, which reuses these same functions)
// show exactly which specific rule a setup does or doesn't satisfy, per the
// requirement that a markup that doesn't fit a model shows which rules
// weren't met.
//
// Convention used throughout for picking a limit-entry price inside a
// zone: bullish (long) entries sit at the LOW edge of the zone (the more
// conservative/better fill), bearish (short) entries at the HIGH edge -
// i.e. "buy the dip into the zone, sell the rip into the zone", not the far
// edge. SL is placed just beyond the relevant invalidation swing (or the
// far edge of the entry zone when no swing is available yet), with a small
// price-scaled buffer (see slBuffer in strategyHelpers.ts).

function fmtTime(t: number): string {
  return new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

type RuleDef = { id: string; label: string };

const CANON: Record<StrategyModelKey, RuleDef[]> = {
  pro_trend_m15_m1: [
    { id: 'm15-direction', label: 'M15 orderflow direction confirmed (HH/HL or LH/LL)' },
    { id: 'poi', label: 'Valid 15M POI (Order Block or FVG) in discount/premium' },
    { id: 'tap', label: 'Liquidity swept / 15M POI tapped' },
    { id: 'm1-choch', label: 'M1 CHoCH / CISD after the tap' },
    { id: 'entry-zone', label: 'M1/M3 Order Block or FVG formed after the CHoCH' },
  ],
  session_liquidity_sweep: [
    { id: 'asian-range', label: 'Asian session High/Low marked' },
    { id: 'london-open', label: 'London session open window reached (07:00-09:00 UTC)' },
    { id: 'sweep', label: 'Price purges Asian High or Low' },
    { id: 'htf-poi', label: 'Sweep runs into an HTF (1H/4H) POI' },
    { id: 'm1-confirm', label: 'M1 CHoCH or candle close back inside the range' },
    { id: 'entry-zone', label: 'Return to the local displacement FVG/OB from the reversal move' },
  ],
  candle2_sweep: [
    { id: 'c1-poi', label: 'Candle 1 approaches an institutional POI (FVG/OB)' },
    { id: 'c2-sweep', label: "Candle 2 purges Candle 1's high/low and closes back inside" },
    { id: 'c3-displacement', label: "Candle 3 displaces aggressively, closing past Candle 2's extreme (CISD)" },
    { id: 'entry', label: 'Limit order at the newly created 15M FVG or Breaker Block' },
  ],
  structural_pullback: [
    { id: 'range', label: '0.5 Equilibrium Fib mapped on the active 1H expansion leg' },
    { id: 'pd-filter', label: 'Retrace stays on the correct side (longs in discount, shorts in premium)' },
    { id: 'displacement', label: 'Displacement: thick-bodied 15M candle closes beyond minor swing structure (CISD)' },
    { id: 'entry', label: 'Entry at the top/bottom of the newly printed FVG' },
  ],
  inducement_sweep: [
    { id: 'htf-poi', label: 'An HTF (1H/4H) zone exists to trade toward' },
    { id: 'idm', label: 'Minor internal high/low (inducement) identified just before the HTF zone' },
    { id: 'idm-sweep', label: 'Inducement swept before price reaches the true HTF POI' },
    { id: 'shift', label: 'LTF (M1/M3) structural break confirms the shift' },
    { id: 'entry', label: 'Entry on mitigation of the breaker block / zone responsible for the shift' },
  ],
  htf_continuation: [
    { id: 'daily-bias', label: 'Daily orderflow shows a strong directional bias' },
    { id: 'invalidation-filter', label: "Price hasn't retraced past 50% of the prior day's expansion leg" },
    { id: 'session', label: 'Currently in the London/NY execution window' },
    { id: 'sweep', label: 'Minor liquidity sweep on 15M before continuation' },
    { id: 'entry-trigger', label: 'Pro-trend continuation entry after the sweep' },
    { id: 'entry-zone', label: 'Entry at the 15M OB/FVG formed by the continuation break' },
  ],
};

export const STRATEGY_MODEL_NAMES: Record<StrategyModelKey, string> = {
  pro_trend_m15_m1: 'Pro-Trend M15/M1 Execution',
  session_liquidity_sweep: 'Session Liquidity Sweep (London Reversal)',
  candle2_sweep: 'Candle-2 Liquidity Sweep (3-Candle Fractal)',
  structural_pullback: 'Structural Pullback / Retracement Model',
  inducement_sweep: 'Inducement & Sweep Model',
  htf_continuation: 'High-Timeframe Continuation Model',
};

function padRules(rules: RuleCheck[], canonical: RuleDef[]): RuleCheck[] {
  const have = new Set(rules.map(r => r.id));
  const padded = [...rules];
  for (const c of canonical) {
    if (!have.has(c.id)) padded.push({ id: c.id, label: c.label, pass: null, detail: 'Not yet evaluated — depends on an earlier step in this model that has not happened yet.' });
  }
  return padded;
}

function finalize(modelKey: StrategyModelKey, rules: RuleCheck[], setup: TradeSetup | null = null): StrategyEvaluation {
  const modelName = STRATEGY_MODEL_NAMES[modelKey];
  const padded = padRules(rules, CANON[modelKey]);
  const anyFail = padded.some(r => r.pass === false);
  const anyPending = padded.some(r => r.pass === null);
  const status: StrategyEvaluation['status'] = anyFail ? 'invalid' : anyPending ? 'partial' : 'valid';
  let summary: string;
  if (status === 'valid' && setup) {
    summary = `${setup.direction === 'bullish' ? 'Long' : 'Short'} setup ready — entry ${setup.entry.toFixed(5)}, SL ${setup.sl.toFixed(5)}, TP ${setup.tp.toFixed(5)} (${setup.rr}R).`;
  } else if (status === 'invalid') {
    const f = padded.find(r => r.pass === false);
    summary = `Not valid right now: "${f?.label}" — ${f?.detail ?? ''}`;
  } else {
    const p = padded.find(r => r.pass === null);
    summary = `Setup still forming — waiting on "${p?.label}".`;
  }
  return { modelKey, modelName, rules: padded, status, setup: status === 'valid' ? setup : null, summary };
}

function notEnoughData(modelKey: StrategyModelKey, message: string): StrategyEvaluation {
  const rules = CANON[modelKey].map(c => ({ id: c.id, label: c.label, pass: null as boolean | null, detail: 'Insufficient candle data for this timeframe.' }));
  return { modelKey, modelName: STRATEGY_MODEL_NAMES[modelKey], rules, status: 'partial', setup: null, summary: message };
}

function entryFromZone(direction: Direction, zone: { high: number; low: number }): number {
  return direction === 'bullish' ? zone.low : zone.high;
}

// --- Model 1: Pro-Trend M15/M1 Execution -----------------------------------
function evaluateProTrendM15M1(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'pro_trend_m15_m1';
  const tf15 = bundle['15m'], tf1 = bundle['1m'];
  if (!tf15 || !tf1) return notEnoughData(key, 'Needs 15M and 1M candle data.');
  const rules: RuleCheck[] = [];

  const direction = tf15.trend;
  rules.push({ id: 'm15-direction', label: CANON[key][0].label, pass: direction !== 'unknown', detail: direction !== 'unknown' ? `15M trend is ${direction}.` : '15M structure has no confirmed trend yet.' });
  if (direction === 'unknown') return finalize(key, rules);

  const poi = latestPoiInPd(tf15, direction);
  rules.push({ id: 'poi', label: CANON[key][1].label, pass: !!poi, detail: poi ? `${poi.kind} ${direction} zone at ${poi.low.toFixed(5)}–${poi.high.toFixed(5)}.` : 'No unmitigated 15M OB/FVG sits on the correct side of the 15M equilibrium.' });
  if (!poi) return finalize(key, rules);

  const tapped = zoneTappedSince(tf15.candles, poi, poi.time);
  rules.push({ id: 'tap', label: CANON[key][2].label, pass: tapped, detail: tapped ? 'Price has traded into the POI zone.' : 'Price has not returned into the POI zone yet.' });
  if (!tapped) return finalize(key, rules);

  const choch = firstStructureEventAfter(tf1, poi.time, 'CHoCH', direction);
  rules.push({ id: 'm1-choch', label: CANON[key][3].label, pass: choch ? true : null, detail: choch ? `1M CHoCH confirmed at ${fmtTime(choch.time)}.` : 'Waiting for a 1M change of character after the tap.' });
  if (!choch) return finalize(key, rules);

  const entryZone = zoneFormedAfter(tf1, choch.time, direction);
  rules.push({ id: 'entry-zone', label: CANON[key][4].label, pass: entryZone ? true : null, detail: entryZone ? `Entry zone ${entryZone.low.toFixed(5)}–${entryZone.high.toFixed(5)}.` : 'No fresh 1M OB/FVG has printed yet after the CHoCH.' });
  if (!entryZone) return finalize(key, rules);

  const entry = entryFromZone(direction, entryZone);
  const invalidation = invalidationSwing(tf1, choch.time, direction === 'bullish' ? 'low' : 'high');
  const sl = invalidation
    ? (direction === 'bullish' ? invalidation.price - slBuffer(invalidation.price) : invalidation.price + slBuffer(invalidation.price))
    : (direction === 'bullish' ? entryZone.low - slBuffer(entryZone.low) : entryZone.high + slBuffer(entryZone.high));
  const setup = buildSetup(direction, entry, sl, 3, 5, 'Partial at 3R–5R, trail the runner toward weak structural highs/lows.');
  return finalize(key, rules, setup);
}

// --- Model 2: Session Liquidity Sweep (London Reversal) --------------------
function evaluateSessionLiquiditySweep(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'session_liquidity_sweep';
  const tf15 = bundle['15m'], tf1 = bundle['1m'];
  const tfHtf = bundle['1h'] ?? bundle['4h'];
  if (!tf15 || !tf1) return notEnoughData(key, 'Needs 15M and 1M candle data.');
  const rules: RuleCheck[] = [];
  const asOf = tf15.lastTime ?? tf15.candles[tf15.candles.length - 1]?.time;

  const asian = asOf != null ? asianRange(tf15.candles, asOf) : null;
  rules.push({ id: 'asian-range', label: CANON[key][0].label, pass: !!asian, detail: asian ? `Asian range ${asian.low.toFixed(5)}–${asian.high.toFixed(5)}.` : 'Not enough 15M data yet to mark today\'s Asian session range.' });
  if (!asian) return finalize(key, rules);

  const windowCandles = tf15.candles.filter(c => c.time >= asian.dayStart + 7 * 3600);
  const londonOpenReached = windowCandles.length > 0;
  rules.push({ id: 'london-open', label: CANON[key][1].label, pass: londonOpenReached, detail: londonOpenReached ? 'London session data is present.' : 'Waiting for the London open window.' });
  if (!londonOpenReached) return finalize(key, rules);

  const highBreaches = windowCandles.filter(c => c.high > asian.high).map(c => c.time);
  const lowBreaches = windowCandles.filter(c => c.low < asian.low).map(c => c.time);
  const lastHighBreach = highBreaches.length ? Math.max(...highBreaches) : -Infinity;
  const lastLowBreach = lowBreaches.length ? Math.max(...lowBreaches) : -Infinity;
  let direction: Direction | null = null, sweepTime: number | null = null;
  if (lastHighBreach > -Infinity || lastLowBreach > -Infinity) {
    if (lastHighBreach > lastLowBreach) { direction = 'bearish'; sweepTime = lastHighBreach; }
    else { direction = 'bullish'; sweepTime = lastLowBreach; }
  }
  rules.push({ id: 'sweep', label: CANON[key][2].label, pass: !!direction, detail: direction ? `${direction === 'bearish' ? 'Asian High' : 'Asian Low'} swept at ${fmtTime(sweepTime!)}.` : 'Neither the Asian High nor Low has been purged yet.' });
  if (!direction || sweepTime == null) return finalize(key, rules);

  let htfTouch: boolean | null = null;
  if (tfHtf) {
    const sweepCandle = windowCandles.find(c => c.time === sweepTime);
    const zones = zonesFor(tfHtf, direction).filter(z => !z.resolved);
    htfTouch = !!sweepCandle && zones.some(z => sweepCandle.low <= z.high && sweepCandle.high >= z.low);
  }
  rules.push({ id: 'htf-poi', label: CANON[key][3].label, pass: htfTouch, detail: htfTouch == null ? 'No HTF (1H/4H) data available to confirm.' : (htfTouch ? 'Sweep candle overlapped an unmitigated HTF POI.' : 'The sweep did not run into an HTF OB/FVG.') });
  if (htfTouch !== true) return finalize(key, rules);

  const choch = firstStructureEventAfter(tf1, sweepTime, 'CHoCH', direction);
  const closedBackInside = tf1.candles.some(c => c.time > sweepTime! && (direction === 'bearish' ? c.close < asian.high : c.close > asian.low));
  const confirmed = !!choch || closedBackInside;
  rules.push({ id: 'm1-confirm', label: CANON[key][4].label, pass: confirmed ? true : null, detail: confirmed ? (choch ? `1M CHoCH at ${fmtTime(choch.time)}.` : 'A candle has closed back inside the Asian range.') : 'Waiting for confirmation on the 1M chart.' });
  if (!confirmed) return finalize(key, rules);

  const anchorTime = choch ? choch.time : sweepTime;
  const entryZone = zoneFormedAfter(tf1, anchorTime, direction);
  rules.push({ id: 'entry-zone', label: CANON[key][5].label, pass: entryZone ? true : null, detail: entryZone ? `Entry zone ${entryZone.low.toFixed(5)}–${entryZone.high.toFixed(5)}.` : 'No fresh 1M displacement FVG/OB has printed yet.' });
  if (!entryZone) return finalize(key, rules);

  const entry = entryFromZone(direction, entryZone);
  const swept = direction === 'bullish' ? asian.low : asian.high;
  const sl = direction === 'bullish' ? swept - slBuffer(swept) : swept + slBuffer(swept);
  const setup = buildSetup(direction, entry, sl, 2, 4, 'London Reversal: partial at 2R, runner to 4R.');
  return finalize(key, rules, setup);
}

// --- Model 3: Candle-2 Liquidity Sweep (3-Candle Fractal) -------------------
function evaluateCandle2Sweep(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'candle2_sweep';
  const tf15 = bundle['15m'];
  if (!tf15) return notEnoughData(key, 'Needs 15M candle data.');
  const rules: RuleCheck[] = [];
  const candles = tf15.candles;
  const allZones = [...zonesFor(tf15, 'bullish'), ...zonesFor(tf15, 'bearish')].filter(z => !z.resolved);

  let found: { c1: typeof candles[number]; c2: typeof candles[number]; c3: typeof candles[number]; direction: Direction; zone: Zone } | null = null;
  const scanFloor = Math.max(0, candles.length - 60);
  for (let i = candles.length - 3; i >= scanFloor; i--) {
    const c1 = candles[i], c2 = candles[i + 1], c3 = candles[i + 2];
    const touchedZone = allZones.find(z => z.time <= c1.time && c1.low <= z.high && c1.high >= z.low);
    if (!touchedZone) continue;
    const sweptHigh = c2.high > c1.high && c2.close < c1.high;
    const sweptLow = c2.low < c1.low && c2.close > c1.low;
    if (sweptHigh && c3.close < c2.low) { found = { c1, c2, c3, direction: 'bearish', zone: touchedZone }; break; }
    if (sweptLow && c3.close > c2.high) { found = { c1, c2, c3, direction: 'bullish', zone: touchedZone }; break; }
  }

  rules.push({ id: 'c1-poi', label: CANON[key][0].label, pass: found ? true : (allZones.length ? false : null), detail: found ? `Candle 1 at ${fmtTime(found.c1.time)} tagged a ${found.zone.kind} zone.` : (allZones.length ? 'No recent candle has tagged an unresolved 15M POI with a full 3-candle follow-through.' : 'No unresolved 15M OB/FVG zones detected yet.') });
  if (!found) return finalize(key, rules);

  rules.push({ id: 'c2-sweep', label: CANON[key][1].label, pass: true, detail: `Candle 2 at ${fmtTime(found.c2.time)} swept Candle 1's extreme and closed back inside.` });
  rules.push({ id: 'c3-displacement', label: CANON[key][2].label, pass: true, detail: `Candle 3 at ${fmtTime(found.c3.time)} displaced ${found.direction}, confirming CISD.` });

  const detectedZone = zoneFormedAfter(tf15, found.c2.time, found.direction);
  const zoneHigh = detectedZone ? detectedZone.high : Math.max(found.c1.high, found.c3.high);
  const zoneLow = detectedZone ? detectedZone.low : Math.min(found.c1.low, found.c3.low);
  rules.push({ id: 'entry', label: CANON[key][3].label, pass: true, detail: `Entry zone ${zoneLow.toFixed(5)}–${zoneHigh.toFixed(5)}.` });

  const entry = entryFromZone(found.direction, { high: zoneHigh, low: zoneLow });
  const sl = found.direction === 'bullish' ? found.c2.low - slBuffer(found.c2.low) : found.c2.high + slBuffer(found.c2.high);
  const setup = buildSetup(found.direction, entry, sl, 2, 4, "Candle-2 Sweep: SL just beyond Candle 2's sweep wick.");
  return finalize(key, rules, setup);
}

// --- Model 4: Structural Pullback / Retracement Model -----------------------
function evaluateStructuralPullback(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'structural_pullback';
  const tf1h = bundle['1h'], tf15 = bundle['15m'];
  if (!tf1h || !tf15) return notEnoughData(key, 'Needs 1H and 15M candle data.');
  const rules: RuleCheck[] = [];

  rules.push({ id: 'range', label: CANON[key][0].label, pass: !!tf1h.range, detail: tf1h.range ? `1H range ${tf1h.range.low.toFixed(5)}–${tf1h.range.high.toFixed(5)}, EQ ${tf1h.range.eq.toFixed(5)}.` : 'Not enough 1H structure yet to define a working range.' });
  if (!tf1h.range) return finalize(key, rules);

  const direction = tf1h.trend;
  const onCorrectSide = direction === 'unknown' ? null : (direction === 'bullish' ? tf1h.position === 'discount' : tf1h.position === 'premium');
  rules.push({ id: 'pd-filter', label: CANON[key][1].label, pass: onCorrectSide, detail: direction === 'unknown' ? 'No confirmed 1H trend yet.' : `1H trend is ${direction}; price is currently in ${tf1h.position}.` });
  if (direction === 'unknown' || onCorrectSide !== true) return finalize(key, rules);

  const anchor = direction === 'bullish' ? tf1h.range.lowTime : tf1h.range.highTime;
  const disp = tf15.structureEvents.find(e => e.time > anchor && e.direction === direction) ?? null;
  rules.push({ id: 'displacement', label: CANON[key][2].label, pass: disp ? true : null, detail: disp ? `15M ${disp.type} confirmed at ${fmtTime(disp.time)}.` : 'Waiting for a 15M structural break in the pullback-completion direction.' });
  if (!disp) return finalize(key, rules);

  const entryZone = zoneFormedAfter(tf15, disp.time, direction);
  rules.push({ id: 'entry', label: CANON[key][3].label, pass: entryZone ? true : null, detail: entryZone ? `FVG entry zone ${entryZone.low.toFixed(5)}–${entryZone.high.toFixed(5)}.` : 'No fresh FVG has printed yet after the displacement.' });
  if (!entryZone) return finalize(key, rules);

  const entry = entryFromZone(direction, entryZone);
  const invalidation = invalidationSwing(tf15, disp.time, direction === 'bullish' ? 'low' : 'high');
  const sl = invalidation
    ? (direction === 'bullish' ? invalidation.price - slBuffer(invalidation.price) : invalidation.price + slBuffer(invalidation.price))
    : (direction === 'bullish' ? entryZone.low - slBuffer(entryZone.low) : entryZone.high + slBuffer(entryZone.high));
  const setup = buildSetup(direction, entry, sl, 3, 5, 'Structural pullback continuation entry.');
  return finalize(key, rules, setup);
}

// --- Model 5: Inducement & Sweep Model --------------------------------------
function evaluateInducementSweep(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'inducement_sweep';
  const tfHtf = bundle['1h'] ?? bundle['4h'];
  const tf15 = bundle['15m'], tf1 = bundle['1m'];
  if (!tfHtf || !tf15 || !tf1) return notEnoughData(key, 'Needs 1H/4H, 15M, and 1M candle data.');
  const rules: RuleCheck[] = [];

  const bullZone = latestPoiInPd(tfHtf, 'bullish');
  const bearZone = latestPoiInPd(tfHtf, 'bearish');
  let direction: Direction | null = null, htfZone: Zone | null = null;
  if (bullZone && (!bearZone || bullZone.time >= bearZone.time)) { direction = 'bullish'; htfZone = bullZone; }
  else if (bearZone) { direction = 'bearish'; htfZone = bearZone; }

  rules.push({ id: 'htf-poi', label: CANON[key][0].label, pass: !!htfZone, detail: htfZone ? `${htfZone.kind} ${direction} zone at ${htfZone.low.toFixed(5)}–${htfZone.high.toFixed(5)}.` : 'No unmitigated HTF POI on the correct side of the range yet.' });
  if (!htfZone || !direction) return finalize(key, rules);

  const minorKind = direction === 'bullish' ? 'low' : 'high';
  const idm = tf15.swings.filter(s => s.kind === minorKind && s.time >= htfZone!.time)[0] ?? null;
  rules.push({ id: 'idm', label: CANON[key][1].label, pass: idm ? true : null, detail: idm ? `Inducement swing at ${fmtTime(idm.time)} (${idm.price.toFixed(5)}).` : 'No minor swing has formed between here and the HTF POI yet.' });
  if (!idm) return finalize(key, rules);

  const sweptIdm = tf15.candles.some(c => c.time > idm.time && (minorKind === 'low' ? c.low < idm.price : c.high > idm.price));
  rules.push({ id: 'idm-sweep', label: CANON[key][2].label, pass: sweptIdm ? true : null, detail: sweptIdm ? 'The inducement swing has been swept.' : 'Waiting for the minor high/low to be taken out first.' });
  if (!sweptIdm) return finalize(key, rules);

  const choch = firstStructureEventAfter(tf1, idm.time, 'CHoCH', direction);
  rules.push({ id: 'shift', label: CANON[key][3].label, pass: choch ? true : null, detail: choch ? `1M CHoCH at ${fmtTime(choch.time)}.` : 'Waiting for a 1M change of character.' });
  if (!choch) return finalize(key, rules);

  const breaker = zoneFormedAfter(tf1, choch.time, direction);
  rules.push({ id: 'entry', label: CANON[key][4].label, pass: breaker ? true : null, detail: breaker ? `Breaker zone ${breaker.low.toFixed(5)}–${breaker.high.toFixed(5)}.` : 'No breaker block/zone has formed yet from the shift.' });
  if (!breaker) return finalize(key, rules);

  const entry = entryFromZone(direction, breaker);
  const invalidation = invalidationSwing(tf1, choch.time, direction === 'bullish' ? 'low' : 'high');
  const sl = invalidation
    ? (direction === 'bullish' ? invalidation.price - slBuffer(invalidation.price) : invalidation.price + slBuffer(invalidation.price))
    : (direction === 'bullish' ? breaker.low - slBuffer(breaker.low) : breaker.high + slBuffer(breaker.high));
  const setup = buildSetup(direction, entry, sl, 3, 5, 'Inducement & Sweep entry on breaker mitigation.');
  return finalize(key, rules, setup);
}

// --- Model 6: High-Timeframe Continuation Model -----------------------------
function evaluateHtfContinuation(bundle: MultiTfAnalysis): StrategyEvaluation {
  const key: StrategyModelKey = 'htf_continuation';
  const tf1d = bundle['1d'], tf15 = bundle['15m'];
  if (!tf1d || !tf15) return notEnoughData(key, 'Needs Daily and 15M candle data.');
  const rules: RuleCheck[] = [];

  const direction = tf1d.trend;
  rules.push({ id: 'daily-bias', label: CANON[key][0].label, pass: direction !== 'unknown', detail: direction !== 'unknown' ? `Daily trend is ${direction}.` : 'No confirmed daily trend yet.' });
  if (direction === 'unknown') return finalize(key, rules);

  const dailyCandles = tf1d.candles;
  const priorDay = dailyCandles.length >= 2 ? dailyCandles[dailyCandles.length - 2] : null;
  const priorEq = priorDay ? (priorDay.high + priorDay.low) / 2 : null;
  const lastClose = tf15.lastClose ?? tf1d.lastClose;
  const withinFilter = priorEq != null && lastClose != null ? (direction === 'bullish' ? lastClose > priorEq : lastClose < priorEq) : null;
  rules.push({ id: 'invalidation-filter', label: CANON[key][1].label, pass: withinFilter, detail: priorEq != null && lastClose != null ? `Prior day EQ ${priorEq.toFixed(5)}, last price ${lastClose.toFixed(5)}.` : 'Not enough daily history yet.' });
  if (withinFilter !== true) return finalize(key, rules);

  const inSession = tf15.lastTime != null ? isLondonOrNySession(tf15.lastTime) : null;
  rules.push({ id: 'session', label: CANON[key][2].label, pass: inSession, detail: inSession == null ? 'No 15M timestamp available.' : (inSession ? 'Within the London/NY session window.' : 'Outside the London/NY session window.') });
  if (inSession !== true) return finalize(key, rules);

  const minorKind = direction === 'bullish' ? 'low' : 'high';
  const recentSwings = tf15.swings.filter(s => s.kind === minorKind).slice(-3);
  let sweepEvent: SwingPoint | null = null;
  for (const s of recentSwings) {
    const swept = tf15.candles.some(c => c.time > s.time && (direction === 'bullish' ? c.low < s.price : c.high > s.price));
    if (swept) sweepEvent = s;
  }
  rules.push({ id: 'sweep', label: CANON[key][3].label, pass: sweepEvent ? true : null, detail: sweepEvent ? `Minor swing at ${fmtTime(sweepEvent.time)} swept.` : 'Waiting for a minor 15M liquidity sweep.' });
  if (!sweepEvent) return finalize(key, rules);

  const bos = firstStructureEventAfter(tf15, sweepEvent.time, 'BOS', direction) ?? firstStructureEventAfter(tf15, sweepEvent.time, 'CHoCH', direction);
  rules.push({ id: 'entry-trigger', label: CANON[key][4].label, pass: bos ? true : null, detail: bos ? `15M ${bos.type} confirms continuation at ${fmtTime(bos.time)}.` : 'Waiting for a 15M continuation break after the sweep.' });
  if (!bos) return finalize(key, rules);

  const entryZone = zoneFormedAfter(tf15, bos.time, direction);
  rules.push({ id: 'entry-zone', label: CANON[key][5].label, pass: entryZone ? true : null, detail: entryZone ? `Entry zone ${entryZone.low.toFixed(5)}–${entryZone.high.toFixed(5)}.` : 'No fresh 15M OB/FVG has printed yet.' });
  if (!entryZone) return finalize(key, rules);

  const entry = entryFromZone(direction, entryZone);
  const invalidation = invalidationSwing(tf15, bos.time, direction === 'bullish' ? 'low' : 'high');
  const sl = invalidation
    ? (direction === 'bullish' ? invalidation.price - slBuffer(invalidation.price) : invalidation.price + slBuffer(invalidation.price))
    : (direction === 'bullish' ? entryZone.low - slBuffer(entryZone.low) : entryZone.high + slBuffer(entryZone.high));
  const setup = buildSetup(direction, entry, sl, 3, 6, 'HTF continuation — trail with daily structure.');
  return finalize(key, rules, setup);
}

export function evaluateStrategy(modelKey: StrategyModelKey, bundle: MultiTfAnalysis): StrategyEvaluation {
  switch (modelKey) {
    case 'pro_trend_m15_m1': return evaluateProTrendM15M1(bundle);
    case 'session_liquidity_sweep': return evaluateSessionLiquiditySweep(bundle);
    case 'candle2_sweep': return evaluateCandle2Sweep(bundle);
    case 'structural_pullback': return evaluateStructuralPullback(bundle);
    case 'inducement_sweep': return evaluateInducementSweep(bundle);
    case 'htf_continuation': return evaluateHtfContinuation(bundle);
    default: throw new Error(`Unknown strategy model: ${modelKey}`);
  }
}

export function evaluateAllStrategies(bundle: MultiTfAnalysis): StrategyEvaluation[] {
  return STRATEGY_MODEL_KEYS.map(k => evaluateStrategy(k, bundle));
}
