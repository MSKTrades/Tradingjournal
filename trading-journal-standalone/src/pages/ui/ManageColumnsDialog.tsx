import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trash2, Plus } from 'lucide-react';
import { CustomColumn } from '../data/types';

type DefaultColDef = { key: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCols: DefaultColDef[];
  defaultVisibility: Record<string, boolean>;
  onToggleDefault: (key: string, visible: boolean) => void;
  customColumns: CustomColumn[];
  onAddCustomColumn: (name: string, type: string) => Promise<void>;
  onDeleteCustomColumn: (id: number) => Promise<void>;
};

function toKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default function ManageColumnsDialog({
  open, onClose,
  defaultCols, defaultVisibility, onToggleDefault,
  customColumns, onAddCustomColumn, onDeleteCustomColumn,
}: Props) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onAddCustomColumn(trimmed, newType);
      setNewName('');
      setNewType('text');
    } finally {
      setAdding(false);
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
                <div>
                  <p className="text-sm font-medium">{col.name}</p>
                  <p className="text-xs text-muted-foreground">{col.data_type}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onDeleteCustomColumn(col.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
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
            <Button onClick={handleAdd} disabled={adding || !newName.trim()} className="w-full">
              <Plus className="w-4 h-4 mr-1" />
              {adding ? 'Adding…' : 'Add Column'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Key will be: <code className="font-mono bg-muted px-1 rounded">{toKey(newName) || '…'}</code>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
