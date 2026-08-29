// A tiny pub/sub so the in-memory demo backend (demoBackend.ts) can surface
// a friendly message the moment it caps something ("you can add 1 trade in
// the demo"), independent of whether the page that triggered it actually
// has its own error UI wired up. Some real pages do (StrategyDialog,
// TradeDetailPanel both show a thrown Error inline) - but a couple
// (Checklists.tsx's add-checklist/add-item handlers) only wrap their API
// call in try/finally, no catch, so a thrown Error there would just log an
// unhandled rejection and go completely unseen. Firing a toast here as well
// means every capped action gets a visible message no matter which page
// triggered it, without having to touch those real pages at all - keeping
// them byte-for-byte the same as the real, logged-in app is the entire
// point of building the demo this way.
type Listener = (message: string) => void;
let listeners: Listener[] = [];

export function showDemoCapToast(message: string) {
  listeners.forEach(l => l(message));
}

export function subscribeDemoCapToast(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}
