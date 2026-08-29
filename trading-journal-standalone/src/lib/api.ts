import { useCallback, useEffect, useState } from 'react';
import { isDemoMode } from './demoMode';
import { handleDemoRequest } from './demoBackend';

const BASE = '/api';

async function request(method: string, url: string, body?: unknown) {
  // The public, no-signup full demo (/demo/app/*) runs every real page
  // completely unmodified against an in-memory fake backend instead of the
  // real API - this is the one place that swap happens. See
  // src/lib/demoMode.ts and src/lib/demoBackend.ts for why and how.
  if (isDemoMode()) {
    return handleDemoRequest(method, url, body);
  }
  const res = await fetch(BASE + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (url: string) => request('GET', url),
  post: (url: string, body?: unknown) => request('POST', url, body ?? {}),
  put: (url: string, body?: unknown) => request('PUT', url, body ?? {}),
  del: (url: string) => request('DELETE', url),
};

/** Fetches data on mount and exposes a refetch() you can call after mutations. */
export function useFetch<T>(url: string): { data: T | undefined; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(url)
      .then(d => { if (!cancelled) { setData(d); setError(null); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url, tick]);

  return { data, loading, error, refetch };
}
