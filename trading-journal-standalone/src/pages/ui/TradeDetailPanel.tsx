import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { Checkbox, Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trade, CustomColumn, Checklist, SESSIONS, fmtMoney } from '../data/types';
import { useAccount } from '../../lib/accounts';
import { cn } from '../../lib/utils';
import NotesEditor from './NotesEditor';

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
    direction: 'Long',
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
  return { ...t, notes_blocks: t.notes_blocks ?? [], screenshots: t.screenshots ?? [] };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pb-5 mb-5 border-b border-border last:border-0">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
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
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
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
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Select…</option>
        {STRUCTURE_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
      </Select>
    </div>
  );
}

export default function TradeDetailPanel({
  open, trade, customColumns, checklists, nextTradeNumber, onSave, onClose, onAddCustomColumn,
}: Props) {
  const { accounts, activeAccountId } = useAccount();
  const [form, setForm] = useState<TradePayload>(() => empty(activeAccountId ?? 0, nextTradeNumber));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  useEffect(() => {
    if (open) {
      setForm(trade ? fromTrade(trade) : empty(activeAccountId ?? 0, nextTradeNumber));
      setSaveError(null);
    }
  }, [open, trade, activeAccountId, nextTradeNumber]);

  const activeChecklist = checklists.find(c => c.id === form.checklist_id) ?? null;

  function set<K extends keyof TradePayload>(k: K, v: TradePayload[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  function setExtra(key: string, value: unknown) {
    setForm(p => ({ ...p, extra_data: { ...p.extra_data, [key]: value } }));
  }
  function setChecklistResult(itemId: number, value: boolean) {
    setForm(p => ({ ...p, checklist_results: { ...p.checklist_results, [String(itemId)]: value } }));
  }

  function NumField({ label, field, step = 0.01, min, placeholder }: {
    label: string; field: keyof TradePayload; step?: number; min?: number; placeholder?: string;
  }) {
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number" step={step} min={min} placeholder={placeholder}
          value={(form[field] as number | null) ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            set(field, (e.target.value === '' ? null : Number(e.target.value)) as TradePayload[typeof field])
          }
        />
      </div>
    );
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

      {/* Drawer — covers ~60% of the viewport (100% on small screens) rather
          than a full-screen takeover, so the journal table stays visible
          (dimmed) behind it, similar to FX Replay's trade panel. */}
      <div className="relative h-full w-full sm:w-[60vw] sm:min-w-[680px] max-w-[1100px] bg-background border-l border-border shadow-2xl flex flex-col animate-drawer-slide">
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

        {/* Body: fields (left) · notes + screenshots (middle) · insights (right) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="w-[300px] shrink-0 overflow-y-auto border-r border-border px-5 py-5">
            <Section title="Trade Info">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Account</Label>
                <Select value={form.account_id} onChange={e => set('account_id', Number(e.target.value))}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.type ? ` (${a.type})` : ''}</option>)}
                </Select>
              </div>
              <NumField label="Trade #" field="trade_number" step={1} min={1} />
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Direction</Label>
                <Select value={form.direction} onChange={e => set('direction', e.target.value)}>
                  <option value="Long">Long ▲</option>
                  <option value="Short">Short ▼</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Pair</Label>
                <Input value={form.coin_token ?? ''} list="inst-list" placeholder="e.g. EURUSD"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('coin_token', e.target.value || null)} />
                <datalist id="inst-list">{INSTRUMENTS.map(i => <option key={i} value={i} />)}</datalist>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Session</Label>
                <Select value={form.session_in ?? ''} onChange={e => set('session_in', e.target.value || null)}>
                  <option value="">Select…</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Execution Time</Label>
                <Input type="time" value={form.trade_executed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_executed_at', e.target.value || null)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Date Placed</Label>
                <Input type="date" value={form.trade_placed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_placed_at', e.target.value || null)} />
              </div>
            </Section>

            <Section title="Entry & Exit">
              <NumField label="Entry Price" field="entry_price" step={0.00001} placeholder="e.g. 1.0842" />
              <NumField label="TP Price" field="tp_price" step={0.00001} placeholder="e.g. 1.0910" />
              <NumField label="SL Price" field="sl_price" step={0.00001} placeholder="e.g. 1.0810" />
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Date Closed</Label>
                <Input type="date" value={form.date_closed ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('date_closed', e.target.value || null)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Time Closed</Label>
                <Input type="time" value={form.time_closed ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('time_closed', e.target.value || null)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Closed Session</Label>
                <Select value={form.closed_session ?? ''} onChange={e => set('closed_session', e.target.value || null)}>
                  <option value="">Select…</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            </Section>

            <Section title="Result">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Result</Label>
                <Select value={form.profit_loss ?? ''} onChange={e => set('profit_loss', e.target.value || null)}>
                  <option value="">Select…</option>
                  <option value="Profit">✅ Profit</option>
                  <option value="Loss">❌ Loss</option>
                  <option value="Breakeven">➖ Breakeven</option>
                </Select>
              </div>
              <NumField label="RR Achieved" field="rr" step={0.1} min={0} placeholder="e.g. 3" />
              <NumField label="Position Size (% of capital)" field="position_size" step={0.01} min={0} placeholder="e.g. 0.5" />

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
              <StructureSelect label="15M Structure" value={form.structure_15m} onChange={v => set('structure_15m', v)} />
              <StructureSelect label="1M WR" value={form.wr_1m} onChange={v => set('wr_1m', v)} />
              <StructureSelect label="1M Before Chart" value={form.before_chart_1m} onChange={v => set('before_chart_1m', v)} />
              <NumField label="Partial 1 (RR)" field="partial_1" step={0.1} min={0} />
              <NumField label="Partial 2 (RR)" field="partial_2" step={0.1} min={0} />
              <NumField label="Max RR Reached" field="max_rr" step={0.1} min={0} />
            </CollapsibleSection>

            <CollapsibleSection
              storageKey="forexforge_panel_custom_open"
              title="Custom Fields"
              subtitle={customColumns.length ? `${customColumns.length} custom field${customColumns.length === 1 ? '' : 's'}` : 'Add your own fields for anything else you track'}
            >
              {customColumns.length > 0 && customColumns.map(col => (
                <div key={col.col_key} className="flex flex-col gap-1">
                  <Label className="text-xs">{col.name}</Label>
                  <Input
                    type={col.data_type === 'number' ? 'number' : 'text'}
                    value={String(form.extra_data[col.col_key] ?? '')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setExtra(col.col_key, col.data_type === 'number' ? Number(e.target.value) : e.target.value)
                    }
                  />
                </div>
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
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Checklist</Label>
                      <Select
                        value={form.checklist_id ?? ''}
                        onChange={e => set('checklist_id', e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Select a checklist…</option>
                        {checklists.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                      </Select>
                    </div>

                    {activeChecklist && (
                      activeChecklist.items.length > 0 ? (
                        <div className="flex flex-col gap-2 mt-1">
                          {activeChecklist.items.map(item => (
                            <div key={item.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={!!form.checklist_results[String(item.id)]}
                                onCheckedChange={() => setChecklistResult(item.id, !form.checklist_results[String(item.id)])}
                                aria-label={item.text}
                              />
                              <span className="text-xs flex-1">{item.text}</span>
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
          </div>

          {/* Right: notes + screenshots. Insights (win rate / profit factor /
              pie chart) moved to the Journal page itself — that's where you
              see every trade at once, so that's where trends about "every
              trade" belong, rather than tucked inside one trade's editor. */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6">
            <NotesEditor blocks={form.notes_blocks} onChange={(blocks) => set('notes_blocks', blocks)} />
          </div>
        </div>
      </div>
    </div>
  );
}
