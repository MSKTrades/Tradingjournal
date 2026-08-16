import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type User = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data: { user: User | null } = await api.get('/columns?resource=auth');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
