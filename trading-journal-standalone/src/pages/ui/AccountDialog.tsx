import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Switch } from '../../lib/ui/form';
import { Trash2 } from 'lucide-react';
import { Account } from '../data/types';
import { AccountPatch, NewAccountPayload } from '../../lib/accounts';

type Props = {
  open: boolean;
  account: Account | null; // null = creating a new account
  onSave: (payload: NewAccountPayload | AccountPatch) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onClose: () => void;
};

type FormState = {
  name: string;
  type: string;
  starting_balance: string;
  active: boolean;
};

function emptyForm(): FormState {
  return { name: '', type: '', starting_balance: '', active: true };
}

function fromAccount(a: Account): FormState {
  return {
    name: a.name,
    type: a.type ?? '',
    starting_balance: a.starting_balance != null ? String(a.starting_balance) : '',
    active: a.active,
  };
}

const TYPE_SUGGESTIONS = ['Live', 'Paper', 'Backtest', 'Demo', 'Prop Firm'];

export default function AccountDialog({ open, account, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(account ? fromAccount(account) : emptyForm());
      setError(null);
    }
  }, [open, account]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type.trim() || null,
        starting_balance: form.starting_balance.trim() === '' ? null : Number(form.starting_balance),
        active: form.active,
        sort_order: account?.sort_order ?? 0,
      };
      await onSave(payload);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!account || !onDelete) return;
    if (!window.confirm(`Delete "${account.name}"? This can't be undone.`)) return;
    setError(null);
    setDeleting(true);
    try {
      await onDelete(account.id);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit Account' : 'New Account'}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <Label>Account Name</Label>
            <Input
              value={form.name}
              placeholder="e.g. Live GBPUSD, Paper Trading, Strategy A Test"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Type (optional)</Label>
            <Input
              value={form.type}
              list="account-type-list"
              placeholder="e.g. Live, Paper, Backtest"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('type', e.target.value)}
            />
            <datalist id="account-type-list">
              {TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
            </datalist>
            <p className="text-xs text-muted-foreground">Just a label — shown next to the account name. Any text works.</p>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Starting Balance (optional)</Label>
            <Input
              type="number" step={1} min={0} placeholder="e.g. 10000"
              value={form.starting_balance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('starting_balance', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Used as the default Start Capital for this account's first trade.</p>
          </div>

          {account && (
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
              <Label>Active (shown in the account switcher)</Label>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {account && onDelete && (
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : account ? 'Save Changes' : 'Create Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
