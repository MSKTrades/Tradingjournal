import { useState } from 'react';
import { ChevronsUpDown, Check, Plus, Pencil, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAccount } from '../lib/accounts';
import { Account } from '../pages/data/types';
import AccountDialog from '../pages/ui/AccountDialog';
import ProBadge from './ProBadge';

export default function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
  const { accounts, loading, activeAccount, activeAccountId, setActiveAccountId, createAccount, updateAccount, deleteAccount } = useAccount();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const visibleAccounts = accounts.filter(a => a.active || a.id === activeAccountId);

  function openCreate() {
    setEditingAccount(null);
    setDialogOpen(true);
    setOpen(false);
  }
  function openEdit(a: Account, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingAccount(a);
    setDialogOpen(true);
    setOpen(false);
  }

  if (loading && accounts.length === 0) {
    return (
      <div className={cn('px-3 py-2 text-xs text-sidebar-muted', collapsed && 'text-center px-0')}>
        {collapsed ? '…' : 'Loading accounts…'}
      </div>
    );
  }

  return (
    <div className="relative px-3 py-2 border-b border-sidebar-border">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        title={collapsed ? (activeAccount?.name ?? 'Select account') : undefined}
        className={cn(
          'flex items-center gap-2 rounded-md text-sm font-medium w-full transition-colors hover:bg-white/5',
          collapsed ? 'justify-center px-0 py-2' : 'px-2 py-2'
        )}
      >
        <span className="flex items-center justify-center h-6 w-6 rounded bg-sidebar-active/15 text-sidebar-active text-xs font-bold shrink-0">
          {activeAccount?.name?.charAt(0).toUpperCase() ?? <Wallet className="w-3.5 h-3.5" />}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-left truncate text-sidebar-foreground">
              {activeAccount?.name ?? 'No account'}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 text-sidebar-muted shrink-0" />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute z-50 top-full mt-1 w-64 rounded-md border border-sidebar-border bg-sidebar shadow-lg py-1',
              collapsed ? 'left-0' : 'left-3'
            )}
          >
            <div className="max-h-64 overflow-y-auto">
              {visibleAccounts.length === 0 && (
                <p className="px-3 py-2 text-xs text-sidebar-muted">No accounts yet.</p>
              )}
              {visibleAccounts.map(a => (
                <div
                  key={a.id}
                  onClick={() => { setActiveAccountId(a.id); setOpen(false); }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer group hover:bg-white/5',
                    a.id === activeAccountId ? 'text-sidebar-active' : 'text-sidebar-foreground'
                  )}
                >
                  <Check className={cn('w-3.5 h-3.5 shrink-0', a.id !== activeAccountId && 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{a.name}</p>
                    {a.type && <p className="text-[10px] text-sidebar-muted truncate">{a.type}</p>}
                  </div>
                  <button
                    onClick={(e) => openEdit(a, e)}
                    className="opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-sidebar-foreground shrink-0 p-1"
                    title="Edit account"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-sidebar-border mt-1 pt-1">
              <button
                onClick={openCreate}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5"
              >
                <Plus className="w-3.5 h-3.5" /> New Account
                {/* The first account is Free — only a 2nd+ one is normally
                    Pro, so the badge only shows once you already have one. */}
                {accounts.length >= 1 && <ProBadge feature="multi_account" className="ml-auto" />}
              </button>
            </div>
          </div>
        </>
      )}

      <AccountDialog
        open={dialogOpen}
        account={editingAccount}
        existingAccountCount={accounts.length}
        onClose={() => setDialogOpen(false)}
        onSave={async (payload) => {
          if (editingAccount) await updateAccount(editingAccount.id, payload as any);
          else await createAccount(payload);
        }}
        onDelete={editingAccount ? (id) => deleteAccount(id) : undefined}
      />
    </div>
  );
}
