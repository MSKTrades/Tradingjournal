import { MultiTfAnalysis, StrategyEvaluation, StrategyModelKey, Direction, RuleCheck, SmcTimeframe, SMC_TIMEFRAME_LABELS } from './types';
import { truncateBundle } from './strategyHelpers';
import { evaluateStrategy, STRATEGY_MODEL_NAMES } from './strategyModels';

// Grades a user's own manually-drawn entry/SL/TP idea against one of the six
// strategy models' rule checklist - this is the "if my markup doesn't fit a
// strategy's rules, show me which rules it doesn't meet and why" feature.
//
// The approach: reuse the EXACT same rule-evaluation functions a live scan
// uses (strategyModels.ts), fed a bundle truncated to what the market
// actually looked like at (or before) the markup's stated entry time - this
// is what avoids grading a past idea with hindsight the trader didn't have
// at the time (lookahead bias). Those rules cover "does the market context
// satisfy this model's setup conditions" (M15 direction, POI existing,
// sweep happened, LTF confirmation, etc). On top of that, a handful of
// markup-specific checks compare the trader's OWN stated entry/SL/TP
// against what that context implies (correct side of the PD range, SL/TP on
// the correct side of entry, and - when the model reached a valid setup of
// its own - alignment with the model's own suggested direction).

export type MarkupInput = {
  model_key: StrategyModelKey;
  timeframe: SmcTimeframe;
  direction: Direction;
  entry_price: number;
  sl_price: number;
  tp_price: number;
  entry_time: string | null; // ISO, or null meaning "as of the most recent candle"
};

function latestKnownTime(bundle: MultiTfAnalysis, tf: SmcTimeframe): number | null {
  const tfa = bundle[tf];
  if (tfa?.lastTime != null) return tfa.lastTime;
  for (const key of Object.keys(bundle) as SmcTimeframe[]) {
    const t = bundle[key]?.lastTime;
    if (t != null) return t;
  }
  return null;
}

export function gradeMarkup(bundle: MultiTfAnalysis, markup: MarkupInput): StrategyEvaluation {
  const asOf = markup.entry_time ? Math.floor(new Date(markup.entry_time).getTime() / 1000) : latestKnownTime(bundle, markup.timeframe);
  const truncated = asOf != null ? truncateBundle(bundle, asOf) : bundle;
  const modelEval = evaluateStrategy(markup.model_key, truncated);

  // The model's own checklist, relabeled so it's clear in the combined list
  // that these describe MARKET CONTEXT, not the markup itself.
  const contextRules: RuleCheck[] = modelEval.rules.map(r => ({ ...r, id: `context-${r.id}`, label: `[Model context] ${r.label}` }));

  const markupRules: RuleCheck[] = [];

  if (modelEval.setup) {
    const matches = modelEval.setup.direction === markup.direction;
    markupRules.push({
      id: 'direction-match', label: 'Your marked direction matches a currently-valid setup from this model',
      pass: matches, detail: matches ? 'Matches the model\'s own live setup direction.' : `The model's own current setup is ${modelEval.setup.direction}, but you marked ${markup.direction}.`,
    });
  } else {
    markupRules.push({
      id: 'direction-match', label: 'A fully valid setup exists for this model right now',
      pass: false, detail: `The model context isn't fully satisfied yet (see [Model context] rules above) — grading your entry/SL/TP against what IS known so far.`,
    });
  }

  const longOk = markup.direction === 'bullish';
  const slOnRightSide = longOk ? markup.sl_price < markup.entry_price : markup.sl_price > markup.entry_price;
  markupRules.push({
    id: 'sl-side', label: 'SL sits on the correct (losing) side of your entry',
    pass: slOnRightSide, detail: slOnRightSide ? 'SL is correctly placed.' : `For a ${markup.direction} trade, SL should be ${longOk ? 'below' : 'above'} entry.`,
  });

  const tpOnRightSide = longOk ? markup.tp_price > markup.entry_price : markup.tp_price < markup.entry_price;
  markupRules.push({
    id: 'tp-side', label: 'TP sits on the correct (winning) side of your entry',
    pass: tpOnRightSide, detail: tpOnRightSide ? 'TP is correctly placed.' : `For a ${markup.direction} trade, TP should be ${longOk ? 'above' : 'below'} entry.`,
  });

  const risk = Math.abs(markup.entry_price - markup.sl_price);
  const reward = Math.abs(markup.tp_price - markup.entry_price);
  const rr = risk > 0 ? reward / risk : 0;
  markupRules.push({
    id: 'risk-reward', label: 'Risk:Reward is at least 1:2',
    pass: risk > 0 ? rr >= 2 : false, detail: risk > 0 ? `Marked RR is ${rr.toFixed(2)}R.` : 'Entry and SL are the same price — risk is zero, RR is undefined.',
  });

  const tfa = truncated[markup.timeframe];
  let entryRulePass: boolean | null = null;
  let entryDetail = 'No range data available on this timeframe at that time.';
  if (tfa?.range) {
    const entryPd = markup.entry_price > tfa.range.eq ? 'premium' : markup.entry_price < tfa.range.eq ? 'discount' : 'equilibrium';
    const wantSide = longOk ? 'discount' : 'premium';
    entryRulePass = entryPd === wantSide || entryPd === 'equilibrium';
    entryDetail = `Entry is in ${entryPd} (${SMC_TIMEFRAME_LABELS[markup.timeframe]} range ${tfa.range.low.toFixed(5)}–${tfa.range.high.toFixed(5)}, EQ ${tfa.range.eq.toFixed(5)}).`;
  }
  markupRules.push({
    id: 'entry-pd', label: `Entry sits in the correct Premium/Discount side (discount for longs, premium for shorts)`,
    pass: entryRulePass, detail: entryDetail,
  });

  const rules = [...contextRules, ...markupRules];
  const anyFail = rules.some(r => r.pass === false);
  const anyPending = rules.some(r => r.pass === null);
  const status: StrategyEvaluation['status'] = anyFail ? 'invalid' : anyPending ? 'partial' : 'valid';

  let summary: string;
  if (status === 'valid') {
    summary = `Your markup fits every rule of ${STRATEGY_MODEL_NAMES[markup.model_key]}, marked RR ${rr.toFixed(2)}.`;
  } else if (status === 'invalid') {
    const failed = rules.filter(r => r.pass === false);
    summary = `${failed.length} rule${failed.length === 1 ? '' : 's'} not met: ${failed.map(r => r.label.replace('[Model context] ', '')).join('; ')}.`;
  } else {
    const pending = rules.filter(r => r.pass === null);
    summary = `Can't fully confirm yet — still waiting on: ${pending.map(r => r.label.replace('[Model context] ', '')).join('; ')}.`;
  }

  return { modelKey: markup.model_key, modelName: STRATEGY_MODEL_NAMES[markup.model_key], rules, status, setup: null, summary };
}
