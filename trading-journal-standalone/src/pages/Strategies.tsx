import { useState } from 'react';
import { Button } from '../lib/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Badge, Switch } from '../lib/ui/form';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, useFetch } from '../lib/api';
import StrategyDialog, { StrategyPayload } from './ui/StrategyDialog';
import { Strategy, Condition, FIELD_LABELS, WEEKDAYS } from './data/types';

function condLabel(c: Condition): string {
  const field = FIELD_LABELS[c.field] ?? c.field;
  return `${field} ${c.op} ${c.value}`;
}

export default function Strategies() {
  const { data: rawStrategies, loading, refetch } = useFetch<Strategy[]>('/strategies');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editStrat, setEditStrat] = useState<Strategy | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

const strategies: Strategy[] = (rawStrategies ?? []).map((s: any) => ({
  ...s,
  conditions: Array.isArray(s.conditions)
    ? s.conditions
    : (typeof s.conditions === 'string' ? JSON.parse(s.conditions || '[]') : []),
  days: Array.isArray(s.days)
    ? s.days
    : (typeof s.days === 'string' ? JSON.parse(s.days || '[]') : []),
  tp1_rr: Number(s.tp1_rr),
  tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
  split_percent: s.split_percent != null ? Number(s.split_percent) : null,
}));

  async function handleSave(payload: StrategyPayload) {
    if (payload.id != null) await api.put(`/strategies?id=${payload.id}`, payload);
    else await api.post('/strategies', payload);
    refetch();
  }

  async function handleDelete(id: number) {
    setDeleteId(id);
    await api.del(`/strategies?id=${id}`);
    setDeleteId(null);
    refetch();
  }

  async function handleToggleActive(strategy: Strategy) {
    await api.put(`/strategies?id=${strategy.id}`, { ...strategy, active: !strategy.active });
    refetch();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Strategies</h1>
          <p className="text-sm text-muted-foreground">
            Define filter rules and TP targets — the Summary page calculates results automatically.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditStrat(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Strategy
        </Button>
      </div>

      {loading && <div className="text-center py-16 text-muted-foreground">Loading…</div>}

      {!loading && strategies.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No strategies defined. Click <strong>Add Strategy</strong> to create one.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {strategies.map(s => (
          <Card key={s.id} className={`border ${s.active ? 'border-border' : 'border-border/40 opacity-60'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold">{s.name}</CardTitle>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={s.active} onCheckedChange={() => handleToggleActive(s)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditStrat(s); setDialogOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={deleteId === s.id} onClick={() => handleDelete(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Filter Conditions</p>
                {(!s.conditions || s.conditions.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic">All trades qualify (no conditions)</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {s.conditions.map((c, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-mono">{condLabel(c)}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Days Traded</p>
                {(!s.days || s.days.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic">All days</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.filter(d => s.days!.includes(d.value)).map(d => (
                      <Badge key={d.value} variant="outline" className="text-xs">{d.label}</Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Take Profit Rules</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-mono">TP1 = 1:{s.tp1_rr}</Badge>
                  {s.tp2_rr != null && (
                    <>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-mono">TP2 = 1:{s.tp2_rr}</Badge>
                      <Badge variant="outline" className="text-xs font-mono">{s.split_percent}% at TP1</Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 leading-relaxed">
                {s.tp2_rr != null && s.split_percent != null ? (
                  <>
                    <strong>Win (both):</strong> {(s.split_percent / 100 * s.tp1_rr + (1 - s.split_percent / 100) * s.tp2_rr).toFixed(1)}R
                    &nbsp;·&nbsp;
                    <strong>Partial (TP1 only):</strong> {(s.split_percent / 100 * s.tp1_rr).toFixed(1)}R
                    &nbsp;·&nbsp;
                    <strong>Loss:</strong> −1R
                  </>
                ) : (
                  <>
                    <strong>Win:</strong> +{s.tp1_rr}R &nbsp;·&nbsp; <strong>Loss:</strong> −1R
                  </>
                )}
              </div>

              {!s.active && <p className="text-xs text-muted-foreground italic">Inactive — excluded from Summary</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <StrategyDialog open={dialogOpen} strategy={editStrat} onSave={handleSave} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
