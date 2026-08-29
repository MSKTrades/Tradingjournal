import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Loader2, Trash2, X, ZoomIn } from 'lucide-react';
import { NoteBlock } from '../data/types';
import { isDemoMode } from '../../lib/demoMode';

type Props = {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
};

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
export default function NotesEditor({ blocks, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

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
            placeholder={i === 0 ? 'Write your trade notes here — paste a screenshot (Ctrl+V) anywhere to drop it in...' : 'Continue writing…'}
            onChange={(v) => setBlock(i, { type: 'text', value: v })}
            onPasteImage={(file) => insertImageAfter(i, file)}
          />
        ) : (
          // No max-width cap (previously max-w-md, ~448px) — screenshots
          // are usually chart/platform captures where more pixels legible
          // is strictly better, and the drawer itself is wide enough now
          // to give them real room instead of shrinking them down.
          <div key={i} className="relative group w-full rounded-lg overflow-hidden border border-border">
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
