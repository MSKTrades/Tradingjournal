import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Textarea } from '../../lib/ui/form';
import { Strategy } from '../data/types';

/** Admin-only "publish this strategy as a public Playbook" dialog — see
 * api/strategies.ts's resource=playbook publish action. Only ever rendered
 * from Strategies.tsx behind an isAdminEmail() check, same UX-nicety-not-
 * the-real-gate pattern as the Admin sidebar link (src/lib/admin.ts) — the
 * server independently 404s a non-admin request regardless of what this UI
 * shows. Title/description are exactly what a visitor sees on the public
 * page; win rate, profit factor, and the equity curve are computed live
 * server-side from this strategy's own matching trades, never entered here.
 */
type Props = {
  open: boolean;
  strategy: Strategy | null;
  onPublish: (fields: { title: string; slug: string; description: string }) => Promise<void>;
  onUnpublish: () => Promise<void>;
  onClose: () => void;
};

export default function PublishPlaybookDialog({ open, strategy, onPublish, onUnpublish, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!strategy) return;
    setTitle(strategy.playbook_title || strategy.name);
    setSlug(strategy.playbook_slug || '');
    setDescription(strategy.playbook_description || '');
  }, [strategy]);

  if (!open || !strategy) return null;
  const isPublished = strategy.playbook_published;

  async function handlePublish() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onPublish({ title: title.trim(), slug: slug.trim(), description: description.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    setSaving(true);
    try {
      await onUnpublish();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isPublished ? 'Playbook settings' : 'Publish as Playbook'}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Publishing makes a public, read-only page out of this strategy's real win rate, profit
            factor, and R-multiple equity curve — computed live from the trades that actually match
            its rules. No dollar amounts or account details are ever shown.
          </p>

          <div>
            <Label htmlFor="pb-title">Title</Label>
            <Input id="pb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={strategy.name} />
          </div>

          <div>
            <Label htmlFor="pb-slug">URL slug (optional)</Label>
            <Input
              id="pb-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated from title"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              pipecho.com/playbooks/{slug.trim() || '…'}
            </p>
          </div>

          <div>
            <Label htmlFor="pb-desc">Description (optional)</Label>
            <Textarea
              id="pb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A short pitch for what this strategy is and when you take it."
            />
          </div>

          {isPublished && strategy.playbook_slug && (
            <p className="text-xs text-muted-foreground">
              Currently live at <span className="font-mono">/playbooks/{strategy.playbook_slug}</span>.
              Saving updates the title/description in place — the slug only changes if you edit it above.
            </p>
          )}
        </div>

        <DialogFooter>
          {isPublished && (
            <Button variant="outline" className="mr-auto text-destructive" disabled={saving} onClick={handleUnpublish}>
              Unpublish
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button disabled={saving || !title.trim()} onClick={handlePublish}>
            {isPublished ? 'Save changes' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
