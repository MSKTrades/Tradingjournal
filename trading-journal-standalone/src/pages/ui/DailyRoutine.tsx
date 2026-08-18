import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Button } from '../../lib/ui/button';
import { Input } from '../../lib/ui/form';
import { ClipboardList, Pencil, Trash2, X, Check, Plus } from 'lucide-react';
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

// A section identifier: 'today' for the always-on-top today box, or a past
// note's numeric id for a History entry - used to key which row's add/edit
// controls are currently open, since both sections share the same
// add/edit/delete interaction.
type Section = 'today' | number;

// A single day's routine points, one below the other - "checked EU/GU/UJ for
// CISD", "confirmed daily bias", etc. Same "Point 1: / Point 2: ..." stacked
// list interaction as the rule-set checklists below it on this page, just
// journaling a running history instead of grading a fixed rule set against a
// trade. There's no dedicated per-point API - every add/edit/delete
// recomputes the day's full points array client-side and upserts the whole
// thing (POST for today, keyed by date; PUT by id for a past day), since a
// day's list is short and this keeps the API surface (and the Vercel Hobby
// function count) small.
export default function DailyRoutine() {
  const { data: rawNotes, refetch } = useFetch<DailyRoutineNote[]>('/checklist?resource=daily_routine');
  const notes: DailyRoutineNote[] = rawNotes ?? [];
  const today = todayISODate();

  const todayNote = notes.find(n => n.note_date.slice(0, 10) === today) ?? null;
  const todayPoints = todayNote?.points ?? [];
  const history = notes.filter(n => n.note_date.slice(0, 10) !== today);

  const [editingPoint, setEditingPoint] = useState<{ section: Section; index: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingFor, setAddingFor] = useState<Section | null>(null);
  const [newPointValue, setNewPointValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function pointsFor(section: Section): string[] {
    return section === 'today' ? todayPoints : (history.find(n => n.id === section)?.points ?? []);
  }

  // Every mutation recomputes the full array and upserts it - POST
  // (upsert-by-date) for today since it may not have a row yet, PUT-by-id
  // for a past day that already exists.
  async function savePoints(section: Section, points: string[]) {
    if (section === 'today') {
      await api.post('/checklist', { resource: 'daily_routine', note_date: today, points });
    } else {
      await api.put(`/checklist?resource=daily_routine&id=${section}`, { points });
    }
    refetch();
  }

  async function handleAddPoint(section: Section) {
    const text = newPointValue.trim();
    if (!text) return;
    setBusy(`add-${section}`);
    try {
      await savePoints(section, [...pointsFor(section), text]);
      setNewPointValue('');
      setAddingFor(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleEditPoint(section: Section, index: number) {
    const text = editValue.trim();
    if (!text) return;
    setBusy(`edit-${section}-${index}`);
    try {
      await savePoints(section, pointsFor(section).map((p, i) => (i === index ? text : p)));
      setEditingPoint(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePoint(section: Section, index: number) {
    setBusy(`delete-${section}-${index}`);
    try {
      await savePoints(section, pointsFor(section).filter((_, i) => i !== index));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteNote(id: number) {
    if (!window.confirm("Delete this day's routine? This can't be undone.")) return;
    setBusy(`delete-note-${id}`);
    try {
      await api.del(`/checklist?resource=daily_routine&id=${id}`);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  function renderPoints(section: Section, points: string[]) {
    return (
      <div className="flex flex-col gap-2">
        {points.length === 0 && addingFor !== section && (
          <p className="text-xs text-muted-foreground italic">No points yet</p>
        )}

        {points.map((point, idx) => (
          editingPoint?.section === section && editingPoint.index === idx ? (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="font-semibold text-muted-foreground text-sm shrink-0">Point {idx + 1}:</span>
              <Input
                autoFocus
                value={editValue}
                className="h-7 text-sm flex-1"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') handleEditPoint(section, idx);
                  if (e.key === 'Escape') setEditingPoint(null);
                }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleEditPoint(section, idx)} disabled={busy === `edit-${section}-${idx}`}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingPoint(null)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div key={idx} className="flex items-center gap-2 group">
              <span className="text-sm flex-1">
                <span className="font-semibold text-muted-foreground mr-1.5">Point {idx + 1}:</span>
                {point}
              </span>
              <button
                type="button"
                onClick={() => { setEditingPoint({ section, index: idx }); setEditValue(point); }}
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeletePoint(section, idx)}
                disabled={busy === `delete-${section}-${idx}`}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        ))}

        {addingFor === section ? (
          <div className="flex items-center gap-1.5 border border-dashed border-border rounded-md p-1.5 mt-1">
            <Input
              autoFocus
              value={newPointValue}
              placeholder="e.g. Checked EU/GU/UJ for confirmation"
              className="h-7 text-xs flex-1"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPointValue(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddPoint(section)}
            />
            <Button size="sm" className="h-7" onClick={() => handleAddPoint(section)} disabled={!newPointValue.trim() || busy === `add-${section}`}>
              Add
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setAddingFor(null); setNewPointValue(''); }}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setAddingFor(section); setNewPointValue(''); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1 self-start"
          >
            <Plus className="w-3.5 h-3.5" /> Add a point
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Daily Routine</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          What you check before trading today — pairs scanned, whether your setup has confirmed, daily bias, anything else worth remembering, one point at a time.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Today — {fmtNoteDate(today)}</p>
          {renderPoints('today', todayPoints)}
        </div>

        {history.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">History</p>
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
              {history.map(n => (
                <div key={n.id} className="rounded-md border border-border bg-muted/30 p-2.5 group/note">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{fmtNoteDate(n.note_date)}</p>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n.id)}
                      disabled={busy === `delete-note-${n.id}`}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover/note:opacity-100 transition-opacity shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {renderPoints(n.id, n.points ?? [])}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
