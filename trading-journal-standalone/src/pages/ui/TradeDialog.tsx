import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Textarea } from '../../lib/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../lib/ui/tabs';
import { Trade, CustomColumn, SESSIONS, fmtMoney, fmtPct } from '../data/types';

export type TradePayload = Omit<Trade, 'id' | 'overall_gain' | 'overall_pct' | 'created_at'> & { id?: number };

type Props = {
  open: boolean;
  trade: Trade | null;
  customColumns: CustomColumn[];
  lastEndCapital: number | null;
  onSave: (t: TradePayload) => Promise<void>;
  onClose: () => void;
};

const INSTRUMENTS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY', 'AUDUSD', 'USDCAD', 'BTCUSD', 'ETHUSD', 'XAGUSD'];
const STRUCTURE_OPTS = ['Bullish', 'Bearish', 'Ranging'];

function empty(lastCap: number | null): TradePayload {
  return {
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
    max_rr: null, comments: null, extra_data: {},
  };
}

function fromTrade(t: Trade): TradePayload { return { ...t }; }

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

function TpToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-colors cursor-pointer select-none ${
        checked ? 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300' : 'border-border bg-muted/30 text-muted-foreground'
      }`}
    >
      <span className="text-lg">{checked ? '✅' : '⬜'}</span>
      <span className="text-xs font-bold">{label}</span>
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

export default function TradeDialog({ open, trade, customColumns, lastEndCapital, onSave, onClose }: Props) {
  const [form, setForm] = useState<TradePayload>(empty(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(trade ? fromTrade(trade) : empty(lastEndCapital));
  }, [open, trade, lastEndCapital]);

  function set<K extends keyof TradePayload>(k: K, v: TradePayload[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  function setExtra(key: string, value: unknown) {
    setForm(p => ({ ...p, extra_data: { ...p.extra_data, [key]: value } }));
  }

  function NumField({ label, field, step = 0.01, min, placeholder, span }: {
    label: string; field: keyof TradePayload; step?: number; min?: number; placeholder?: string; span?: boolean;
  }) {
    return (
      <div className={`flex flex-col gap-1 ${span ? 'col-span-2' : ''}`}>
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

  const pl = previewPL(form);
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trade ? `Edit Trade #${trade.trade_number ?? trade.id}` : 'Add Trade'}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="capital">Capital</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Trade #" field="trade_number" step={1} min={1} />
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Coin / Token / Pair</Label>
                <Input value={form.coin_token ?? ''} list="inst-list" placeholder="e.g. EURUSD"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('coin_token', e.target.value || null)} />
                <datalist id="inst-list">{INSTRUMENTS.map(i => <option key={i} value={i} />)}</datalist>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Direction</Label>
                <Select value={form.direction} onChange={e => set('direction', e.target.value)}>
                  <option value="Long">Long ▲</option>
                  <option value="Short">Short ▼</option>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Session</Label>
                <Select value={form.session_in ?? ''} onChange={e => set('session_in', e.target.value || null)}>
                  <option value="">Select…</option>
                  {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>

              <StructureSelect label="15M Structure" value={form.structure_15m} onChange={v => set('structure_15m', v)} />
              <StructureSelect label="1M WR" value={form.wr_1m} onChange={v => set('wr_1m', v)} />
              <div className="col-span-2">
                <StructureSelect label="1M Before Chart" value={form.before_chart_1m} onChange={v => set('before_chart_1m', v)} />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Date Placed</Label>
                <Input type="date" value={form.trade_placed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_placed_at', e.target.value || null)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Exec Time</Label>
                <Input type="time" value={form.trade_executed_at ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('trade_executed_at', e.target.value || null)} />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <Label className="text-xs">Comments</Label>
                <Textarea rows={2} value={form.comments ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('comments', e.target.value || null)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="metrics">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="CISD Break (candles)" field="cisd_break" step={1} min={0} placeholder="e.g. 7" />
              <NumField label="Total Inverse Candles" field="total_inverse_candles" step={1} min={0} />
              <NumField label="Inverse Candle Size (ratio)" field="inverse_candle_size" step={0.01} min={0} placeholder="e.g. 0.35" />
              <NumField label="Distance from Asia H/L (pips)" field="distance_from_asia" step={0.1} min={0} />

              <div className="flex flex-col gap-1 col-span-2">
                <Label className="text-xs">Liquidity Swept (e.g. Asia Session High, PDH, EQH)</Label>
                <Input value={form.liquidity_swept ?? ''} placeholder="e.g. Asia Session High, PDH, equal highs..."
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('liquidity_swept', e.target.value || null)} />
              </div>

              <NumField label="Liquidity Swept No." field="liquidity_swept_no" step={1} min={0} />
              <NumField label="SL Pips" field="sl_pips" step={0.1} min={0} />
              <NumField label="Position Size (% of capital)" field="position_size" step={0.01} min={0} placeholder="e.g. 0.5" />

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
          </TabsContent>

          <TabsContent value="results">
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

              <div className="col-span-2">
                <Label className="text-xs mb-2 block">TP Levels Hit (click to toggle)</Label>
                <div className="grid grid-cols-4 gap-2">
                  <TpToggle label="1:2" checked={form.reached_1r2} onChange={v => set('reached_1r2', v)} />
                  <TpToggle label="1:3" checked={form.reached_1r3} onChange={v => set('reached_1r3', v)} />
                  <TpToggle label="1:4" checked={form.reached_1r4} onChange={v => set('reached_1r4', v)} />
                  <TpToggle label="1:5" checked={form.reached_1r5} onChange={v => set('reached_1r5', v)} />
                </div>
              </div>

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
          </TabsContent>

          <TabsContent value="capital">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 col-span-2">
                <Label className="text-xs">Start Capital ($)</Label>
                <Input type="number" step={1} min={0} placeholder="e.g. 15000"
                  value={form.start_capital ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    set('start_capital', e.target.value === '' ? null : Number(e.target.value))
                  } />
              </div>

              {pl && (
                <div className="col-span-2 grid grid-cols-3 gap-3">
                  <div className={`rounded-lg border p-3 text-center ${pl.gain_loss >= 0 ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <p className="text-xs text-muted-foreground">Gain / Loss</p>
                    <p className={`text-lg font-bold ${pl.gain_loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {fmtMoney(pl.gain_loss)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground">G/L %</p>
                    <p className={`text-lg font-bold ${pl.gain_loss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {fmtPct(pl.gain_loss_pct)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs text-muted-foreground">End Capital</p>
                    <p className="text-lg font-bold">{fmtMoney(pl.end_capital)}</p>
                  </div>
                </div>
              )}

              {!pl && (
                <p className="col-span-2 text-xs text-muted-foreground bg-muted/30 rounded p-3">
                  Set Start Capital, Position Size %, Profit/Loss and RR to see auto-calculated figures.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Trade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
