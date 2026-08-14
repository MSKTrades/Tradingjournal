import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { X, Plus, Trash2, ImagePlus, Loader2, ZoomIn } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Textarea } from '../../lib/ui/form';
import { Trade, CustomColumn, SESSIONS, fmtMoney, fmtPct } from '../data/types';
import { cn } from '../../lib/utils';

export type TradePayload = Omit<Trade, 'id' | 'overall_gain' | 'overall_pct' | 'created_at'> & { id?: number };

type Props = {
  open: boolean;
  trade: Trade | null;
  customColumns: CustomColumn[];
  lastEndCapital: number | null;
  accountId: number;
  onSave: (t: TradePayload) => Promise<void>;
  onClose: () => void;
  onAddCustomColumn: (name: string, type: string) => Promise<void>;
};

const INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD', 'USDCAD', 'BTCUSD', 'ETHUSD', 'XAGUSD'];
const STRUCTURE_OPTS = ['Bullish', 'Bearish', 'Ranging'];

function empty(lastCap: number | null, accountId: number): TradePayload {
  return {
    account_id: accountId,
    trade_number: null, start_capital: lastCap, end_capital: null,
    gain_loss: null, gain_loss_pct: null,
    structure_15m: null, wr_1m: null, before_chart_1m: null,
    direction: 'Long',
    liquidity_swept: null, distance_from_asia: null, liquidity_swept_no: null,
    cisd_break: null, total_inverse_candles: null, inverse_candle_size: null,
    sl_pips: null, position_size: null,
    profit_loss: null, rr: null,
    coin_token: null,
    trade_placed_at: new Date().toISOString().split('T')[0] ?? '',
    trade_executed_at: null, session_in: null,
    date_closed: null, time_closed: null, closed_session: null, trade_duration: null,
    partial_1: null, partial_2: null,
    reached_1r2: false, reached_1r3: false, reached_1r4: false, reached_1r5: false,
    max_rr: null, comments: null, extra_data: {}, screenshots: [],
  };
}

function fromTrade(t: Trade): TradePayload {
  return { ...t, screenshots: t.screenshots ?? [] };
}

function previewPL(f: TradePayload) {
  if (!f.start_capital || !f.position_size) return null;
  const risk = f.start_capital * f.position_size / 100;
  if (f.profit_loss === 'Profit' && f.rr != null) {
    const gl = risk * f.rr;
    return { gain_loss: gl, gain_loss_pct: gl / f.start_capital * 100, end_capital: f.start_capital + gl };
  }
  if (f.profit_loss === 'Loss') {
    return { gain_loss: -risk, gain_loss_pct: -risk / f.start_capital * 100, end_capital: f.start_capital - risk };
  }
  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 pb-5 mb-5 border-b border-border last:border-0">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
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

export default function TradeDetailPanel({ open, trade, customColumns, lastEndCapital, accountId, onSave, onClose, onAddCustomColumn }: Props) {
  const [form, setForm] = useState<TradePayload>(() => empty(null, accountId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setForm(trade ? fromTrade(trade) : empty(lastEndCapital, accountId));
  }, [open, trade, lastEndCapital, accountId]);

  function set<K extends keyof TradePayload>(k: K, v: TradePayload[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  function setExtra(key: string, value: unknown) {
    setForm(p => ({ ...p, extra_data: { ...p.extra_data, [key]: value } }));
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
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
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

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of list) {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType: file.type,
        });
        uploaded.push(blob.url);
      }
      setForm(p => ({ ...p, screenshots: [...(p.screenshots ?? []), ...uploaded] }));
    } catch (e: any) {
      setUploadError(e?.message ?? 'Upload failed. Make sure Blob storage is set up for this Vercel project.');
    } finally {
      setUploading(false);
    }
  }

  function removeScreenshot(url: string) {
    setForm(p => ({ ...p, screenshots: (p.screenshots ?? []).filter(u => u !== url) }));
  }

  if (!open) return null;
  const pl = previewPL(form);
  const screenshots = form.screenshots ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
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
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Trade'}</Button>
        </div>
      </div>

      {/* Body: fields on the left, screenshots + notes on the right */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="w-[360px] shrink-0 overflow-y-auto border-r border-border px-5 py-5">
          <Section title="Trade Info">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Trade #" field="trade_number" step={1} min={1} />
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Direction</Label>
                <Select value={form.direction} onChange={e => set('direction', e.target.value)}>
                  <option value="Long">Long ▲</option>
                  <option value="Short">Short ▼</option>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-xs">Coin / Token / Pair</Label>
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
                <Label className="text-xs">Exec Time</Label>
                <Input type="time" value={form.trade_executed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_executed_at', e.target.value || null)} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-xs">Date Placed</Label>
                <Input type="date" value={form.trade_placed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_placed_at', e.target.value || null)} />
              </div>
              <StructureSelect label="15M Structure" value={form.structure_15m} onChange={v => set('structure_15m', v)} />
              <StructureSelect label="1M WR" value={form.wr_1m} onChange={v => set('wr_1m', v)} />
              <div className="col-span-2">
                <StructureSelect label="1M Before Chart" value={form.before_chart_1m} onChange={v => set('before_chart_1m', v)} />
              </div>
            </div>
          </Section>

          <Section title="SMC Metrics">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="CISD Break (candles)" field="cisd_break" step={1} min={0} placeholder="e.g. 7" />
              <NumField label="Total Inverse Candles" field="total_inverse_candles" step={1} min={0} />
              <NumField label="Inverse Candle Size" field="inverse_candle_size" step={0.01} min={0} placeholder="e.g. 0.35" />
              <NumField label="Distance from Asia H/L" field="distance_from_asia" step={0.1} min={0} />
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-xs">Liquidity Swept</Label>
                <Input value={form.liquidity_swept ?? ''} placeholder="e.g. Asia Session High, PDH, equal highs..."
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('liquidity_swept', e.target.value || null)} />
              </div>
              <NumField label="Liquidity Swept No." field="liquidity_swept_no" step={1} min={0} />
              <NumField label="SL Pips" field="sl_pips" step={0.1} min={0} />
              <NumField label="Position Size (%)" field="position_size" step={0.01} min={0} placeholder="e.g. 0.5" />
              {customColumns.map(col => (
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
            </div>

            {!addingField ? (
              <button
                type="button"
                onClick={() => setAddingField(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add your own field
              </button>
            ) : (
              <div className="flex flex-col gap-2 border border-dashed border-border rounded-md p-2.5 mt-1">
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
                  <Button size="sm" onClick={handleAddField} disabled={addingField && !newFieldName.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingField(false); setNewFieldName(''); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Results">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Profit / Loss</Label>
                <Select value={form.profit_loss ?? ''} onChange={e => set('profit_loss', e.target.value || null)}>
                  <option value="">Select…</option>
                  <option value="Profit">✅ Profit</option>
                  <option value="Loss">❌ Loss</option>
                </Select>
              </div>
              <NumField label="RR Achieved" field="rr" step={0.1} min={0} placeholder="e.g. 3" />
              <NumField label="Partial 1 (RR)" field="partial_1" step={0.1} min={0} />
              <NumField label="Partial 2 (RR)" field="partial_2" step={0.1} min={0} />
              <NumField label="Max RR Reached" field="max_rr" step={0.1} min={0} />
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
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">TP Levels Hit</Label>
              <div className="grid grid-cols-4 gap-1.5">
                <TpToggle label="1:2" checked={form.reached_1r2} onChange={v => set('reached_1r2', v)} />
                <TpToggle label="1:3" checked={form.reached_1r3} onChange={v => set('reached_1r3', v)} />
                <TpToggle label="1:4" checked={form.reached_1r4} onChange={v => set('reached_1r4', v)} />
                <TpToggle label="1:5" checked={form.reached_1r5} onChange={v => set('reached_1r5', v)} />
              </div>
            </div>
          </Section>

          <Section title="Capital">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Start Capital ($)</Label>
              <Input type="number" step={1} min={0} placeholder="e.g. 15000"
                value={form.start_capital ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  set('start_capital', e.target.value === '' ? null : Number(e.target.value))
                } />
            </div>
            {pl && (
              <div className="grid grid-cols-3 gap-2 mt-1">
                <div className={`rounded-lg border p-2 text-center ${pl.gain_loss >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                  <p className="text-[10px] text-muted-foreground">Gain / Loss</p>
                  <p className={`text-sm font-bold ${pl.gain_loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {fmtMoney(pl.gain_loss)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">G/L %</p>
                  <p className={`text-sm font-bold ${pl.gain_loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {fmtPct(pl.gain_loss_pct)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">End Capital</p>
                  <p className="text-sm font-bold">{fmtMoney(pl.end_capital)}</p>
                </div>
              </div>
            )}
            {!pl && (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                Set Start Capital, Position Size %, Profit/Loss and RR to see auto-calculated figures.
              </p>
            )}
          </Section>
        </div>

        {/* Right: big open canvas — screenshots + notes, Notion-style */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Screenshots</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1" />}
                {uploading ? 'Uploading…' : 'Add Screenshot'}
              </Button>
              <input
                ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
              className={cn(
                'rounded-xl border-2 border-dashed border-border p-4 transition-colors',
                screenshots.length === 0 && 'py-14 flex flex-col items-center justify-center gap-2 text-center'
              )}
            >
              {screenshots.length === 0 ? (
                <>
                  <ImagePlus className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drag & drop chart screenshots here, or click "Add Screenshot"</p>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {screenshots.map((url) => (
                    <div key={url} className="relative group rounded-lg overflow-hidden border border-border aspect-video bg-muted">
                      <img src={url} alt="Trade screenshot" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setLightbox(url)}>
                          <ZoomIn className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => removeScreenshot(url)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {uploadError && <p className="text-xs text-destructive mt-2">{uploadError}</p>}

            <p className="text-sm font-semibold mt-8 mb-2">Notes</p>
            <Textarea
              rows={10}
              placeholder="What was your reasoning for this trade? What would you do differently?"
              value={form.comments ?? ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('comments', e.target.value || null)}
            />
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Trade screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button className="absolute top-5 right-5 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
