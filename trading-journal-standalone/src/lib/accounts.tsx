import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { Account } from '../pages/data/types';

const STORAGE_KEY = 'forexforge_active_account';

export type NewAccountPayload = {
  name: string;
  type: string | null;
  starting_balance: number | null;
  daily_loss_limit_pct: number | null;
  max_drawdown_limit_pct: number | null;
  consistency_rule_pct: number | null;
};

export type AccountPatch = {
  name: string;
  type: string | null;
  starting_balance: number | null;
  active: boolean;
  sort_order: number;
  daily_loss_limit_pct: number | null;
  max_drawdown_limit_pct: number | null;
  consistency_rule_pct: number | null;
  // Public Track Record fields - optional because AccountDialog only ever
  // sends these when editing an existing account (a brand-new account has
  // no id yet to attach a share token to). See schema.sql / api/accounts.ts.
  public_share_enabled?: boolean;
  public_share_name?: string | null;
  public_share_show_dollars?: boolean;
};

type AccountContextValue = {
  accounts: Account[];
  loading: boolean;
  activeAccountId: number | null;
  activeAccount: Account | null;
  setActiveAccountId: (id: number) => void;
  refetch: () => Promise<void>;
  createAccount: (payload: NewAccountPayload) => Promise<Account>;
  updateAccount: (id: number, patch: AccountPatch) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

function getStoredId(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const n = stored ? Number(stored) : null;
  return n && !isNaN(n) ? n : null;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAccountId, setActiveAccountIdState] = useState<number | null>(getStoredId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data: Account[] = await api.get('/accounts');
      setAccounts(data);
      setActiveAccountIdState(prev => {
        if (prev != null && data.some(a => a.id === prev)) return prev;
        const fallback = data[0]?.id ?? null;
        if (fallback != null) window.localStorage.setItem(STORAGE_KEY, String(fallback));
        return fallback;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setActiveAccountId = useCallback((id: number) => {
    setActiveAccountIdState(id);
    window.localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const createAccount = useCallback(async (payload: NewAccountPayload) => {
    const created: Account = await api.post('/accounts', payload);
    await load();
    setActiveAccountId(created.id);
    return created;
  }, [load, setActiveAccountId]);

  const updateAccount = useCallback(async (id: number, patch: AccountPatch) => {
    await api.put(`/accounts?id=${id}`, patch);
    await load();
  }, [load]);

  const deleteAccount = useCallback(async (id: number) => {
    await api.del(`/accounts?id=${id}`);
    await load();
  }, [load]);

  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? null;

  return (
    <AccountContext.Provider
      value={{ accounts, loading, activeAccountId, activeAccount, setActiveAccountId, refetch: load, createAccount, updateAccount, deleteAccount }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within an AccountProvider');
  return ctx;
}
