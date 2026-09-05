// The full-app demo's fake backend. Every real page (Summary, Journal,
// Performance, Strategies, Checklists) goes through exactly one choke point
// for every network call - api.ts's request() - so intercepting requests
// there and answering them from an in-memory store, instead of real
// fetch()/Postgres, is enough to run the ENTIRE real app UI on fake data
// with zero changes to any of those pages. That's deliberate: it's the only
// way "an actual demo system with all the tabs and all features" doesn't
// mean maintaining a second, parallel copy of the UI that quietly drifts
// out of sync with the real one.
//
// Everything here lives in one module-level `store` object, created once
// when this module is first imported. There's no persistence (no
// localStorage, no server) on purpose - closing the tab or reloading throws
// the whole thing away and the next visit starts from the same seed data,
// exactly as asked ("once they close the browser, the trade gets deleted").
//
// A handful of calculations (recalcCapital, the /summary strategy-matching
// engine, the /trades/performance monthly/yearly/weekday/session
// aggregation) are ported as closely as practical from their real
// api/*.ts counterparts so the numbers a demo visitor sees behave the same
// way the real product's do - see the comment above each one for which real
// file it mirrors. Keep them in sync if the real formulas change; they're
// deliberately duplicated rather than imported since the real versions live
// in server-only files (api/_db.js etc.) that can't be pulled into a
// client bundle.
import type {
  Account, Trade, Strategy, Checklist, ChecklistItem, CustomColumn, Tag, TagGroup,
  TagGroupOption, LedgerEntry, Condition, StrategyResult, DailyRoutineNote, Timeframe, Instrument,
} from '../pages/data/types';
import { TAG_CONDITION_FIELD } from '../pages/data/types';
import { showDemoCapToast } from './demoToast';

// --- id generation ----------------------------------------------------
// Starts well above any real serial-PK range so a demo-created object's id
// never looks like it could collide with a real one if the two were ever
// compared (they never are - this store is fully isolated - but it costs
// nothing to make that obvious at a glance too).
let seq = 9_000_000;
function nextId(): number {
  return seq++;
}

// --- deterministic PRNG (mulberry32), same one RuleToggleDemo.tsx uses -
// keeps the seed data stable across renders/reloads within one tab instead
// of re-shuffling every time a component remounts.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// --- Error helper -------------------------------------------------------
// Every capped "add" action goes through this: fire the toast (guaranteed
// visible regardless of the calling page's own error handling - see
// demoToast.ts) AND throw, so pages that DO have inline error UI (Strategy/
// Trade dialogs) also show the message right where the click happened.
function capError(message: string): never {
  showDemoCapToast(message);
  throw new Error(message);
}

const SIGNUP_CTA = 'Sign up free to remove this limit.';

// =========================================================================
// Store shape + seed data
// =========================================================================

type Store = {
  account: Account;
  trades: Trade[];
  strategies: Strategy[];
  checklists: Checklist[];
  dailyRoutine: DailyRoutineNote[];
  customColumns: CustomColumn[];
  tags: Tag[];
  tagGroups: TagGroup[];
  timeframes: Timeframe[];
  instruments: Instrument[];
  ledger: LedgerEntry[];
  // How many NEW items a demo visitor has added in this tab, per category -
  // each capped at 1 (see ADD_CAPS below). Seed data doesn't count against
  // this; only things the visitor themselves adds do.
  added: Record<string, number>;
};

const ADD_CAPS: Record<string, number> = {
  trades: 1,
  strategies: 1,
  checklists: 1,
  checklistItems: 1,
  columns: 1,
  tagGroups: 1,
  tagGroupOptions: 1,
  timeframes: 1,
  instruments: 1,
  accounts: 0, // multi-account is a Pro feature even for real users - see proFeatures.ts
};

function capName(key: string): string {
  const names: Record<string, string> = {
    trades: 'trade', strategies: 'strategy playbook', checklists: 'checklist',
    checklistItems: 'checklist item', columns: 'custom field', tagGroups: 'tag group',
    tagGroupOptions: 'tag group option', timeframes: 'timeframe', instruments: 'trading pair', accounts: 'trading account',
  };
  return names[key] ?? key;
}

function checkAndConsumeCap(store: Store, key: string) {
  const cap = ADD_CAPS[key] ?? 0;
  const used = store.added[key] ?? 0;
  if (used >= cap) {
    const noun = capName(key);
    capError(
      cap === 0
        ? `Adding another ${noun} isn't available in the demo. ${SIGNUP_CTA}`
        : `The demo allows adding ${cap} new ${noun}${cap === 1 ? '' : 's'}. ${SIGNUP_CTA}`
    );
  }
  store.added[key] = used + 1;
}

// Small fixed palette so seeded/created tags and tag options get a
// consistent, readable set of colors instead of every one landing on the
// same default - cycles by index, same idea as most tag-color pickers in
// this app.
const TAG_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#ef4444'];
function colorForIndex(i: number): string {
  return TAG_COLORS[i % TAG_COLORS.length];
}

const HTF_BIAS_GROUP = 'HTF Bias';
const EXEC_MISTAKES_GROUP = 'Execution Mistakes';

function buildSeed(): Store {
  const accountId = nextId();
  const startingBalance = 10000;

  const account: Account = {
    id: accountId,
    name: 'London Reversal (Demo)',
    type: 'Demo',
    starting_balance: startingBalance,
    active: true,
    sort_order: 0,
    created_at: new Date(Date.now() - 95 * 86400000).toISOString(),
    daily_loss_limit_pct: 5,
    max_drawdown_limit_pct: 10,
    consistency_rule_pct: null,
    public_share_enabled: false,
    public_share_token: null,
    public_share_name: null,
    public_share_show_dollars: false,
  };

  const checklistId = nextId();
  const checklist: Checklist = {
    id: checklistId,
    name: 'London Reversal Pre-Trade',
    sort_order: 0,
    active: true,
    account_ids: [],
    items: [
      { id: nextId(), checklist_id: checklistId, text: 'Confirmed BOS on the 15m before entry', sort_order: 0, active: true },
      { id: nextId(), checklist_id: checklistId, text: 'Asia session liquidity swept', sort_order: 1, active: true },
      { id: nextId(), checklist_id: checklistId, text: 'Risking 1% or less', sort_order: 2, active: true },
      { id: nextId(), checklist_id: checklistId, text: 'Checked the economic calendar for red-folder news', sort_order: 3, active: true },
    ],
  };

  const strategy: Strategy = {
    id: nextId(),
    name: 'London Reversal',
    conditions: [{ field: 'rr', op: '>=', value: 0 }],
    days: [],
    time_start: '07:00',
    time_end: '11:00',
    tp1_rr: 3,
    tp2_rr: 5,
    split_percent: 50,
    active: true,
    sort_order: 0,
    account_ids: [],
    playbook_published: false,
    playbook_slug: null,
    playbook_title: null,
    playbook_description: null,
    playbook_published_at: null,
  };
  // time_end covers every hour the seed generator below can produce
  // (7am-2pm) - narrower and the "Best Strategy" stat on Summary reads as
  // if some sample trades don't even qualify for a demo strategy, which is
  // a confusing story to tell a first-time visitor. All three strategies
  // below share this same window.
  strategy.time_end = '15:00';

  // Two single-target variants of the same setup, evaluated at a different
  // take-profit distance than the two-target "London Reversal" above - same
  // qualifying trades (identical conditions/day/time), but buildSummary's
  // calcR() reads a different reached_1rX flag per target (reached_1r2 vs
  // reached_1r3), so their win rate and total R genuinely differ instead of
  // repeating the same numbers under a new name. Lets a demo visitor compare
  // "what if I banked profit at 1:2 instead of 1:3" the way the real
  // Strategies page is meant to be used for.
  const strategyTp2: Strategy = {
    ...strategy,
    id: nextId(),
    name: 'London Reversal TP 1:2',
    conditions: [...strategy.conditions],
    account_ids: [...strategy.account_ids],
    tp1_rr: 2,
    tp2_rr: null,
    split_percent: null,
    sort_order: 1,
  };
  const strategyTp3: Strategy = {
    ...strategy,
    id: nextId(),
    name: 'London Reversal TP 1:3',
    conditions: [...strategy.conditions],
    account_ids: [...strategy.account_ids],
    tp1_rr: 3,
    tp2_rr: null,
    split_percent: null,
    sort_order: 2,
  };

  const htfGroupId = nextId();
  const execGroupId = nextId();
  const tagGroups: TagGroup[] = [
    {
      id: htfGroupId, name: HTF_BIAS_GROUP, sort_order: 0, account_ids: [],
      options: [
        { id: nextId(), group_id: htfGroupId, name: 'Bullish', color: colorForIndex(2), sort_order: 0 },
        { id: nextId(), group_id: htfGroupId, name: 'Bearish', color: colorForIndex(7), sort_order: 1 },
        { id: nextId(), group_id: htfGroupId, name: 'Neutral', color: colorForIndex(1), sort_order: 2 },
      ],
    },
    {
      id: execGroupId, name: EXEC_MISTAKES_GROUP, sort_order: 1, account_ids: [],
      options: [
        { id: nextId(), group_id: execGroupId, name: 'Moved Stop Loss', color: colorForIndex(7), sort_order: 0 },
        { id: nextId(), group_id: execGroupId, name: 'Chased Entry', color: colorForIndex(4), sort_order: 1 },
        { id: nextId(), group_id: execGroupId, name: 'Sized Up on Revenge', color: colorForIndex(7), sort_order: 2 },
      ],
    },
  ];

  const tags: Tag[] = [
    { id: nextId(), name: 'A+ Setup', color: colorForIndex(2), sort_order: 0 },
    { id: nextId(), name: 'Revenge Trade', color: colorForIndex(7), sort_order: 1 },
  ];

  // --- seed trades ---------------------------------------------------
  // Same correlated-but-not-random generator RuleToggleDemo.tsx uses (BOS
  // confirmation, an Asia sweep, and the London session all genuinely raise
  // the odds of a winner; Monday hurts), extended here to fill in every
  // field the real Trade shape needs (position size, session, tags, an
  // occasional graded checklist, emotions, HTF bias/execution-mistake tag
  // selections) so every tab - Journal's table, Performance's breakdowns,
  // Summary's widgets - has something real-looking to show on first load,
  // not an empty state.
  const rand = mulberry32(20260214);
  const emotionsPool = ['Confident', 'Anxious', 'Patient', 'FOMO', 'Calm'];
  const sessions: Trade['session_in'][] = ['London', 'New York', 'Asia', 'London/NY Overlap'] as any;
  const rawTrades: any[] = [];
  // Always runs from ~13 weeks ago through TODAY - not a fixed calendar
  // range - so the demo never goes stale. This matters specifically for
  // Summary's Weekly Digest (WeeklyDigest.tsx): it only ever looks at the
  // CURRENT Mon-Sun week by default and renders nothing when that week has
  // no trades. A hardcoded past range (the old '2026-06-01' start, stopped
  // once 24 trades existed) drifted out of "this week" within a couple of
  // months and left the digest looking broken to anyone visiting later.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let cursor = new Date(today);
  cursor.setUTCDate(cursor.getUTCDate() - 13 * 7);
  let tradeNumber = 1;
  while (cursor.getTime() <= today.getTime()) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const tradesToday = rand() < 0.65 ? 1 : (rand() < 0.5 ? 0 : 2);
      for (let i = 0; i < tradesToday; i++) {
        const bos = rand() < 0.55;
        const asiaSwept = rand() < 0.45;
        const session = sessions[Math.floor(rand() * sessions.length)];
        let winProb = 0.40;
        if (bos) winProb += 0.18;
        if (asiaSwept) winProb += 0.10;
        if (session === 'London') winProb += 0.08;
        if (weekday === 1) winProb -= 0.16;
        winProb = Math.min(0.92, Math.max(0.06, winProb));
        const win = rand() < winProb;
        const direction = rand() < 0.5 ? 'Long' : 'Short';
        const dateStr = cursor.toISOString().slice(0, 10);
        const hour = 7 + Math.floor(rand() * 8);
        const minute = Math.floor(rand() * 6) * 10;
        const bias = rand() < 0.5 ? 'Bullish' : (rand() < 0.7 ? 'Bearish' : 'Neutral');
        const tagSelections: Record<string, string[]> = { [HTF_BIAS_GROUP]: [bias] };
        const flatTags: string[] = [];
        if (!win && rand() < 0.3) {
          const mistake = rand() < 0.5 ? 'Moved Stop Loss' : (rand() < 0.5 ? 'Chased Entry' : 'Sized Up on Revenge');
          tagSelections[EXEC_MISTAKES_GROUP] = [mistake];
          flatTags.push('Revenge Trade');
        } else if (win && rand() < 0.4) {
          flatTags.push('A+ Setup');
        }
        const gradeChecklist = rand() < 0.6;
        rawTrades.push({
          id: nextId(),
          account_id: accountId,
          trade_number: tradeNumber++,
          direction,
          entry_type: 'Market',
          tags: flatTags,
          tag_selections: tagSelections,
          liquidity_swept: asiaSwept ? 'Asia' : null,
          distance_from_asia: null,
          liquidity_swept_no: null,
          cisd_break: null,
          total_inverse_candles: null,
          inverse_candle_size: null,
          sl_pips: 15 + Math.round(rand() * 20),
          position_size: 1,
          profit_loss: win ? 'Profit' : (rand() < 0.08 ? 'Breakeven' : 'Loss'),
          rr: win ? Number((1 + rand() * 2.5).toFixed(1)) : Number((0.4 + rand() * 1).toFixed(1)),
          gross_profit: null,
          commission: null,
          net_profit: null,
          entry_price: null,
          tp_price: null,
          sl_price: null,
          coin_token: 'GBPUSD',
          trade_placed_at: dateStr,
          trade_executed_at: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          session_in: session,
          date_closed: dateStr,
          time_closed: null,
          closed_session: session,
          trade_duration: null,
          partial_1: null,
          partial_2: null,
          reached_1r2: win,
          reached_1r3: win && rand() < 0.7,
          reached_1r4: win && rand() < 0.4,
          reached_1r5: win && rand() < 0.15,
          max_rr: win ? Number((1.5 + rand() * 2).toFixed(1)) : 0,
          comments: null,
          extra_data: {},
          screenshots: [],
          notes_blocks: [],
          checklist_enabled: gradeChecklist,
          checklist_id: gradeChecklist ? checklistId : null,
          checklist_results: gradeChecklist
            ? Object.fromEntries(checklist.items.map(it => [String(it.id), rand() < (win ? 0.85 : 0.5)]))
            : {},
          emotions: rand() < 0.7 ? [emotionsPool[Math.floor(rand() * emotionsPool.length)]] : [],
          trade_rating: rand() < 0.8 ? Math.ceil(rand() * 5) : null,
          created_at: new Date(cursor.getTime() + i * 60000).toISOString(),
          // filled in by recalcCapital below
          start_capital: null, end_capital: null, gain_loss: null, gain_loss_pct: null,
          overall_gain: 0, overall_pct: 0,
          source: 'manual',
        });
      }
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  recalcCapital(rawTrades, startingBalance);

  // A few Prop Firm Ledger entries (Summary's PropPnlLedger.tsx widget) -
  // a challenge fee near the start of the trading history, then two payouts
  // as it progressed, so "Ready to try the ledger in the demo" (the
  // Prop Firm Ledger & Challenge Simulator feature page) actually shows
  // something on arrival instead of an empty list.
  const ledger: LedgerEntry[] = [
    {
      id: nextId(), account_id: accountId, entry_type: 'fee', amount: 99,
      entry_date: todayISO(-90), note: 'Phase 1 challenge fee',
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    },
    {
      id: nextId(), account_id: accountId, entry_type: 'payout', amount: 850,
      entry_date: todayISO(-30), note: 'First profit split',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: nextId(), account_id: accountId, entry_type: 'payout', amount: 620,
      entry_date: todayISO(-8), note: 'Second profit split',
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    },
  ];

  return {
    account,
    trades: rawTrades as Trade[],
    strategies: [strategy, strategyTp2, strategyTp3],
    checklists: [checklist],
    dailyRoutine: [],
    customColumns: [],
    tags,
    tagGroups,
    // A small starter list so the timeframe picker on a pasted screenshot
    // isn't empty on first look - the real TIMEFRAME_PRESETS cover this too
    // (NotesEditor merges them client-side regardless), this just mirrors
    // what a real account looks like after a bit of use.
    timeframes: [
      { id: nextId(), name: '15M', sort_order: 0 },
      { id: nextId(), name: '1H', sort_order: 1 },
      { id: nextId(), name: '4H', sort_order: 2 },
      { id: nextId(), name: 'Daily', sort_order: 3 },
    ],
    // Starts empty - the static INSTRUMENTS presets in TradeDetailPanel already
    // cover the common pairs client-side, so there's nothing to seed here.
    instruments: [],
    ledger,
    added: {},
  };
}

let store = buildSeed();

// =========================================================================
// Ported calculations
// =========================================================================

// Mirrors recalcAccountCapital in api/_db.js: walks trades in order, each
// one's start_capital = the previous one's end_capital, gain_loss derived
// from position_size (% risk) x RR Achieved, sign/magnitude per
// profit_loss. Mutates the array's objects in place.
function recalcCapital(trades: any[], startingBalance: number) {
  const sorted = [...trades].sort((a, b) => {
    const an = a.trade_number ?? 999999, bn = b.trade_number ?? 999999;
    if (an !== bn) return an - bn;
    const ad = a.trade_placed_at ?? a.created_at ?? '';
    const bd = b.trade_placed_at ?? b.created_at ?? '';
    if (ad !== bd) return String(ad).localeCompare(String(bd));
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });
  let running = startingBalance;
  for (const t of sorted) {
    const startCap = running;
    const dollarRisk = startCap * (Number(t.position_size) || 0) / 100;
    const rrVal = t.rr != null ? Number(t.rr) : null;
    // A trade synced from a real MT4/5 account (source='mt_sync') or
    // imported from a broker CSV statement (source='csv_import') already
    // carries its own real dollar P&L - position_size for those rows isn't
    // "% of capital risked" the way a manually-logged trade's is, so running
    // it through the %-risk formula below would produce a meaningless
    // number. Trust the stored value instead, same as api/_db.js's
    // recalcAccountCapital (the real backend this function mirrors).
    const gainLoss = (t.source === 'mt_sync' || t.source === 'csv_import') ? Number(t.gain_loss ?? 0)
      : t.profit_loss === 'Breakeven' ? 0
      : t.profit_loss === 'Loss' ? (rrVal != null ? -Math.abs(dollarRisk * rrVal) : -dollarRisk)
      : t.profit_loss === 'Profit' ? dollarRisk * (rrVal ?? 0)
      : 0;
    const gainLossPct = startCap !== 0 ? (gainLoss / startCap * 100) : 0;
    const endCap = startCap + gainLoss;
    t.start_capital = Math.round(startCap * 100) / 100;
    t.end_capital = Math.round(endCap * 100) / 100;
    t.gain_loss = Math.round(gainLoss * 100) / 100;
    t.gain_loss_pct = Math.round(gainLossPct * 100) / 100;
    running = endCap;
  }
}

// Mirrors listTrades in api/trades/index.ts: overall_gain/overall_pct
// relative to the FIRST trade's start_capital, then newest-first for
// display.
function listTradesForAccount(accountId: number): Trade[] {
  const mine = store.trades.filter(t => t.account_id === accountId);
  const sorted = [...mine].sort((a, b) => {
    const an = (a as any).trade_number ?? 999999, bn = (b as any).trade_number ?? 999999;
    return an - bn;
  });
  if (sorted.length === 0) return [];
  const initialCapital = Number(sorted[0].start_capital ?? 0);
  const withTotals = sorted.map(t => {
    const endCap = Number(t.end_capital ?? t.start_capital ?? 0);
    const overallGain = Math.round((endCap - initialCapital) * 100) / 100;
    const overallPct = initialCapital !== 0 ? Math.round((overallGain / initialCapital) * 10000) / 100 : 0;
    return { ...t, overall_gain: overallGain, overall_pct: overallPct };
  });
  return withTotals.reverse();
}

// --- /summary strategy engine, ported from api/summary/index.ts --------
const RAW_NUMERIC_FIELDS: Record<string, string> = {
  rr: 'rr', max_rr: 'max_rr', entry_price: 'entry_price', tp_price: 'tp_price', sl_price: 'sl_price',
  gain_loss: 'gain_loss', gain_loss_pct: 'gain_loss_pct', position_size: 'position_size',
  partial_1: 'partial_1', partial_2: 'partial_2',
};
const LEGACY_EXTRA_DATA_ALIASES: Record<string, string> = {
  cisd_break: 'cisd_break', inverse_candles: 'inverse_candle_size', gap_from_asia_h: 'distance_from_asia',
};

function getFieldValue(trade: any, field: string): number | null {
  const rawKey = RAW_NUMERIC_FIELDS[field];
  if (rawKey) {
    const v = trade[rawKey];
    return v != null ? Number(v) : null;
  }
  const extraKey = LEGACY_EXTRA_DATA_ALIASES[field] ?? field;
  const v = trade.extra_data?.[extraKey] ?? trade[extraKey];
  return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null;
}
function evalCondition(val: number | null, op: string, threshold: number): boolean {
  if (val === null || val === undefined) return false;
  switch (op) {
    case '<': return val < threshold;
    case '<=': return val <= threshold;
    case '>': return val > threshold;
    case '>=': return val >= threshold;
    case '=': return val === threshold;
    case '!=': return val !== threshold;
    default: return false;
  }
}
function matchesTagCondition(trade: any, op: string, tagName: string, group?: string): boolean {
  let has: boolean;
  if (group) {
    has = (trade.tag_selections?.[group] ?? []).includes(tagName);
  } else {
    const groupValues = Object.values(trade.tag_selections ?? {}).flat();
    has = (trade.tags ?? []).includes(tagName) || (groupValues as string[]).includes(tagName);
  }
  return op === '!has' ? !has : has;
}
function matchesCondition(trade: any, cond: Condition): boolean {
  if (cond.field === TAG_CONDITION_FIELD) return matchesTagCondition(trade, cond.op, String(cond.value), cond.group);
  return evalCondition(getFieldValue(trade, cond.field), cond.op, Number(cond.value));
}
function matchesDay(trade: any, days: number[] | null | undefined): boolean {
  if (!days || days.length === 0) return true;
  if (!trade.trade_placed_at) return false;
  const d = new Date(trade.trade_placed_at);
  if (isNaN(d.getTime())) return false;
  return days.includes(d.getUTCDay());
}
function matchesTime(trade: any, timeStart: string | null, timeEnd: string | null): boolean {
  if (!timeStart && !timeEnd) return true;
  const t = trade.trade_executed_at;
  if (!t) return false;
  const time = String(t).substring(0, 5);
  if (timeStart && time < timeStart) return false;
  if (timeEnd && time > timeEnd) return false;
  return true;
}
function getReached(trade: any, tp: number): boolean {
  if (tp <= 2) return Boolean(trade.reached_1r2);
  if (tp <= 3) return Boolean(trade.reached_1r3);
  if (tp <= 4) return Boolean(trade.reached_1r4);
  if (tp <= 5) return Boolean(trade.reached_1r5);
  return Number(trade.max_rr ?? -1) >= tp;
}
function calcR(trade: any, tp1: number, tp2: number | null, splitPct: number | null): number {
  if (tp2 !== null && splitPct !== null) {
    const half = splitPct / 100;
    if (getReached(trade, tp2)) return half * tp1 + (1 - half) * tp2;
    if (getReached(trade, tp1)) return half * tp1;
    return -1;
  }
  if (getReached(trade, tp1)) return tp1;
  return -1;
}

function buildSummary(accountId: number): StrategyResult[] {
  const trades = store.trades.filter(t => t.account_id === accountId);
  const strategies = store.strategies.filter(s =>
    s.active && (s.account_ids.length === 0 || s.account_ids.includes(accountId))
  );
  return strategies.map(strategy => {
    const tp1 = strategy.tp1_rr, tp2 = strategy.tp2_rr, split = strategy.split_percent;
    const qualifying = trades.filter(trade => {
      if (!matchesDay(trade, strategy.days)) return false;
      if (!matchesTime(trade, strategy.time_start, strategy.time_end)) return false;
      if (!strategy.conditions.length) return true;
      return strategy.conditions.every(cond => matchesCondition(trade, cond));
    });
    const tradeResults = qualifying.map(trade => ({
      id: trade.id, date: trade.trade_placed_at ?? '', pair: trade.coin_token ?? '',
      r: calcR(trade, tp1, tp2, split),
    }));
    const total = tradeResults.length;
    const wins = tradeResults.filter(t => t.r > 0).length;
    const losses = tradeResults.filter(t => t.r < 0).length;
    const totalR = tradeResults.reduce((s, t) => s + t.r, 0);
    const grossWinR = tradeResults.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0);
    const grossLossR = Math.abs(tradeResults.filter(t => t.r < 0).reduce((s, t) => s + t.r, 0));
    const profitFactor = grossLossR > 0 ? Math.round((grossWinR / grossLossR) * 100) / 100 : (grossWinR > 0 ? null : 0);
    return {
      id: strategy.id, name: strategy.name, tp1_rr: tp1, tp2_rr: tp2, split_percent: split,
      conditions: strategy.conditions, days: strategy.days, time_start: strategy.time_start, time_end: strategy.time_end,
      total_trades: total, wins, losses,
      win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
      total_r: Math.round(totalR * 100) / 100,
      avg_r: total > 0 ? Math.round((totalR / total) * 100) / 100 : 0,
      profit_factor: profitFactor,
      trades: tradeResults,
    };
  });
}

// --- /trades/performance, ported from api/trades/performance.ts --------
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION_ORDER = ['Asia', 'Pre-London', 'London', 'London/NY Overlap', 'New York', 'Unknown'];

function isWin(t: any): boolean {
  if (t.profit_loss === 'Profit') return true;
  if (t.profit_loss === 'Loss') return false;
  return Number(t.gain_loss ?? 0) > 0;
}
function isLoss(t: any): boolean {
  if (t.profit_loss === 'Loss') return true;
  if (t.profit_loss === 'Profit') return false;
  return Number(t.gain_loss ?? 0) < 0;
}
function toISODate(t: any): string {
  const raw = t.trade_placed_at;
  if (!raw) return '';
  return String(raw).substring(0, 10);
}
function computeStreaks(list: any[]) {
  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  const winStreaks: number[] = [], lossStreaks: number[] = [];
  for (const t of list) {
    if (isWin(t)) {
      curWin++;
      if (curLoss > 0) { lossStreaks.push(curLoss); curLoss = 0; }
      maxWin = Math.max(maxWin, curWin);
    } else if (isLoss(t)) {
      curLoss++;
      if (curWin > 0) { winStreaks.push(curWin); curWin = 0; }
      maxLoss = Math.max(maxLoss, curLoss);
    }
  }
  if (curWin > 0) winStreaks.push(curWin);
  if (curLoss > 0) lossStreaks.push(curLoss);
  return {
    maxWin, maxLoss,
    avgWin: winStreaks.length ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0,
    avgLoss: lossStreaks.length ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0,
  };
}
function computeAdvancedStats(list: any[]) {
  const winners = list.filter(isWin);
  const losers = list.filter(isLoss);
  const n = list.length;
  const winRate = n > 0 ? winners.length / n : 0;
  const lossRate = n > 0 ? losers.length / n : 0;
  const avgWin = winners.length ? winners.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0) / winners.length : 0;
  const avgLoss = losers.length ? losers.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0) / losers.length : 0;
  const expectancy = winRate * avgWin + lossRate * avgLoss;
  const grossWin = winners.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const grossLoss = -losers.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0);
  const bestWin = winners.length ? Math.max(...winners.map(t => Number(t.gain_loss_pct ?? 0))) : 0;
  const avgWinPct = winners.length ? winners.reduce((s, t) => s + Number(t.gain_loss_pct ?? 0), 0) / winners.length : 0;
  const worstLoss = losers.length ? Math.min(...losers.map(t => Number(t.gain_loss_pct ?? 0))) : 0;
  const avgLossPct = losers.length ? losers.reduce((s, t) => s + Number(t.gain_loss_pct ?? 0), 0) / losers.length : 0;
  const streaks = computeStreaks(list);
  return {
    expectancy: Math.round(expectancy * 100) / 100,
    avg_win: Math.round(avgWin * 100) / 100,
    avg_loss: Math.round(avgLoss * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    total_winners: winners.length,
    best_win: Math.round(bestWin * 100) / 100,
    avg_win_pct: Math.round(avgWinPct * 100) / 100,
    max_cons_wins: streaks.maxWin,
    avg_cons_wins: Math.round(streaks.avgWin * 100) / 100,
    total_losers: losers.length,
    worst_loss: Math.round(worstLoss * 100) / 100,
    avg_loss_pct: Math.round(avgLossPct * 100) / 100,
    max_cons_losses: streaks.maxLoss,
    avg_cons_losses: Math.round(streaks.avgLoss * 100) / 100,
  };
}

function buildPerformance(accountId: number, strategyId: number | null) {
  let trades = store.trades.filter(t => t.account_id === accountId && t.trade_placed_at);
  trades = [...trades].sort((a, b) => String(a.trade_placed_at).localeCompare(String(b.trade_placed_at)));

  if (strategyId != null) {
    const s = store.strategies.find(x => x.id === strategyId);
    if (!s) throw new Error('Strategy not found');
    trades = trades.filter(trade => {
      if (!matchesDay(trade, s.days)) return false;
      if (!matchesTime(trade, s.time_start, s.time_end)) return false;
      if (!s.conditions.length) return true;
      return s.conditions.every(c => matchesCondition(trade, c));
    });
  }

  function aggregate(key: (t: any) => string) {
    const map = new Map<string, any[]>();
    for (const t of trades) {
      const k = key(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries()).map(([period, ts]) => {
      const totalGain = ts.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const startCap = Number(ts[0]?.start_capital ?? 0);
      const endCap = Number(ts[ts.length - 1]?.end_capital ?? startCap + totalGain);
      const wins = ts.filter(isWin).length;
      const losses = ts.filter(isLoss).length;
      const total = ts.length;
      const grossWin = ts.filter(isWin).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const grossLoss = -ts.filter(isLoss).reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
      const profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
      const rrValues = ts.map(t => t.rr).filter((v: any) => v != null && !isNaN(Number(v))).map(Number);
      const avgRr = rrValues.length ? rrValues.reduce((a: number, b: number) => a + b, 0) / rrValues.length : null;
      return {
        period, total_trades: total, wins, losses,
        win_rate: total > 0 ? Math.round(wins / total * 100) : 0,
        total_gain: Math.round(totalGain * 100) / 100,
        pct_return: startCap > 0 ? Math.round(totalGain / startCap * 10000) / 100 : 0,
        start_capital: Math.round(startCap * 100) / 100,
        end_capital: Math.round(endCap * 100) / 100,
        profit_factor: profitFactor,
        avg_rr: avgRr !== null ? Math.round(avgRr * 100) / 100 : null,
      };
    });
  }

  const toYYYYMM = (t: any) => toISODate(t).substring(0, 7);
  const toYYYY = (t: any) => toISODate(t).substring(0, 4);
  const toDay = (t: any) => toISODate(t);
  const toWeekday = (t: any) => {
    const iso = toISODate(t);
    if (!iso) return 'Unknown';
    return WEEKDAY_NAMES[new Date(iso + 'T00:00:00Z').getUTCDay()] ?? 'Unknown';
  };
  const toSession = (t: any) => t.session_in || 'Unknown';

  const weekdayRows = aggregate(toWeekday);
  const weekdaySorted = WEEKDAY_ORDER.map(name => weekdayRows.find(r => r.period === name)).filter(Boolean);
  const sessionRows = aggregate(toSession);
  const sessionSorted = SESSION_ORDER
    .map(name => sessionRows.find(r => r.period === name))
    .filter(Boolean)
    .concat(sessionRows.filter(r => !SESSION_ORDER.includes(r.period)));

  return {
    monthly: aggregate(toYYYYMM),
    yearly: aggregate(toYYYY),
    weekday: weekdaySorted,
    daily: aggregate(toDay),
    hourly: [],
    session: sessionSorted,
    stats: computeAdvancedStats(trades),
  };
}

// =========================================================================
// Request router - mirrors api.ts's request(method, url, body) contract:
// resolves with the parsed "response body" on success, throws Error(message)
// on failure.
// =========================================================================

function parseUrl(url: string): { path: string; params: URLSearchParams } {
  const [path, query] = url.split('?');
  return { path, params: new URLSearchParams(query ?? '') };
}

function upsertTagsFromTrade(tagNames: string[]) {
  for (const name of tagNames) {
    if (!store.tags.some(t => t.name === name)) {
      store.tags.push({ id: nextId(), name, color: colorForIndex(store.tags.length), sort_order: store.tags.length });
    }
  }
}

export async function handleDemoRequest(method: string, url: string, body?: unknown): Promise<any> {
  // A small artificial delay so loading states aren't instant-invisible -
  // this is meant to feel like a real (if fast) network app, not a
  // synchronous mock.
  await new Promise(r => setTimeout(r, 120));

  const { path, params } = parseUrl(url);
  const b: any = body ?? {};
  const resource = params.get('resource') ?? b.resource;
  const accountId = store.account.id;

  // --- /columns?resource=auth --------------------------------------------
  // Always answers "not logged in", on purpose - this is the ONE call that
  // must NEVER be answered by the demo backend as if it were a real
  // session. AuthProvider (lib/auth.tsx) is mounted once, above <Routes>,
  // for the entire app, and calls this exactly once on first mount; if that
  // first mount happens to occur while sitting on a /demo/app/* URL (a
  // direct/bookmarked link, a page reload while in the demo, or a search
  // result landing straight on it - all real entry points now that /demo/app
  // is in the sitemap), a fake truthy user here would make AuthProvider
  // believe there's a real logged-in session for the REST OF THE TAB, not
  // just inside the demo. Every future navigation - including "Exit demo"
  // and the sidebar logo - would then see a non-null `user` and route into
  // the real authenticated app shell instead of back to the marketing
  // Landing page, hitting real API endpoints with no real session behind
  // them. None of the demo pages need `user` to be truthy - they're
  // deliberately not wrapped in Protected (see App.tsx's DemoShell) and
  // don't call useAuth() at all - so there's nothing to lose by always
  // answering honestly here.
  if (path === '/columns' && resource === 'auth') {
    return { user: null };
  }
  if (path === '/columns' && resource === 'contact') return { ok: true };
  if (path === '/columns' && resource === 'feedback') return { ok: true };

  // --- /accounts ---------------------------------------------------------
  if (path === '/accounts') {
    if (method === 'GET' && resource === 'ledger') return store.ledger;
    if (method === 'GET') return [store.account];
    if (method === 'POST' && resource === 'ledger') {
      const entry: LedgerEntry = {
        id: nextId(), account_id: accountId, entry_type: b.entry_type, amount: Number(b.amount),
        entry_date: b.entry_date, note: b.note ?? null, created_at: new Date().toISOString(),
      };
      store.ledger.push(entry);
      return entry;
    }
    if (method === 'POST' && resource === 'regenerate_share_token') {
      store.account.public_share_token = Math.random().toString(36).slice(2, 12);
      return { public_share_token: store.account.public_share_token };
    }
    if (method === 'POST') {
      // A brand-new account (multi-account) - Pro-only even for real users.
      checkAndConsumeCap(store, 'accounts');
      // unreachable (cap is 0) but keeps TS happy about a return path
      return store.account;
    }
    if (method === 'PUT') {
      Object.assign(store.account, b);
      return { ok: true };
    }
    if (method === 'DELETE' && resource === 'ledger') {
      const id = Number(params.get('id'));
      store.ledger = store.ledger.filter(e => e.id !== id);
      return { deleted: 1 };
    }
    if (method === 'DELETE') {
      capError(`Deleting your only account isn't available in the demo. ${SIGNUP_CTA}`);
    }
  }

  // --- /trades -------------------------------------------------------
  if (path === '/trades') {
    if (method === 'GET') return listTradesForAccount(accountId);
    if (method === 'POST') {
      checkAndConsumeCap(store, 'trades');
      const trade: any = {
        ...b,
        id: nextId(),
        account_id: accountId,
        trade_number: store.trades.filter(t => t.account_id === accountId).length + 1,
        tags: b.tags ?? [],
        tag_selections: b.tag_selections ?? {},
        extra_data: b.extra_data ?? {},
        screenshots: [],
        notes_blocks: b.notes_blocks ?? [],
        checklist_results: b.checklist_results ?? {},
        emotions: b.emotions ?? [],
        created_at: new Date().toISOString(),
      };
      upsertTagsFromTrade(trade.tags);
      store.trades.push(trade);
      recalcCapital(store.trades.filter(t => t.account_id === accountId), Number(store.account.starting_balance ?? 0));
      return trade;
    }
  }
  const tradeIdMatch = /^\/trades\/(\d+)$/.exec(path);
  if (tradeIdMatch) {
    const id = Number(tradeIdMatch[1]);
    if (method === 'PUT') {
      const idx = store.trades.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Trade not found');
      store.trades[idx] = { ...store.trades[idx], ...b, id, account_id: accountId };
      upsertTagsFromTrade((store.trades[idx] as any).tags ?? []);
      recalcCapital(store.trades.filter(t => t.account_id === accountId), Number(store.account.starting_balance ?? 0));
      return store.trades[idx];
    }
    if (method === 'DELETE') {
      store.trades = store.trades.filter(t => t.id !== id);
      return { deleted: 1 };
    }
  }
  // /trades/bulk?resource=add / ?resource=delete - mirrors the real
  // api/trades/bulk.ts's own dispatch (see that file for why bulk-add and
  // bulk-delete are one route now instead of two: freeing a serverless
  // function slot under the Vercel Hobby 12-function cap for api/stripe.ts).
  if (path === '/trades/bulk' && resource === 'delete' && method === 'POST') {
    const ids: number[] = b.ids ?? [];
    store.trades = store.trades.filter(t => !ids.includes(t.id));
    return { deleted: ids.length };
  }
  if (path === '/trades/bulk' && resource === 'add' && method === 'POST') {
    const rows: any[] = b.trades ?? [];
    if (rows.length === 0) return { added: 0 };
    // Excel import shares the same 1-trade demo allowance as adding a
    // single trade by hand - a multi-row import would blow straight past
    // it in one call, so it's all-or-nothing rather than silently keeping
    // only the first row (which would look like the import half-failed).
    if ((store.added.trades ?? 0) + rows.length > ADD_CAPS.trades) {
      capError(`The demo allows adding ${ADD_CAPS.trades} new trade total, including Excel import. ${SIGNUP_CTA}`);
    }
    store.added.trades = (store.added.trades ?? 0) + rows.length;
    for (const row of rows) {
      // Mirrors api/trades/bulk.ts's own bulkAdd: a CSV import mapped
      // through the Gross Profit/Commission split (the FTMO/MT4/5-style
      // path - see ImportTradesDialog.tsx) arrives with gross_profit set
      // but no gain_loss, since the real backend is what computes that
      // net figure. The demo mode has no real backend to defer to, so it
      // has to do that same computation itself here - otherwise
      // recalcCapital's source='csv_import' bypass below would trust a
      // gain_loss that was never actually filled in and silently zero out
      // every such trade's P&L in the demo.
      const gainLoss = row.source === 'csv_import'
        ? (row.gain_loss != null ? row.gain_loss : (row.gross_profit != null ? Math.round((row.gross_profit - (row.commission ?? 0)) * 100) / 100 : null))
        : row.gain_loss;
      const trade: any = {
        ...row, id: nextId(), account_id: accountId, gain_loss: gainLoss,
        trade_number: store.trades.filter(t => t.account_id === accountId).length + 1,
        tags: row.tags ?? [], tag_selections: row.tag_selections ?? {}, extra_data: row.extra_data ?? {},
        screenshots: [], notes_blocks: [], checklist_results: {}, emotions: [],
        created_at: new Date().toISOString(),
      };
      store.trades.push(trade);
    }
    recalcCapital(store.trades.filter(t => t.account_id === accountId), Number(store.account.starting_balance ?? 0));
    return { added: rows.length };
  }
  if (path === '/trades/performance' && method === 'GET') {
    const strategyIdParam = params.get('strategy_id');
    return buildPerformance(accountId, strategyIdParam ? Number(strategyIdParam) : null);
  }

  // --- /columns (custom fields + tags + tag groups) -------------------
  if (path === '/columns') {
    if (method === 'GET' && resource === 'tags') return store.tags;
    if (method === 'GET' && resource === 'timeframes') return store.timeframes;
    if (method === 'POST' && resource === 'timeframes') {
      const name = String(b.name ?? '').trim();
      const existing = store.timeframes.find(t => t.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      checkAndConsumeCap(store, 'timeframes');
      const tf: Timeframe = { id: nextId(), name, sort_order: store.timeframes.length };
      store.timeframes.push(tf);
      return tf;
    }
    if (method === 'GET' && resource === 'instruments') return store.instruments;
    if (method === 'POST' && resource === 'instruments') {
      const name = String(b.name ?? '').trim();
      const existing = store.instruments.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      checkAndConsumeCap(store, 'instruments');
      const inst: Instrument = { id: nextId(), name, sort_order: store.instruments.length };
      store.instruments.push(inst);
      return inst;
    }
    if (method === 'GET' && resource === 'tag_groups') {
      // Mirrors api/columns.ts's getTagGroups filter, though the demo only
      // ever has one account (multi-account is Pro-only, disabled here same
      // as for real users) so this never actually excludes anything today.
      const accountIdParam = params.get('account_id');
      const filterId = accountIdParam ? Number(accountIdParam) : null;
      return filterId
        ? store.tagGroups.filter(g => g.account_ids.length === 0 || g.account_ids.includes(filterId))
        : store.tagGroups;
    }
    if (method === 'GET') return store.customColumns.filter(c => c.account_id === accountId);
    if (method === 'POST' && resource === 'tag_groups') {
      checkAndConsumeCap(store, 'tagGroups');
      const g: TagGroup = { id: nextId(), name: b.name, sort_order: store.tagGroups.length, account_ids: b.account_ids ?? [], options: [] };
      store.tagGroups.push(g);
      return g;
    }
    if (method === 'POST' && resource === 'tag_group_options') {
      checkAndConsumeCap(store, 'tagGroupOptions');
      const group = store.tagGroups.find(g => g.id === b.group_id);
      if (!group) throw new Error('Tag group not found');
      const opt: TagGroupOption = { id: nextId(), group_id: b.group_id, name: b.name, color: colorForIndex(group.options.length), sort_order: group.options.length };
      group.options.push(opt);
      return opt;
    }
    if (method === 'POST') {
      checkAndConsumeCap(store, 'columns');
      const col: CustomColumn = {
        id: nextId(), name: b.name, col_key: b.col_key, data_type: b.data_type,
        visible: true, sort_order: store.customColumns.length, account_id: accountId,
      };
      store.customColumns.push(col);
      return col;
    }
    if (method === 'PUT' && resource === 'tag_groups') {
      const group = store.tagGroups.find(g => g.id === b.id);
      if (!group) throw new Error('Tag group not found');
      if (b.name !== undefined) group.name = b.name;
      if (b.account_ids !== undefined) group.account_ids = b.account_ids;
      return { id: group.id };
    }
    if (method === 'PUT') {
      const col = store.customColumns.find(c => c.id === b.id);
      if (col) col.name = b.name;
      return { ok: true };
    }
    if (method === 'DELETE' && resource === 'tag_groups') {
      const id = Number(params.get('id'));
      store.tagGroups = store.tagGroups.filter(g => g.id !== id);
      return { deleted: 1 };
    }
    if (method === 'DELETE' && resource === 'tag_group_options') {
      const id = Number(params.get('id'));
      for (const g of store.tagGroups) g.options = g.options.filter(o => o.id !== id);
      return { deleted: 1 };
    }
    if (method === 'DELETE') {
      const id = Number(params.get('id'));
      store.customColumns = store.customColumns.filter(c => c.id !== id);
      return { deleted: 1 };
    }
  }

  // --- /checklist (rule sets, items, daily routine) -------------------
  if (path === '/checklist') {
    if (method === 'GET' && resource === 'daily_routine') return store.dailyRoutine;
    if (method === 'GET') {
      const accountIdParam = params.get('account_id');
      const filterId = accountIdParam ? Number(accountIdParam) : null;
      const list = filterId
        ? store.checklists.filter(c => c.account_ids.length === 0 || c.account_ids.includes(filterId))
        : store.checklists;
      return list;
    }
    if (method === 'POST' && resource === 'daily_routine') {
      const existing = store.dailyRoutine.find(n => n.note_date === b.note_date);
      if (existing) { existing.points = b.points; existing.updated_at = new Date().toISOString(); return existing; }
      const note: DailyRoutineNote = { id: nextId(), note_date: b.note_date, points: b.points, updated_at: new Date().toISOString() };
      store.dailyRoutine.push(note);
      return note;
    }
    if (method === 'POST' && resource === 'item') {
      checkAndConsumeCap(store, 'checklistItems');
      const cl = store.checklists.find(c => c.id === b.checklist_id);
      if (!cl) throw new Error('Checklist not found');
      const item: ChecklistItem = { id: nextId(), checklist_id: b.checklist_id, text: b.text, sort_order: cl.items.length, active: true };
      cl.items.push(item);
      return item;
    }
    if (method === 'POST') {
      checkAndConsumeCap(store, 'checklists');
      const cl: Checklist = { id: nextId(), name: b.name, sort_order: store.checklists.length, active: true, account_ids: [], items: [] };
      store.checklists.push(cl);
      return cl;
    }
    if (method === 'PUT' && resource === 'daily_routine') {
      const id = Number(params.get('id'));
      const note = store.dailyRoutine.find(n => n.id === id);
      if (note) { note.points = b.points; note.updated_at = new Date().toISOString(); }
      return note ?? { ok: true };
    }
    if (method === 'PUT' && resource === 'item') {
      const id = Number(params.get('id'));
      for (const cl of store.checklists) {
        const item = cl.items.find(i => i.id === id);
        if (item) { item.text = b.text; return item; }
      }
      return { ok: true };
    }
    if (method === 'PUT' && resource === 'checklist') {
      const id = Number(params.get('id'));
      const cl = store.checklists.find(c => c.id === id);
      if (cl) Object.assign(cl, b);
      return cl ?? { ok: true };
    }
    if (method === 'DELETE' && resource === 'daily_routine') {
      const id = Number(params.get('id'));
      store.dailyRoutine = store.dailyRoutine.filter(n => n.id !== id);
      return { deleted: 1 };
    }
    if (method === 'DELETE' && resource === 'item') {
      const id = Number(params.get('id'));
      for (const cl of store.checklists) cl.items = cl.items.filter(i => i.id !== id);
      return { deleted: 1 };
    }
    if (method === 'DELETE' && resource === 'checklist') {
      const id = Number(params.get('id'));
      store.checklists = store.checklists.filter(c => c.id !== id);
      return { deleted: 1 };
    }
  }

  // --- /strategies -----------------------------------------------------
  if (path === '/strategies') {
    if (method === 'GET') return store.strategies;
    if (method === 'POST') {
      checkAndConsumeCap(store, 'strategies');
      const s: Strategy = {
        playbook_published: false, playbook_slug: null, playbook_title: null,
        playbook_description: null, playbook_published_at: null,
        ...b, id: nextId(), sort_order: store.strategies.length,
      };
      store.strategies.push(s);
      return s;
    }
    if (method === 'PUT') {
      const id = Number(params.get('id'));
      const idx = store.strategies.findIndex(s => s.id === id);
      if (idx === -1) throw new Error('Strategy not found');
      store.strategies[idx] = { ...store.strategies[idx], ...b, id };
      return store.strategies[idx];
    }
    if (method === 'DELETE') {
      const id = Number(params.get('id'));
      store.strategies = store.strategies.filter(s => s.id !== id);
      return { deleted: 1 };
    }
  }

  // --- /summary ----------------------------------------------------------
  if (path === '/summary') {
    if (resource === 'news') {
      return {
        events: [], headlines: [],
        eventsError: "Market news isn't available in the demo — it's live in your real account.",
        headlinesError: "Market news isn't available in the demo — it's live in your real account.",
      };
    }
    if (method === 'GET') return buildSummary(accountId);
  }

  throw new Error(`This isn't available in the demo (${method} ${path}).`);
}
