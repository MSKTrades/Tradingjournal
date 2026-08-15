import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '../../lib/ui/form';
import { Tag } from '../data/types';

type Props = {
  value: string[]; // tag names currently on this trade
  allTags: Tag[]; // the reusable tag list (Journal/Performance filters read from this too)
  onChange: (names: string[]) => void;
  onCreateTag: (name: string) => void; // fire-and-forget: registers a new name in the reusable list
};

const FALLBACK_COLOR = '#f59e0b';

// Free-typed, chip-style tag picker: type a name, press Enter (or pick a
// suggestion) to add it. A name that doesn't already exist in the
// reusable tag list gets created there too (so it's suggested next time,
// and shows up as a real option in the Performance page's Tags filter),
// but the trade itself just stores the plain tag NAME string (see
// Trade.tags) - no id cross-referencing needed to render or filter by it.
export default function TagPicker({ value, allTags, onChange, onCreateTag }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);

  function colorFor(name: string): string {
    return allTags.find(t => t.name.toLowerCase() === name.toLowerCase())?.color ?? FALLBACK_COLOR;
  }

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!value.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    if (!allTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      onCreateTag(trimmed);
    }
    setInput('');
    setOpen(false);
  }

  function removeTag(name: string) {
    onChange(value.filter(v => v !== name));
  }

  const suggestions = allTags
    .filter(t => !value.some(v => v.toLowerCase() === t.name.toLowerCase()))
    .filter(t => input.trim() === '' || t.name.toLowerCase().includes(input.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map(name => {
            const color = colorFor(name);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${color}25`, color, border: `1px solid ${color}55` }}
              >
                {name}
                <button type="button" onClick={() => removeTag(name)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <Input
        value={input}
        placeholder="Add a tag…"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') { e.preventDefault(); addTag(input); }
        }}
        className="text-xs"
      />
      {open && (input.trim() !== '' || suggestions.length > 0) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map(t => (
            <button
              key={t.id}
              type="button"
              onMouseDown={() => addTag(t.name)}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left hover:bg-accent"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
          {input.trim() !== '' && !allTags.some(t => t.name.toLowerCase() === input.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={() => addTag(input)}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left hover:bg-accent text-primary"
            >
              <Plus className="w-3 h-3" /> Create "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
