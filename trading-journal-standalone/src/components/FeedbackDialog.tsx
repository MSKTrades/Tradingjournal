import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../lib/ui/dialog';
import { Button } from '../lib/ui/button';
import { Textarea, Select, Label } from '../lib/ui/form';
import { api } from '../lib/api';

/** Feedback / feature-request submission — stored in the `feedback` table
 * (see schema.sql), readable only from the admin stats page. This is a
 * one-way box, not a support channel — there's no reply thread, so it's
 * meant for "here's an idea" / "here's what's annoying me" rather than
 * anything needing a response. Contact Us (mailto, elsewhere in Layout) is
 * the channel for anything that needs an actual reply. */
export default function FeedbackDialog({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<'feedback' | 'feature_request'>('feedback');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset a beat after the close animation would run, so the form
      // doesn't visibly flash back to blank while still on screen.
      setTimeout(() => { setMessage(''); setCategory('feedback'); setDone(false); setError(null); }, 150);
    }
  }

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed) { setError('Write a quick note first.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/columns', { resource: 'feedback', category, message: trimmed });
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not send that — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? 'Feedback & feature requests' : undefined}
        className={`flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full ${
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
        }`}
      >
        <MessageSquarePlus className="w-[18px] h-[18px] shrink-0" />
        {!collapsed && <span>Feedback</span>}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>Thanks — got it</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Appreciate you taking the time. If you'd like a reply, use Contact Us instead —
                this box doesn't have a reply thread.
              </p>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Feedback & feature requests</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Type</Label>
                  <Select value={category} onChange={(e) => setCategory(e.target.value as any)}>
                    <option value="feedback">General feedback</option>
                    <option value="feature_request">Feature request</option>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Your note</Label>
                  <Textarea
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's working, what's not, what you wish existed..."
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
