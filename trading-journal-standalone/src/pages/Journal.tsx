import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '../lib/ui/button';
import { Badge, Checkbox } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Plus, Columns, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, FileUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { api, useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import TradeDetailPanel, { TradePayload } from './ui/TradeDetailPanel';
import ManageColumnsDialog from './ui/ManageColumnsDialog';
import ImportTradesDialog, { ImportedTrade } from './ui/ImportTradesDialog';
import { Trade, CustomColumn, Checklist, Tag, Account, fmtMoney, fmtPct, fmtNum, plColor } from './data/types';
import { cn } from '../lib/utils';
import PerformanceFilterBar, { PerfFilters, emptyFilters, matchesFilters } from './ui/PerformanceFilterBar';
import { computeDrawdown } from './data/risk';

const DEFAULT_COLS = [
  { key: 'trade_number',          label: '#',            vis: true },
  { key: 'trade_placed_at',       label: 'Date',         vis: true },
  { key: 'coin_token',            label: 'Pair/Token',   vis: true },
  { key: 'direction',             label: 'Dir',          vis: true },
  { key: 'session_in',            label: 'Session',      vis: false },
  { key: 'before_chart_1m',       label: '1M B/Chart',   vis: false },
  // CISD/inverse-candle/distance/liquidity/SL-pips/15M-Structure/1M-WR
  // columns moved to user-defined custom fields (see schema.sql migration)
  // — they now show up automatically via `visibleCustom` below instead of
  // being hardcoded here, so they don't appear twice.
  { key: 'position_size',         label: 'Pos %',        vis: false },
  { key: 'profit_loss',           label: 'P/L',          vis: true },
  { key: 'rr',                    label: 'RR',           vis: true },
  { key: 'partial_1',             label: 'Partial1',     vis: false },
  { key: 'partial_2',             label: 'Partial2',     vis: false },
  { key: 'reached_1r2',           label: '1:2',          vis: true },
  { key: 'reached_1r3',           label: '1:3',          vis: true },
  { key: 'reached_1r4',           label: '1:4',          vis: true },
  { key: 'reached_1r5',           label: '1:5',          vis: true },
  { key: 'max_rr',                label: 'Max RR',       vis: true },
  { key: 'start_capital',         label: 'Start $',      vis: true },
  { key: 'gain_loss',             label: 'G/L $',        vis: true },
  { key: 'gain_loss_pct',         label: 'G/L %',        vis: true },
  { key: 'end_capital',           label: 'End $',        vis: true },
  { key: 'overall_gain',          label: 'Overall $',    vis: false },
  { key: 'overall_pct',           label: 'Overall %',    vis: false },
  { key: 'trade_duration',        label: 'Duration',     vis: false },
  { key: 'date_closed',           label: 'Closed Date',  vis: false },
  { key: 'closed_session',        label: 'Cl.Session',   vis: false },
  { key: 'comments',              label: 'Comments',     vis: true },
];

const VIS_KEY = 'journal_col_vis_v2';

function loadVis(): Record<string, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem(VIS_KEY) ?? '{}') as Record<string, boolean>;
    const out: Record<string, boolean> = {};
    DEFAULT_COLS.forEach(c => { out[c.key] = stored[c.key] !== undefined ? Boolean(stored[c.key]) : c.vis; });
    return out;
  } catch { return Object.fromEntries(DEFAULT_COLS.map(c => [c.key, c.vis])); }
}

type SortState = { key: string; dir: 'asc' | 'desc' | null };

function renderCell(trade: Trade, key: string): React.ReactNode {
  const raw = trade[key as keyof Trade];
  const v: string | number | boolean | null | undefined =
    raw === null || raw === undefined || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
      ? (raw as string | number | boolean | null | undefined) : undefined;
  if (key.startsWith('reached_')) {
    return v ? <span className="text-green-500 font-bold">✓</span> : <span className="text-muted-foreground text-xs">—</span>;
  }
  if (key === 'direction') {
    return <Badge variant={v === 'Long' ? 'default' : 'secondary'} className="text-xs">{v === 'Long' ? '▲' : '▼'} {String(v)}</Badge>;
  }
  if (key === 'profit_loss') {
    if (v === 'Breakeven') return <span className="font-semibold text-xs text-muted-foreground">➖ Breakeven</span>;
    const isProfit = v === 'Profit';
    return <span className={`font-semibold text-xs ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{isProfit ? '✅ Profit' : '❌ Loss'}</span>;
  }
  if (key === 'gain_loss' || key === 'overall_gain') return <span className={plColor(v as number | null)}>{fmtMoney(v as number | null)}</span>;
  if (key === 'gain_loss_pct' || key === 'overall_pct') return <span className={plColor(v as number | null)}>{fmtPct(v as number | null)}</span>;
  if (key === 'start_capital' || key === 'end_capital') return <span className="font-mono text-xs">{fmtMoney(v as number | null)}</span>;
  if (key === 'trade_placed_at' || key === 'date_closed') {
    const s = String(v ?? '');
    return <span className="font-mono text-xs">{s.split('T')[0] ?? s}</span>;
  }
  if (key === 'rr' || key === 'max_rr') return v != null ? <span className="font-semibold">{fmtNum(v as number, 1)}R</span> : <span className="text-muted-foreground">—</span>;
  if (key === 'comments') return <span className="text-xs text-muted-foreground max-w-[150px] truncate block" title={String(v ?? '')}>{v || '—'}</span>;
  if (typeof v === 'number') return fmtNum(v, 2);
  if (v == null || v === '' || typeof v === 'object') return <span className="text-muted-foreground">—</span>;
  return String(v);
}

// Win/Loss/Breakeven read as a status, not a generic category — green/red
// carry that meaning everywhere else in this app (P/L badges, capital
// cards), so they're reused here rather than picking new colors. Breakeven
// stays the app's neutral muted-foreground token on purpose: it should
// recede next to the two outcomes that actually matter, not compete with
// them as a third "category". Direct counts in the legend (not just color)
// are the required secondary encoding for a colorblind-safe read.
// Same green/yellow/orange/red staging RiskGuardrail already uses for "how
// close to the limit" gauges on the Summary page - reused here so the same
// percentage-of-limit always reads the same way everywhere in the app.
function raceColor(pct: number): { bar: string; text: string } {
  if (pct >= 100) return { bar: 'bg-red-500', text: 'text-red-500' };
  if (pct >= 75) return { bar: 'bg-orange-500', text: 'text-orange-500' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
  return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}

type JournalInsightsProps = {
  trades: Trade[];      // the filtered/visible set - Total Trades and the win/loss counts track whatever the filter bar currently shows
  allTrades: Trade[];   // every trade on this account, unfiltered - capital, Total P/L, and the drawdown race need the account's real running balance, not just a filtered slice of it
  account: Account | null;
};

function JournalInsights({ trades, allTrades, account }: JournalInsightsProps) {
  const stats = useMemo(() => {
    const wins = trades.filter(t => t.profit_loss === 'Profit');
    const losses = trades.filter(t => t.profit_loss === 'Loss');
    const breakeven = trades.filter(t => t.profit_loss === 'Breakeven');
    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? Math.round((wins.length / decided) * 100) : 0;
    const grossWin = wins.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
    const grossLoss = -losses.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? null : 0);

    return {
      total: trades.length, wins: wins.length, losses: losses.length, breakeven: breakeven.length,
      winRate, profitFactor,
    };
  }, [trades]);

  // Starting/current capital and the max-drawdown race reflect the whole
  // account, not the filtered view above - computeDrawdown already knows
  // how to turn a starting balance + every trade's gain_loss into a running
  // equity curve (same helper the Performance page's drawdown chart uses).
  const dd = useMemo(
    () => computeDrawdown(allTrades, account?.starting_balance ?? null),
    [allTrades, account?.starting_balance]
  );
  const startingBalance = account?.starting_balance != null ? Number(account.starting_balance) : null;
  const totalPLDollar = startingBalance != null ? dd.currentBalance - startingBalance : null;
  const totalPLPct = startingBalance != null && startingBalance !== 0 && totalPLDollar != null
    ? (totalPLDollar / startingBalance) * 100
    : null;
  const maxDDLimitPct = account?.max_drawdown_limit_pct != null ? Number(account.max_drawdown_limit_pct) : null;
  const maxDDLimitDollar = startingBalance != null && maxDDLimitPct != null ? startingBalance * (maxDDLimitPct / 100) : null;
  const maxDDUsedPct = maxDDLimitDollar != null && maxDDLimitDollar > 0 ? (dd.currentDDDollar / maxDDLimitDollar) * 100 : null;

  if (trades.length === 0) return null;

  return (
    <div className="flex flex-wrap items-stretch gap-3 mb-4">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[110px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Trades</p>
        <p className="text-xl font-bold">{stats.total}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[100px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Wins</p>
        <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.wins}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[100px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Losses</p>
        <p className="text-xl font-bold text-red-500 dark:text-red-400">{stats.losses}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[110px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Break Even</p>
        <p className="text-xl font-bold text-muted-foreground">{stats.breakeven}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[120px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Starting Capital</p>
        <p className="text-xl font-bold">{fmtMoney(startingBalance)}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[120px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Current Capital</p>
        <p className={cn('text-xl font-bold', plColor(totalPLDollar))}>
          {fmtMoney(dd.currentBalance)}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[130px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total P/L</p>
        <p className={cn('text-xl font-bold', plColor(totalPLDollar))}>{fmtMoney(totalPLDollar)}</p>
        <p className={cn('text-[10px]', plColor(totalPLDollar))}>{fmtPct(totalPLPct)}</p>
      </div>
      {maxDDLimitDollar != null && maxDDUsedPct != null && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[180px]">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Max Loss Race</p>
            <span className={cn('text-[10px] font-mono font-semibold', raceColor(maxDDUsedPct).text)}>
              {Math.min(999, maxDDUsedPct).toFixed(0)}% used
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5 mb-1.5">
            <div className={cn('h-full transition-[width]', raceColor(maxDDUsedPct).bar)} style={{ width: `${Math.min(100, Math.max(0, maxDDUsedPct))}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{fmtMoney(dd.currentDDDollar)} of {fmtMoney(maxDDLimitDollar)} ({fmtNum(maxDDLimitPct, 1)}% max)</p>
        </div>
      )}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[140px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Win Rate</p>
        <p className="text-xl font-bold">{stats.winRate}%</p>
        <p className="text-[10px] text-muted-foreground">{stats.wins}W / {stats.losses}L / {stats.breakeven}BE</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 min-w-[110px]">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Profit Factor</p>
        <p className="text-xl font-bold">{stats.profitFactor === null ? '∞' : stats.profitFactor.toFixed(2)}</p>
      </div>
    </div>
  );
}

// A styled ::-webkit-scrollbar / scrollbar-width:thin on the table's
// overflow-x-auto container isn't enough on its own - modern Windows
// Chrome/Edge (Fluent overlay scrollbars) and macOS's default "only show
// while scrolling" setting both override page CSS and hide it entirely, so
// the extra columns stayed just as undiscoverable as before. This is a
// fully custom control instead - a track + thumb reflecting real scroll
// position (via scroll/resize listeners) plus explicit left/right buttons -
// so it's visible regardless of the OS's scrollbar settings. It only
// renders once the table actually overflows, and hides itself again if a
// column change brings it back within view.
function useHorizontalScrollState(ref: React.RefObject<HTMLDivElement>) {
  const [state, setState] = useState({ canScroll: false, canLeft: false, canRight: false, thumbPct: 0, thumbWidthPct: 100 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const canScroll = scrollWidth > clientWidth + 2;
      const thumbWidthPct = Math.min(100, (clientWidth / scrollWidth) * 100);
      const maxScroll = scrollWidth - clientWidth;
      const thumbPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - thumbWidthPct) : 0;
      setState({
        canScroll,
        canLeft: scrollLeft > 2,
        canRight: scrollLeft < maxScroll - 2,
        thumbPct,
        thumbWidthPct,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  return state;
}

function TableScrollBar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement> }) {
  const { canScroll, canLeft, canRight, thumbPct, thumbWidthPct } = useHorizontalScrollState(containerRef);
  if (!canScroll) return null;

  const nudge = (dir: number) => containerRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={!canLeft}
        aria-label="Scroll table left"
        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <div className="relative flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute top-0 bottom-0 rounded-full bg-muted-foreground/60"
          style={{ left: `${thumbPct}%`, width: `${thumbWidthPct}%` }}
        />
      </div>
      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={!canRight}
        aria-label="Scroll table right"
        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">scroll for more columns</span>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Windows the page-number buttons down to a fixed set (first, last, a
// couple around the current page, "…" for the gaps) rather than printing
// every page - matters once an account has a few hundred trades.
function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function JournalPagination({
  page, totalPages, pageSize, totalRows, onPage, onPageSize,
}: {
  page: number; totalPages: number; pageSize: number; totalRows: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  if (totalRows === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalRows);

  const navBtn = 'w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent shrink-0';

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-3 px-1">
      <p className="text-xs text-muted-foreground">
        Showing {first}–{last} of {totalRows} trades
      </p>
      <div className="flex items-center gap-0.5">
        <button type="button" className={navBtn} disabled={page === 1} onClick={() => onPage(1)} aria-label="First page">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={navBtn} disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageNumbers(page, totalPages).map((p, i) => p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-7 text-center text-xs text-muted-foreground">&hellip;</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            className={cn(
              'w-7 h-7 rounded text-xs font-medium shrink-0',
              p === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {p}
          </button>
        ))}
        <button type="button" className={navBtn} disabled={page === totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={navBtn} disabled={page === totalPages} onClick={() => onPage(totalPages)} aria-label="Last page">
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="text-xs bg-transparent border border-border rounded px-2 py-1 text-foreground"
        >
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function Journal() {
  const { accounts, loading: accountsLoading, activeAccountId, activeAccount } = useAccount();
  const { data: rawTrades, loading, refetch: refetchTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawCols, refetch: refetchCols } = useFetch<CustomColumn[]>(`/columns?account_id=${activeAccountId ?? ''}`);
  const { data: rawChecklists } = useFetch<Checklist[]>(`/checklist?account_id=${activeAccountId ?? ''}`);
  const { data: rawTags } = useFetch<Tag[]>('/columns?resource=tags');
  const allTags: Tag[] = rawTags ?? [];
  const [filters, setFilters] = useState<PerfFilters>(emptyFilters);
  // Tags themselves aren't scoped to one account - the same tag pool is
  // meant to be reusable everywhere you apply one to a trade (see the
  // Tags picker inside TradeDetailPanel, which does use the full allTags
  // list for exactly that reason). But the Tags FILTER here is different:
  // showing every tag you've ever created across every account - most of
  // which can't possibly match a single trade in whichever account is
  // currently active - just reads as broken ("why is Asia in here, I don't
  // use that tag on this account"). Narrowing the filter's own option list
  // to tags actually present on at least one trade in this account fixes
  // that without touching how tags themselves work.

  const [dialogOpen, setDialogOpen] = useState(false);
  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadVis);
  const [sort, setSort] = useState<SortState>({ key: 'trade_placed_at', dir: 'desc' });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const tableScrollRef = useRef<HTMLDivElement>(null);
  // 25 sits in the "20-30 per page" range asked for - large enough that
  // most accounts rarely need to page through, small enough that the
  // sticky header actually has something to stay pinned above.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const trades: Trade[] = rawTrades ?? [];
  const usedTagNames = new Set(trades.flatMap(t => t.tags ?? []));
  const accountTagOptions = allTags.filter(t => usedTagNames.has(t.name));
  const customCols: CustomColumn[] = rawCols ?? [];
  const checklists: Checklist[] = rawChecklists ?? [];
  const nextTradeNumber = trades.length === 0 ? 1 : Math.max(0, ...trades.map(t => t.trade_number ?? 0)) + 1;

  // Custom columns don't live directly on the Trade object — their values
  // sit inside extra_data — so sorting has to check there too, not just
  // `a[sort.key]`, or clicking a custom field's header would silently no-op.
  const customColKeys = useMemo(() => new Set(customCols.map(c => c.col_key)), [customCols]);
  function sortValue(t: Trade, key: string): unknown {
    return customColKeys.has(key) ? t.extra_data?.[key] : t[key as keyof Trade];
  }

  const sorted = useMemo(() => {
    if (!sort.dir) return trades;
    return [...trades].sort((a, b) => {
      const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, sort, customColKeys]);

  // Same Assets/Side/Outcome/Tags/Day/Date-range filter bar as Performance,
  // applied on top of sorting - `matchesFilters` is the one shared
  // predicate both pages use, so "Side: Short" etc. can't drift between them.
  const assetOptions = useMemo(
    () => Array.from(new Set(trades.map(t => (t.coin_token ?? '').trim().toUpperCase()).filter(Boolean))).sort(),
    [trades]
  );
  const filtered = useMemo(() => sorted.filter(t => matchesFilters(t, filters)), [sorted, filters]);

  // Re-sorting, switching accounts, or changing filters changes what page 1
  // even means, and shrinking the page size (or a bulk delete) can leave
  // `page` pointing past the new last page - both are corrected here rather
  // than in the render path, so every consumer of `page` below already sees
  // a valid value.
  useEffect(() => { setPage(1); }, [activeAccountId, sort.key, sort.dir, pageSize, filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [page, currentPage]);
  const pageTrades = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );

  function toggleSort(key: string) {
    setSort(p => p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : p.dir === 'desc' ? { key, dir: null } : { key, dir: 'asc' });
  }

  function toggleVis(key: string, v: boolean) {
    const next = { ...visibility, [key]: v };
    setVisibility(next);
    localStorage.setItem(VIS_KEY, JSON.stringify(next));
  }

  async function handleSave(payload: TradePayload) {
    // account_id comes from the panel's own Account selector now, so trades
    // can be assigned to (or reassigned to) any account from right there.
    if (payload.id != null) await api.put(`/trades/${payload.id}`, payload);
    else await api.post('/trades', payload);
    refetchTrades();
  }

  async function handleDelete(id: number) {
    setDeleteId(id);
    await api.del(`/trades/${id}`);
    setDeleteId(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    refetchTrades();
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected trade${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await api.post('/trades/bulk-delete', { ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
    refetchTrades();
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Scoped to the current page, not every trade behind pagination - matches
  // the usual paginated-table convention, and avoids a "select all" that
  // silently includes hundreds of rows the user can't currently see.
  function toggleSelectAll() {
    const pageIds = pageTrades.map(t => t.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function handleAddCol(name: string, type: string, accountIds?: number[]) {
    const col_key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    // Scoped to whichever account is currently active by default — a field
    // added here only shows up on this account going forward, not every
    // account. Passing accountIds (from the "Also add to" picker) instead
    // creates the SAME name+col_key on every one of those accounts in one
    // call, so a field meant for a strategy that spans several accounts
    // actually has a matching key on all of them - see the comment on
    // api/columns.ts's account_ids branch for why that matters.
    if (accountIds && accountIds.length > 0) {
      await api.post('/columns', { name, col_key, data_type: type, account_ids: accountIds });
    } else {
      await api.post('/columns', { name, col_key, data_type: type, account_id: activeAccountId });
    }
    refetchCols();
  }
  async function handleRenameCol(id: number, name: string) {
    await api.put('/columns', { id, name });
    refetchCols();
  }

  function SortIcon({ col }: { col: string }) {
    if (sort.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-30" />;
  }

  const visibleCols = DEFAULT_COLS.filter(c => visibility[c.key]);
  const visibleCustom = customCols.filter(c => c.visible !== false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Trade Journal</h1>
          <p className="text-sm text-muted-foreground">
            {trades.length} trade{trades.length !== 1 ? 's' : ''}
            {activeAccount && <> &middot; <span className="font-medium text-foreground">{activeAccount.name}</span></>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete {selectedIds.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setColDialogOpen(true)}>
            <Columns className="w-4 h-4 mr-1" /> Columns
          </Button>
          <Button variant="outline" size="sm" disabled={!activeAccountId} onClick={() => setImportOpen(true)}>
            <FileUp className="w-4 h-4 mr-1" /> Import Excel
          </Button>
          <Button size="sm" disabled={!activeAccountId} onClick={() => { setEditTrade(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Trade
          </Button>
        </div>
      </div>

      {!accountsLoading && accounts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg mb-4">
          No accounts yet. Use the account switcher in the sidebar to create one before adding trades.
        </div>
      )}

      <PerformanceFilterBar filters={filters} onChange={setFilters} assetOptions={assetOptions} tagOptions={accountTagOptions} />

      <JournalInsights trades={filtered} allTrades={trades} account={activeAccount} />

      <TableScrollBar containerRef={tableScrollRef} />

      {/* No overflow-hidden here (even though it'd tidy the rounded corners
          against the inner scrollable table) - an overflow!=visible
          ancestor becomes the reference frame position:sticky measures
          against, and since THIS div never scrolls on its own (the window
          does), that silently breaks the sticky column header below. */}
      <div className="rounded-lg border border-border">
        <Table scrollRef={tableScrollRef} containerClassName="max-h-[65vh]">
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8 px-2 bg-background">
                <Checkbox
                  checked={pageTrades.length > 0 && pageTrades.every(t => selectedIds.has(t.id))}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              {visibleCols.map(c => (
                <TableHead key={c.key} className="cursor-pointer select-none whitespace-nowrap px-2 py-2 bg-background" onClick={() => toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">{c.label} <SortIcon col={c.key} /></span>
                </TableHead>
              ))}
              {visibleCustom.map(c => (
                <TableHead key={c.col_key} className="cursor-pointer select-none whitespace-nowrap px-2 py-2 text-xs bg-background" onClick={() => toggleSort(c.col_key)}>
                  <span className="inline-flex items-center gap-1">{c.name} <SortIcon col={c.col_key} /></span>
                </TableHead>
              ))}
              <TableHead className="w-16 px-2 bg-background">Act</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={99} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={99} className="text-center py-12 text-muted-foreground">
                  {trades.length === 0
                    ? <>No trades yet. Click <strong>Add Trade</strong> or <strong>Import Excel</strong> to begin.</>
                    : 'No trades match the current filters.'}
                </TableCell>
              </TableRow>
            )}
            {pageTrades.map(trade => (
              <TableRow
                key={trade.id}
                className={cn('hover:bg-muted/30 text-xs cursor-pointer', selectedIds.has(trade.id) && 'bg-primary/5')}
                onClick={() => { setEditTrade(trade); setDialogOpen(true); }}
              >
                <TableCell className="px-2 py-1.5" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(trade.id)} onCheckedChange={() => toggleSelect(trade.id)} aria-label={`Select trade ${trade.id}`} />
                </TableCell>
                {visibleCols.map(c => (
                  <TableCell key={c.key} className="px-2 py-1.5 whitespace-nowrap">{renderCell(trade, c.key)}</TableCell>
                ))}
                {visibleCustom.map(col => (
                  <TableCell key={col.col_key} className="px-2 py-1.5 text-xs">{String(trade.extra_data?.[col.col_key] ?? '—')}</TableCell>
                ))}
                <TableCell className="px-2 py-1.5" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditTrade(trade); setDialogOpen(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      disabled={deleteId === trade.id} onClick={() => handleDelete(trade.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <JournalPagination
        page={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalRows={filtered.length}
        onPage={setPage}
        onPageSize={setPageSize}
      />

      <TradeDetailPanel
        open={dialogOpen}
        trade={editTrade}
        customColumns={customCols}
        checklists={checklists}
        nextTradeNumber={nextTradeNumber}
        trades={trades}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
        onAddCustomColumn={handleAddCol}
        onDeleteCustomColumn={async (id: number) => { await api.del(`/columns?id=${id}`); refetchCols(); }}
        onRenameCustomColumn={handleRenameCol}
      />

      <ImportTradesDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        customColumns={customCols}
        onImport={async (rows: ImportedTrade[]) => {
          await api.post('/trades/bulk-add', { trades: rows, account_id: activeAccountId });
          refetchTrades();
        }}
      />

      <ManageColumnsDialog
        open={colDialogOpen}
        onClose={() => setColDialogOpen(false)}
        defaultCols={DEFAULT_COLS.map(c => ({ key: c.key, label: c.label }))}
        defaultVisibility={visibility}
        onToggleDefault={toggleVis}
        customColumns={customCols}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onAddCustomColumn={handleAddCol}
        onDeleteCustomColumn={async (id: number) => { await api.del(`/columns?id=${id}`); refetchCols(); }}
        onRenameCustomColumn={handleRenameCol}
      />
    </div>
  );
}
