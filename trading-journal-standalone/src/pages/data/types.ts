export type Account = {
  id: number;
  name: string;
  type: string | null;         // free-form label, e.g. "Live", "Paper", "Backtest"
  starting_balance: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  // Optional prop-firm-style risk rules, both as a % of starting_balance.
  // NULL = not tracked for this account. See schema.sql for the full note.
  daily_loss_limit_pct: number | null;
  max_drawdown_limit_pct: number | null;
  // Optional prop-firm "consistency rule" - caps how much of total profit
  // can come from a single day, e.g. no single day may exceed 20% of total
  // profit. NULL = not tracked. Purely informational, same as the two
  // above - see schema.sql.
  consistency_rule_pct: number | null;
};

// One cash movement to/from the prop firm for an account - a challenge fee
// paid, or a payout received. Entirely separate from per-trade P&L (see
// ledger_entries in schema.sql) - tracked by PropPnlLedger.tsx, never fed
// into trades.gain_loss or the drawdown/equity-curve math.
export type LedgerEntry = { id: number; account_id: number; entry_type: 'fee' | 'payout'; amount: number; entry_date: string; note: string | null; created_at: string };

export type Trade = {
  id: number;
  account_id: number;
  trade_number: number | null;
  start_capital: number | null;
  end_capital: number | null;
  gain_loss: number | null;
  gain_loss_pct: number | null;
  overall_gain: number;
  overall_pct: number;
  structure_15m: string | null;
  wr_1m: string | null;
  before_chart_1m: string | null;
  direction: string;
  entry_type: string | null; // 'Market' | 'Limit' | 'Stop' | null
  tags: string[];
  // Keyed by tag_groups.name -> selected tag_group_options.name(s) for that
  // group, e.g. { "Confidence Level": ["High"] }. Separate from the flat
  // `tags` list above - see the schema.sql note on tag_groups for why.
  tag_selections: Record<string, string[]>;
  liquidity_swept: string | null;
  distance_from_asia: number | null;
  liquidity_swept_no: number | null;
  cisd_break: number | null;
  total_inverse_candles: number | null;
  inverse_candle_size: number | null;
  sl_pips: number | null;
  position_size: number | null;
  profit_loss: string | null;
  rr: number | null;
  // $-based P/L entry: gross_profit and commission are what you type in
  // (straight off your broker statement); net_profit is server-computed
  // from the two (gross_profit - commission), never trusted from the
  // client - same reasoning as gain_loss below. RR Achieved (`rr` above)
  // and `profit_loss` are then derived client-side from net_profit and
  // this trade's dollar risk before saving (or from Partial 1/2 when
  // that toggle is on instead) - see TradeDetailPanel.tsx.
  gross_profit: number | null;
  commission: number | null;
  net_profit: number | null;
  entry_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  coin_token: string | null;
  trade_placed_at: string | null;
  trade_executed_at: string | null;
  session_in: string | null;
  date_closed: string | null;
  time_closed: string | null;
  closed_session: string | null;
  trade_duration: string | null;
  partial_1: number | null;
  partial_2: number | null;
  reached_1r2: boolean;
  reached_1r3: boolean;
  reached_1r4: boolean;
  reached_1r5: boolean;
  max_rr: number | null;
  comments: string | null;
  extra_data: Record<string, unknown>;
  screenshots: string[];
  notes_blocks: NoteBlock[];
  // Checklist is opt-in per trade (not every trade type needs one) — when
  // off, checklist_id/checklist_results are just whatever was last recorded
  // and ignored. checklist_id records WHICH checklist this trade was graded
  // against; checklist_results is keyed by checklist_item id, not checklist
  // id, so it doesn't care which checklist that item came from.
  checklist_enabled: boolean;
  checklist_id: number | null;
  checklist_results: Record<string, boolean>; // keyed by ChecklistItem id (as string, since it round-trips through JSON)
  // Emotions + Trade Rating - entirely separate from the tags/tag_selections
  // system above. `emotions` is a fixed, curated list of mindset labels
  // (not free-form, not user-editable - see EMOTIONS in TradeDetailPanel.tsx)
  // rendered as multi-select toggle chips. `trade_rating` is a 1-5
  // self-graded rating of execution quality (did you follow your process),
  // independent of whether the trade won or lost - null when ungraded.
  emotions: string[];
  trade_rating: number | null;
  created_at: string;
};

// Ordered content stream for the trade detail panel's notes editor — lets
// text and pasted/uploaded screenshots interleave in whatever order they
// were written, Notion-style, instead of two separate fields.
export type NoteBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string };

// `value` is a plain number for every ordinary numeric field condition
// (rr < 2, entry_price >= 1.27, etc). The one exception is the reserved
// `field: 'has_tag'` (see TAG_CONDITION_FIELD below) - there, `value` holds
// a tag NAME instead, so a strategy can require "this trade is/isn't
// tagged X" alongside its numeric conditions.
//
// `group` only applies to a tag condition, and is optional there too: tag
// group option names get reused across groups all the time (e.g. "EMA9"
// shows up under both "1M_Price above" and "15M Price below" - see the tag
// groups note on TagGroup below), so "has EMA9" on its own is ambiguous
// about which one you mean. Setting `group` to a tag group's name narrows
// the check to just that group's own selections; leaving it unset checks
// everywhere a trade can carry a tag (every group's selections, plus the
// older flat tags list) - same as before `group` existed, so old saved
// strategies keep working unchanged.
export type Condition = { field: string; op: string; value: number | string; group?: string };

// Reserved condition field key for "does this trade have tag X" - kept out
// of CONDITION_FIELDS/custom columns entirely (it's not a number you're
// comparing, it's a tag name), and given its own tiny op set (TAG_OPS)
// instead of the numeric OPS list. StrategyDialog.tsx checks for this exact
// key to switch a condition row's UI from op+number to has/doesn't-have+tag
// picker; api/summary/index.ts and api/trades/performance.ts check for it
// server-side to match against trade.tags instead of a numeric field.
export const TAG_CONDITION_FIELD = 'has_tag';
export const TAG_OPS = ['has', '!has'] as const;

export type Strategy = {
  id: number;
  name: string;
  conditions: Condition[];
  days: number[] | null; // 0=Sun..6=Sat; empty/null = all days allowed
  time_start: string | null; // e.g. "07:00"
  time_end: string | null;   // e.g. "11:00"
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
  active: boolean;
  sort_order: number;
  account_ids: number[]; // which accounts this strategy is counted on; [] = every account, including new ones you create later
};

export type CustomColumn = {
  id: number;
  name: string;
  col_key: string;
  data_type: string;
  visible: boolean;
  sort_order: number;
  account_id: number; // which account this field belongs to — fields no longer show across every account
};

// A reusable, user-defined tag (e.g. "A+ Setup", "Revenge Trade",
// "News Event"). Trades reference tags by NAME (see Trade.tags), not by
// this id — this table exists so the tag picker can suggest what you've
// already created instead of you retyping it, and so each tag can carry
// its own color.
export type Tag = {
  id: number;
  name: string;
  color: string;
  sort_order: number;
};

// One selectable value within a TagGroup (e.g. "High" under "Confidence
// Level"). See the schema.sql note on tag_groups/tag_group_options for the
// full rationale.
export type TagGroupOption = {
  id: number;
  group_id: number;
  name: string;
  color: string;
  sort_order: number;
};

// A user-defined tag category ("Confidence Level", "SL Levels", ...) with
// its own set of selectable sub-tags - FX Replay's "tag groups" pattern.
export type TagGroup = {
  id: number;
  name: string;
  sort_order: number;
  options: TagGroupOption[];
};

export const ENTRY_TYPES = ['Market', 'Limit', 'Stop'];

// A user-defined trade rule ("Did I wait for the CISD?", "Risk <= 1%?"),
// belonging to one Checklist.
export type ChecklistItem = {
  id: number;
  checklist_id: number;
  text: string;
  sort_order: number;
  active: boolean;
};

// A named, reusable rule set (e.g. "London Reversal", "Breakout Setup").
// Account-scoped the same way Strategy is (see account_ids below) — one
// trader, several rule sets, some shared across every account and some
// built for just one. Managed on its own Checklists tab; picked per trade
// from the trade screen.
export type Checklist = {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
  account_ids: number[]; // [] = every account (including new ones) — same convention as Strategy.account_ids
  items: ChecklistItem[];
};

// A pre-trade routine checklist for one calendar day - "checked EU/GU/UJ for
// CISD", "confirmed daily bias", one point per line item, stacked one below
// the other. One row per date; saving today's points again just overwrites
// that same row (see the PUT upsert in api/checklist.ts) rather than
// creating duplicates. Kept as a running history you can scroll back
// through, not wiped each day.
export type DailyRoutineNote = {
  id: number;
  note_date: string; // YYYY-MM-DD
  points: string[];
  updated_at: string;
};

export type StrategyResult = {
  id: number;
  name: string;
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
  conditions: Condition[];
  days: number[] | null;
  time_start: string | null;
  time_end: string | null;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_r: number;
  avg_r: number;
  profit_factor: number | null;
  trades: Array<{ id: number; date: string; pair: string; r: number }>;
};

// Economic-calendar event for the Home/Summary screen's news widget.
// impact/country/date come through verbatim from the upstream feed's own
// labels rather than a fixed enum, since that feed isn't ours to control.
export type NewsEvent = {
  title: string;
  country: string;
  date: string; // ISO timestamp
  impact: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

// General market/international headline for the news widget's second
// column, sourced from plain RSS (ForexLive, BBC World) rather than the
// economic-calendar feed.
export type Headline = {
  title: string;
  link: string;
  pubDate: string | null;
  source: string;
};

// Best-effort currency -> ISO 3166-1 alpha-2 country code, for rendering an
// actual flag <img> (see ui/CurrencyFlag.tsx). Deliberately covers only
// currencies that actually show up on an economic calendar (the majors + a
// handful of others FF sometimes lists) - an unknown code just renders no
// flag rather than guessing.
//
// This used to return a Unicode flag emoji directly, but several platforms
// - notably Windows, even fairly recent versions - don't render the
// regional-indicator emoji pairs as flags at all; they fall back to
// showing the raw two-letter code as plain text, which is exactly what was
// happening. An <img> from a flag CDN renders identically everywhere.
const CURRENCY_COUNTRY_CODES: Record<string, string> = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au', CAD: 'ca',
  CHF: 'ch', NZD: 'nz', CNY: 'cn', HKD: 'hk', SGD: 'sg', ZAR: 'za',
  MXN: 'mx', SEK: 'se', NOK: 'no', TRY: 'tr', INR: 'in', BRL: 'br', KRW: 'kr',
};

export function currencyCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return CURRENCY_COUNTRY_CODES[code.toUpperCase()] ?? null;
}

export const FIELD_LABELS: Record<string, string> = {
  cisd_break: 'CISD Break',
  inverse_candles: 'Inv. Candle Size',
  gap_from_asia_h: 'Distance from Asia H/L',
  rr: 'Risk:Reward (R)',
  entry_price: 'Entry Price',
  tp_price: 'TP Price',
  sl_price: 'SL Price',
  max_rr: 'Max R Reached',
  gain_loss: 'Gain/Loss ($)',
  gain_loss_pct: 'Gain/Loss (%)',
  position_size: 'Position Size (%)',
  partial_1: 'Partial 1 (%)',
  partial_2: 'Partial 2 (%)',
  has_tag: 'Tag',
};

// The built-in numeric fields every trade always has, for every account,
// regardless of which custom fields that particular user has added. These
// read straight off the trades table server-side (see getFieldValue in
// api/summary/index.ts).
//
// The three original SMC/ICT fields (CISD Break, Inverse Candle Size,
// Distance from Asia H/L) used to be hardcoded in this list too, which
// meant every new signup saw them in the Filter Conditions dropdown even
// though they're specific to the strategy they were originally built
// around and stay NULL for anyone who's never used them - confusing noise,
// and not actually "built-in" the way rr/entry price/etc. are. They're
// real columns on the trades table (kept for backward compatibility - see
// the "SMC fields became custom columns" migration in schema.sql), but
// they only belong in this dropdown for accounts that actually have data
// in them, exactly like any other custom field - so they've been dropped
// from here and now flow in below purely from the per-account
// `custom_columns` merge in StrategyDialog.tsx (that migration already
// creates a custom_columns row for cisd_break/inverse_candle_size/
// distance_from_asia on any account with non-null trade data in them, and
// none at all for an account that's never touched them).
export const CONDITION_FIELDS = [
  { key: 'rr',              label: 'Risk:Reward (R)' },
  { key: 'max_rr',          label: 'Max R Reached' },
  { key: 'entry_price',     label: 'Entry Price' },
  { key: 'tp_price',        label: 'TP Price' },
  { key: 'sl_price',        label: 'SL Price' },
  { key: 'gain_loss',       label: 'Gain/Loss ($)' },
  { key: 'gain_loss_pct',   label: 'Gain/Loss (%)' },
  { key: 'position_size',   label: 'Position Size (%)' },
  { key: 'partial_1',       label: 'Partial 1 (%)' },
  { key: 'partial_2',       label: 'Partial 2 (%)' },
];

export const OPS = ['<', '<=', '>', '>=', '=', '!='];

export const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

export const SESSIONS = ['London', 'New York', 'Asia', 'London/NY Overlap', 'Pre-London'];

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(v));
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function plColor(v: number | null | undefined): string {
  if (v == null) return 'text-muted-foreground';
  return Number(v) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
}

// --- Chart Replay / Backtesting -------------------------------------------

export const REPLAY_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type ReplayTimeframe = typeof REPLAY_TIMEFRAMES[number];

// A handful of common Dukascopy instrument ids, for the Fetch Data dialog's
// pair picker. Dukascopy actually covers hundreds of forex/metals/indices/
// crypto instruments beyond this list - the dialog's pair field also takes
// free text, this is just autocomplete for the ones most people will want.
//
// Every pair across the 8 majors (EUR, GBP, AUD, NZD, USD, CAD, CHF, JPY) -
// all 28 combinations, each written once in standard FX quoting convention
// (higher-priority currency as the base: EUR > GBP > AUD > NZD > USD > CAD >
// CHF > JPY) - plus gold/silver at the end.
export const COMMON_PAIRS = [
  'EURUSD', 'EURGBP', 'EURAUD', 'EURNZD', 'EURCAD', 'EURCHF', 'EURJPY',
  'GBPUSD', 'GBPAUD', 'GBPNZD', 'GBPCAD', 'GBPCHF', 'GBPJPY',
  'AUDUSD', 'AUDNZD', 'AUDCAD', 'AUDCHF', 'AUDJPY',
  'NZDUSD', 'NZDCAD', 'NZDCHF', 'NZDJPY',
  'USDCAD', 'USDCHF', 'USDJPY',
  'CADCHF', 'CADJPY',
  'CHFJPY',
  'XAUUSD', 'XAGUSD',
];

// How many decimal places a pair is conventionally quoted to, for chart
// price-scale/axis formatting. Most FX pairs trade in "pipettes" (5 decimal
// places, the 5th being a tenth of a pip); JPY-quoted pairs run two orders
// of magnitude higher in price so their convention is 3 decimals instead;
// metals are quoted in whole-dollar terms so 2-3 decimals is standard.
// lightweight-charts' default price-scale formatting isn't pair-aware, so
// without this it was falling back to a generic 2-decimal display on every
// pair - fine for a stock price, but useless for reading pips off an FX
// chart, which is the entire point of this page.
export function pricePrecisionForPair(pair: string): { precision: number; minMove: number } {
  const p = pair.toUpperCase();
  if (p.includes('JPY')) return { precision: 3, minMove: 0.001 };
  if (p.startsWith('XAU')) return { precision: 2, minMove: 0.01 };
  if (p.startsWith('XAG')) return { precision: 3, minMove: 0.001 };
  return { precision: 5, minMove: 0.00001 };
}

export type ChartDataset = {
  id: number;
  pair: string;
  timeframe: string;
  blob_url: string;
  candle_count: number;
  start_time: string | null;
  end_time: string | null;
  uploaded_at: string;
};

// One OHLC bar, normalized from whatever CSV format was uploaded. `time` is
// unix seconds (UTC) - the unit lightweight-charts expects for its
// UTCTimestamp type.
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type BacktestTrade = {
  id: number;
  dataset_id: number;
  direction: string;           // 'Long' | 'Short'
  entry_price: number;
  sl_price: number | null;
  tp_price: number | null;
  entry_time: string;          // ISO timestamp of the replay candle it was placed on
  exit_time: string | null;
  exit_price: number | null;
  result: string | null;       // 'Profit' | 'Loss' | null while open
  rr: number | null;
  notes: string | null;
  tags: string[];              // shares the same reusable tag pool as trades.tags
  created_at: string;
};

export type ChartDrawingType = 'trendline' | 'horizontal' | 'rectangle' | 'fib';

export type ChartDrawing = {
  id: number;
  dataset_id: number;
  type: ChartDrawingType;
  points: { time: number; price: number }[];
  color: string;
  created_at: string;
};
