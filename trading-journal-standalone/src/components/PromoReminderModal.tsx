import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../lib/ui/dialog';
import { Button } from '../lib/ui/button';
import { REMINDER_CHECKPOINTS, type PromoCheckpoint } from '../lib/promo';

const DISMISSED_KEY_PREFIX = 'pipecho_promo_dismissed_';

function isDismissed(id: string) {
  return window.localStorage.getItem(DISMISSED_KEY_PREFIX + id) === '1';
}

function dismiss(id: string) {
  window.localStorage.setItem(DISMISSED_KEY_PREFIX + id, '1');
}

/** Finds the most recent reminder checkpoint that's due (today >= its date)
 * and hasn't been dismissed. Only ever surfaces one at a time - if someone
 * doesn't log in between the September and November checkpoints, they see
 * the November one, not a pile-up of three. */
function findActiveCheckpoint(): PromoCheckpoint | null {
  const today = new Date().toISOString().slice(0, 10);
  let active: PromoCheckpoint | null = null;
  for (const cp of REMINDER_CHECKPOINTS) {
    if (cp.date <= today && !isDismissed(cp.id)) active = cp;
  }
  return active;
}

/** Mounted inside the authenticated shell (Layout). Layout gets remounted on
 * every in-app navigation (each protected route wraps its own AuthedShell in
 * App.tsx), so "dismiss" always writes to localStorage - otherwise this
 * would pop up again on literally the next click. Marking only the current
 * checkpoint as seen is enough: findActiveCheckpoint() always resolves to
 * the LATEST due-and-undismissed checkpoint, so dismissing today's just
 * means the next one won't show until its own date arrives - a natural
 * "remind me later" with no separate code path needed. */
export default function PromoReminderModal() {
  const [checkpoint, setCheckpoint] = useState<PromoCheckpoint | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setCheckpoint(findActiveCheckpoint());
  }, []);

  function handleDismiss() {
    if (!checkpoint) return;
    dismiss(checkpoint.id);
    setCheckpoint(null);
  }

  function handleUpgrade() {
    handleDismiss();
    navigate('/pricing');
  }

  if (!checkpoint) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {checkpoint.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{checkpoint.body}</p>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>Remind me later</Button>
          <Button onClick={handleUpgrade}>View plans</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
