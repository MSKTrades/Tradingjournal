import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '../../lib/ui/form';
import { TagGroup } from '../data/types';

type Props = {
  groups: TagGroup[];
  selections: Record<string, string[]>; // group name -> selected option name(s)
  onChange: (next: Record<string, string[]>) => void;
  onCreateGroup: (name: string) => void;
  onCreateOption: (groupId: number, groupName: string, optionName: string) => void;
};

const FALLBACK_COLOR = '#f59e0b';

// One group row's "+ Add" popover - lets you toggle an existing option for
// this group on/off, or type a new one and create it on the fly. Options
// are multi-select (like the flat Tags picker) since a trade can
// legitimately match more than one value in some categories.
function GroupOptionPicker({ group, selected, onToggle, onCreate }: {
  group: TagGroup;
  selected: string[];
  onToggle: (name: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  const filtered = group.options.filter(o => input.trim() === '' || o.name.toLowerCase().includes(input.trim().toLowerCase()));
  const exactExists = group.options.some(o => o.name.toLowerCase() === input.trim().toLowerCase());

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-3 h-3" /> Add tag
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-52 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2">
            <Input
              autoFocus
              value={input}
              placeholder={`Search or add to ${group.name}…`}
              className="text-xs mb-1.5"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && input.trim() && !exactExists) { onCreate(input.trim()); setInput(''); setOpen(false); }
              }}
            />
            <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
              {filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  // Deliberately does NOT close the popover - picking several
                  // options for one trade (e.g. every EMA it's above) used to
                  // mean reopening this exact popover once per option, which
                  // is the opposite of what a multi-select picker should feel
                  // like. It now stays open so you can click through several
                  // in a row; the overlay below (or clicking elsewhere) is
                  // still how you close it when you're done.
                  onClick={() => onToggle(o.name)}
                  className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs text-left hover:bg-accent"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
                  {o.name}
                  {selected.includes(o.name) && <span className="ml-auto text-primary">✓</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-[11px] text-muted-foreground px-1.5 py-1">No matches.</p>}
              {input.trim() !== '' && !exactExists && (
                <button
                  type="button"
                  // Creating a brand new option is a more deliberate,
                  // one-off action (typing a new value in) than toggling an
                  // existing one, so this still closes the popover after -
                  // matches how "+ New Account" and similar one-shot create
                  // actions behave elsewhere in the app.
                  onClick={() => { onCreate(input.trim()); setInput(''); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs text-left hover:bg-accent text-primary"
                >
                  <Plus className="w-3 h-3" /> Create "{input.trim()}"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// FX Replay-style tag GROUPS: a fixed list of your own categories (e.g.
// "Confidence Level", "SL Levels"), each with its own set of selectable
// sub-tags. Unlike the flat Tags picker above it (free-form single-level
// labels), a group is "pick from this specific set of values" - closer to
// a custom enum per category than a free label. Nothing is pre-seeded:
// every group and option here is something you create yourself via
// "+ Add tag group" / "+ Add tag", since which categories matter (setup
// confidence, SL reason, timeframe, ...) is entirely trader-specific.
export default function TagGroupsPicker({ groups, selections, onChange, onCreateGroup, onCreateOption }: Props) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  function toggleOption(group: TagGroup, optionName: string) {
    const current = selections[group.name] ?? [];
    const next = current.includes(optionName) ? current.filter(v => v !== optionName) : [...current, optionName];
    onChange({ ...selections, [group.name]: next });
  }

  function createOption(group: TagGroup, optionName: string) {
    onCreateOption(group.id, group.name, optionName);
    const current = selections[group.name] ?? [];
    if (!current.includes(optionName)) onChange({ ...selections, [group.name]: [...current, optionName] });
  }

  function colorFor(group: TagGroup, optionName: string): string {
    return group.options.find(o => o.name.toLowerCase() === optionName.toLowerCase())?.color ?? FALLBACK_COLOR;
  }

  function submitNewGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    onCreateGroup(name);
    setNewGroupName('');
    setAddingGroup(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.length === 0 && !addingGroup && (
        <p className="text-xs text-muted-foreground italic">
          No tag groups yet - create one below (e.g. "Confidence Level", "SL Levels") and give it its own sub-tags.
        </p>
      )}
      {groups.map(group => {
        const selected = selections[group.name] ?? [];
        return (
          <div key={group.id} className="flex items-start justify-between gap-3 py-1 border-b border-border/50 last:border-0">
            <span className="text-xs font-bold text-foreground w-32 shrink-0 pt-0.5 truncate" title={group.name}>{group.name}</span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {selected.map(name => {
                const color = colorFor(group, name);
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${color}25`, color, border: `1px solid ${color}55` }}
                  >
                    {name}
                    <button type="button" onClick={() => toggleOption(group, name)} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              <GroupOptionPicker
                group={group}
                selected={selected}
                onToggle={(name) => toggleOption(group, name)}
                onCreate={(name) => createOption(group, name)}
              />
            </div>
          </div>
        );
      })}

      {addingGroup ? (
        <div className="flex items-center gap-2 border border-dashed border-border rounded-md p-2">
          <Input
            autoFocus
            value={newGroupName}
            placeholder="Group name, e.g. Confidence Level"
            className="text-xs"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && submitNewGroup()}
          />
          <button type="button" onClick={submitNewGroup} disabled={!newGroupName.trim()} className="text-xs font-medium text-primary shrink-0 disabled:opacity-50">
            Add
          </button>
          <button type="button" onClick={() => { setAddingGroup(false); setNewGroupName(''); }} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingGroup(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start"
        >
          <Plus className="w-3.5 h-3.5" /> Add tag group
        </button>
      )}
    </div>
  );
}
