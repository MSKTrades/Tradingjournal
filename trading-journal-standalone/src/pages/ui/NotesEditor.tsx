import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Clock3, Loader2, MessageSquare, Plus, Trash2, X, ZoomIn } from 'lucide-react';
import { NoteBlock, Timeframe, TIMEFRAME_PRESETS } from '../data/types';
import { isDemoMode } from '../../lib/demoMode';

type Props = {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  // Saved custom timeframes (see the Timeframe type) + a way to persist a
  // newly-picked one for reuse next time. Both optional so NotesEditor still
  // works if a caller doesn't wire them up - the timeframe badge/picker on
  // each screenshot just won't render without `timeframes` passed.
  timeframes?: Timeframe[];
  onAddTimeframe?: (name: string) => void;
};

// Small popover shown on each screenshot to record which chart timeframe it
// was taken on - opens automatically right after a screenshot is pasted (see
// openTfFor in NotesEditor below), or can be reopened any time by clicking
// the badge in the image's top-left corner. Picking a preset that isn't in
// this user's saved list yet (or typing a custom one) calls onAddTimeframe
// so it's there to pick again next time, same "save on first real use"
// pattern the tag picker uses for colors.
function TimeframePicker({ value, options, onPick, onClose }: {
  value: string | undefined;
  options: string[];
  onPick: (tf: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  function submitCustom() {
    const trimmed = custom.trim();
    if (!trimmed) return;
    onPick(trimmed);
    setCustom('');
  }

  return (
    <div
      ref={ref}
      className="absolute top-9 left-1.5 z-10 w-52 rounded-lg border border-border bg-popover shadow-lg p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[11px] font-medium text-muted-foreground px-1 pb-1.5">Which timeframe is this?</p>
      <div className="flex flex-wrap gap-1 px-1 pb-2">
        {options.map(tf => (
          <button
            key={tf}
            onClick={() => onPick(tf)}
            className={`px-2 py-1 rounded-md text-xs border transition-colors ${
              tf === value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-1">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitCustom(); }}
          placeholder="Add your own…"
          className="min-w-0 flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={submitCustom}
          disabled={!custom.trim()}
          className="h-6 w-6 shrink-0 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// Small popover for writing a free-text note about one specific screenshot
// - "what happened / what you were thinking on this chart". Same
// click-to-open-a-popover, click-outside-to-close shape as TimeframePicker
// above (that's the explicit ask - comments should work "the same as what
// we're doing with TFs"), but it doesn't auto-open on paste the way the
// timeframe picker does: stacking two auto-opening popovers on every pasted
// screenshot would be more clutter than help, and a comment is usually
// written after you've actually looked at the chart for a moment, not in
// the same instant you paste it. The always-visible comment row below the
// image (not an overlay badge on top of it - that read as too easy to
// miss) is the invitation instead. Saves as you type (blurring/closing just
// dismisses the popover, nothing is lost) rather than needing an explicit
// Save button - one less click for what's meant to be a quick, low-friction
// note.
function CommentPopover({ value, onChange, onClose }: {
  value: string | undefined;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-10 w-full sm:w-80 rounded-lg border border-border bg-popover shadow-lg p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[11px] font-medium text-muted-foreground px-1 pb-1.5">Notes on this chart</p>
      <textarea
        ref={textareaRef}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What happened here? What worked or didn't…"
        rows={3}
        className="w-full resize-none bg-transparent border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary placeholder:text-muted-foreground"
      />
    </div>
  );
}

function AutoTextarea({ value, onChange, onPasteImage, placeholder, focused }: {
  value: string;
  onChange: (v: string) => void;
  onPasteImage: (file: File) => void;
  placeholder?: string;
  focused?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (focused) ref.current?.focus();
  }, [focused]);

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items || []);
    const imageItem = items.find(it => it.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        onPasteImage(file);
      }
    }
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
      placeholder={placeholder}
      rows={1}
      className="w-full resize-none bg-transparent border-0 outline-none text-sm leading-relaxed placeholder:text-muted-foreground py-1"
    />
  );
}

// Notion-style content stream: type freely, paste a screenshot (Ctrl+V) right
// where the cursor is and it drops in as an inline image block with a fresh
// text block after it so typing continues naturally. There used to also be
// an "Add Screenshot" file-picker button here, but paste already covers the
// same job with less UI to scan past, so it was dropped in favor of just
// the placeholder text telling you paste works.
export default function NotesEditor({ blocks, onChange, timeframes = [], onAddTimeframe }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  // Which image block's timeframe popover is open, if any - set right after
  // a screenshot is pasted so the picker shows up immediately without an
  // extra click (see insertImageAfter), and whenever the badge itself is
  // clicked to change an already-set timeframe.
  const [openTfFor, setOpenTfFor] = useState<number | null>(null);
  // Which image block's comment popover is open, if any - same idea as
  // openTfFor but never set automatically (see CommentPopover's comment on
  // why it doesn't auto-open on paste).
  const [openCommentFor, setOpenCommentFor] = useState<number | null>(null);

  // Saved custom timeframes merged with the built-in presets, deduped and
  // case-insensitively - so once someone's saved "2H" it shows up in the
  // quick-pick list right alongside 1H/4H instead of only living in the
  // free-text box.
  const tfOptions = (() => {
    const seen = new Set<string>();
    const all: string[] = [];
    for (const tf of [...TIMEFRAME_PRESETS, ...timeframes.map(t => t.name)]) {
      const key = tf.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(tf);
    }
    return all;
  })();

  // Invariant: always end with a text block so there's somewhere to type
  // after the last image.
  const normalized: NoteBlock[] = blocks.length === 0 || blocks[blocks.length - 1].type !== 'text'
    ? [...blocks, { type: 'text', value: '' }]
    : blocks;

  function setBlock(i: number, block: NoteBlock) {
    const next = normalized.slice();
    next[i] = block;
    onChange(next);
  }

  async function insertImageAfter(i: number, file: File) {
    if (uploading) return;
    // The demo's fake backend (demoBackend.ts) intercepts api.ts's
    // request() - but this upload goes straight through @vercel/blob's own
    // client, bypassing that entirely and hitting the REAL /api/upload
    // function even inside the demo sandbox. There's no fake blob store to
    // redirect it to, so screenshots are simply not offered in the demo
    // rather than either uploading real files from an anonymous visitor or
    // silently failing with a confusing Blob-storage error message.
    if (isDemoMode()) {
      setUploadError("Screenshots aren't available in the demo — sign up free to attach chart screenshots to your trades.");
      return;
    }
    setUploadError(null);
    setUploading(true);

    // The upload has two network hops — get a client token from /api/upload,
    // then PUT the bytes straight to Blob storage — and neither the fetch()
    // calls underneath nor the SDK impose their own timeout. If either hop
    // stalls (Blob store not provisioned, a proxy/firewall silently dropping
    // the *.vercel-storage.com connection, etc.) the button would otherwise
    // spin forever and — because `uploading` never resets — silently swallow
    // every retry too. A hard timeout guarantees it always resolves one way
    // or the other.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: file.type,
        abortSignal: controller.signal,
      });
      const next = normalized.slice();
      next.splice(i + 1, 0, { type: 'image', url: blob.url }, { type: 'text', value: '' });
      onChange(next);
      setFocusIndex(i + 2);
      // Prompt for the timeframe right away, per the newly-pasted image -
      // this is the "just show an option to select when a screenshot is
      // pasted" ask, rather than something you have to remember to go set
      // later. Dismissing it (click elsewhere) just leaves it unset.
      setOpenTfFor(i + 1);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setUploadError('Upload timed out after 45s. Check that a Blob store is connected to this Vercel project (Storage tab) and that your network allows connections to *.vercel-storage.com, then try again.');
      } else {
        setUploadError(e?.message ?? 'Upload failed. Make sure Blob storage is set up for this Vercel project.');
      }
    } finally {
      clearTimeout(timeout);
      setUploading(false);
    }
  }

  function removeImage(i: number) {
    onChange(normalized.filter((_, idx) => idx !== i));
  }

  function setImageTimeframe(i: number, tf: string) {
    setBlock(i, { ...(normalized[i] as { type: 'image'; url: string; timeframe?: string; comment?: string }), timeframe: tf });
    onAddTimeframe?.(tf);
    setOpenTfFor(null);
  }

  function setImageComment(i: number, comment: string) {
    setBlock(i, { ...(normalized[i] as { type: 'image'; url: string; timeframe?: string; comment?: string }), comment });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-semibold">Notes</p>
        {uploading && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading screenshot…
          </span>
        )}
      </div>

      {/* No border/card wrapper here on purpose (used to be a bordered
          rounded-xl box with a min-h-[200px] floor) - per feedback, a small
          separate box read as cramped next to the drawer's extra width;
          this now just flows as part of the page, and the taller min-height
          lets it actually use the vertical room the wider drawer gives it
          instead of leaving empty space below a short box. */}
      <div className="flex flex-col gap-3 min-h-[55vh]">
        {normalized.map((block, i) => block.type === 'text' ? (
          <AutoTextarea
            key={i}
            value={block.value}
            focused={i === focusIndex}
            // Only the very first block carries instructional placeholder
            // text. A "Continue writing…" prompt used to repeat after every
            // single screenshot, which read as clutter once more than one
            // or two images were pasted in a row with nothing typed between
            // them - an empty block just stays visually quiet now instead.
            placeholder={i === 0 ? 'Write your trade notes here — paste a screenshot (Ctrl+V) anywhere to drop it in...' : undefined}
            onChange={(v) => setBlock(i, { type: 'text', value: v })}
            onPasteImage={(file) => insertImageAfter(i, file)}
          />
        ) : (
          // No max-width cap (previously max-w-md, ~448px) — screenshots
          // are usually chart/platform captures where more pixels legible
          // is strictly better, and the drawer itself is wide enough now
          // to give them real room instead of shrinking them down.
          <div key={i} className="w-full rounded-lg overflow-hidden border border-border">
            <div className="relative group">
              <img
                src={block.url} alt="Trade screenshot" className="w-full h-auto block cursor-zoom-in"
                onClick={() => setLightbox(block.url)}
              />
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  onClick={() => setLightbox(block.url)}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  className="h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-red-600"
                  onClick={() => removeImage(i)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Timeframe badge - always visible (not just on hover, unlike
                  the zoom/delete buttons above) since it's information, not
                  just an action, and blank/unlabelled is itself worth seeing
                  at a glance. Click to open/change; auto-opens right after
                  this image is first pasted (see openTfFor). */}
              <button
                onClick={() => setOpenTfFor(openTfFor === i ? null : i)}
                className={`absolute top-1.5 left-1.5 h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                  block.timeframe
                    ? 'bg-black/60 text-white hover:bg-black/80'
                    : 'bg-black/60 text-white/80 hover:bg-black/80 opacity-0 group-hover:opacity-100'
                }`}
              >
                <Clock3 className="w-3 h-3" />
                {block.timeframe ?? 'Set TF'}
              </button>
              {openTfFor === i && (
                <TimeframePicker
                  value={block.timeframe}
                  options={tfOptions}
                  onPick={(tf) => setImageTimeframe(i, tf)}
                  onClose={() => setOpenTfFor(null)}
                />
              )}
            </div>
            {/* Comment control - moved off the image itself and onto its own
                full-width row underneath. It used to be a small badge
                overlaid on the bottom-left corner of the screenshot, same
                treatment as the timeframe badge above, but that read as too
                easy to miss sitting on top of a busy chart image (feedback
                after shipping it). Living in normal document flow, in the
                app's own text color against a plain background, is a lot
                harder not to notice - and it's always shown now, not just
                on hover, the same "worth seeing even when empty" reasoning
                as the timeframe badge. */}
            <div className="relative">
              <button
                onClick={() => setOpenCommentFor(openCommentFor === i ? null : i)}
                className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-xs text-left border-t border-border transition-colors ${
                  block.comment ? 'bg-primary/10 hover:bg-primary/15' : 'bg-muted/40 hover:bg-muted text-muted-foreground'
                }`}
              >
                <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${block.comment ? 'text-primary' : ''}`} />
                <span className={`truncate ${block.comment ? 'text-foreground font-medium' : ''}`}>
                  {block.comment || 'Add a comment on this chart…'}
                </span>
              </button>
              {openCommentFor === i && (
                <CommentPopover
                  value={block.comment}
                  onChange={(v) => setImageComment(i, v)}
                  onClose={() => setOpenCommentFor(null)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {uploadError && <p className="text-xs text-destructive mt-2">{uploadError}</p>}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Trade screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button className="absolute top-5 right-5 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
