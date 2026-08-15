import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WEEKDAYS, Tag } from '../data/types';

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

type Props = {
  filters: PerfFilters;
  onChange: (f: PerfFilters) => void;
  assetOptions: string[];
  tagOptions: Tag[];
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
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })}
            className="h-[30px] rounded-full border border-border bg-transparent px-2.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })}
            className="h-[30px] rounded-full border border-border bg-transparent px-2.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
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
