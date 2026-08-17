import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X, ListChecks, Newspaper, Clock3 } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { Checkbox, Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trade, CustomColumn, Checklist, NewsEvent, TagGroup, SESSIONS, ENTRY_TYPES, fmtMoney } from '../data/types';
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
  onAddCustomColumn: (name: string, type: string) => Promise<void>;
};

const INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD', 'USDCAD', 'BTCUSD', 'ETHUSD', 'XAGUSD'];
const STRUCTURE_OPTS = ['Bullish', 'Bearish', 'Ranging'];

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
    entry_price: null, tp_price: null, sl_price: null,
    coin_token: null,
    trade_placed_at: new Date().toISOString().split('T')[0] ?? '',
    trade_executed_at: null, session_in: null,
    date_closed: null, time_closed: null, closed_session: null, trade_duration: null,
    partial_1: null, partial_2: null,
    reached_1r2: false, reached_1r3: false, reached_1r4: false, reached_1r5: false,
    max_rr: null, comments: null, extra_data: {}, screenshots: [], notes_blocks: [],
    checklist_enabled: false, checklist_id: null, checklist_results: {},
  };
}

function fromTrade(t: Trade): TradePayload {
  return { ...t, notes_blocks: t.notes_blocks ?? [], screenshots: t.screenshots ?? [], tags: t.tags ?? [], tag_selections: t.tag_selections ?? {} };
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

function StructureSelect({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <FieldRow label={label}>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Select…</option>
        {STRUCTURE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
      </Select>
    </FieldRow>
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
}: Props) {
  const { accounts, activeAccountId } = useAccount();
  const [form, setForm] = useState<TradePayload>(() => empty(activeAccountId ?? 0, nextTradeNumber));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNewsPopover, setShowNewsPopover] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const { data: rawTagGroups, refetch: refetchTagGroups } = useFetch<TagGroup[]>('/columns?resource=tag_groups');
  const tagGroups: TagGroup[] = rawTagGroups ?? [];

  // Guards the SL-distance auto-calc effect below against firing the moment
  // a trade loads: opening an existing trade (or switching between trades)
  // replaces `form` wholesale, which looks identical to the user having just
  // typed new Entry/SL prices - without this flag, every trade you opened
  // would have its saved SL Distance silently recomputed and overwritten
  // from the raw price difference the instant the panel opened, even if the
  // real distance included spread/slippage the naive calc can't see.
  const skipNextAutoSlPips = useRef(true);

  useEffect(() => {
    if (open) {
      setForm(trade ? fromTrade(trade) : empty(activeAccountId ?? 0, nextTradeNumber));
      setSaveError(null);
      skipNextAutoSlPips.current = true;
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

  function set<K extends keyof TradePayload>(k: K, v: TradePayload[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  function setExtra(key: string, value: unknown) {
    setForm(p => ({ ...p, extra_data: { ...p.extra_data, [key]: value } }));
  }
  function setChecklistResult(itemId: number, value: boolean) {
    setForm(p => ({ ...p, checklist_results: { ...p.checklist_results, [String(itemId)]: value } }));
  }

  // Small typed helper so each <NumField> call site below doesn't have to
  // repeat `value={form.x} onChange={v => set('x', v)}` by hand.
  function numField<K extends keyof TradePayload>(field: K) {
    return {
      value: form[field] as unknown as number | null,
      onChange: (v: number | null) => set(field, v as TradePayload[K]),
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form);
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

  async function handleAddField() {
    const trimmed = newFieldName.trim();
    if (!trimmed) return;
    setAddingField(true);
    try {
      await onAddCustomColumn(trimmed, newFieldType);
      setNewFieldName('');
      setNewFieldType('text');
    } finally {
      setAddingField(false);
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
                <>
                  <Input value={form.coin_token ?? ''} list="inst-list" placeholder="e.g. EURUSD"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('coin_token', e.target.value || null)} />
                  <datalist id="inst-list">{INSTRUMENTS.map(i => <option key={i} value={i} />)}</datalist>
                </>
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
              <FieldRow label="Result">
                <Select value={form.profit_loss ?? ''} onChange={e => set('profit_loss', e.target.value || null)}>
                  <option value="">Select…</option>
                  <option value="Profit">✅ Profit</option>
                  <option value="Loss">❌ Loss</option>
                  <option value="Breakeven">➖ Breakeven</option>
                </Select>
              </FieldRow>
              <NumField label="RR Achieved" {...numField('rr')} step={0.1} min={0} placeholder="e.g. 3" />

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

            <CollapsibleSection
              storageKey="forexforge_panel_smc_open"
              title="SMC / ICT Metrics (optional)"
              subtitle="Structure and session-based metrics"
            >
              {/* 15M Structure and 1M WR moved down to Custom Fields (see
                  the migration in schema.sql) - strategy-specific fields
                  that don't belong baked into every account by default.
                  1M Before Chart stays here since it wasn't part of that
                  move. */}
              <StructureSelect label="1M Before Chart" value={form.before_chart_1m} onChange={v => set('before_chart_1m', v)} />
              <NumField label="Partial 1 (RR)" {...numField('partial_1')} step={0.1} min={0} />
              <NumField label="Partial 2 (RR)" {...numField('partial_2')} step={0.1} min={0} />
              <NumField label="Max RR Reached" {...numField('max_rr')} step={0.1} min={0} />
            </CollapsibleSection>

            <CollapsibleSection
              storageKey="forexforge_panel_custom_open"
              title="Custom Fields"
              subtitle={customColumns.length ? `${customColumns.length} custom field${customColumns.length === 1 ? '' : 's'}` : 'Add your own fields for anything else you track'}
            >
              {customColumns.length > 0 && customColumns.map(col => (
                <FieldRow key={col.col_key} label={col.name}>
                  <Input
                    type={col.data_type === 'number' ? 'number' : 'text'}
                    value={String(form.extra_data[col.col_key] ?? '')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setExtra(col.col_key, col.data_type === 'number' ? Number(e.target.value) : e.target.value)
                    }
                  />
                </FieldRow>
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
                    <Button size="sm" variant="ghost" onClick={() => { setAddingField(false); setNewFieldName(''); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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
                                    ? 'bg-red-500/20 text-red-600 dark:text-red-400'
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

            <NotesEditor blocks={form.notes_blocks} onChange={(blocks) => set('notes_blocks', blocks)} />
          </div>
        </div>
      </div>
    </div>
  );
}
