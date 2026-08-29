// Whether the app is currently rendering inside the public, no-signup
// "full demo" (App.tsx's /demo/app/* routes — the real Summary/Journal/
// Performance/Strategies/Checklists pages, unmodified, wired to an
// in-memory fake backend instead of the real API). Deliberately derived
// from the URL path on every call rather than a stored flag that gets
// flipped on/off: a mutable global would need careful enable-on-enter /
// disable-on-exit bookkeeping (and a bug there could leak demo-mode
// routing into a real signup/login call, or vice versa) - reading
// location.pathname fresh every time makes that whole class of bug
// impossible. See src/lib/api.ts's request() for the one place this
// actually changes behavior.
export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/demo/app');
}

export const DEMO_BASE = '/demo/app';
