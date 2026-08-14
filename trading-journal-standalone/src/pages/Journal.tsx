import { useState, useMemo } from 'react';
import { Button } from '../lib/ui/button';
import { Badge, Checkbox } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { Plus, Columns, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, FileUp } from 'lucide-react';
import { api, useFetch } from '../lib/api';
import TradeDialog, { TradePayload } from './ui/TradeDialog';
import ManageColumnsDialog from './ui/ManageColumnsDialog';
import ImportTradesDialog, { ImportedTrade } from './ui/ImportTradesDialog';
import { Trade, CustomColumn, fmtMoney, fmtPct, fmtNum, plColor } from './data/types';
import { cn } from '../lib/utils';

const DEFAULT_COLS = [
  { key: 'trade_number',          label: '#',            vis: true },
  { key: 'trade_placed_at',       label: 'Date',         vis: true },
  { key: 'coin_token',            label: 'Pair/Token',   vis: true },
  { key: 'direction',             label: 'Dir',          vis: true },
  { key: 'session_in',            label: 'Session',      vis: false },
  { key: 'structure_15m',         label: '15M Str',      vis: false },
  { key: 'wr_1m',                 label: '1M WR',        vis: false },
  { key: 'before_chart_1m',       label: '1M B/Chart',   vis: false },
  { key: 'cisd_break',            label: 'CISD',         vis: true },
  { key: 'inverse_candle_size',   label: 'Inv.C Size',   vis: true },
  { key: 'total_inverse_candles', label: 'Tot.Inv.C',    vis: false },
  { key: 'distance_from_asia',    label: 'Dist.Asia',    vis: true },
  { key: 'liquidity_swept',       label: 'Liq.Swept',    vis: false },
  { key: 'liquidity_swept_no',    label: 'Liq.Swept#',   vis: false },
  { key: 'sl_pips',               label: 'SL Pips',      vis: false },
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

export default function Journal() {
  const { data: rawTrades, loading, refetch: refetchTrades } = useFetch<Trade[]>('/trades');
  const { data: rawCols, refetch: refetchCols } = useFetch<CustomColumn[]>('/columns');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadVis);
  const [sort, setSort] = useState<SortState>({ key: 'trade_placed_at', dir: 'desc' });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const trades: Trade[] = rawTrades ?? [];
  const customCols: CustomColumn[] = rawCols ?? [];
  const lastEndCapital = trades.length > 0 ? (trades[0]?.end_capital ?? null) : null;

  const sorted = useMemo(() => {
    if (!sort.dir) return trades;
    return [...trades].sort((a, b) => {
      const av = a[sort.key as keyof Trade], bv = b[sort.key as keyof Trade];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [trades, sort]);

  function toggleSort(key: string) {
    setSort(p => p.key !== key ? { key, dir: 'asc' } : p.dir === 'asc' ? { key, dir: 'desc' } : p.dir === 'desc' ? { key, dir: null } : { key, dir: 'asc' });
  }

  function toggleVis(key: string, v: boolean) {
    const next = { ...visibility, [key]: v };
    setVisibility(next);
    localStorage.setItem(VIS_KEY, JSON.stringify(next));
  }

  async function handleSave(payload: TradePayload) {
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

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === sorted.length && sorted.length > 0 ? new Set() : new Set(sorted.map(t => t.id)));
  }

  async function handleAddCol(name: string, type: string) {
    const col_key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    await api.post('/columns', { name, col_key, data_type: type });
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
          <p className="text-sm text-muted-foreground">{trades.length} trade{trades.length !== 1 ? 's' : ''}</p>
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
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="w-4 h-4 mr-1" /> Import Excel
          </Button>
          <Button size="sm" onClick={() => { setEditTrade(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Trade
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8 px-2">
                <Checkbox checked={sorted.length > 0 && selectedIds.size === sorted.length} onCheckedChange={toggleSelectAll} aria-label="Select all" />
              </TableHead>
              {visibleCols.map(c => (
                <TableHead key={c.key} className="cursor-pointer select-none whitespace-nowrap px-2 py-2" onClick={() => toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">{c.label} <SortIcon col={c.key} /></span>
                </TableHead>
              ))}
              {visibleCustom.map(c => (
                <TableHead key={c.col_key} className="whitespace-nowrap px-2 py-2 text-xs">{c.name}</TableHead>
              ))}
              <TableHead className="w-16 px-2">Act</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={99} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={99} className="text-center py-12 text-muted-foreground">
                  No trades yet. Click <strong>Add Trade</strong> or <strong>Import Excel</strong> to begin.
                </TableCell>
              </TableRow>
            )}
            {sorted.map(trade => (
              <TableRow key={trade.id} className={cn('hover:bg-muted/30 text-xs', selectedIds.has(trade.id) && 'bg-primary/5')}>
                <TableCell className="px-2 py-1.5">
                  <Checkbox checked={selectedIds.has(trade.id)} onCheckedChange={() => toggleSelect(trade.id)} aria-label={`Select trade ${trade.id}`} />
                </TableCell>
                {visibleCols.map(c => (
                  <TableCell key={c.key} className="px-2 py-1.5 whitespace-nowrap">{renderCell(trade, c.key)}</TableCell>
                ))}
                {visibleCustom.map(col => (
                  <TableCell key={col.col_key} className="px-2 py-1.5 text-xs">{String(trade.extra_data?.[col.col_key] ?? '—')}</TableCell>
                ))}
                <TableCell className="px-2 py-1.5">
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

      <TradeDialog
        open={dialogOpen}
        trade={editTrade}
        customColumns={customCols}
        lastEndCapital={lastEndCapital}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
      />

      <ImportTradesDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (rows: ImportedTrade[]) => {
          await api.post('/trades/bulk-add', { trades: rows });
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
        onAddCustomColumn={handleAddCol}
        onDeleteCustomColumn={async (id: number) => { await api.del(`/columns/${id}`); refetchCols(); }}
      />
    </div>
  );
}
