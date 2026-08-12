import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trash2, Plus } from 'lucide-react';
import { Strategy, Condition, CONDITION_FIELDS, OPS, WEEKDAYS } from '../data/types';

type Props = {
  open: boolean;
  strategy: Strategy | null;
  onSave: (s: StrategyPayload) => Promise<void>;
  onClose: () => void;
};

export type StrategyPayload = {
  id?: number;
  name: string;
  conditions: Condition[];
  days: number[];
  time_start: string | null;
  time_end: string | null;
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
  active: boolean;
  sort_order: number;
};

function emptyStrategy(): StrategyPayload {
  return {
    name: '',
    conditions: [],
    days: [],
    time_start: null,
    time_end: null,
    tp1_rr: 3,
    tp2_rr: null,
    split_percent: null,
    active: true,
    sort_order: 0,
  };
}

function toPayload(s: Strategy): StrategyPayload {
  return {
    id: s.id,
    name: s.name,
    conditions: s.conditions ?? [],
    days: s.days ?? [],
    time_start: s.time_start ?? null,
    time_end: s.time_end ?? null,
    tp1_rr: Number(s.tp1_rr),
    tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
    split_percent: s.split_percent != null ? Number(s.split_percent) : null,
    active: s.active,
    sort_order: s.sort_order,
  };
}

export default function StrategyDialog({ open, strategy, onSave, onClose }: Props) {
  const [form, setForm] = useState<StrategyPayload>(emptyStrategy);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(strategy ? toPayload(strategy) : emptyStrategy());
  }, [open, strategy]);

  function setField<K extends keyof StrategyPayload>(k: K, v: StrategyPayload[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function addCondition() {
    setForm(prev => ({ ...prev, conditions: [...prev.conditions, { field: 'cisd_break', op: '<=', value: 8 }] }));
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    setForm(prev => ({ ...prev, conditions: prev.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));
  }
  function removeCondition(i: number) {
    setForm(prev => ({ ...prev, conditions: prev.conditions.filter((_, idx) => idx !== i) }));
  }
  function toggleDay(day: number) {
    setForm(prev => ({ ...prev, days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day] }));
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  }

  if (!open) return null;
  const hasSplit = form.tp2_rr != null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{strategy ? 'Edit Strategy' : 'Add Strategy'}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1">
            <Label>Strategy Name</Label>
            <Input value={form.name} placeholder="e.g. Inverse 1:3"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Filter Conditions</Label>
              <Button variant="outline" size="sm" onClick={addCondition}><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
            {form.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions — all trades qualify.</p>}
            <div className="flex flex-col gap-2">
              {form.conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={cond.field} onChange={e => updateCondition(i, { field: e.target.value })} className="flex-1 text-xs">
                    {CONDITION_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </Select>
                  <Select value={cond.op} onChange={e => updateCondition(i, { op: e.target.value })} className="w-16 text-xs">
                    {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                  </Select>
                  <Input type="number" step={0.01} className="w-20 text-xs" value={cond.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(i, { value: Number(e.target.value) })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Days Traded</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(d => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    form.days.includes(d.value) ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {form.days.length === 0 ? 'No days selected — all days allowed.' : `Only trades placed on ${form.days.length} selected day(s) qualify.`}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Label>Take Profit Rules</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">TP1 (R multiple)</Label>
                <Input type="number" min={0.5} step={0.5} value={form.tp1_rr}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('tp1_rr', Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">TP2 (split exit)</Label>
                  <Switch checked={hasSplit} onCheckedChange={(v) => { setField('tp2_rr', v ? 5 : null); setField('split_percent', v ? 50 : null); }} />
                </div>
                <Input type="number" min={0.5} step={0.5} disabled={!hasSplit} value={hasSplit ? (form.tp2_rr ?? '') : ''} placeholder="e.g. 5"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('tp2_rr', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
            </div>

            {hasSplit && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">% of position closed at TP1 (remainder runs to TP2)</Label>
                <Input type="number" min={1} max={99} step={1} value={form.split_percent ?? 50}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('split_percent', Number(e.target.value))} />
              </div>
            )}

            {hasSplit && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Remainder after TP1 is assumed to run to break-even if TP2 is not reached.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={(v) => setField('active', v)} />
            <Label>Active (included in Summary)</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save Strategy'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
