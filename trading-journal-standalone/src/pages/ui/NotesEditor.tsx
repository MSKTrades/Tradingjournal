import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { ImagePlus, Loader2, Trash2, X, ZoomIn } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { NoteBlock } from '../data/types';

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
// text block after it so typing continues naturally, or use "Add Screenshot"
// to append one at the end via a file picker.
export default function NotesEditor({ blocks, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setUploadError(null);
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: file.type,
      });
      const next = normalized.slice();
      next.splice(i + 1, 0, { type: 'image', url: blob.url }, { type: 'text', value: '' });
      onChange(next);
      setFocusIndex(i + 2);
    } catch (e: any) {
      setUploadError(e?.message ?? 'Upload failed. Make sure Blob storage is set up for this Vercel project.');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(i: number) {
    onChange(normalized.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">Notes</p>
        <Button
          variant="outline" size="sm" disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1" />}
          {uploading ? 'Uploading…' : 'Add Screenshot'}
        </Button>
        <input
          ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImageAfter(normalized.length - 1, f); e.target.value = ''; }}
        />
      </div>

      <div className="rounded-xl border border-border p-4 min-h-[200px] flex flex-col gap-2">
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
          <div key={i} className="relative group inline-block max-w-md rounded-lg overflow-hidden border border-border">
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
