import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Button } from '../../lib/ui/button';
import { Input, Label, Badge } from '../../lib/ui/form';
import { Wallet, Trash2 } from 'lucide-react';
import { api, useFetch } from '../../lib/api';
import { LedgerEntry, fmtMoney, plColor } from '../data/types';

// Local-date "today" (not UTC) - same reasoning already used for
// trade_placed_at / todayISODate() elsewhere in this app (see risk.ts,
// DailyRoutine.tsx).
function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtEntryDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type FormState = { entry_type: 'fee' | 'payout'; amount: string; entry_date: string; note: string };

function emptyForm(): FormState {
  return { entry_type: 'fee', amount: '', entry_date: todayISODate(), note: '' };
}

/** Renders on the Summary page, only when there's an active account - a
 * running ledger of account-level cash movements to/from the prop firm
 * (challenge fees paid, payouts received). Entirely separate from
 * per-trade P&L: never feeds recalcAccountCapital, trades.gain_loss, or the
 * drawdown/equity-curve math in risk.ts - purely a ledger + summary. See
 * ledger_entries in schema.sql and the resource=ledger branches in
 * api/accounts.ts. */
export default function PropPnlLedger({ accountId }: { accountId: number }) {
  const { data: rawEntries, loading, refetch } = useFetch<LedgerEntry[]>(`/accounts?resource=ledger&account_id=${accountId}`);
  const entries: LedgerEntry[] = rawEntries ?? [];

  const [form, setForm] = useState<FormState>(emptyForm);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  const totalFees = entries.filter(e => e.entry_type === 'fee').reduce((s, e) => s + Number(e.amount), 0);
  const totalPayouts = entries.filter(e => e.entry_type === 'payout').reduce((s, e) => s + Number(e.amount), 0);
  const net = totalPayouts - totalFees;

  async function handleAdd() {
    const amount = Number(form.amount);
    if (!form.amount.trim() || isNaN(amount) || amount <= 0 || !form.entry_date) return;
    setError(null);
    setAdding(true);
    try {
      await api.post('/accounts', {
        resource: 'ledger',
        account_id: accountId,
        entry_type: form.entry_type,
        amount,
        entry_date: form.entry_date,
        note: form.note.trim() || null,
      });
      setForm(emptyForm());
      refetch();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add entry');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await api.del(`/accounts?resource=ledger&id=${id}`);
      refetch();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Prop P&amp;L</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Challenge fees paid and payouts received on this account — separate from per-trade P&amp;L, purely a running ledger.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Fees Paid</p>
            {/* Softened from red to a dark orange - a fee outflow isn't an
                alarm state the way a breached risk limit is, and this now
                matches the same orange the Fee badge below uses. */}
            <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{fmtMoney(totalFees)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Payouts Received</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{fmtMoney(totalPayouts)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net Position</p>
            <p className={`text-lg font-bold ${plColor(net)}`}>
              {fmtMoney(net)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border border-dashed border-border rounded-md p-2.5">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Type</Label>
            <div className="flex rounded-md border border-input overflow-hidden h-8">
              <button
                type="button"
                onClick={() => set('entry_type', 'fee')}
                className={`px-2.5 text-xs font-medium ${form.entry_type === 'fee' ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent'}`}
              >
                Fee
              </button>
              <button
                type="button"
                onClick={() => set('entry_type', 'payout')}
                className={`px-2.5 text-xs font-medium ${form.entry_type === 'payout' ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent'}`}
              >
                Payout
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Amount</Label>
            <Input
              type="number" step={0.01} min={0} placeholder="e.g. 99"
              value={form.amount}
              className="h-8 text-xs w-28"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('amount', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Date</Label>
            <Input
              type="date"
              value={form.entry_date}
              className="h-8 text-xs"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('entry_date', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <Label className="text-[11px] text-muted-foreground">Note (optional)</Label>
            <Input
              value={form.note}
              placeholder="e.g. Phase 1 challenge fee"
              className="h-8 text-xs"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('note', e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8" onClick={handleAdd} disabled={adding || !form.amount.trim() || !form.entry_date}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {loading ? (
          <p className="text-xs text-muted-foreground italic">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No fees or payouts logged yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto pr-1">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center gap-2 group text-xs py-1 border-b border-border/50 last:border-0">
                <span className="text-muted-foreground w-20 shrink-0">{fmtEntryDate(entry.entry_date)}</span>
                <Badge
                  className={entry.entry_type === 'fee'
                    ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-400/30'
                    : 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30'}
                >
                  {entry.entry_type === 'fee' ? 'Fee' : 'Payout'}
                </Badge>
                <span className="font-mono font-medium w-20 shrink-0">{fmtMoney(Number(entry.amount))}</span>
                <span className="text-muted-foreground truncate flex-1">{entry.note}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  disabled={deletingId === entry.id}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
