export type Account = {
  id: number;
  name: string;
  type: string | null;         // free-form label, e.g. "Live", "Paper", "Backtest"
  starting_balance: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

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
  created_at: string;
};

// Ordered content stream for the trade detail panel's notes editor — lets
// text and pasted/uploaded screenshots interleave in whatever order they
// were written, Notion-style, instead of two separate fields.
export type NoteBlock =
  | { type: 'text'; value: string }
  | { type: 'image'; url: string };

export type Condition = { field: string; op: string; value: number };

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
};

export type CustomColumn = {
  id: number;
  name: string;
  col_key: string;
  data_type: string;
  visible: boolean;
  sort_order: number;
};

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
// Global across accounts, same as Strategy — one trader, several rule sets,
// one per setup they trade. Managed on its own Checklists tab; picked per
// trade from the trade screen.
export type Checklist = {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
  items: ChecklistItem[];
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
};

export const CONDITION_FIELDS = [
  { key: 'cisd_break',      label: 'CISD Break (candles)' },
  { key: 'inverse_candles', label: 'Inverse Candle Size' },
  { key: 'gap_from_asia_h', label: 'Distance from Asia H/L' },
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
