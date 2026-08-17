import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Button } from '../../lib/ui/button';
import { Textarea } from '../../lib/ui/form';
import { ClipboardList, Pencil, Trash2, X, Check } from 'lucide-react';
import { api, useFetch } from '../../lib/api';
import { DailyRoutineNote } from '../data/types';

// Local-date "today" (not UTC), matching the same reasoning already used for
// trade_placed_at / todayISODate() elsewhere in this app - a routine note
// for "today" should mean the trader's own calendar day, not UTC's.
function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtNoteDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// A free-text pre-trade routine note, one per calendar day - "checked every
// pair for CISD, no setup yet", daily bias, whatever the morning routine is.
// Lives on the Checklists page since it's the same "rules I hold myself to
// before I trade" spirit as the rule-set checklists above it, just captured
// as a running journal instead of a graded rule set.
export default function DailyRoutine() {
  const { data: rawNotes, refetch } = useFetch<DailyRoutineNote[]>('/checklist?resource=daily_routine');
  const notes: DailyRoutineNote[] = rawNotes ?? [];
  const today = todayISODate();

  const todayNote = notes.find(n => n.note_date.slice(0, 10) === today) ?? null;
  const history = notes.filter(n => n.note_date.slice(0, 10) !== today);

  // null = "untouched this session" - fall back to whatever's saved for
  // today (once it's loaded) rather than an empty box wiping a note you
  // already saved earlier today.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const savedTodayText = todayNote?.text ?? '';
  const todayText = draft ?? savedTodayText;
  const dirty = todayText !== savedTodayText;

  async function handleSaveToday() {
    setSaving(true);
    try {
      await api.post('/checklist', { resource: 'daily_routine', note_date: today, text: todayText });
      setDraft(null);
      refetch();
    } finally {
      setSaving(false);
    }
  }

  async function handleEditHistory(id: number) {
    setBusy(`edit-${id}`);
    try {
      await api.put(`/checklist?resource=daily_routine&id=${id}`, { text: editValue });
      setEditingId(null);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteHistory(id: number) {
    if (!window.confirm("Delete this day's note? This can't be undone.")) return;
    setBusy(`delete-${id}`);
    try {
      await api.del(`/checklist?resource=daily_routine&id=${id}`);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Daily Routine</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Notes on what you checked before trading today — pairs scanned, whether CISD's formed, daily bias, anything else worth remembering.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Today — {fmtNoteDate(today)}</p>
          <Textarea
            rows={4}
            placeholder="e.g. Checked EURUSD, GBPUSD, USDJPY for CISD — GU formed one on 15M, waiting for retrace into POI. Daily bias: bullish."
            value={todayText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <Button size="sm" onClick={handleSaveToday} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">History</p>
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
              {history.map(n => (
                <div key={n.id} className="rounded-md border border-border bg-muted/30 p-2.5 group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">{fmtNoteDate(n.note_date)}</p>
                    {editingId !== n.id && (
                      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => { setEditingId(n.id); setEditValue(n.text); }} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteHistory(n.id)} disabled={busy === `delete-${n.id}`} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {editingId === n.id ? (
                    <div className="flex flex-col gap-2 mt-1.5">
                      <Textarea rows={3} autoFocus className="text-sm" value={editValue}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditValue(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEditHistory(n.id)} disabled={busy === `edit-${n.id}`}>
                          <Check className="w-3.5 h-3.5 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap mt-1">
                      {n.text ? n.text : <span className="italic text-muted-foreground">No note</span>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
