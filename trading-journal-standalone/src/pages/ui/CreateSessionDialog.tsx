import { useEffect, useState } from 'react';
import { Loader2, PlusCircle, FileWarning, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select } from '../../lib/ui/form';
import { ChartDataset, BacktestSession } from '../data/types';
import { api } from '../../lib/api';

type Props = {
  open: boolean;
  onClose: () => void;
  datasets: ChartDataset[];
  // Present -> editing this session (name/capital/risk% only, pair and
  // start date are fixed once a session exists - changing either mid-session
  // would silently invalidate every trade already logged against it).
  // Absent -> creating a brand new session.
  editingSession?: BacktestSession | null;
  onSaved: (session: BacktestSession) => void;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Session creation is where pair + start date now live, replacing the old
// dataset dropdown + drag-a-slider flow directly on the Practice Backtest
// tab - see Backtest.tsx. A session's start_time is fixed for its lifetime:
// reopening it always resumes the replay from the exact same point, so
// results stay comparable across visits.
export default function CreateSessionDialog({ open, onClose, datasets, editingSession, onSaved }: Props) {
  const isEdit = !!editingSession;

  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [name, setName] = useState('');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [riskPct, setRiskPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingSession) {
      setDatasetId(editingSession.dataset_id);
      setStartDate(toDateStr(new Date(editingSession.start_time)));
      setName(editingSession.name ?? '');
      setInitialCapital(String(editingSession.initial_capital));
      setRiskPct(editingSession.default_risk_pct != null ? String(editingSession.default_risk_pct) : '');
    } else {
      setDatasetId(datasets[0]?.id ?? null);
      setStartDate('');
      setName('');
      setInitialCapital('10000');
      setRiskPct('');
    }
    setError(null);
  }, [open, editingSession, datasets]);

  const selectedDataset = datasets.find(d => d.id === datasetId) ?? null;
  const minDate = selectedDataset?.start_time ? toDateStr(new Date(selectedDataset.start_time)) : undefined;
  const maxDate = selectedDataset?.end_time ? toDateStr(new Date(selectedDataset.end_time)) : undefined;
  const dateOutOfRange = !isEdit && !!startDate && ((minDate && startDate < minDate) || (maxDate && startDate > maxDate));

  const capitalNum = Number(initialCapital);
  const riskNum = riskPct.trim() ? Number(riskPct) : null;
  const canSave = !saving && datasetId != null && (isEdit || !!startDate) && !dateOutOfRange
    && !isNaN(capitalNum) && capitalNum > 0
    && (riskNum == null || (!isNaN(riskNum) && riskNum > 0));

  async function handleSave() {
    if (!canSave || datasetId == null) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dataset_id: datasetId,
        name: name.trim() || null,
        initial_capital: capitalNum,
        default_risk_pct: riskNum,
        ...(isEdit ? {} : { start_time: new Date(`${startDate}T00:00:00Z`).toISOString() }),
      };
      const saved = isEdit
        ? await api.put(`/backtest?resource=sessions&id=${editingSession!.id}`, payload)
        : await api.post('/backtest', { resource: 'sessions', ...payload });
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? `Failed to ${isEdit ? 'save' : 'create'} session.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Session Settings' : 'Create Backtest Session'}</DialogTitle>
          {!saving && <DialogClose onClose={onClose} />}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? 'Rename this session or adjust its capital/risk settings. Pair and start date are locked once a session exists.'
              : 'A session is its own run through a pair\'s history - its own starting capital, its own fixed start point, its own trade log. Create as many as you want to compare setups or pairs side by side.'}
          </p>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">Pair</Label>
            <Select
              value={datasetId ?? ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDatasetId(Number(e.target.value))}
              disabled={saving || isEdit || datasets.length === 0}
            >
              {datasets.length === 0 && <option value="">No datasets fetched yet</option>}
              {datasets.map(d => <option key={d.id} value={d.id}>{d.pair}</option>)}
            </Select>
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                min={minDate}
                max={maxDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                disabled={saving || !selectedDataset}
              />
              <p className="text-xs text-muted-foreground">
                {selectedDataset
                  ? `Replay starts revealing candles from here. Available range: ${minDate} → ${maxDate}.`
                  : 'Fetch a dataset for this pair first (Fetch Data button).'}
              </p>
              {dateOutOfRange && (
                <p className="text-xs text-destructive">That date is outside the fetched data's range.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label className="text-xs">Session Name (optional)</Label>
            <Input
              placeholder={selectedDataset ? `${selectedDataset.pair} session` : 'e.g. GBPUSD - London reversal test'}
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Initial Capital ($)</Label>
              <Input
                type="number" min={0} step={100}
                value={initialCapital}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInitialCapital(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Default Risk % (optional)</Label>
              <Input
                type="number" min={0} step={0.1} placeholder="e.g. 1"
                value={riskPct}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRiskPct(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Default Risk % auto-fills each new trade's Position Size field below Entry - you can still change it per trade before logging.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Saving…</>
              : isEdit
                ? <><Save className="w-3.5 h-3.5 mr-1" /> Save Changes</>
                : <><PlusCircle className="w-3.5 h-3.5 mr-1" /> Create Session</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
