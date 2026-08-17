import { useState } from 'react';
import { Button } from '../lib/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Input } from '../lib/ui/form';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { api, useFetch } from '../lib/api';
import { Checklist } from './data/types';
import DailyRoutine from './ui/DailyRoutine';

export default function Checklists() {
  const { data: rawChecklists, loading, refetch } = useFetch<Checklist[]>('/checklist');
  const checklists: Checklist[] = rawChecklists ?? [];

  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingItemFor, setAddingItemFor] = useState<number | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemValue, setEditItemValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function handleAddChecklist() {
    const name = newChecklistName.trim();
    if (!name) return;
    setBusy('add-checklist');
    try {
      await api.post('/checklist', { resource: 'checklist', name });
      setNewChecklistName('');
      setAddingChecklist(false);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleRenameChecklist(id: number) {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(`rename-${id}`);
    try {
      await api.put(`/checklist?resource=checklist&id=${id}`, { name });
      setRenamingId(null);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteChecklist(id: number) {
    if (!window.confirm('Delete this checklist and all its rules? Trades already graded against it keep their history, but the checklist itself is gone.')) return;
    setBusy(`delete-checklist-${id}`);
    try {
      await api.del(`/checklist?resource=checklist&id=${id}`);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleAddItem(checklistId: number) {
    const text = newItemText.trim();
    if (!text) return;
    setBusy(`add-item-${checklistId}`);
    try {
      await api.post('/checklist', { resource: 'item', checklist_id: checklistId, text });
      setNewItemText('');
      setAddingItemFor(null);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteItem(id: number) {
    setBusy(`delete-item-${id}`);
    try {
      await api.del(`/checklist?resource=item&id=${id}`);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  async function handleEditItem(id: number) {
    const text = editItemValue.trim();
    if (!text) return;
    setBusy(`edit-item-${id}`);
    try {
      await api.put(`/checklist?resource=item&id=${id}`, { text });
      setEditingItemId(null);
      refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Checklists</h1>
          <p className="text-sm text-muted-foreground">
            Define rule sets for the setups you trade — enable one on any trade to grade it against its rules.
          </p>
        </div>
        <Button size="sm" onClick={() => { setAddingChecklist(true); setNewChecklistName(''); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Checklist
        </Button>
      </div>

      <DailyRoutine />

      {loading && <div className="text-center py-16 text-muted-foreground">Loading…</div>}

      {!loading && checklists.length === 0 && !addingChecklist && (
        <div className="text-center py-16 text-muted-foreground">
          No checklists yet. Click <strong>Add Checklist</strong> to create one — e.g. "London Reversal" or "Breakout Setup".
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {addingChecklist && (
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4 flex flex-col gap-2">
              <Input
                autoFocus
                value={newChecklistName}
                placeholder="Checklist name, e.g. London Reversal"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewChecklistName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddChecklist()}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddChecklist} disabled={!newChecklistName.trim() || busy === 'add-checklist'}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingChecklist(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {checklists.map(cl => (
          <Card key={cl.id} className="border border-border">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                {renamingId === cl.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      autoFocus
                      value={renameValue}
                      className="h-7 text-sm"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameValue(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleRenameChecklist(cl.id)}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRenameChecklist(cl.id)} disabled={busy === `rename-${cl.id}`}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setRenamingId(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-base font-bold">{cl.name}</CardTitle>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => { setRenamingId(cl.id); setRenameValue(cl.name); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={busy === `delete-checklist-${cl.id}`} onClick={() => handleDeleteChecklist(cl.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-0">
              {cl.items.length === 0 && addingItemFor !== cl.id && (
                <p className="text-xs text-muted-foreground italic">No rules yet</p>
              )}

              {cl.items.map((item, idx) => (
                editingItemId === item.id ? (
                  <div key={item.id} className="flex items-center gap-1.5">
                    <span className="font-semibold text-muted-foreground text-sm shrink-0">Rule {idx + 1}:</span>
                    <Input
                      autoFocus
                      value={editItemValue}
                      className="h-7 text-sm flex-1"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditItemValue(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter') handleEditItem(item.id);
                        if (e.key === 'Escape') setEditingItemId(null);
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleEditItem(item.id)} disabled={busy === `edit-item-${item.id}`}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingItemId(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <span className="text-sm flex-1">
                      <span className="font-semibold text-muted-foreground mr-1.5">Rule {idx + 1}:</span>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setEditingItemId(item.id); setEditItemValue(item.text); }}
                      className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={busy === `delete-item-${item.id}`}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              ))}

              {addingItemFor === cl.id ? (
                <div className="flex flex-col gap-2 border border-dashed border-border rounded-md p-2 mt-1">
                  <Input
                    autoFocus
                    value={newItemText}
                    placeholder="Rule, e.g. Waited for CISD break"
                    className="text-xs"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewItemText(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAddItem(cl.id)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAddItem(cl.id)} disabled={!newItemText.trim() || busy === `add-item-${cl.id}`}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingItemFor(null); setNewItemText(''); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAddingItemFor(cl.id); setNewItemText(''); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add a rule
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
