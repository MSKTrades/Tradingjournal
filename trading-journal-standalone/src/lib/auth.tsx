import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { identifyUser, resetAnalytics } from './analytics';

export type User = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  /** 'free' or 'pro' — the one field src/lib/proFeatures.ts's hasProAccess()
   * actually reads. Written by api/stripe.ts's webhook handler as real
   * Stripe subscription events come in; defaults to 'free' for every
   * account until they subscribe (see the users.plan column in schema.sql). */
  plan: string;
  /** Stripe's own subscription status (trialing/active/past_due/canceled/
   * etc.), for display on the Billing page only — hasProAccess() doesn't
   * read this directly, it reads the already-derived `plan` above. Null
   * until a subscription has ever existed. */
  stripe_subscription_status: string | null;
  /** ISO timestamp of the current billing period's end (or trial end),
   * for "renews on ..." / "trial ends ..." copy on the Billing page. Null
   * until a subscription has ever existed. */
  plan_current_period_end: string | null;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches just `user` (plan, subscription status, etc.) without
   * touching `loading` — unlike the mount-time refresh below, this is meant
   * to be called from an already-rendered page (Billing.tsx, after
   * returning from Stripe Checkout/the Billing Portal) where flipping
   * `loading` back to true would flash the app's full-page AuthSplash for
   * what should be a quiet background update. */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (): Promise<User | null> => {
    try {
      const data: { user: User | null } = await api.get('/columns?resource=auth');
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const u = await fetchUser();
    setUser(u);
    setLoading(false);
  }, [fetchUser]);

  const refreshUser = useCallback(async () => {
    const u = await fetchUser();
    setUser(u);
  }, [fetchUser]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fires for every path that lands on a real user - initial page-load
  // session check, password login, signup, and Google OAuth's redirect back
  // in (that one resolves through the same refresh() call above, not a
  // separate code path) - so there's exactly one place this needs to be
  // wired, not one per login method. Cleared on logout so PostHog doesn't
  // keep attributing a shared/public browser's next session to whoever was
  // last logged in on it.
  useEffect(() => {
    if (user) identifyUser(user.id, user.email);
    else resetAnalytics();
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const data: { user: User } = await api.post('/columns', { resource: 'auth', action: 'login', email, password });
    setUser(data.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const data: { user: User } = await api.post('/columns', { resource: 'auth', action: 'signup', email, password, name });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/columns', { resource: 'auth', action: 'logout' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
