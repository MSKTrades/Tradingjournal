import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../utils';

export function Dialog({
  open, onOpenChange, children,
}: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) {
  if (!open) return null;
  // Rendered via a portal straight onto <body>, instead of inline inside
  // whatever page happens to be open - a modal rendered inline stays
  // subject to every ancestor's own stacking context (a `position:relative`
  // widget elsewhere on the page, like the Sessions timeline's colored
  // bars, could still end up compositing above a same-tree `fixed z-50`
  // overlay in some browsers/GPU-acceleration paths, which is exactly what
  // showed up as "the popup background looks transparent" - page content
  // visibly painting through the dialog). A <body>-level portal sidesteps
  // that class of bug entirely: the dialog's DOM node is a direct sibling
  // of the whole app, in the single flat top-level stacking context, so
  // z-50 unambiguously wins over everything the app renders. Also darkened
  // the backdrop from /50 to /70 so the dimmed page reads as clearly
  // "behind glass" rather than barely tinted.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full">{children}</div>
    </div>,
    document.body
  );
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  // No default max-w-* here - every call site already passes its own
  // (max-w-md / max-w-lg / max-w-2xl). Baking in a default used to collide
  // with a caller's override: cn() just concatenates class names with no
  // Tailwind-merge dedup, so having BOTH max-w-lg (here) and e.g. max-w-md
  // (caller) present at once left the winner decided by generated-CSS
  // ordering rather than by intent - AccountDialog's "max-w-md" was silently
  // losing to this default max-w-lg, rendering it wider than intended.
  return (
    <div className={cn('mx-auto max-h-[90vh] w-full overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg', className)}>
      {children}
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex items-start justify-between">{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn('text-base font-semibold', className)}>{children}</h2>;
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
      <X size={16} />
    </button>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
