import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Switch } from '../../lib/ui/form';
import { Trash2 } from 'lucide-react';
import { Account } from '../data/types';
import { AccountPatch, NewAccountPayload } from '../../lib/accounts';
import { api } from '../../lib/api';
import BrokerConnect from './BrokerConnect';
import ProBadge from '../../components/ProBadge';
import ProNotice from '../../components/ProNotice';

type Props = {
  open: boolean;
  account: Account | null; // null = creating a new account
  onSave: (payload: NewAccountPayload | AccountPatch) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onClose: () => void;
  /** How many accounts already exist — used only to decide whether to show
   * the Pro notice below (Free plan's line is 1 account). Optional and
   * defaults to 0 so existing callers that don't pass it just never show
   * the notice, rather than crashing. */
  existingAccountCount?: number;
};

type FormState = {
  name: string;
  type: string;
  starting_balance: string;
  active: boolean;
  daily_loss_limit_pct: string;
  max_drawdown_limit_pct: string;
  consistency_rule_pct: string;
  public_share_enabled: boolean;
  public_share_name: string;
  public_share_show_dollars: boolean;
};

function emptyForm(): FormState {
  return {
    name: '', type: '', starting_balance: '', active: true,
    daily_loss_limit_pct: '', max_drawdown_limit_pct: '', consistency_rule_pct: '',
    public_share_enabled: false, public_share_name: '', public_share_show_dollars: false,
  };
}

function fromAccount(a: Account): FormState {
  return {
    name: a.name,
    type: a.type ?? '',
    starting_balance: a.starting_balance != null ? String(a.starting_balance) : '',
    active: a.active,
    daily_loss_limit_pct: a.daily_loss_limit_pct != null ? String(a.daily_loss_limit_pct) : '',
    max_drawdown_limit_pct: a.max_drawdown_limit_pct != null ? String(a.max_drawdown_limit_pct) : '',
    consistency_rule_pct: a.consistency_rule_pct != null ? String(a.consistency_rule_pct) : '',
    public_share_enabled: a.public_share_enabled,
    public_share_name: a.public_share_name ?? '',
    public_share_show_dollars: a.public_share_show_dollars,
  };
}

const TYPE_SUGGESTIONS = ['Live', 'Paper', 'Backtest', 'Demo', 'Prop Firm'];

export default function AccountDialog({ open, account, onSave, onDelete, onClose, existingAccountCount = 0 }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The share token itself isn't part of the editable form - it's
  // server-generated (see api/accounts.ts), never typed by the user. Tracked
  // separately so "Regenerate Link" can update the shown URL immediately
  // without a full round trip through onSave/onClose.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(account ? fromAccount(account) : emptyForm());
      setShareToken(account?.public_share_token ?? null);
      setCopied(false);
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
        daily_loss_limit_pct: form.daily_loss_limit_pct.trim() === '' ? null : Number(form.daily_loss_limit_pct),
        max_drawdown_limit_pct: form.max_drawdown_limit_pct.trim() === '' ? null : Number(form.max_drawdown_limit_pct),
        consistency_rule_pct: form.consistency_rule_pct.trim() === '' ? null : Number(form.consistency_rule_pct),
        // Public Track Record fields only apply to an existing account (see
        // the gating on the section below) - a brand-new account has
        // nothing to attach a share token to yet.
        ...(account ? {
          public_share_enabled: form.public_share_enabled,
          public_share_name: form.public_share_name.trim() || null,
          public_share_show_dollars: form.public_share_show_dollars,
        } : {}),
      };
      await onSave(payload);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save account');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink() {
    if (!shareToken) return;
    const url = `${window.location.origin}/track/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can throw (e.g. insecure context, permission denied) -
      // the URL is still right there in the read-only input for a manual
      // copy, so just leave the "Copied!" state off rather than surfacing
      // an error for what's a minor convenience feature.
    }
  }

  async function handleRegenerateLink() {
    if (!account) return;
    if (!window.confirm('Regenerating this link will make the old one stop working for anyone you already sent it to. Continue?')) return;
    setError(null);
    setRegenerating(true);
    try {
      const res: { public_share_token: string } = await api.post('/accounts', {
        resource: 'regenerate_share_token',
        account_id: account.id,
      });
      setShareToken(res.public_share_token);
      setCopied(false);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to regenerate link');
    } finally {
      setRegenerating(false);
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
          {/* Only a 2nd+ account is normally Pro — the very first account
              someone creates is on the Free plan, so this notice is
              deliberately scoped to existingAccountCount >= 1. */}
          {!account && existingAccountCount >= 1 && <ProNotice feature="multi_account" />}

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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Daily Loss Limit % (optional)</Label>
              <Input
                type="number" step={0.1} min={0} placeholder="e.g. 5"
                value={form.daily_loss_limit_pct}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('daily_loss_limit_pct', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Max Drawdown Limit % (optional)</Label>
              <Input
                type="number" step={0.1} min={0} placeholder="e.g. 10"
                value={form.max_drawdown_limit_pct}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('max_drawdown_limit_pct', e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Consistency Rule % (optional)</Label>
            <Input
              type="number" step={0.1} min={0} placeholder="e.g. 20"
              value={form.consistency_rule_pct}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('consistency_rule_pct', e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            If this account is a prop-firm challenge, set these to match its rules (e.g. FTMO-style 5% daily / 10% max /
            20% consistency) to get a live guardrail on the Summary page showing how close you are to each limit.
            Leave blank to skip.
          </p>

          {account && (
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} />
              <Label>Active (shown in the account switcher)</Label>
            </div>
          )}

          {/* Connect a real MT4/MT5 broker account (FTMO, The5ers, or any
              other prop firm/broker on those platforms) so trades sync in
              automatically instead of being typed by hand. Only shown once
              the account already exists (same reasoning as the risk limits
              above - there's nothing to connect yet on a still-unsaved
              account), and lives in its own component since connecting,
              syncing, and disconnecting each have their own request/loading
              state that doesn't belong mixed into this form's. */}
          {account && <BrokerConnect accountId={account.id} />}

          {/* Public Track Record - a shareable, unguessable public URL
              showing a read-only summary of this account's performance to
              anyone with the link, no login required. Only shown once the
              account already exists, same reasoning as the sections above -
              there's no id yet to attach a share token to on a still-unsaved
              account. */}
          {account && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-3">
                <Switch checked={form.public_share_enabled} onCheckedChange={(v) => set('public_share_enabled', v)} />
                <Label className="flex items-center gap-1.5">
                  Enable public track record page
                  <ProBadge feature="public_track_record" />
                </Label>
              </div>

              {form.public_share_enabled && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <Label>Display name (optional)</Label>
                    <Input
                      value={form.public_share_name}
                      placeholder={account.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('public_share_name', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown to visitors instead of your account name, if you'd rather keep that private.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <Switch checked={form.public_share_show_dollars} onCheckedChange={(v) => set('public_share_show_dollars', v)} />
                      <Label>Show dollar amounts</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Off by default — visitors only see percentages, not your account size or dollar P/L.
                    </p>
                  </div>

                  {shareToken ? (
                    <div className="flex flex-col gap-1">
                      <Label>Shareable link</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={`${window.location.origin}/track/${shareToken}`} onFocus={(e) => e.currentTarget.select()} />
                        <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
                          {copied ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <Button
                        type="button" variant="outline" size="sm" className="self-start mt-1"
                        onClick={handleRegenerateLink} disabled={regenerating}
                      >
                        {regenerating ? 'Regenerating…' : 'Regenerate Link'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Save to generate your link.</p>
                  )}
                </div>
              )}
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
