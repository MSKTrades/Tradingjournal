import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../../lib/ui/dialog';
import { Button } from '../../lib/ui/button';
import { Select } from '../../lib/ui/form';
import { Badge } from '../../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../lib/ui/table';
import { Upload, CheckCircle, FileSpreadsheet } from 'lucide-react';

export type ImportedTrade = {
  trade_number: number | null;
  start_capital: number | null;
  structure_15m: string | null;
  wr_1m: string | null;
  before_chart_1m: string | null;
  direction: string;
  liquidity_swept: string | null;
  distance_from_asia: number | null;
  liquidity_swept_no: number | null;
  cisd_break: number | null;
  total_inverse_candles: number | null;
  inverse_candle_size: number | null;
  sl_pips: number | null;
  position_size: number | null;
  profit_loss: string | null;
  rr: number | null;
  coin_token: string | null;
  trade_placed_at: string | null;
  trade_executed_at: string | null;
  session_in: string | null;
  date_closed: string | null;
  time_closed: string | null;
  closed_session: string | null;
  trade_duration: string | null;
  partial_1: number | null;
  partial_2: number | null;
  reached_1r2: boolean;
  reached_1r3: boolean;
  reached_1r4: boolean;
  reached_1r5: boolean;
  max_rr: number | null;
  comments: string | null;
  extra_data: Record<string, unknown>;
};

const TRADE_FIELDS = [
  { key: 'skip',                  label: '— Skip —' },
  { key: 'trade_number',          label: 'Trade #' },
  { key: 'coin_token',            label: 'Pair / Token' },
  { key: 'direction',             label: 'Direction (Long/Short)' },
  { key: 'structure_15m',         label: '15M Structure' },
  { key: 'wr_1m',                 label: '1M WR' },
  { key: 'trade_placed_at',       label: 'Date Placed' },
  { key: 'trade_executed_at',     label: 'Time Executed' },
  { key: 'session_in',            label: 'Session In' },
  { key: 'date_closed',           label: 'Date Closed' },
  { key: 'time_closed',           label: 'Time Closed' },
  { key: 'closed_session',        label: 'Closed Session' },
  { key: 'trade_duration',        label: 'Trade Duration' },
  { key: 'cisd_break',            label: 'CISD Break Candles' },
  { key: 'total_inverse_candles', label: 'Total Inverse Candles' },
  { key: 'inverse_candle_size',   label: 'Inverse Candle Size' },
  { key: 'distance_from_asia',    label: 'Distance from Asia H/L' },
  { key: 'liquidity_swept',       label: 'Liquidity Swept' },
  { key: 'liquidity_swept_no',    label: 'Liquidity Swept No.' },
  { key: 'sl_pips',               label: 'SL Pips' },
  { key: 'position_size',         label: 'Position Size %' },
  { key: 'start_capital',         label: 'Start Capital ($)' },
  { key: 'profit_loss',           label: 'Profit / Loss' },
  { key: 'rr',                    label: 'RR' },
  { key: 'partial_1',             label: 'Partial 1' },
  { key: 'partial_2',             label: 'Partial 2' },
  { key: 'reached_1r2',           label: '1:2 Reached' },
  { key: 'reached_1r3',           label: '1:3 Reached' },
  { key: 'reached_1r4',           label: '1:4 Reached' },
  { key: 'reached_1r5',           label: '1:5 Reached' },
  { key: 'max_rr',                label: 'Max RR' },
  { key: 'comments',              label: 'Comments' },
];

const DETECT_RULES: [RegExp, string][] = [
  [/^trade.?number$|^trade$|^#$/i,          'trade_number'],
  [/pair|symbol|coin|token|instrument|market/i, 'coin_token'],
  [/buy.?sell|direction|side|long|short|type/i, 'direction'],
  [/15m.?(str|structure|chart)/i,         'structure_15m'],
  [/15.?min.?(str|structure)/i,           'structure_15m'],
  [/1m.?wr|wr.?1m|1.?min.?wr/i,          'wr_1m'],
  [/1m.?before|before.?1m|before.?chart/i,'before_chart_1m'],
  [/1m.?chart|chart.?1m/i,               'before_chart_1m'],
  [/date.*plac|plac.*date|open.*date|entry.*date/i, 'trade_placed_at'],
  [/exec.*time|time.*exec|entry.*time|open.*time/i, 'trade_executed_at'],
  [/session.*in|in.*session|session.*exec|exec.*session/i, 'session_in'],
  [/date.*clos|clos.*date|exit.*date/i,     'date_closed'],
  [/time.*clos|clos.*time|exit.*time/i,     'time_closed'],
  [/clos.*session|session.*clos/i,          'closed_session'],
  [/duration/i,                             'trade_duration'],
  [/cisd/i,                                 'cisd_break'],
  [/total.*inv|inv.*total/i,                'total_inverse_candles'],
  [/inv.*size|size.*inv|inv.*candle|candle.*size/i, 'inverse_candle_size'],
  [/dist.*asia|asia.*dist|gap.*asia|asia.*gap/i, 'distance_from_asia'],
  [/liq.*swept?\s*no|swept?\s*no/i,         'liquidity_swept_no'],
  [/liq.*swept?|swept?/i,                   'liquidity_swept'],
  [/sl.?pip|stop.?pip|pip/i,               'sl_pips'],
  [/pos.*size|size.*pos|position/i,         'position_size'],
  [/start.*cap|cap.*start|initial.*cap/i,   'start_capital'],
  [/profit.?loss|p.?[/\\]?l\b/i,           'profit_loss'],
  [/\brr\b|reward|risk.?reward/i,           'rr'],
  [/partial.?1|part.?1/i,                  'partial_1'],
  [/partial.?2|part.?2/i,                  'partial_2'],
  [/^1.?[:/]2$|tp.?2$|1r2|hit.?2|2.?hit/i,  'reached_1r2'],
  [/^1.?[:/]3$|tp.?3$|1r3|hit.?3|3.?hit/i,  'reached_1r3'],
  [/^1.?[:/]4$|tp.?4$|1r4|hit.?4|4.?hit/i,  'reached_1r4'],
  [/^1.?[:/]5$|tp.?5$|1r5|hit.?5|5.?hit/i,  'reached_1r5'],
  [/max.?rr|max.?r\b/i,                   'max_rr'],
  [/comment|note|remark/i,                  'comments'],
];

function autoDetect(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  headers.forEach((h, i) => {
    const clean = h.trim();
    for (const [re, field] of DETECT_RULES) {
      if (re.test(clean)) { map[i] = field; break; }
    }
  });
  return map;
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (val instanceof Date) return val.toISOString().split('T')[0] ?? null;
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? String(val).trim() : (d.toISOString().split('T')[0] ?? null);
}

function parseTime(val: unknown): string | null {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.substring(0, 5);
  if (typeof val === 'number') {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return s;
}

function parseNum(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(String(val).replace(/[,%$]/g, '').trim());
  return isNaN(n) ? null : n;
}

function parseDirection(val: unknown): string {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'short' || s === 's' || s === 'sell' || s === 'bear') return 'Short';
  return 'Long';
}

function parsePL(val: unknown): string | null {
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'profit' || s === 'p' || s === 'win' || s === 'w' || s === '1') return 'Profit';
  if (s === 'loss' || s === 'l' || s === 'lose' || s === '0' || s === '-1') return 'Loss';
  return null;
}

function parseBool(val: unknown): boolean {
  const s = String(val ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === '✓' || s === 'x';
}

function parseStr(val: unknown): string | null {
  const s = String(val ?? '').trim();
  return s || null;
}

function rowToTrade(values: unknown[], mapping: Record<number, string>): ImportedTrade {
  const t: ImportedTrade = {
    trade_number: null, start_capital: null, structure_15m: null, wr_1m: null, before_chart_1m: null,
    direction: 'Long', liquidity_swept: null, distance_from_asia: null,
    liquidity_swept_no: null, cisd_break: null, total_inverse_candles: null,
    inverse_candle_size: null, sl_pips: null, position_size: null,
    profit_loss: null, rr: null, coin_token: null, trade_placed_at: null,
    trade_executed_at: null, session_in: null, date_closed: null, time_closed: null,
    closed_session: null, trade_duration: null, partial_1: null, partial_2: null,
    reached_1r2: false, reached_1r3: false, reached_1r4: false, reached_1r5: false,
    max_rr: null, comments: null, extra_data: {},
  };
  Object.entries(mapping).forEach(([idxStr, field]) => {
    const val = values[Number(idxStr)];
    switch (field) {
      case 'trade_number':          t.trade_number          = parseNum(val); break;
      case 'start_capital':         t.start_capital         = parseNum(val); break;
      case 'coin_token':            t.coin_token            = parseStr(val); break;
      case 'direction':             t.direction             = parseDirection(val); break;
      case 'before_chart_1m':       t.before_chart_1m       = parseStr(val); break;
      case 'wr_1m':                 t.wr_1m                 = parseStr(val); break;
      case 'trade_placed_at':       t.trade_placed_at       = parseDate(val); break;
      case 'trade_executed_at':     t.trade_executed_at     = parseTime(val); break;
      case 'session_in':            t.session_in            = parseStr(val); break;
      case 'date_closed':           t.date_closed           = parseDate(val); break;
      case 'time_closed':           t.time_closed           = parseTime(val); break;
      case 'closed_session':        t.closed_session        = parseStr(val); break;
      case 'trade_duration':        t.trade_duration        = parseStr(val); break;
      case 'cisd_break':            t.cisd_break            = parseNum(val); break;
      case 'total_inverse_candles': t.total_inverse_candles = parseNum(val); break;
      case 'inverse_candle_size':   t.inverse_candle_size   = parseNum(val); break;
      case 'distance_from_asia':    t.distance_from_asia    = parseNum(val); break;
      case 'liquidity_swept':       t.liquidity_swept       = parseStr(val); break;
      case 'liquidity_swept_no':    t.liquidity_swept_no    = parseNum(val); break;
      case 'sl_pips':               t.sl_pips               = parseNum(val); break;
      case 'position_size':         t.position_size         = parseNum(val); break;
      case 'profit_loss':           t.profit_loss           = parsePL(val); break;
      case 'rr':                    t.rr                    = parseNum(val); break;
      case 'partial_1':             t.partial_1             = parseNum(val); break;
      case 'partial_2':             t.partial_2             = parseNum(val); break;
      case 'reached_1r2':           t.reached_1r2           = parseBool(val); break;
      case 'reached_1r3':           t.reached_1r3           = parseBool(val); break;
      case 'reached_1r4':           t.reached_1r4           = parseBool(val); break;
      case 'reached_1r5':           t.reached_1r5           = parseBool(val); break;
      case 'max_rr':                t.max_rr                = parseNum(val); break;
      case 'comments':              t.comments              = parseStr(val); break;
    }
  });
  return t;
}

type Props = { open: boolean; onClose: () => void; onImport: (trades: ImportedTrade[]) => Promise<void> };
type Step  = 'upload' | 'map' | 'preview';
type SheetInfo = { name: string; rowCount: number };

export default function ImportTradesDialog({ open, onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep]     = useState<Step>('upload');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, { headers: string[]; rows: unknown[][] }>>({});
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<ImportedTrade[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  function reset() {
    setStep('upload'); setSheets([]); setSelected([]);
    setRawData({}); setMapping({}); setPreview([]); setFileName('');
  }
  function handleClose() { reset(); onClose(); }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const wb = XLSX.read(data, { type: 'binary', cellDates: true });
      const infos: SheetInfo[] = [];
      const rmap: Record<string, { headers: string[]; rows: unknown[][] }> = {};
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        if (!ws) return;
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        if (aoa.length < 2) return;
        const headers = (aoa[0] ?? []).map(h => String(h ?? '').trim()).filter(Boolean);
        if (!headers.length) return;
        const rows = aoa.slice(1).filter(r => r.some(c => c !== '' && c != null));
        if (!rows.length) return;
        infos.push({ name, rowCount: rows.length });
        rmap[name] = { headers, rows };
      });
      setSheets(infos);
      setRawData(rmap);
      setSelected(infos.map(s => s.name));
      const first = infos[0];
      if (first) setMapping(autoDetect(rmap[first.name]?.headers ?? []));
      setStep('map');
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function allHeaders(): string[] {
    const seen = new Set<string>(); const out: string[] = [];
    selected.forEach(s => (rawData[s]?.headers ?? []).forEach(h => { if (!seen.has(h)) { seen.add(h); out.push(h); } }));
    return out;
  }

  function buildPreview() {
    const trades: ImportedTrade[] = [];
    const seen = new Set<string>();
    selected.forEach(sName => {
      const sheet = rawData[sName];
      if (!sheet) return;
      const hMap: Record<number, string> = {};
      sheet.headers.forEach((h, i) => {
        const gi = allHeaders().indexOf(h);
        if (gi >= 0 && mapping[gi] && mapping[gi] !== 'skip') hMap[i] = mapping[gi];
      });
      sheet.rows.forEach(row => {
        const t = rowToTrade(row, hMap);
        if (!t.trade_placed_at && !t.coin_token) return;
        const key = `${t.trade_number}|${t.trade_placed_at}|${t.coin_token}|${t.direction}`;
        if (!seen.has(key)) { seen.add(key); trades.push(t); }
      });
    });
    setPreview(trades);
    setStep('preview');
  }

  async function handleImport() {
    setImporting(true);
    try { await onImport(preview); handleClose(); }
    finally { setImporting(false); }
  }

  if (!open) return null;
  const headers = allHeaders();
  const valid   = preview.filter(t => t.trade_placed_at ?? t.coin_token ?? t.trade_number);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Import from Excel
          </DialogTitle>
          <DialogClose onClose={handleClose} />
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:bg-accent/40 transition-colors w-full"
              onClick={() => fileRef.current?.click()}>
              <Upload className="w-10 h-10 text-muted-foreground" />
              <p className="font-medium">Click to select your Excel file</p>
              <p className="text-sm text-muted-foreground">.xlsx or .xls</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'map' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium mb-1">File: <span className="text-muted-foreground">{fileName}</span></p>
              <p className="text-xs text-muted-foreground mb-2">Select sheets to import:</p>
              <div className="flex flex-wrap gap-2">
                {sheets.map(s => (
                  <Badge key={s.name} variant={selected.includes(s.name) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelected(p => p.includes(s.name) ? p.filter(n => n !== s.name) : [...p, s.name])}>
                    {s.name} ({s.rowCount} rows)
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Map columns → trade fields:</p>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded w-44 shrink-0 truncate">{h}</span>
                    <Select value={mapping[i] ?? 'skip'} onChange={e => setMapping(p => ({ ...p, [i]: e.target.value }))} className="flex-1 h-7 text-xs">
                      {TRADE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={buildPreview} disabled={!selected.length}>Preview →</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="font-medium">{valid.length} trades ready to import</span>
            </div>
            <p className="text-xs text-muted-foreground">Duplicate trades (same trade# + date + pair) are merged.</p>
            <div className="rounded border border-border overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {['#', 'Date', 'Pair', 'Dir', 'CISD', 'Inv.C', 'P/L', 'RR', 'Max RR', '1:2', '1:3', '1:4', '1:5'].map(h => (
                      <TableHead key={h} className="text-xs py-1 px-2 whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valid.slice(0, 50).map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs py-1 px-2">{t.trade_number ?? '—'}</TableCell>
                      <TableCell className="text-xs py-1 px-2 font-mono">{t.trade_placed_at ?? '—'}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.coin_token ?? '—'}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.direction}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.cisd_break ?? '—'}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.inverse_candle_size ?? '—'}</TableCell>
                      <TableCell className={`text-xs py-1 px-2 font-semibold ${t.profit_loss === 'Profit' ? 'text-green-600 dark:text-green-400' : t.profit_loss === 'Loss' ? 'text-red-500 dark:text-red-400' : ''}`}>
                        {t.profit_loss ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.rr ?? '—'}</TableCell>
                      <TableCell className="text-xs py-1 px-2">{t.max_rr ?? '—'}</TableCell>
                      {[t.reached_1r2, t.reached_1r3, t.reached_1r4, t.reached_1r5].map((r, ri) => (
                        <TableCell key={ri} className="text-xs py-1 px-2 text-center">{r ? '✓' : '—'}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {valid.length > 50 && (
                    <TableRow><TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-2">…and {valid.length - 50} more</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('map')}>← Back</Button>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing || !valid.length}>
                {importing ? 'Importing…' : `Import ${valid.length} Trades`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
