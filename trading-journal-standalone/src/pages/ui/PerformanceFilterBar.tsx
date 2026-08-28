import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WEEKDAYS, Trade } from '../data/types';

// A flattened, source-agnostic tag option for the Tags filter chip - the
// caller merges both the flat tags pool and every tag group's options into
// this shape (see allTagsOnTrade above for why both sources matter).
export type TagOption = { name: string; color: string };

export type PerfFilters = {
  assets: string[];
  side: string[];
  outcome: string[];
  tags: string[];
  days: number[];
  dateFrom: string | null;
  dateTo: string | null;
};

export function emptyFilters(): PerfFilters {
  return { assets: [], side: [], outcome: [], tags: [], days: [], dateFrom: null, dateTo: null };
}

export function isFiltersEmpty(f: PerfFilters): boolean {
  return f.assets.length === 0 && f.side.length === 0 && f.outcome.length === 0
    && f.tags.length === 0 && f.days.length === 0 && !f.dateFrom && !f.dateTo;
}

// A trade can be tagged through either of two systems that both still
// write to real trades: the flat, ungrouped `tags` list (still used by the
// Backtest tab's tag picker) and FX Replay-style tag GROUPS (used by the
// Journal's TradeDetailPanel - each group like "1M_Price above" has its own
// options like "EMA9"/"EMA21", stored per trade as tag_selections keyed by
// group name). Anywhere "does this trade have tag X" matters has to check
// both, or group-based tags (which is what most trades actually use today)
// silently never match - exported so Journal/Performance can use the same
// union when building the Tags filter's own option list, not just here.
export function allTagsOnTrade(t: Trade): string[] {
  return [...(t.tags ?? []), ...Object.values(t.tag_selections ?? {}).flat()];
}

// Shared filter predicate - used by both Performance's client-side views
// (By Hour, Cumulative P/L) and the Journal table's filter bar, so the two
// pages can never silently drift apart on what e.g. "Side: Short" means.
export function matchesFilters(t: Trade, filters: PerfFilters): boolean {
  if (filters.assets.length > 0 && !filters.assets.includes((t.coin_token ?? '').trim().toUpperCase())) return false;
  if (filters.side.length > 0 && !filters.side.includes(t.direction)) return false;
  if (filters.outcome.length > 0 && !filters.outcome.includes(t.profit_loss ?? '')) return false;
  if (filters.tags.length > 0 && !allTagsOnTrade(t).some(tag => filters.tags.includes(tag))) return false;
  if (filters.days.length > 0) {
    if (!t.trade_placed_at) return false;
    const d = new Date(t.trade_placed_at);
    if (isNaN(d.getTime()) || !filters.days.includes(d.getUTCDay())) return false;
  }
  if (filters.dateFrom && (!t.trade_placed_at || t.trade_placed_at < filters.dateFrom)) return false;
  if (filters.dateTo && (!t.trade_placed_at || t.trade_placed_at > filters.dateTo)) return false;
  return true;
}

const OUTCOME_OPTIONS = [
  { value: 'Profit', label: 'Wins' },
  { value: 'Loss', label: 'Losses' },
  { value: 'Breakeven', label: 'Breakeven' },
];
const SIDE_OPTIONS = ['Long', 'Short'];

// A single "Assets ▾" / "Side ▾" style dropdown chip - click to open a
// checkbox list, click elsewhere to close. Kept generic (values + labels +
// selected + onToggle) so the same component drives Assets/Side/Outcome/
// Tags/Day without four near-duplicate implementations.
function FilterChip({ label, count, options, selected, onToggle }: {
  label: string;
  count: number;
  options: { value: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
          count > 0 ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
        )}
      >
        {label}{count > 0 && <span className="rounded-full bg-primary/20 px-1.5 text-[10px]">{count}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1">
            {options.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No options yet.</p>}
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => onToggle(opt.value)}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
                {opt.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function daysInMonthGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon-start, matches CalendarView
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, i) => {
    const d = i - offset + 1;
    return d > 0 && d <= daysInMonth ? d : null;
  });
  while (cells.length > 35 && cells.slice(-7).every(c => c === null)) cells.splice(-7, 7);
  return cells;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// A themed calendar popover in place of the browser's own native
// <input type="date"> - the native control renders with whatever styling
// the OS/browser gives it (usually a light popup), which read as broken
// against this app's dark theme. Clicking the field now pops up a
// month-grid picker instead, matching the rest of the filter bar's chips.
function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (value ? new Date(`${value}T00:00:00`) : new Date()).getMonth());

  function openPicker() {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const cells = daysInMonthGrid(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          'flex items-center gap-1.5 h-[30px] px-2.5 rounded-full border text-xs font-medium transition-colors',
          value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
        )}
      >
        <CalendarIcon className="w-3 h-3" />
        {value ?? label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold">{monthLabel}</span>
              <button type="button" onClick={() => shiftMonth(1)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                <span key={d} className="text-[10px] text-muted-foreground text-center">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const iso = isoDate(viewYear, viewMonth, d);
                const selected = iso === value;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onChange(iso); setOpen(false); }}
                    className={cn(
                      'h-7 w-7 rounded-md text-xs flex items-center justify-center',
                      selected ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted text-foreground'
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  filters: PerfFilters;
  onChange: (f: PerfFilters) => void;
  assetOptions: string[];
  tagOptions: TagOption[];
};

// FX Replay-style filter bar: a row of dropdown chips plus a row of
// removable pills summarizing the active selection. Applies to the
// client-side-computed views on this page (the new By Hour tab and the
// cumulative P/L line chart) - see the note in Performance.tsx on why the
// pre-existing Monthly/Yearly/Weekday/Session/Heatmap/Calendar tabs still
// run off the server's own aggregation instead.
export default function PerformanceFilterBar({ filters, onChange, assetOptions, tagOptions }: Props) {
  function toggle<K extends 'assets' | 'side' | 'outcome' | 'tags'>(key: K, value: string) {
    const list = filters[key];
    const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next });
  }
  function toggleDay(day: number) {
    const next = filters.days.includes(day) ? filters.days.filter(d => d !== day) : [...filters.days, day];
    onChange({ ...filters, days: next });
  }

  const activePills: { key: string; label: string; onRemove: () => void }[] = [
    ...filters.assets.map(a => ({ key: `asset-${a}`, label: a, onRemove: () => toggle('assets', a) })),
    ...filters.side.map(s => ({ key: `side-${s}`, label: s, onRemove: () => toggle('side', s) })),
    ...filters.outcome.map(o => ({
      key: `outcome-${o}`,
      label: OUTCOME_OPTIONS.find(x => x.value === o)?.label ?? o,
      onRemove: () => toggle('outcome', o),
    })),
    ...filters.tags.map(t => ({ key: `tag-${t}`, label: t, onRemove: () => toggle('tags', t) })),
    ...filters.days.map(d => ({
      key: `day-${d}`,
      label: WEEKDAYS.find(w => w.value === d)?.label ?? String(d),
      onRemove: () => toggleDay(d),
    })),
    ...(filters.dateFrom || filters.dateTo ? [{
      key: 'date-range',
      label: `${filters.dateFrom ?? '…'} → ${filters.dateTo ?? '…'}`,
      onRemove: () => onChange({ ...filters, dateFrom: null, dateTo: null }),
    }] : []),
  ];

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Assets"
          count={filters.assets.length}
          options={assetOptions.map(a => ({ value: a, label: a }))}
          selected={filters.assets}
          onToggle={(v) => toggle('assets', v)}
        />
        <FilterChip
          label="Side"
          count={filters.side.length}
          options={SIDE_OPTIONS.map(s => ({ value: s, label: s }))}
          selected={filters.side}
          onToggle={(v) => toggle('side', v)}
        />
        <FilterChip
          label="Outcome"
          count={filters.outcome.length}
          options={OUTCOME_OPTIONS}
          selected={filters.outcome}
          onToggle={(v) => toggle('outcome', v)}
        />
        <FilterChip
          label="Tags"
          count={filters.tags.length}
          options={tagOptions.map(t => ({ value: t.name, label: t.name, color: t.color }))}
          selected={filters.tags}
          onToggle={(v) => toggle('tags', v)}
        />
        <FilterChip
          label="Day"
          count={filters.days.length}
          options={WEEKDAYS.map(w => ({ value: String(w.value), label: w.label }))}
          selected={filters.days.map(String)}
          onToggle={(v) => toggleDay(Number(v))}
        />
        <div className="flex items-center gap-1.5">
          <DateField label="From" value={filters.dateFrom} onChange={(v) => onChange({ ...filters, dateFrom: v })} />
          <span className="text-xs text-muted-foreground">→</span>
          <DateField label="To" value={filters.dateTo} onChange={(v) => onChange({ ...filters, dateTo: v })} />
        </div>
        {!isFiltersEmpty(filters) && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters())}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Clear all
          </button>
        )}
      </div>
      {activePills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activePills.map(p => (
            <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {p.label}
              <button type="button" onClick={p.onRemove} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
