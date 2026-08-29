import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { subscribeDemoCapToast } from '../lib/demoToast';

/** Mounted once, only inside the demo sandbox (see Layout.tsx's demoMode
 * prop) - listens for demoBackend.ts's showDemoCapToast() calls and shows
 * whatever it's told for a few seconds. This exists specifically because a
 * couple of real pages (Checklists.tsx's add-checklist/add-item handlers)
 * only wrap their API call in try/finally with no catch, so a thrown Error
 * from the fake backend would otherwise go completely unseen there - this
 * guarantees every capped action gets a visible message regardless of which
 * page triggered it. */
export default function DemoCapToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeDemoCapToast((msg) => {
      setMessage(msg);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-primary/30 bg-popover text-popover-foreground shadow-lg px-4 py-3 flex items-start gap-2.5 text-sm">
      <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
