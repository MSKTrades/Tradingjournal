import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Trash2, Layers } from 'lucide-react';
import { Input } from '../../lib/ui/form';
import { TagGroup } from '../data/types';

type Props = {
  groups: TagGroup[];
  selections: Record<string, string[]>; // group name -> selected option name(s)
  onChange: (next: Record<string, string[]>) => void;
  onCreateGroup: (name: string) => void;
  onCreateOption: (groupId: number, groupName: string, optionName: string) => void;
  // Both optional so this component doesn't break for any other caller that
  // hasn't wired deletion up yet. Deleting a group or option is account-wide
  // (same as creating one) - api/columns.ts owns the confirm-and-cascade
  // behavior on the backend; this component just needs somewhere to put the
  // trigger for it.
  onDeleteGroup?: (groupId: number, groupName: string) => void;
  onDeleteOption?: (optionId: number, groupName: string, optionName: string) => void;
  // Lets a group be restricted to specific accounts instead of showing up
  // on every one - see the "Applies To" control below. `accounts` is only
  // needed to render the picker's chip list; both are optional so a caller
  // that hasn't wired multi-account scoping up yet (or a user with just one
  // account, where this control has nothing useful to do) keeps working
  // exactly as before.
  accounts?: { id: number; name: string }[];
  onUpdateGroupAccounts?: (groupId: number, accountIds: number[]) => void;
};

const FALLBACK_COLOR = '#f59e0b';

// Matches the popover's own w-52 (13rem). Used to decide whether it fits to
// the right of the trigger or needs to be right-aligned instead.
const POPOVER_WIDTH = 208;
// Rough ceiling for the popover's rendered height (search input + mt/mb +
// the max-h-40 option list + padding). Only used to decide whether to flip
// the popover above the trigger when there isn't room below - the actual
// popover is free to be shorter than this, since "open above" anchors off
// the popover's own bottom edge rather than a fixed top offset.
const POPOVER_EST_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;

type PopoverStyle = { top?: number; bottom?: number; left?: number; right?: number } | null;

// Positions the "Add tag" popover relative to its trigger button using
// viewport coordinates (not the trigger's own offset parent), so it can be
// rendered through a portal straight onto <body> - see the root-cause note
// on GroupOptionPicker below for why that matters. Recomputes on open, and
// on resize/scroll while open, so it tracks the trigger if the surrounding
// drawer is scrolled.
function useSmartPopoverPosition(open: boolean, triggerRef: React.RefObject<HTMLButtonElement>) {
  const [style, setStyle] = useState<PopoverStyle>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    function recompute() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openAbove = spaceBelow < POPOVER_EST_HEIGHT && spaceAbove > spaceBelow;

      const spaceRight = window.innerWidth - rect.left;
      const alignRight = spaceRight < POPOVER_WIDTH;

      const next: PopoverStyle = {};
      if (openAbove) {
        // Anchor off the bottom edge so the popover grows upward from the
        // trigger regardless of its actual (possibly shorter-than-estimated)
        // height, instead of guessing a fixed `top`.
        next.bottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.top + 4);
      } else {
        next.top = rect.bottom + 4;
      }
      if (alignRight) {
        next.right = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right);
      } else {
        next.left = Math.max(VIEWPORT_MARGIN, rect.left);
      }
      setStyle(next);
    }

    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, triggerRef]);

  return style;
}

// One group row's "+ Add" popover - lets you toggle an existing option for
// this group on/off, or type a new one and create it on the fly. Options
// are multi-select (like the flat Tags picker) since a trade can
// legitimately match more than one value in some categories.
function GroupOptionPicker({ group, selected, onToggle, onCreate, onDelete }: {
  group: TagGroup;
  selected: string[];
  onToggle: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete?: (optionId: number, optionName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Root cause of the popover-stuck-in-a-corner bug: this used to be a plain
  // `position: absolute` div anchored `top-full left-0` off its own trigger
  // button, with no awareness of viewport edges. TagGroupsPicker renders
  // inside the trade detail panel's narrow, vertically-scrolling side
  // drawer, so a trigger near the bottom (and/or right) edge of that
  // scrollable panel had nowhere to expand into and got clipped/crammed
  // into the corner - e.g. "Execution Mistakes", which sits low in the tag
  // groups list. Fixed by measuring the trigger's viewport position
  // (useSmartPopoverPosition) and rendering the popover through a portal
  // straight onto <body> as `position: fixed`, so it's never constrained by
  // the drawer's own overflow clipping and can flip above/below or
  // left/right-align itself based on actual available space.
  const popoverStyle = useSmartPopoverPosition(open, triggerRef);

  const filtered = group.options.filter(o => input.trim() === '' || o.name.toLowerCase().includes(input.trim().toLowerCase()));
  const exactExists = group.options.some(o => o.name.toLowerCase() === input.trim().toLowerCase());

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-3 h-3" /> Add tag
      </button>
      {open && createPortal(
        <>
          {/* Root cause of "can't close without picking something": this
              overlay used to sit at z-40, but the trade detail drawer that
              hosts this component (TradeDetailPanel.tsx) renders its own
              backdrop + panel at z-50 (`fixed inset-0 z-50`). Both this
              overlay and that drawer are viewport-fixed elements compared
              directly by z-index in the same top-level stacking context, so
              the drawer's z-50 painted entirely above our z-40 overlay for
              every pixel - any click on the drawer body (or its own
              backdrop) was won by the drawer, and our overlay's onClick
              never fired. Bumped clear of the drawer's z-50 (with a gap
              between overlay and content so there's no reliance on DOM
              order to keep the popover's own buttons on top) so an outside
              click actually reaches this overlay now. */}
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[60] w-52 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2"
            style={popoverStyle ?? undefined}
          >
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
                // Not a single <button> anymore - the option row now holds
                // two independent actions (toggle vs. delete), and a button
                // can't nest inside another button. The toggle target is
                // still the whole row minus the trash icon, so clicking
                // anywhere on the label works exactly as before.
                <div
                  key={o.id}
                  className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-xs hover:bg-accent"
                >
                  <button
                    type="button"
                    // Deliberately does NOT close the popover - picking
                    // several options for one trade (e.g. every EMA it's
                    // above) used to mean reopening this exact popover once
                    // per option, which is the opposite of what a
                    // multi-select picker should feel like. It now stays
                    // open so you can click through several in a row; the
                    // overlay (or clicking elsewhere) is still how you close
                    // it when you're done.
                    onClick={() => onToggle(o.name)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
                    <span className="truncate">{o.name}</span>
                  </button>
                  {selected.includes(o.name) && <span className="text-primary shrink-0">✓</span>}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(o.id, o.name)}
                      title={`Delete "${o.name}"`}
                      className="shrink-0 text-muted-foreground hover:text-destructive opacity-60 hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
        </>,
        document.body
      )}
    </div>
  );
}

// "Applies To" control for one group - lets you restrict a tag group (e.g.
// a hyper-specific price-level group built for one particular account) to
// just the account(s) it actually matters for, instead of it showing up
// everywhere including brand-new accounts that have nothing to do with it.
// Same chip-toggle pattern as StrategyDialog's "Applies To" picker and this
// panel's own "add to other accounts" control for custom fields, just
// rendered as a popover (via the same positioning hook GroupOptionPicker
// above uses) since this list doesn't have room for a full inline picker
// per row.
function GroupAccountsPicker({ accountIds, accounts, onChange }: {
  accountIds: number[];
  accounts: { id: number; name: string }[];
  onChange: (next: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverStyle = useSmartPopoverPosition(open, triggerRef);
  const allAccounts = accountIds.length === 0;

  function toggle(id: number) {
    onChange(accountIds.includes(id) ? accountIds.filter(a => a !== id) : [...accountIds, id]);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(p => !p)}
        title="Which accounts this tag group applies to"
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
      >
        <Layers className="w-2.5 h-2.5" />
        {allAccounts ? 'All accounts' : `${accountIds.length} account${accountIds.length === 1 ? '' : 's'}`}
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[60] w-52 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-2 flex flex-col gap-1"
            style={popoverStyle ?? undefined}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pb-0.5">Applies to</p>
            <button
              type="button"
              onClick={() => onChange([])}
              className={`px-2 py-1 rounded text-xs text-left transition-colors ${allAccounts ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              All accounts
            </button>
            {accounts.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`px-2 py-1 rounded text-xs text-left truncate transition-colors ${!allAccounts && accountIds.includes(a.id) ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </>,
        document.body
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
// Curated starter set for a process/execution-mistake tag group (ICT/SMC
// intraday London-session forex is the app's domain - see other context -
// so these lean into that: chasing entries, skipping checklist rules,
// moving stops, missing the London open, etc) - high-value enough that it
// shouldn't require typing 8 options in by hand one at a time via
// GroupOptionPicker above.
const EXEC_MISTAKE_STARTER_OPTIONS = ['Chased Entry', 'Skipped Rule', 'Moved SL', 'Late to London', 'FOMO Entry', 'Oversized', 'No Checklist', 'Revenge Trade'];
const EXEC_MISTAKE_GROUP_NAME = 'Execution Mistakes';
const EXEC_MISTAKE_GROUP_RE = /execution mistake|mistake|error/i;

// Starter set for the HTF (higher-timeframe) bias a trade was taken
// against - the raw material for the "HTF Bias Alignment" summary card
// (HtfBiasAlignment.tsx) on the Summary page, which cross-references
// whichever of these you pick against the trade's own Long/Short direction
// to see whether you actually do better trading with your own HTF read or
// against it. "Neutral / Ranging" is deliberately included even though it
// has no directional alignment of its own - tagging "there wasn't a clear
// HTF bias here" is itself useful signal (e.g. "I keep losing on trades I
// took when I already knew HTF was ranging").
const HTF_BIAS_STARTER_OPTIONS = ['Bullish', 'Bearish', 'Neutral / Ranging'];
const HTF_BIAS_GROUP_NAME = 'HTF Bias';
const HTF_BIAS_GROUP_RE = /htf.*bias|bias/i;

export default function TagGroupsPicker({ groups, selections, onChange, onCreateGroup, onCreateOption, onDeleteGroup, onDeleteOption, accounts, onUpdateGroupAccounts }: Props) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // onCreateGroup/onCreateOption are both fire-and-forget (they return void,
  // not a promise or the created row - see handleCreateTagGroup/
  // handleCreateTagGroupOption in TradeDetailPanel) and the ONLY way this
  // component ever learns a new group's real id is the same way the
  // ordinary "+ Add tag group" flow does: the parent's onCreateGroup POSTs,
  // refetches, and the newly created group shows up in the `groups` prop on
  // the next render, found by name. So the starter-pack button below
  // follows that exact same approach - fire onCreateGroup(EXEC_MISTAKE_GROUP_NAME),
  // then watch `groups` for that name to appear before firing the 8
  // onCreateOption calls (which need a real group.id).
  const [execMistakeStarterBusy, setExecMistakeStarterBusy] = useState(false);
  const execMistakeStarterFiredOptionsRef = useRef(false);
  const hasExecMistakeGroup = groups.some(g => EXEC_MISTAKE_GROUP_RE.test(g.name));

  useEffect(() => {
    if (!execMistakeStarterBusy || execMistakeStarterFiredOptionsRef.current) return;
    const group = groups.find(g => g.name === EXEC_MISTAKE_GROUP_NAME);
    if (!group) return;
    execMistakeStarterFiredOptionsRef.current = true;
    for (const optionName of EXEC_MISTAKE_STARTER_OPTIONS) {
      onCreateOption(group.id, group.name, optionName);
    }
    setExecMistakeStarterBusy(false);
  }, [groups, execMistakeStarterBusy, onCreateOption]);

  // Same fire-and-create-group-then-watch-for-its-id pattern as Execution
  // Mistakes above, for the HTF Bias starter.
  const [htfBiasStarterBusy, setHtfBiasStarterBusy] = useState(false);
  const htfBiasStarterFiredOptionsRef = useRef(false);
  const hasHtfBiasGroup = groups.some(g => HTF_BIAS_GROUP_RE.test(g.name));

  useEffect(() => {
    if (!htfBiasStarterBusy || htfBiasStarterFiredOptionsRef.current) return;
    const group = groups.find(g => g.name === HTF_BIAS_GROUP_NAME);
    if (!group) return;
    htfBiasStarterFiredOptionsRef.current = true;
    for (const optionName of HTF_BIAS_STARTER_OPTIONS) {
      onCreateOption(group.id, group.name, optionName);
    }
    setHtfBiasStarterBusy(false);
  }, [groups, htfBiasStarterBusy, onCreateOption]);

  function addStarterExecMistakeGroup() {
    if (execMistakeStarterBusy) return;
    execMistakeStarterFiredOptionsRef.current = false;
    setExecMistakeStarterBusy(true);
    onCreateGroup(EXEC_MISTAKE_GROUP_NAME);
  }

  function addStarterHtfBiasGroup() {
    if (htfBiasStarterBusy) return;
    htfBiasStarterFiredOptionsRef.current = false;
    setHtfBiasStarterBusy(true);
    onCreateGroup(HTF_BIAS_GROUP_NAME);
  }

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
            <div className="flex flex-col gap-0.5 w-32 shrink-0 pt-0.5">
              <span className="flex items-center gap-1">
                <span className="text-xs font-bold text-foreground truncate" title={group.name}>{group.name}</span>
                {onDeleteGroup && (
                  <button
                    type="button"
                    onClick={() => onDeleteGroup(group.id, group.name)}
                    title={`Delete "${group.name}" group`}
                    className="shrink-0 text-muted-foreground hover:text-destructive opacity-60 hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </span>
              {onUpdateGroupAccounts && accounts && accounts.length > 1 && (
                <GroupAccountsPicker
                  accountIds={group.account_ids ?? []}
                  accounts={accounts}
                  onChange={(next) => onUpdateGroupAccounts(group.id, next)}
                />
              )}
            </div>
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
                onDelete={onDeleteOption ? (optionId, optionName) => onDeleteOption(optionId, group.name, optionName) : undefined}
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAddingGroup(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start"
          >
            <Plus className="w-3.5 h-3.5" /> Add tag group
          </button>
          {!hasExecMistakeGroup && (
            <button
              type="button"
              onClick={addStarterExecMistakeGroup}
              disabled={execMistakeStarterBusy}
              className="text-xs text-muted-foreground hover:text-foreground self-start disabled:opacity-50"
            >
              {execMistakeStarterBusy ? 'Adding starter tags…' : '+ Add starter Execution Mistake tags'}
            </button>
          )}
          {!hasHtfBiasGroup && (
            <button
              type="button"
              onClick={addStarterHtfBiasGroup}
              disabled={htfBiasStarterBusy}
              className="text-xs text-muted-foreground hover:text-foreground self-start disabled:opacity-50"
            >
              {htfBiasStarterBusy ? 'Adding starter tags…' : '+ Add starter HTF Bias tags'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
