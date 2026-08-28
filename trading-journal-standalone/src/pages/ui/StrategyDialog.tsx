import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Input, Label, Select, Switch } from '../../lib/ui/form';
import { Trash2, Plus } from 'lucide-react';
import { Strategy, Condition, CustomColumn, Tag, TagGroup, CONDITION_FIELDS, OPS, WEEKDAYS, TAG_CONDITION_FIELD, TAG_OPS } from '../data/types';
import { useFetch } from '../../lib/api';
import { useAccount } from '../../lib/accounts';

type Props = {
  open: boolean;
  strategy: Strategy | null;
  onSave: (s: StrategyPayload) => Promise<void>;
  onClose: () => void;
};

export type StrategyPayload = {
  id?: number;
  name: string;
  conditions: Condition[];
  days: number[];
  time_start: string | null;
  time_end: string | null;
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
  active: boolean;
  sort_order: number;
  account_ids: number[]; // [] = every account (including new ones)
};

function emptyStrategy(): StrategyPayload {
  return {
    name: '',
    conditions: [],
    days: [],
    time_start: null,
    time_end: null,
    tp1_rr: 3,
    tp2_rr: null,
    split_percent: null,
    active: true,
    sort_order: 0,
    account_ids: [],
  };
}

function toPayload(s: Strategy): StrategyPayload {
  return {
    id: s.id,
    name: s.name,
    conditions: s.conditions ?? [],
    days: s.days ?? [],
    time_start: s.time_start ?? null,
    time_end: s.time_end ?? null,
    tp1_rr: Number(s.tp1_rr),
    tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
    split_percent: s.split_percent != null ? Number(s.split_percent) : null,
    active: s.active,
    sort_order: s.sort_order,
    account_ids: s.account_ids ?? [],
  };
}

export default function StrategyDialog({ open, strategy, onSave, onClose }: Props) {
  const [form, setForm] = useState<StrategyPayload>(emptyStrategy);
  const [saving, setSaving] = useState(false);
  // If the save request fails (network hiccup, a stale/half-deployed API
  // function, etc.) this surfaces it instead of the dialog just silently
  // closing (or silently doing nothing) and leaving you to guess whether
  // your change actually stuck - see handleSave below.
  const [error, setError] = useState<string | null>(null);

  // Filter conditions can compare against ANY numeric field logged on a
  // trade - so besides the small set of truly universal built-in fields
  // (rr, entry price, etc. - every account has these), pull in whatever
  // custom fields this user has actually added (Journal > Manage Columns)
  // and offer the numeric ones here too. This is also how the three
  // original SMC-specific fields (CISD Break, Inverse Candle Size,
  // Distance from Asia H/L) show up now - they're no longer hardcoded into
  // CONDITION_FIELDS (see the comment there for why: they used to appear
  // for every new signup even though they're always empty for anyone who
  // didn't build their journal around that original strategy), so an
  // account only sees them here if it actually has a matching
  // custom_columns row - same as any other custom field.
  // Custom fields are scoped per account, but a strategy's "Applies To"
  // can point at a SPECIFIC account (or several) that isn't necessarily
  // the one currently active in the switcher - e.g. editing a GBPUSD
  // strategy while EURUSD is the active account. Scoping this list to only
  // the active account meant a condition already using a field from the
  // strategy's own target account would silently fail to match any option
  // in the dropdown (the browser just falls back to showing whichever
  // option happens to be first), which looked exactly like the field had
  // been swapped out from under you. Fetching every account's custom
  // fields (account_id=all - still scoped to this user's own accounts
  // server-side) and deduping by col_key fixes that regardless of which
  // account is active or which account(s) the strategy applies to.
  const { accounts } = useAccount();
  const { data: rawCols } = useFetch<CustomColumn[]>('/columns?account_id=all');
  const allFields = useMemo(() => {
    const seen = new Set<string>();
    const custom: { key: string; label: string }[] = [];
    for (const c of rawCols ?? []) {
      if (c.data_type !== 'number' || seen.has(c.col_key)) continue;
      seen.add(c.col_key);
      custom.push({ key: c.col_key, label: c.name });
    }
    return [...CONDITION_FIELDS, ...custom];
  }, [rawCols]);

  // Tags aren't a number to compare against - a strategy condition on a tag
  // is "does/doesn't this trade have tag X" (see TAG_CONDITION_FIELD) - so
  // they're offered as one extra option in the same field dropdown, and
  // picking it swaps the rest of that condition row's UI (op + value) from
  // the numeric one to a has/doesn't-have + tag picker below.
  //
  // Two separate tagging systems both still write to real trades, so both
  // feed this dropdown: the flat, ungrouped tags table (still used by the
  // Backtest tab's tag picker) and FX Replay-style tag GROUPS (used by the
  // Journal's TradeDetailPanel, where each group like "1M_Price above" has
  // its own set of options like "EMA9"/"EMA21", stored per trade as
  // tag_selections keyed by group name). Sourcing this dropdown from only
  // the flat table missed every group-based tag entirely, which is exactly
  // the "why does it only show Asia" bug - merging both here matches what a
  // condition actually checks server-side (trade.tags OR any group's
  // selections contain this name - see matchesTagCondition in
  // summary/index.ts and trades/performance.ts). Neither pool is
  // account-scoped (same tags everywhere, like the pickers on a trade
  // itself), so this isn't filtered by account the way custom fields are.
  const { data: rawTags } = useFetch<Tag[]>('/columns?resource=tags');
  const { data: rawTagGroups } = useFetch<TagGroup[]>('/columns?resource=tag_groups');
  const allTagOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of rawTags ?? []) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push(t.name);
    }
    for (const g of rawTagGroups ?? []) {
      for (const o of g.options) {
        if (seen.has(o.name)) continue;
        seen.add(o.name);
        out.push(o.name);
      }
    }
    return out;
  }, [rawTags, rawTagGroups]);
  // Tag group option names get reused across groups constantly in practice
  // (e.g. "EMA9" shows up under "1M_Price above", "15M Price below", "4H
  // Price below", ... all at once), so "has EMA9" on its own is ambiguous
  // about which one a condition actually means. Picking a specific group
  // here narrows the value dropdown to just that group's own options and
  // sets Condition.group, which both matching endpoints check against
  // tag_selections[group] directly instead of searching everywhere. Leaving
  // it on "Any tag group" keeps the old flattened behavior (checks trade.tags
  // and every group's selections), so existing saved conditions still work.
  const tagGroupNames = useMemo(() => (rawTagGroups ?? []).map(g => g.name), [rawTagGroups]);
  function optionsForGroup(group: string | undefined): string[] {
    if (!group) return allTagOptions;
    return (rawTagGroups ?? []).find(g => g.name === group)?.options.map(o => o.name) ?? [];
  }

  useEffect(() => {
    if (open) {
      setForm(strategy ? toPayload(strategy) : emptyStrategy());
      setError(null);
    }
  }, [open, strategy]);

  function setField<K extends keyof StrategyPayload>(k: K, v: StrategyPayload[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function addCondition() {
    setForm(prev => ({ ...prev, conditions: [...prev.conditions, { field: 'cisd_break', op: '<=', value: 8 }] }));
  }
  function updateCondition(i: number, patch: Partial<Condition>) {
    setForm(prev => ({ ...prev, conditions: prev.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));
  }
  // Switching a condition row's field to/from "Has Tag" needs to reset op
  // and value too, not just field - a numeric op like "<=" and a number
  // value make no sense once the row becomes a tag condition, and vice
  // versa. Keeping this as its own function (rather than inlining into the
  // field <Select>'s onChange) is what makes that reset obvious rather than
  // something you'd have to notice was missing.
  function updateConditionField(i: number, field: string) {
    if (field === TAG_CONDITION_FIELD) {
      updateCondition(i, { field, op: 'has', group: undefined, value: allTagOptions[0] ?? '' });
    } else {
      updateCondition(i, { field, op: '<=', group: undefined, value: 0 });
    }
  }
  // Changing which tag group a "Has Tag" condition points at also has to
  // reset value - whatever was picked under the old group (or the old
  // flattened list) might not even exist as an option in the new one.
  function updateConditionGroup(i: number, group: string) {
    const opts = optionsForGroup(group || undefined);
    updateCondition(i, { group: group || undefined, value: opts[0] ?? '' });
  }
  function removeCondition(i: number) {
    setForm(prev => ({ ...prev, conditions: prev.conditions.filter((_, idx) => idx !== i) }));
  }
  function toggleDay(day: number) {
    setForm(prev => ({ ...prev, days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day] }));
  }
  // Clicking a specific account switches out of "All Accounts" mode (an
  // empty array) into a restricted list containing just that account;
  // clicking "All Accounts" itself resets back to []. There's no separate
  // on/off switch for the restriction - the array being empty or not IS the
  // mode, same shape the account-scoped custom fields already settled on.
  function toggleAccount(id: number) {
    setForm(prev => ({
      ...prev,
      account_ids: prev.account_ids.includes(id) ? prev.account_ids.filter(a => a !== id) : [...prev.account_ids, id],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      // Previously an unhandled rejection here meant the dialog just sat
      // there with no explanation - a failed save (e.g. the account_ids
      // column missing because a schema migration wasn't re-run, or an
      // API function that's out of sync with the frontend) looked
      // identical to a successful one that silently reverted. Now it's
      // shown inline so it's obvious the save didn't go through.
      setError(err instanceof Error ? err.message : 'Failed to save strategy. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const hasSplit = form.tp2_rr != null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{strategy ? 'Edit Strategy' : 'Add Strategy'}</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-1">
            <Label>Strategy Name</Label>
            <Input value={form.name} placeholder="e.g. Inverse 1:3"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Filter Conditions</Label>
              <Button variant="outline" size="sm" onClick={addCondition}><Plus className="w-3 h-3 mr-1" /> Add</Button>
            </div>
            {form.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions — all trades qualify.</p>}
            {/* Field name gets its own full-width row - crammed into a single
                row alongside the op/value/delete controls, a select this long
                (e.g. "Distance from Asia H/L") had almost no room left on
                narrow (mobile) screens and rendered as an unreadably clipped
                sliver. Stacking it above op/value/delete means it always has
                the dialog's full width to show its label. */}
            <div className="flex flex-col gap-3">
              {form.conditions.map((cond, i) => {
                const isTag = cond.field === TAG_CONDITION_FIELD;
                const tagValueOptions = isTag ? optionsForGroup(cond.group) : [];
                return (
                  <div key={i} className="flex flex-col gap-1.5 p-2 rounded-md border border-border/60">
                    <Select value={cond.field} onChange={e => updateConditionField(i, e.target.value)} className="w-full text-xs">
                      {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      <option value={TAG_CONDITION_FIELD}>Has Tag</option>
                    </Select>
                    {isTag ? (
                      <>
                        {/* Tag group option names get reused across groups
                            (EMA9 shows up under several timeframe/direction
                            groups at once) - picking one here scopes the
                            value dropdown below to just that group instead
                            of leaving "has EMA9" ambiguous about which. */}
                        {tagGroupNames.length > 0 && (
                          <Select value={cond.group ?? ''} onChange={e => updateConditionGroup(i, e.target.value)} className="w-full text-xs">
                            <option value="">Any tag group</option>
                            {tagGroupNames.map(g => <option key={g} value={g}>{g}</option>)}
                          </Select>
                        )}
                        <div className="flex items-center gap-2">
                          <Select value={cond.op} onChange={e => updateCondition(i, { op: e.target.value })} className="w-32 text-xs shrink-0">
                            {TAG_OPS.map(op => <option key={op} value={op}>{op === '!has' ? "doesn't have" : 'has'}</option>)}
                          </Select>
                          {tagValueOptions.length > 0 ? (
                            <Select value={String(cond.value)} onChange={e => updateCondition(i, { value: e.target.value })} className="flex-1 min-w-0 text-xs">
                              {tagValueOptions.map(name => <option key={name} value={name}>{name}</option>)}
                            </Select>
                          ) : (
                            <Input className="flex-1 min-w-0 text-xs" value={String(cond.value)} placeholder="Tag name"
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(i, { value: e.target.value })} />
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(i)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select value={cond.op} onChange={e => updateCondition(i, { op: e.target.value })} className="w-16 text-xs shrink-0">
                          {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                        </Select>
                        <Input type="number" step={0.01} className="flex-1 min-w-0 text-xs" value={cond.value as number}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCondition(i, { value: Number(e.target.value) })} />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {isTag && tagValueOptions.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No tags created yet — type one above, or add a tag group with some options to a trade first
                        from the Journal so it's reusable here too.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Days Traded</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(d => (
                <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    form.days.includes(d.value) ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {form.days.length === 0 ? 'No days selected — all days allowed.' : `Only trades placed on ${form.days.length} selected day(s) qualify.`}
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Applies To</Label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setField('account_ids', [])}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  form.account_ids.length === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                }`}>
                All Accounts
              </button>
              {accounts.map(a => (
                <button key={a.id} type="button" onClick={() => toggleAccount(a.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    form.account_ids.includes(a.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40'
                  }`}>
                  {a.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {form.account_ids.length === 0
                ? 'Counted on every account, including new ones you create later.'
                : `Only counted on ${form.account_ids.length} selected account${form.account_ids.length === 1 ? '' : 's'} — won’t show up anywhere else, including new accounts.`}
            </p>
          </div>

          <div>
  <Label className="mb-2 block">Time Window (Time Executed)</Label>
  <div className="grid grid-cols-2 gap-3">
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Start Time</Label>
      <Input
        type="time"
        value={form.time_start ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setField('time_start', e.target.value || null)
        }
      />
    </div>
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">End Time</Label>
      <Input
        type="time"
        value={form.time_end ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setField('time_end', e.target.value || null)
        }
      />
    </div>
  </div>
  <p className="text-xs text-muted-foreground mt-1.5">
    {form.time_start || form.time_end
      ? `Only trades executed between ${form.time_start || '00:00'} and ${form.time_end || '23:59'} qualify.`
      : 'No time window — all times allowed.'}
  </p>
</div>

          <div className="flex flex-col gap-3">
            <Label>Take Profit Rules</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">TP1 (R multiple)</Label>
                <Input type="number" min={0.5} step={0.5} value={form.tp1_rr}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('tp1_rr', Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">TP2 (split exit)</Label>
                  <Switch checked={hasSplit} onCheckedChange={(v) => { setField('tp2_rr', v ? 5 : null); setField('split_percent', v ? 50 : null); }} />
                </div>
                <Input type="number" min={0.5} step={0.5} disabled={!hasSplit} value={hasSplit ? (form.tp2_rr ?? '') : ''} placeholder="e.g. 5"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('tp2_rr', e.target.value === '' ? null : Number(e.target.value))} />
              </div>
            </div>

            {hasSplit && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">% of position closed at TP1 (remainder runs to TP2)</Label>
                <Input type="number" min={1} max={99} step={1} value={form.split_percent ?? 50}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('split_percent', Number(e.target.value))} />
              </div>
            )}

            {hasSplit && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Remainder after TP1 is assumed to run to break-even if TP2 is not reached.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.active} onCheckedChange={(v) => setField('active', v)} />
            <Label>Active (included in Summary)</Label>
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
              Couldn't save: {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save Strategy'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
