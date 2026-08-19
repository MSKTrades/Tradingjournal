import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../lib/ui/dialog';
import { Button } from '../lib/ui/button';
import { Input, Textarea, Label } from '../lib/ui/form';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Contact form — replaces the old `mailto:support@pipecho.com` links
 * (sidebar Contact us, and the marketing header/footer) with an actual
 * in-app form. A `mailto:` link depends on the visitor having a desktop
 * mail client configured, which a lot of people simply don't (especially
 * on mobile) — this works for everyone, logged in or not, and the message
 * is never lost even if email delivery isn't configured (see
 * sendContactEmail in api/columns.ts) since every submission is stored in
 * contact_messages regardless and readable from the Admin page.
 *
 * Deliberately a totally different component from FeedbackDialog even
 * though the shape looks similar — this one asks for an email (since it
 * needs a reply address and works for logged-out visitors who have no
 * account email to fall back on) and is meant for anything needing an
 * actual response, unlike Feedback's one-way "here's an idea" box. */
const TRIGGER_CLASSES = {
  // Matches FeedbackDialog's own sidebar button exactly (icon handled
  // separately below since only this variant has one).
  sidebar: 'flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full',
  // Matches MarketingHeader's other nav links (Pricing, Blog).
  nav: 'px-3 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent',
  // Matches MarketingFooter's other links (Blog, Pricing, Log in).
  footer: 'text-muted-foreground hover:text-foreground',
} as const;

export default function ContactDialog({
  variant = 'sidebar', collapsed = false,
}: {
  variant?: keyof typeof TRIGGER_CLASSES;
  /** Sidebar-only: icon-only with a tooltip when the sidebar is collapsed,
   * same as FeedbackDialog. Ignored for nav/footer variants. */
  collapsed?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !email && user?.email) {
      // Prefill from the logged-in account, but only once on open — don't
      // clobber something they've already typed if they toggle the dialog.
      setEmail(user.email);
    }
    if (!next) {
      setTimeout(() => { setMessage(''); setDone(false); setError(null); }, 150);
    }
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Enter a valid email address.'); return; }
    if (!trimmedMessage) { setError('Write a message first.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Public endpoint — no session required, works for a logged-out
      // landing-page visitor same as a logged-in user (see api/columns.ts,
      // the resource === 'contact' handler before requireUserId).
      await api.post('/columns', { resource: 'contact', email: trimmedEmail, message: trimmedMessage });
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not send that — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          title={collapsed ? 'Contact us' : undefined}
          className={`${TRIGGER_CLASSES.sidebar} ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
        >
          <Mail className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Contact us</span>}
        </button>
      ) : (
        <button type="button" onClick={() => handleOpenChange(true)} className={TRIGGER_CLASSES[variant]}>
          Contact us
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>Message sent</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Thanks — we'll get back to you at {email}.
              </p>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Contact us</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Your email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Message</Label>
                  <Textarea
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
