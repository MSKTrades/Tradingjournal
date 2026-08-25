import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { CustomColumn } from '../data/types';

type DefaultColDef = { key: string; label: string };
type AccountRef = { id: number; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCols: DefaultColDef[];
  defaultVisibility: Record<string, boolean>;
  onToggleDefault: (key: string, visible: boolean) => void;
  customColumns: CustomColumn[];
  // Every account this user has, plus which one is active right now - used
  // by the "Also add to" picker below so a field meant to back a strategy
  // that runs across several accounts can be created identically on all of
  // them in one step, instead of the old flow (switch account, retype the
  // exact same field name, hope it comes out byte-for-byte the same) that
  // was quietly producing same-looking fields with different col_keys and
  // then silently failing to show up in Filter Conditions/Summary on
  // whichever accounts got a slightly different key.
  accounts: AccountRef[];
  activeAccountId: number | null;
  onAddCustomColumn: (name: string, type: string, accountIds?: number[]) => Promise<void>;
  onDeleteCustomColumn: (id: number) => Promise<void>;
  onRenameCustomColumn: (id: number, name: string) => Promise<void>;
};

function toKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default function ManageColumnsDialog({
  open, onClose,
  defaultCols, defaultVisibility, onToggleDefault,
  customColumns, accounts, activeAccountId, onAddCustomColumn, onDeleteCustomColumn, onRenameCustomColumn,
}: Props) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [extraAccountIds, setExtraAccountIds] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const otherAccounts = accounts.filter(a => a.id !== activeAccountId);

  function toggleExtraAccount(id: number) {
    setExtraAccountIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const ids = extraAccountIds.length > 0 && activeAccountId ? [activeAccountId, ...extraAccountIds] : undefined;
      await onAddCustomColumn(trimmed, newType, ids);
      setNewName('');
      setNewType('text');
      setExtraAccountIds([]);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(col: CustomColumn) {
    setEditingId(col.id);
    setEditingName(col.name);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }
  async function saveEdit() {
    const trimmed = editingName.trim();
    if (!trimmed || editingId == null) { cancelEdit(); return; }
    setRenaming(true);
    try {
      await onRenameCustomColumn(editingId, trimmed);
      cancelEdit();
    } finally {
      setRenaming(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Columns</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Default Columns</p>
          <div className="flex flex-col gap-2">
            {defaultCols.map(col => (
              <div key={col.key} className="flex items-center justify-between">
                <span className="text-sm">{col.label}</span>
                <Switch checked={defaultVisibility[col.key] !== false} onCheckedChange={(v) => onToggleDefault(col.key, v)} />
              </div>
            ))}
          </div>
        </div>

        <hr className="my-4 border-border" />

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Custom Columns</p>
          {customColumns.length === 0 && <p className="text-sm text-muted-foreground mb-3">No custom columns yet.</p>}
          <div className="flex flex-col gap-2 mb-4">
            {customColumns.map(col => (
              <div key={col.id} className="flex items-center justify-between gap-2 bg-muted/40 rounded px-3 py-2">
                {editingId === col.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      className="h-8 text-sm"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 dark:text-green-400" disabled={renaming} onClick={saveEdit}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelEdit}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{col.name}</p>
                      <p className="text-xs text-muted-foreground">{col.data_type}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(col)} title="Rename">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => onDeleteCustomColumn(col.id)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border border-dashed border-border rounded-lg p-3">
            <p className="text-sm font-medium">Add Column</p>
            <div className="flex flex-col gap-1">
              <Label>Column Name</Label>
              <Input
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                placeholder="e.g. Session, Setup Type"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Type</Label>
              <Select value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes / No</option>
              </Select>
            </div>
            {otherAccounts.length > 0 && (
              <div className="flex flex-col gap-1">
                <Label>Also add to</Label>
                <div className="flex flex-wrap gap-1.5">
                  {otherAccounts.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleExtraAccount(a.id)}
                      className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                        extraAccountIds.includes(a.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {extraAccountIds.length === 0
                    ? 'Field will only exist on the account you\'re currently viewing.'
                    : `Field will be created identically (same name & key) on this account plus ${extraAccountIds.length} more — useful for a strategy that runs across several accounts, so its condition actually finds the field everywhere it needs to.`}
                </p>
              </div>
            )}
            <Button onClick={handleAdd} disabled={adding || !newName.trim()} className="w-full">
              <Plus className="w-4 h-4 mr-1" />
              {adding ? 'Adding…' : 'Add Column'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Key will be: <code className="font-mono bg-muted px-1 rounded">{toKey(newName) || '…'}</code> — this
              is what stays fixed forever (renaming the field above only changes its label, never this key), so
              existing Filter Conditions and logged values never break.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
