import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X, ListChecks, Newspaper, Clock3, Pencil, Check, Trash2, Star, Smile } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { Checkbox, Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trade, CustomColumn, Checklist, NewsEvent, TagGroup, Timeframe, Instrument, SESSIONS, ENTRY_TYPES, fmtMoney } from '../data/types';
import { computeDrawdown, positionSizeLots, slPipsFromPrices } from '../data/risk';
import { useAccount } from '../../lib/accounts';
import { api, useFetch } from '../../lib/api';
import { cn } from '../../lib/utils';
import NotesEditor from './NotesEditor';
import CurrencyFlag from './CurrencyFlag';
import TagGroupsPicker from './TagGroupsPicker';

// Splits a 6-letter pair like "GBPUSD" into ['GBP','USD'] to cross-reference
// against the economic calendar's currency codes. Anything else (crypto
// tickers, unusual lengths) is left alone — it just won't match any
// calendar entry, which is the correct outcome for a pair that isn't a
// currency pair.
function pairCurrencies(pair: string | null): string[] {
  if (!pair) return [];
  const clean = pair.toUpperCase().replace(/[^A-Z]/g, '');
  if (clean.length !== 6) return [];
  return [clean.slice(0, 3), clean.slice(3, 6)];
}

type NewsDayStatus = 'unknown' | 'no-data' | 'clear' | 'news-day';

// The economic-calendar feed only ever covers "this week" (see
// api/summary/index.ts) — there's no historical archive behind it. So for
// a trade placed outside that window, the honest answer is "no data",
// never "no news" (which would be a guess dressed up as a fact).
function checkNewsDay(pair: string | null, dateStr: string | null, events: NewsEvent[]):
  { status: NewsDayStatus; matches: NewsEvent[] } {
  if (!dateStr) return { status: 'unknown', matches: [] };
  const currencies = pairCurrencies(pair);
  if (currencies.length === 0) return { status: 'unknown', matches: [] };
  if (events.length === 0) return { status: 'no-data', matches: [] };

  const targetDay = new Date(dateStr).toDateString();
  const coversDate = events.some(e => new Date(e.date).toDateString() === targetDay);
  if (!coversDate) return { status: 'no-data', matches: [] };

  const matches = events.filter(e => {
    const d = new Date(e.date);
    if (d.toDateString() !== targetDay) return false;
    const impact = e.impact.toLowerCase();
    if (impact !== 'high' && impact !== 'medium') return false;
    return currencies.includes(e.country.toUpperCase());
  });

  return { status: matches.length > 0 ? 'news-day' : 'clear', matches };
}

export type TradePayload = Omit<Trade, 'id' | 'overall_gain' | 'overall_pct' | 'created_at'> & { id?: number };

type Props = {
  open: boolean;
  trade: Trade | null;
  customColumns: CustomColumn[];
  // Checklists are managed on their own Checklists tab now — the trade
  // panel only picks one and grades a trade against it, it doesn't
  // create/edit rules itself.
  checklists: Checklist[];
  nextTradeNumber: number;
  // Already-fetched trades for the currently active account (from Journal's
  // own fetch) — used only to work out a live current balance for the
  // Position Size Calculator below, not re-fetched here.
  trades: Trade[];
  onSave: (t: TradePayload) => Promise<void>;
  onClose: () => void;
  onAddCustomColumn: (name: string, type: string, accountIds?: number[]) => Promise<void>;
  // Optional so any existing caller that hasn't wired these up yet still
  // compiles - they just won't show the rename/delete affordance below
  // (matches how onAddCustomColumn already handled a missing account list
  // before this).
  onDeleteCustomColumn?: (id: number) => Promise<void>;
  onRenameCustomColumn?: (id: number, name: string) => Promise<void>;
};

const INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD', 'USDCAD', 'BTCUSD', 'ETHUSD', 'XAGUSD'];

// Fixed, curated emotion list for the Emotions picker in the right column's
// info bar - deliberately NOT free-form/user-editable (unlike Tags below,
// which is a whole separate system). Split into two visual groups purely
// for scannability: positive/disciplined states first, caution states
// second, reusing the same green/amber color vocabulary RiskGuardrail.tsx's
// statusColor already uses for "good" vs "watch out" rather than inventing
// new colors.
export const EMOTIONS_POSITIVE = ['Calm', 'Confident', 'Disciplined', 'Patient'];
export const EMOTIONS_CAUTION = ['FOMO', 'Impatient', 'Revenge Trade', 'Tilted'];

function empty(accountId: number, tradeNumber: number): TradePayload {
  return {
    account_id: accountId,
    trade_number: tradeNumber,
    start_capital: null, end_capital: null, gain_loss: null, gain_loss_pct: null,
    structure_15m: null, wr_1m: null, before_chart_1m: null,
    direction: 'Long', entry_type: null, tags: [], tag_selections: {},
    liquidity_swept: null, distance_from_asia: null, liquidity_swept_no: null,
    cisd_break: null, total_inverse_candles: null, inverse_candle_size: null,
    sl_pips: null, position_size: null,
    profit_loss: null, rr: null,
    gross_profit: null, commission: null, net_profit: null,
    entry_price: null, tp_price: null, sl_price: null,
    coin_token: null,
    trade_placed_at: new Date().toISOString().split('T')[0] ?? '',
    trade_executed_at: null, session_in: null,
    date_closed: null, time_closed: null, closed_session: null, trade_duration: null,
    partial_1: null, partial_2: null,
    reached_1r2: false, reached_1r3: false, reached_1r4: false, reached_1r5: false,
    max_rr: null, comments: null, extra_data: {}, screenshots: [], notes_blocks: [],
    checklist_enabled: false, checklist_id: null, checklist_results: {},
    emotions: [], trade_rating: null,
  };
}

function fromTrade(t: Trade): TradePayload {
  return {
    ...t, notes_blocks: t.notes_blocks ?? [], screenshots: t.screenshots ?? [], tags: t.tags ?? [], tag_selections: t.tag_selections ?? {},
    // Older trades saved before this feature existed won't have `emotions`
    // at all - default it to [] so the toggle-chip UI below doesn't crash
    // on .includes(). trade_rating is already nullable, so it needs no
    // equivalent fallback.
    emotions: t.emotions ?? [],
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pb-5 mb-5 border-b border-border last:border-0">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

// Field label sits to the left of its input rather than stacked above it,
// at a fixed width so every row in a section lines up into one aligned
// column - and stays a plain (non-bold) weight so the bold Section title
// above it remains the strongest thing on the page, not just the first.
const FIELD_LABEL_WIDTH = 'w-[126px]';
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className={cn('text-xs font-normal shrink-0', FIELD_LABEL_WIDTH)}>{label}</Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// Themed replacement for a native `<input list="...">` datalist - a browser
// datalist can't be styled at all (it always renders in the OS/browser's own
// light popup regardless of the app's dark theme, which is exactly the "not
// aligned with the theme" bug this was reported as), doesn't scroll past a
// browser-decided handful of rows, and has no way to show an explicit "add
// this as new" affordance - typing something new works, but nothing on
// screen says so. This is a real dropdown instead: matches TimeframePicker's
// shape in NotesEditor.tsx (click outside to close, a scrollable option
// list, an explicit add row), scoped to a single free-text field rather than
// a multi-select popover.
function PairPicker({ value, options, onChange, onPick }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query))
    : options;
  const exactMatch = options.some(o => o.toLowerCase() === query);
  const showAddRow = query.length > 0 && !exactMatch;

  function pick(v: string) {
    onPick(v);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input
          value={value}
          placeholder="e.g. EURUSD"
          onFocus={() => setOpen(true)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { onChange(e.target.value); setOpen(true); }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && showAddRow) { e.preventDefault(); pick(value.trim()); }
            if (e.key === 'Escape') setOpen(false);
          }}
          className="pr-8"
        />
        <ChevronDown
          className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        />
      </div>
      {open && (filtered.length > 0 || showAddRow) && (
        <div className="absolute top-full left-0 mt-1 z-20 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors',
                  o.toLowerCase() === query && 'bg-muted font-medium'
                )}
              >
                {o}
              </button>
            ))}
            {showAddRow && (
              <button
                type="button"
                onClick={() => pick(value.trim())}
                className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-muted transition-colors flex items-center gap-1.5 border-t border-border"
              >
                <Plus className="w-3.5 h-3.5" /> Add "{value.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ storageKey, title, subtitle, children }: {
  storageKey: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => window.localStorage.getItem(storageKey) === '1');

  function toggle() {
    setOpen(prev => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="pb-5 mb-5 border-b border-border last:border-0">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 w-full text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{title}</span>
      </button>
      {!open && subtitle && <p className="text-xs text-muted-foreground mt-1 ml-5">{subtitle}</p>}
      {open && <div className="flex flex-col gap-3 mt-3">{children}</div>}
    </div>
  );
}

function TpToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border-2 py-2 transition-colors cursor-pointer select-none',
        checked ? 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300' : 'border-border bg-muted/30 text-muted-foreground'
      )}
    >
      <span className="text-sm">{checked ? '✅' : '⬜'}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  );
}

// Defined at module scope (not inside TradeDetailPanel) on purpose: a
// component function declared inside another component's body gets a brand
// new function identity on every render, and React treats "different
// function identity" as "different component type" - so every keystroke
// (which updates `form` and re-renders the parent) was unmounting and
// remounting a fresh <input>, kicking focus out after a single character.
// Taking `value`/`onChange` as plain props instead of closing over
// `form`/`set` keeps this component's identity stable across renders, which
// is what actually fixes the focus loss.
function NumField({ label, value, onChange, step = 0.01, min, placeholder }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  step?: number; min?: number; placeholder?: string;
}) {
  return (
    <FieldRow label={label}>
      <Input
        type="number" step={step} min={min} placeholder={placeholder}
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </FieldRow>
  );
}

export default function TradeDetailPanel({
  open, trade, customColumns, checklists, nextTradeNumber, trades, onSave, onClose, onAddCustomColumn,
  onDeleteCustomColumn, onRenameCustomColumn,
}: Props) {
  const { accounts, activeAccountId } = useAccount();
  const [form, setForm] = useState<TradePayload>(() => empty(activeAccountId ?? 0, nextTradeNumber));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNewsPopover, setShowNewsPopover] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  // Which OTHER accounts (besides whichever is active right now) to also
  // create the new field on - see handleAddField below and the comment on
  // ManageColumnsDialog's matching picker for why this exists.
  const [newFieldAccountIds, setNewFieldAccountIds] = useState<number[]>([]);
  const otherAccountsForNewField = accounts.filter(a => a.id !== activeAccountId);
  // Inline rename of an existing custom field's label (not its col_key -
  // see the comment on api/columns.ts's PUT handler for why the key itself
  // never changes).
  const [editingColId, setEditingColId] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const [renamingCol, setRenamingCol] = useState(false);
  // Scoped to the active account, same as checklists' own grading picker -
  // a tag group's account_ids ('[]' = every account) decides whether it
  // shows up here. See api/columns.ts's getTagGroups for the matching
  // filter. Refetches automatically when the active account changes since
  // the URL itself changes (useFetch's effect deps include the url).
  const { data: rawTagGroups, refetch: refetchTagGroups } = useFetch<TagGroup[]>(`/columns?resource=tag_groups&account_id=${activeAccountId ?? ''}`);
  const tagGroups: TagGroup[] = rawTagGroups ?? [];
  const { data: rawTimeframes, refetch: refetchTimeframes } = useFetch<Timeframe[]>('/columns?resource=timeframes');
  const timeframes: Timeframe[] = rawTimeframes ?? [];
  const { data: rawInstruments, refetch: refetchInstruments } = useFetch<Instrument[]>('/columns?resource=instruments');
  // Merge the user's saved custom pairs in with the static presets, deduped
  // case-insensitively, so a pair they've typed before shows up in the
  // datalist right alongside EURUSD/GBPUSD/etc.
  const instrumentOptions: string[] = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...INSTRUMENTS, ...(rawInstruments ?? []).map(i => i.name)]) {
      const key = name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [rawInstruments]);

  // Guards the SL-distance auto-calc effect below against firing the moment
  // a trade loads: opening an existing trade (or switching between trades)
  // replaces `form` wholesale, which looks identical to the user having just
  // typed new Entry/SL prices - without this flag, every trade you opened
  // would have its saved SL Distance silently recomputed and overwritten
  // from the raw price difference the instant the panel opened, even if the
  // real distance included spread/slippage the naive calc can't see.
  const skipNextAutoSlPips = useRef(true);
  // Same idea as skipNextAutoSlPips, for the Gross/Commission/Partials ->
  // RR Achieved / Result auto-calc effect further down: without this, every
  // trade you opened would have its saved RR Achieved and Result silently
  // recomputed the instant the panel loaded, since loading a trade sets
  // form.gross_profit etc. all at once and looks identical to the user
  // having just typed them in.
  const skipNextAutoResult = useRef(true);
  // Whether Partial 1 / Partial 2 are shown at all - off by default so the
  // common case (one clean exit) only shows the four $ fields. Reopening a
  // trade that already has a partial filled in switches this on automatically
  // so that data isn't hidden.
  const [exitInPartials, setExitInPartials] = useState(false);

  useEffect(() => {
    if (open) {
      const nextForm = trade ? fromTrade(trade) : empty(activeAccountId ?? 0, nextTradeNumber);
      setForm(nextForm);
      setSaveError(null);
      setExitInPartials(nextForm.partial_1 != null || nextForm.partial_2 != null);
      skipNextAutoSlPips.current = true;
      skipNextAutoResult.current = true;
    }
  }, [open, trade, activeAccountId, nextTradeNumber]);

  // Rule: once both Entry Price and SL Price are filled in, SL Distance
  // (pips) keeps itself in sync with them automatically. You can still
  // hand-edit SL Distance afterward - that edit sticks until you change
  // either price again, at which point it's recalculated fresh.
  useEffect(() => {
    if (skipNextAutoSlPips.current) {
      skipNextAutoSlPips.current = false;
      return;
    }
    const pips = slPipsFromPrices(form.entry_price, form.sl_price, form.coin_token);
    if (pips != null) {
      setForm(p => (p.entry_price === form.entry_price && p.sl_price === form.sl_price ? { ...p, sl_pips: pips } : p));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.entry_price, form.sl_price, form.coin_token]);

  const activeChecklist = checklists.find(c => c.id === form.checklist_id) ?? null;

  const { data: newsData } = useFetch<{ events: NewsEvent[] }>('/summary?resource=news');
  const newsCheck = useMemo(
    () => checkNewsDay(form.coin_token, form.trade_placed_at, newsData?.events ?? []),
    [form.coin_token, form.trade_placed_at, newsData]
  );
  const checklistSummary = useMemo(() => {
    if (!form.checklist_enabled || !activeChecklist || activeChecklist.items.length === 0) return null;
    const followed = activeChecklist.items.filter(i => form.checklist_results[String(i.id)] === true).length;
    return { followed, total: activeChecklist.items.length };
  }, [form.checklist_enabled, form.checklist_results, activeChecklist]);

  // Position Size Calculator — uses the selected trade's own account (not
  // necessarily the globally active one, since a trade can belong to any
  // account) and, for the currently active account only, its live running
  // balance (starting balance + all trades so far) rather than the static
  // starting balance, so the suggested size reflects where the account
  // actually stands today. For any other account we fall back to its
  // starting balance since we don't have that account's trades loaded here.
  const selectedAccount = accounts.find(a => a.id === form.account_id) ?? null;
  const accountBalanceForSizing = useMemo(() => {
    if (!selectedAccount) return null;
    // starting_balance comes back from the API as a string (same as every
    // other Postgres NUMERIC column) even though it's typed as `number` -
    // coerce it explicitly rather than relying on the compile-time type.
    const startingBalanceNum = selectedAccount.starting_balance != null ? Number(selectedAccount.starting_balance) : null;
    if (form.account_id === activeAccountId) {
      const dd = computeDrawdown(trades, startingBalanceNum);
      return dd.currentBalance || startingBalanceNum;
    }
    return startingBalanceNum;
  }, [selectedAccount, form.account_id, activeAccountId, trades]);

  const sizing = useMemo(() => {
    if (accountBalanceForSizing == null) return null;
    return positionSizeLots({
      accountBalance: accountBalanceForSizing,
      riskPct: form.position_size,
      slPips: form.sl_pips,
      pair: form.coin_token,
      entryPrice: form.entry_price,
    });
  }, [accountBalanceForSizing, form.position_size, form.sl_pips, form.coin_token, form.entry_price]);

  // Dollar risk for THIS trade specifically, used to back RR Achieved out of
  // a $ P/L instead of the other way around. For a trade that's already
  // saved, its own start_capital (the server's sequential snapshot at the
  // point it happened) is the correct, precise base - using today's live
  // balance instead would be wrong for anything but the most recent trade.
  // For a brand-new unsaved trade there's no start_capital yet, so this
  // falls back to the same live-balance estimate the Position Size
  // calculator above already shows you.
  const riskBaseCapital = trade?.start_capital != null ? Number(trade.start_capital) : accountBalanceForSizing;
  const riskDollar = riskBaseCapital != null && form.position_size != null
    ? Math.round(riskBaseCapital * (form.position_size / 100) * 100) / 100
    : null;

  function set<K extends keyof TradePayload>(k: K, v: TradePayload[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  function setExtra(key: string, value: unknown) {
    setForm(p => ({ ...p, extra_data: { ...p.extra_data, [key]: value } }));
  }
  // The whole Result section funnels into RR Achieved + Result, from
  // whichever of two sources you actually filled in:
  //  1. Gross Profit/Loss ($) and Commissions ($) - the normal path. Net
  //     Profit = Gross - Commissions, and RR Achieved = Net Profit / this
  //     trade's dollar risk (needs Position Size % filled in above).
  //  2. Partial 1 (RR) + Partial 2 (RR), if you turn that toggle on - for
  //     when you scaled out at two distinct RR levels and want that exact
  //     precision rather than a blended $ result. When both are filled in,
  //     their average WINS over the $-derived RR, since it's a more precise,
  //     price-based fact about exactly where you exited.
  // Either way, Result (Profit/Loss/Breakeven) follows the sign of whichever
  // number won. You can still hand-edit RR Achieved or Result afterward -
  // since this effect only reacts to the inputs, not to rr/profit_loss
  // themselves, a manual edit sticks until you change one of the inputs again.
  useEffect(() => {
    if (skipNextAutoResult.current) {
      skipNextAutoResult.current = false;
      return;
    }
    const netProfit = form.gross_profit != null
      ? Math.round((form.gross_profit - (form.commission ?? 0)) * 100) / 100
      : null;

    let nextRr: number | null = null;
    let signSource: number | null = null; // whichever number's sign decides Result
    if (exitInPartials && form.partial_1 != null && form.partial_2 != null) {
      nextRr = Math.round(((form.partial_1 + form.partial_2) / 2) * 100) / 100;
      signSource = nextRr;
    } else if (netProfit != null && riskDollar != null && riskDollar > 0) {
      nextRr = Math.round((netProfit / riskDollar) * 100) / 100;
      signSource = netProfit;
    } else if (netProfit != null) {
      signSource = netProfit; // can't derive RR yet (no Position Size %), but Result can still follow the $ result
    }

    if (netProfit != null || nextRr != null) {
      setForm(p => ({
        ...p,
        net_profit: netProfit,
        ...(nextRr != null ? { rr: nextRr } : {}),
        ...(signSource != null ? { profit_loss: signSource > 0 ? 'Profit' : signSource < 0 ? 'Loss' : 'Breakeven' } : {}),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.gross_profit, form.commission, form.partial_1, form.partial_2, exitInPartials, riskDollar]);

  function setChecklistResult(itemId: number, value: boolean) {
    setForm(p => ({ ...p, checklist_results: { ...p.checklist_results, [String(itemId)]: value } }));
  }

  // Multi-select toggle for the fixed Emotions list - adds/removes `name`
  // from form.emotions, same on/off pattern as a checkbox.
  function toggleEmotion(name: string) {
    set('emotions', form.emotions.includes(name) ? form.emotions.filter(e => e !== name) : [...form.emotions, name]);
  }
  // Single-select for Trade Rating, with click-to-clear: clicking the star
  // at the currently-selected position again resets to null instead of
  // re-setting the same value, so a misclick is a second click to undo
  // rather than needing some separate "clear" affordance.
  function setTradeRating(n: number) {
    set('trade_rating', form.trade_rating === n ? null : n);
  }

  // Small typed helper so each <NumField> call site below doesn't have to
  // repeat `value={form.x} onChange={v => set('x', v)}` by hand.
  function numField<K extends keyof TradePayload>(field: K) {
    return {
      value: form[field] as unknown as number | null,
      onChange: (v: number | null) => set(field, v as TradePayload[K]),
    };
  }

  // Same fire-and-forget, server-deduped pattern as handleAddTimeframe below
  // - safe to call for every pick, whether it's an existing preset/saved
  // pair or a brand new one just typed in, since the POST itself is a
  // no-op (returns the existing row) when the name's already known.
  function handleAddInstrument(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    api.post('/columns', { resource: 'instruments', name: trimmed }).then(() => refetchInstruments()).catch(() => {});
  }

  // Safety net for the rare case a pair got typed directly into the field
  // without ever going through PairPicker's dropdown (e.g. autofill) - keeps
  // it from silently never being remembered.
  function saveNewInstrumentIfNeeded() {
    const name = (form.coin_token ?? '').trim();
    if (!name) return;
    const known = instrumentOptions.some(i => i.toLowerCase() === name.toLowerCase());
    if (known) return;
    handleAddInstrument(name);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form);
      saveNewInstrumentIfNeeded();
      onClose();
    } catch (e: any) {
      // Previously a failed save closed nothing but also said nothing — the
      // dialog just quietly re-enabled the Save button, so a rejected
      // request looked identical to a successful one and it was easy to
      // walk away thinking the edits had landed when they hadn't.
      setSaveError(e?.message ?? 'Save failed. Your changes were not saved — please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Same fire-and-forget idempotent pattern used for tag groups below: the
  // option is already applied to this trade locally (TagGroupsPicker
  // updates form.tag_selections immediately), this just registers it in
  // the reusable list so it's there next time and for other trades.
  function handleCreateTagGroup(name: string) {
    api.post('/columns', { resource: 'tag_groups', name }).then(() => refetchTagGroups()).catch(() => {});
  }
  function handleCreateTagGroupOption(groupId: number, groupName: string, optionName: string) {
    api.post('/columns', { resource: 'tag_group_options', group_id: groupId, name: optionName }).then(() => refetchTagGroups()).catch(() => {});
  }
  // Deleting a whole group is account-wide (it's a shared reusable
  // category, same as create) - api/columns.ts cascades the DELETE down to
  // every option under it in one query. This trade's own in-progress
  // selections still hold that group's name as a key in tag_selections
  // until refetchTagGroups() completes and the group disappears from
  // `groups`, so strip it locally right away too - otherwise the panel
  // would briefly still show the deleted group's chips for the trade
  // that's open right now. Trades that already had this group's tags
  // saved keep those values sitting in their own tag_selections (deleting
  // the group definition doesn't retroactively rewrite past trades) - they
  // just become inert, unmatched keys with nothing left to render them.
  function handleDeleteTagGroup(groupId: number, groupName: string) {
    if (!confirm(`Delete the "${groupName}" tag group? This removes it and all its tags for every trade - trades that already used it keep that history, but you won't be able to pick this group again.`)) return;
    api.del(`/columns?resource=tag_groups&id=${groupId}`).then(() => {
      refetchTagGroups();
      setForm(f => {
        if (!(groupName in f.tag_selections)) return f;
        const next = { ...f.tag_selections };
        delete next[groupName];
        return { ...f, tag_selections: next };
      });
    }).catch(() => {});
  }
  function handleDeleteTagGroupOption(optionId: number, groupName: string, optionName: string) {
    if (!confirm(`Delete the "${optionName}" tag from "${groupName}"?`)) return;
    api.del(`/columns?resource=tag_group_options&id=${optionId}`).then(() => {
      refetchTagGroups();
      setForm(f => {
        const current = f.tag_selections[groupName];
        if (!current || !current.includes(optionName)) return f;
        return { ...f, tag_selections: { ...f.tag_selections, [groupName]: current.filter(v => v !== optionName) } };
      });
    }).catch(() => {});
  }
  // Restricting a group to specific accounts (or back to "All accounts")
  // via TagGroupsPicker's new "Applies To" control. Since the tag groups
  // list is already scoped to the active account (see the useFetch call
  // above), narrowing a group's accounts to a set that no longer includes
  // the one currently open can make it disappear from this very list right
  // after refetching - that's the intended effect (the whole point of
  // scoping), not a bug.
  function handleUpdateTagGroupAccounts(groupId: number, accountIds: number[]) {
    api.put('/columns?resource=tag_groups', { id: groupId, account_ids: accountIds }).then(() => refetchTagGroups()).catch(() => {});
  }
  // Fire-and-forget, same as tag/tag-group creation above - NotesEditor
  // already applied the timeframe to the note block locally, this just
  // saves it to the reusable list for next time. A failure here (offline,
  // demo cap, etc.) isn't worth surfacing - worst case it just isn't
  // remembered as a quick-pick option next time.
  function handleAddTimeframe(name: string) {
    api.post('/columns', { resource: 'timeframes', name }).then(() => refetchTimeframes()).catch(() => {});
  }

  async function handleAddField() {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setAddingField(true);
    try {
      const ids = newFieldAccountIds.length > 0 && activeAccountId ? [activeAccountId, ...newFieldAccountIds] : undefined;
      await onAddCustomColumn(trimmed, newFieldType, ids);
      setNewFieldName('');
      setNewFieldType('text');
      setNewFieldAccountIds([]);
    } finally {
      setAddingField(false);
    }
  }
  function toggleNewFieldAccount(id: number) {
    setNewFieldAccountIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }

  function startEditCol(colId: number, name: string) {
    setEditingColId(colId);
    setEditingColName(name);
  }
  function cancelEditCol() {
    setEditingColId(null);
    setEditingColName('');
  }
  async function saveEditCol() {
    const trimmed = editingColName.trim();
    if (!trimmed || editingColId == null || !onRenameCustomColumn) { cancelEditCol(); return; }
    setRenamingCol(true);
    try {
      await onRenameCustomColumn(editingColId, trimmed);
      cancelEditCol();
    } finally {
      setRenamingCol(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — dims the rest of the app instead of covering it, and
          closing here matches the existing Cancel behavior (discards
          in-progress edits without a confirmation prompt). */}
      <div className="absolute inset-0 bg-black/60 animate-drawer-backdrop" onClick={onClose} />

      {/* Drawer — covers most of the viewport width (100% on small screens)
          rather than a full-screen takeover, so the journal table stays
          visible (dimmed) behind it, similar to FX Replay's trade panel.
          Widened from 70vw/760px to 88vw/980px - the left field column plus
          notes/screenshots on the right felt cramped at the old width,
          especially once Tags and Entry Type were added. */}
      <div className="relative h-full w-full sm:w-[75vw] sm:min-w-[900px] max-w-[1600px] bg-background border-l border-border shadow-2xl flex flex-col animate-drawer-slide">
        {/* Top bar */}
        <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
            <h2 className="text-sm font-semibold truncate">
              {trade ? `Trade #${trade.trade_number ?? trade.id}` : 'New Trade'}
              {form.coin_token && <span className="text-muted-foreground font-normal"> — {form.coin_token}</span>}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {saveError && <p className="text-xs text-destructive max-w-[280px] truncate" title={saveError}>{saveError}</p>}
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Trade'}</Button>
          </div>
        </div>

        {/* Body: fields (left) · notes + screenshots (right). The left
            column used to stay a fixed 300px even after the drawer itself
            was widened from 70vw to 88vw - every extra pixel went to the
            right (Notes/screenshots) panel, so the form fields never
            actually got the room the wider drawer implied. Now scales with
            the drawer (32%) between a floor and ceiling instead of a bare
            fixed width. */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Fixed pixel width (not a % of the drawer) so this column keeps
              its own size even as the overall drawer is narrowed - shrinking
              the drawer should give more of that space back to the page
              behind it, not cramp the form itself. */}
          <div className="w-[420px] shrink-0 overflow-y-auto border-r border-border px-5 py-5">
            {/* Grouped FX Replay-style: identity fields (account/asset/side/
                entry type/tags) first, then everything about going IN to the
                trade, then SL/TP together, then everything about coming OUT
                of it, then the result. */}
            <Section title="Trade Info">
              <FieldRow label="Account">
                <Select value={form.account_id} onChange={e => set('account_id', Number(e.target.value))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.type ? ` (${a.type})` : ''}</option>)}
                </Select>
              </FieldRow>
              <NumField label="Trade #" {...numField('trade_number')} step={1} min={1} />
              <FieldRow label="Pair">
                <PairPicker
                  value={form.coin_token ?? ''}
                  options={instrumentOptions}
                  onChange={(v) => set('coin_token', v || null)}
                  onPick={(v) => { set('coin_token', v || null); handleAddInstrument(v); }}
                />
              </FieldRow>
              <FieldRow label="Side">
                <Select value={form.direction} onChange={e => set('direction', e.target.value)}>
                  <option value="Long">Long ▲</option>
                  <option value="Short">Short ▼</option>
                </Select>
              </FieldRow>
              <FieldRow label="Entry Type">
                <Select value={form.entry_type ?? ''} onChange={e => set('entry_type', e.target.value || null)}>
                  <option value="">Select…</option>
                  {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FieldRow>
            </Section>

            <Section title="Entry">
              <FieldRow label="Date Placed">
                <Input type="date" value={form.trade_placed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_placed_at', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Execution Time">
                <Input type="time" value={form.trade_executed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_executed_at', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Session">
                <Select value={form.session_in ?? ''} onChange={e => set('session_in', e.target.value || null)}>
                  <option value="">Select…</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </FieldRow>
              <NumField label="Entry Price" {...numField('entry_price')} step={0.00001} placeholder="e.g. 1.0842" />
            </Section>

            <Section title="Stop Loss / Take Profit">
              <NumField label="SL Price" {...numField('sl_price')} step={0.00001} placeholder="e.g. 1.0810" />
              <NumField label="TP Price" {...numField('tp_price')} step={0.00001} placeholder="e.g. 1.0910" />
              <NumField
                label="SL Distance (pips)" {...numField('sl_pips')} step={0.1} min={0} placeholder="e.g. 18"
              />
              {form.entry_price != null && form.sl_price != null && (
                <p className="text-[11px] text-muted-foreground -mt-2 ml-[138px]">
                  Auto-calculated from Entry/SL Price — edit above to override.
                </p>
              )}
              <NumField label="Position Size (% of capital)" {...numField('position_size')} step={0.01} min={0} placeholder="e.g. 0.5" />

              {sizing && form.position_size != null && form.sl_pips != null && form.sl_pips > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Position Size Calculator
                  </p>
                  {sizing.lots != null ? (
                    <>
                      <p className="text-lg font-bold leading-tight">
                        {sizing.lots.toFixed(2)} lots
                        <span className="text-xs font-normal text-muted-foreground ml-1.5">
                          ({sizing.units?.toLocaleString()} units)
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Risking {fmtMoney(sizing.riskDollar)} ({form.position_size}% of {fmtMoney(accountBalanceForSizing)})
                        &nbsp;at {form.sl_pips} pip SL
                      </p>
                      {sizing.approximate && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                          Approximate — pip value for this pair is estimated at $10/pip (standard lot). Exact for
                          XXXUSD and USDJPY pairs.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Enter Position Size %, SL Distance (pips), and a pair to see a suggested lot size.
                    </p>
                  )}
                </div>
              )}
            </Section>

            <Section title="Exit">
              <FieldRow label="Date Closed">
                <Input type="date" value={form.date_closed ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('date_closed', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Time Closed">
                <Input type="time" value={form.time_closed ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('time_closed', e.target.value || null)} />
              </FieldRow>
              <FieldRow label="Closed Session">
                <Select value={form.closed_session ?? ''} onChange={e => set('closed_session', e.target.value || null)}>
                  <option value="">Select…</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </FieldRow>
            </Section>

            <Section title="Result">
              <NumField label="Gross Profit/Loss ($)" {...numField('gross_profit')} step={0.01} placeholder="e.g. 120 or -80" />
              <NumField label="Commissions ($)" {...numField('commission')} step={0.01} min={0} placeholder="e.g. 4.50" />

              <FieldRow label="Net Profit ($)">
                <div className={cn(
                  'h-9 flex items-center px-3 rounded-md border border-border bg-muted/30 text-sm font-mono',
                  form.net_profit == null
                    ? 'text-muted-foreground'
                    : cn('font-bold', form.net_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                )}>
                  {form.net_profit != null ? fmtMoney(form.net_profit) : 'Enter Gross Profit/Loss above'}
                </div>
              </FieldRow>

              <NumField label="RR Achieved" {...numField('rr')} step={0.1} placeholder="e.g. 3 or -1" />
              <p className="text-xs text-muted-foreground -mt-2">
                {riskDollar != null
                  ? `Auto-calculated as Net Profit ÷ your ${fmtMoney(riskDollar)} risk on this trade. Edit it directly any time.`
                  : 'Fill in Position Size % above to have this calculated from Net Profit automatically — or just type it in directly.'}
              </p>

              <FieldRow label="Result">
                <Select value={form.profit_loss ?? ''} onChange={e => set('profit_loss', e.target.value || null)}>
                  <option value="">Select…</option>
                  <option value="Profit">✅ Profit</option>
                  <option value="Loss">❌ Loss</option>
                  <option value="Breakeven">➖ Breakeven</option>
                </Select>
              </FieldRow>

              <div className="flex items-center justify-between">
                <Label className="text-xs">I exited in partials (two RR levels)</Label>
                <Switch checked={exitInPartials} onCheckedChange={setExitInPartials} />
              </div>
              {exitInPartials && (
                <>
                  <NumField label="Partial 1 (RR)" {...numField('partial_1')} step={0.1} min={0} />
                  <NumField label="Partial 2 (RR)" {...numField('partial_2')} step={0.1} min={0} />
                  <p className="text-xs text-muted-foreground -mt-2">
                    Once both are filled in, their average overrides RR Achieved above.
                  </p>
                </>
              )}

              <NumField label="Max RR Reached" {...numField('max_rr')} step={0.1} min={0} />

              <div>
                <Label className="text-xs mb-1.5 block">TP Levels Hit</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <TpToggle label="1:2" checked={form.reached_1r2} onChange={v => set('reached_1r2', v)} />
                  <TpToggle label="1:3" checked={form.reached_1r3} onChange={v => set('reached_1r3', v)} />
                  <TpToggle label="1:4" checked={form.reached_1r4} onChange={v => set('reached_1r4', v)} />
                  <TpToggle label="1:5" checked={form.reached_1r5} onChange={v => set('reached_1r5', v)} />
                </div>
              </div>

              {trade ? (
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div className={cn('rounded-lg border p-2 text-center', (trade.gain_loss ?? 0) >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10')}>
                    <p className="text-[10px] text-muted-foreground">Start Capital</p>
                    <p className="text-sm font-bold">{fmtMoney(trade.start_capital)}</p>
                  </div>
                  <div className={cn('rounded-lg border p-2 text-center', (trade.gain_loss ?? 0) >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10')}>
                    <p className="text-[10px] text-muted-foreground">Gain / Loss</p>
                    <p className={cn('text-sm font-bold', (trade.gain_loss ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                      {fmtMoney(trade.gain_loss)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">End Capital</p>
                    <p className="text-sm font-bold">{fmtMoney(trade.end_capital)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                  Start capital, P/L, and end capital are calculated automatically when you save — based on the account's balance and every trade's Position Size / RR, in order.
                </p>
              )}
            </Section>

            {/* The old "SMC / ICT Metrics (optional)" section used to live
                here with 1M Before Chart, Partial 1/2, and Max RR Reached.
                1M Before Chart is gone entirely (unused - see below), and
                the other three now live up in the Result section, right
                below RR Achieved, since that's the calculation they
                actually feed into. 15M Structure / 1M WR moved to Custom
                Fields earlier (see the migration in schema.sql). */}

            <CollapsibleSection
              storageKey="forexforge_panel_custom_open"
              title="Custom Fields"
              subtitle={customColumns.length ? `${customColumns.length} custom field${customColumns.length === 1 ? '' : 's'}` : 'Add your own fields for anything else you track'}
            >
              {customColumns.length > 0 && customColumns.map(col => (
                editingColId === col.id ? (
                  <div key={col.col_key} className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={editingColName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingColName(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') saveEditCol(); if (e.key === 'Escape') cancelEditCol(); }}
                      className={cn('text-xs', FIELD_LABEL_WIDTH)}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-green-600 dark:text-green-400" disabled={renamingCol} onClick={saveEditCol}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={cancelEditCol}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div key={col.col_key} className="flex items-center gap-1 group">
                    <FieldRow label={col.name}>
                      <Input
                        type={col.data_type === 'number' ? 'number' : 'text'}
                        value={String(form.extra_data[col.col_key] ?? '')}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setExtra(col.col_key, col.data_type === 'number' ? Number(e.target.value) : e.target.value)
                        }
                      />
                    </FieldRow>
                    {onRenameCustomColumn && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => startEditCol(col.id, col.name)} title="Rename field">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {onDeleteCustomColumn && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteCustomColumn(col.id)} title="Delete field">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )
              ))}

              {!addingField ? (
                <button
                  type="button"
                  onClick={() => setAddingField(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" /> Add your own field
                </button>
              ) : (
                <div className="flex flex-col gap-2 border border-dashed border-border rounded-md p-2.5">
                  <Input
                    value={newFieldName}
                    placeholder="Field name, e.g. Setup Type"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFieldName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddField()}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} className="text-xs flex-1">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes / No</option>
                    </Select>
                    <Button size="sm" onClick={handleAddField} disabled={!newFieldName.trim()}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingField(false); setNewFieldName(''); setNewFieldAccountIds([]); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {otherAccountsForNewField.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] text-muted-foreground">Also add to (besides {activeAccountId ? accounts.find(a => a.id === activeAccountId)?.name ?? 'this account' : 'this account'}):</p>
                      <div className="flex flex-wrap gap-1">
                        {otherAccountsForNewField.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleNewFieldAccount(a.id)}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[11px] font-medium border transition-colors',
                              newFieldAccountIds.includes(a.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                            )}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              storageKey="forexforge_panel_checklist_open"
              title="Checklist"
              subtitle={form.checklist_enabled ? (activeChecklist ? activeChecklist.name : 'Enabled — pick a checklist below') : 'Off — turn on to grade this trade against your rules'}
            >
              <div className="flex items-center justify-between">
                <Label className="text-xs">Enable checklist for this trade</Label>
                <Switch
                  checked={form.checklist_enabled}
                  onCheckedChange={v => set('checklist_enabled', v)}
                />
              </div>

              {form.checklist_enabled && (
                checklists.length > 0 ? (
                  <>
                    <FieldRow label="Checklist">
                      <Select
                        value={form.checklist_id ?? ''}
                        onChange={e => set('checklist_id', e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Select a checklist…</option>
                        {checklists.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                      </Select>
                    </FieldRow>

                    {activeChecklist && (
                      activeChecklist.items.length > 0 ? (
                        <div className="flex flex-col gap-2 mt-1">
                          {activeChecklist.items.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={!!form.checklist_results[String(item.id)]}
                                onCheckedChange={() => setChecklistResult(item.id, !form.checklist_results[String(item.id)])}
                                aria-label={item.text}
                              />
                              <span className="text-xs flex-1">
                                <span className="font-semibold text-muted-foreground mr-1">Rule {idx + 1}:</span>
                                {item.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          This checklist has no rules yet — add some on the <strong>Checklists</strong> tab.
                        </p>
                      )
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No checklists yet — create one on the <strong>Checklists</strong> tab first.
                  </p>
                )
              )}
            </CollapsibleSection>

            {/* Tags moved to the very bottom of the form, per feedback -
                the flat free-form tags picker was removed in favor of the
                FX Replay-style grouped sub-tags below, which now cover the
                same "label a trade" need with more structure. */}
            <Section title="Tags">
              <TagGroupsPicker
                groups={tagGroups}
                selections={form.tag_selections}
                onChange={(next) => set('tag_selections', next)}
                onCreateGroup={handleCreateTagGroup}
                onCreateOption={handleCreateTagGroupOption}
                onDeleteGroup={handleDeleteTagGroup}
                onDeleteOption={handleDeleteTagGroupOption}
                accounts={accounts}
                onUpdateGroupAccounts={handleUpdateTagGroupAccounts}
              />
            </Section>
          </div>

          {/* Right: notes + screenshots. Insights (win rate / profit factor /
              pie chart) moved to the Journal page itself — that's where you
              see every trade at once, so that's where trends about "every
              trade" belong, rather than tucked inside one trade's editor. */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 mb-4 flex flex-wrap gap-x-8 gap-y-2">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Checklist</span>
                <span className="text-sm font-medium">
                  {!form.checklist_enabled ? '—'
                    : !checklistSummary ? 'No rules'
                    : checklistSummary.followed === checklistSummary.total
                      ? `All ${checklistSummary.total} followed`
                      : `${checklistSummary.followed}/${checklistSummary.total} followed`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">News Day</span>
                {newsCheck.status === 'news-day' && (
                  // A native title="" tooltip here has a slow OS-level hover
                  // delay and no room for anything but plain text, which
                  // read as "nothing happens" - this is a real hover
                  // popover instead, shown/hidden on mouse enter/leave, with
                  // each event's flag, impact, local time, and forecast/
                  // previous/actual figures.
                  <span
                    className="relative"
                    onMouseEnter={() => setShowNewsPopover(true)}
                    onMouseLeave={() => setShowNewsPopover(false)}
                  >
                    <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400 cursor-help underline decoration-dotted underline-offset-4">
                      {newsCheck.matches.length} event{newsCheck.matches.length !== 1 ? 's' : ''} (hover for details)
                    </span>
                    {showNewsPopover && (
                      <div className="absolute z-50 top-full left-0 mt-2 w-80 max-w-[90vw] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">High/medium-impact events on this date</p>
                        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                          {newsCheck.matches.map((e, i) => (
                            <div key={i} className="text-xs border-b border-border last:border-0 pb-2 last:pb-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <CurrencyFlag code={e.country} />
                                <span className="font-semibold">{e.country}</span>
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                                  e.impact.toLowerCase() === 'high'
                                    // "High impact" is a heads-up/caution badge, not a
                                    // loss indicator - matches the app's dark-orange
                                    // "pay attention" convention (RiskGuardrail etc.)
                                    // rather than alarm-red.
                                    ? 'bg-orange-700/20 text-orange-700 dark:text-orange-400'
                                    : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                                )}>
                                  {e.impact}
                                </span>
                                <span className="text-muted-foreground ml-auto">
                                  {new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="font-medium">{e.title}</p>
                              {(e.forecast || e.previous || e.actual) && (
                                <div className="flex flex-wrap gap-x-3 text-muted-foreground mt-0.5">
                                  {e.actual && <span>Actual: {e.actual}</span>}
                                  {e.forecast && <span>Forecast: {e.forecast}</span>}
                                  {e.previous && <span>Previous: {e.previous}</span>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </span>
                )}
                {newsCheck.status === 'clear' && <span className="text-sm font-medium text-green-600 dark:text-green-400">Clear</span>}
                {newsCheck.status === 'no-data' && <span className="text-sm font-medium text-muted-foreground">No calendar data for this date</span>}
                {newsCheck.status === 'unknown' && <span className="text-sm font-medium text-muted-foreground">—</span>}
              </div>

              <div className="flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Duration</span>
                <span className="text-sm font-medium">
                  {form.date_closed ? (form.trade_duration ?? '—') : 'Trade still open'}
                </span>
              </div>
            </div>

            {/* Emotions + Trade Rating - a new, prominent capture point
                separate from the Tags system at the bottom of the left
                column. Placed right below the Checklist/News Day/Duration
                info bar above, per feedback that a Tags-based "Mindset"
                group was too buried in a long form to actually get used. */}
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 mb-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Smile className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-primary shrink-0">Emotions</span>
                <div className="flex flex-wrap gap-1.5">
                  {EMOTIONS_POSITIVE.map(name => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={form.emotions.includes(name)}
                      onClick={() => toggleEmotion(name)}
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium border transition-colors',
                        form.emotions.includes(name)
                          ? 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300'
                          : 'border-border bg-transparent text-muted-foreground hover:border-foreground/40'
                      )}
                    >
                      {name}
                    </button>
                  ))}
                  {EMOTIONS_CAUTION.map(name => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={form.emotions.includes(name)}
                      onClick={() => toggleEmotion(name)}
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium border transition-colors',
                        form.emotions.includes(name)
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'border-border bg-transparent text-muted-foreground hover:border-foreground/40'
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-primary shrink-0">Trade Rating</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Rate ${n}`}
                      aria-pressed={form.trade_rating === n}
                      onClick={() => setTradeRating(n)}
                      className="p-0.5 text-muted-foreground hover:text-yellow-500"
                      title="Click again to clear"
                    >
                      <Star
                        className={cn(
                          'w-4 h-4',
                          form.trade_rating != null && n <= form.trade_rating
                            ? 'fill-yellow-500 text-yellow-500'
                            : 'fill-none'
                        )}
                      />
                    </button>
                  ))}
                  {form.trade_rating != null && (
                    <span className="text-xs text-muted-foreground ml-1.5">{form.trade_rating}/5</span>
                  )}
                </div>
              </div>
            </div>

            <NotesEditor
              blocks={form.notes_blocks}
              onChange={(blocks) => set('notes_blocks', blocks)}
              timeframes={timeframes}
              onAddTimeframe={handleAddTimeframe}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
