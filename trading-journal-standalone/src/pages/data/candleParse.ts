import { Candle } from './types';

// Tolerant parser for the historical-candle CSV exports people actually
// have lying around: TradingView's "Export chart data" (header row, a
// combined `time` column as either unix seconds or an ISO string), MT4/MT5
// exports (Date + Time as two separate columns, dot-separated date like
// "2024.01.02"), Dukascopy's tick/candle export ("Local time" like
// "02.01.2024 00:00:00.000 GMT+0000"), and HistData.com's headerless
// yyyymmdd/hhmmss files. Rather than requiring one exact format, this reads
// the header (if any) to figure out which columns are which, falls back to
// a small set of positional guesses when there's no header, and tries a
// handful of common date/time patterns per cell — skipping (and counting)
// any row it can't make sense of instead of failing the whole import over
// one bad line.

export type ParsedCandles = {
  candles: Candle[];
  skippedRows: number;
  totalRows: number;
};

const HEADER_KEYWORDS = new Set([
  'time', 'date', 'timestamp', 'datetime', 'local time',
  'open', 'high', 'low', 'close', 'volume', 'vol', 'gmt time',
]);

function detectDelimiter(line: string): string {
  const counts: Record<string, number> = {
    ',': (line.match(/,/g) || []).length,
    ';': (line.match(/;/g) || []).length,
    '\t': (line.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === delim && !inQuotes) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(c => HEADER_KEYWORDS.has(c.trim().toLowerCase()));
}

// Parses a cell that carries a FULL date (and possibly time) by itself.
// Returns unix seconds, or null if this cell doesn't match a known
// combined-datetime pattern (e.g. it's date-only, or time-only — those are
// handled separately by parseDateOnly / parseTimeOnly for the split-column
// case).
function parseCombinedDateTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // Dukascopy: "02.01.2024 00:00:00.000 GMT+0000" (also tolerates no ms/tz)
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    return Math.round(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)) / 1000);
  }

  // ISO-ish: "2024-01-02T00:00:00Z" / "2024-01-02 00:00:00"
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    return Math.round(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)) / 1000);
  }

  // MM/DD/YYYY HH:mm[:ss]
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, mo, d, y, h, mi, se] = m;
    return Math.round(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)) / 1000);
  }

  return null;
}

// Date-only cell -> {y, mo, d} in UTC. Supports "2024.01.02" (MT4),
// "2024-01-02" (ISO), "20240102" (HistData), "01/02/2024" (US).
function parseDateOnly(raw: string): [number, number, number] | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})$/);
  if (m) return [+m[1], +m[2] - 1, +m[3]];
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return [+m[1], +m[2] - 1, +m[3]];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return [+m[3], +m[1] - 1, +m[2]];
  return null;
}

// Time-only cell -> {h, mi, se}. Supports "00:00", "00:00:00", "000000".
function parseTimeOnly(raw: string): [number, number, number] | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return [+m[1], +m[2], +(m[3] ?? 0)];
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function combineDateTime(datePart: string, timePart: string): number | null {
  const d = parseDateOnly(datePart);
  if (!d) return null;
  const t = parseTimeOnly(timePart) ?? [0, 0, 0];
  return Math.round(Date.UTC(d[0], d[1], d[2], t[0], t[1], t[2]) / 1000);
}

// A bare numeric time cell: unix seconds, unix milliseconds, or an Excel
// serial date (days since 1899-12-30) if the sheet came through Excel.
function parseNumericTime(n: number): number | null {
  if (n > 20000 && n < 80000) return Math.round((n - 25569) * 86400); // Excel serial
  if (n > 1e8 && n < 4e9) return Math.round(n);                        // unix seconds
  if (n >= 4e9 && n < 4e12) return Math.round(n / 1000);                // unix ms
  return null;
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

export async function parseCandleFile(file: File): Promise<ParsedCandles> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new Error('File is empty.');

  const delim = detectDelimiter(lines[0]);
  const firstCells = splitLine(lines[0], delim);
  const hasHeader = looksLikeHeader(firstCells);

  const header = hasHeader ? firstCells.map(c => c.trim().toLowerCase()) : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) throw new Error('No data rows found after the header.');

  const firstDataCells = splitLine(dataLines[0], delim);
  const colCount = firstDataCells.length;

  // Figure out which column index holds what, either from the header names
  // or (no header) from the column count + a quick look at the first row.
  let idx: { time?: number; date?: number; timeOnly?: number; open: number; high: number; low: number; close: number; volume?: number };

  if (header) {
    const find = (...names: string[]) => header.findIndex(h => names.includes(h));
    const dateCol = find('date');
    const plainTimeCol = find('time'); // only fires on an exact "time" header
    const combinedCol = find('timestamp', 'datetime', 'local time', 'gmt time');

    const openIdx = find('open'), highIdx = find('high'), lowIdx = find('low'), closeIdx = find('close');
    const volIdx = find('volume', 'vol');

    if (dateCol >= 0 && plainTimeCol >= 0) {
      // Separate "Date" + "Time" columns (MT4/MT5-style) - combine per row.
      idx = { date: dateCol, timeOnly: plainTimeCol, open: openIdx, high: highIdx, low: lowIdx, close: closeIdx, volume: volIdx >= 0 ? volIdx : undefined };
    } else if (dateCol >= 0) {
      // Date-only column, no separate time - candles land at midnight.
      idx = { date: dateCol, open: openIdx, high: highIdx, low: lowIdx, close: closeIdx, volume: volIdx >= 0 ? volIdx : undefined };
    } else if (combinedCol >= 0) {
      idx = { time: combinedCol, open: openIdx, high: highIdx, low: lowIdx, close: closeIdx, volume: volIdx >= 0 ? volIdx : undefined };
    } else if (plainTimeCol >= 0) {
      // Just a "Time" column with no "Date" column - treat it as the one
      // combined datetime column (TradingView exports call it "time").
      idx = { time: plainTimeCol, open: openIdx, high: highIdx, low: lowIdx, close: closeIdx, volume: volIdx >= 0 ? volIdx : undefined };
    } else {
      throw new Error('Could not find a Time/Date column in the header.');
    }

    if (idx.open < 0 || idx.high < 0 || idx.low < 0 || idx.close < 0) {
      throw new Error('Could not find Open/High/Low/Close columns in the header. Expected column names like "Open", "High", "Low", "Close".');
    }
  } else {
    // No header - guess from column count. This covers the two most common
    // headerless exports: a single combined datetime column, or a separate
    // date+time pair (MT4-style), each optionally followed by volume.
    const col0IsFullDateTime = parseCombinedDateTime(firstDataCells[0]) != null
      || (toNumber(firstDataCells[0]) != null && parseNumericTime(toNumber(firstDataCells[0])!) != null);
    if (colCount >= 6 && col0IsFullDateTime) {
      idx = { time: 0, open: 1, high: 2, low: 3, close: 4, volume: colCount >= 6 ? 5 : undefined };
    } else if (colCount >= 6) {
      // assume [date, time, open, high, low, close, volume?]
      idx = { date: 0, timeOnly: 1, open: 2, high: 3, low: 4, close: 5, volume: colCount >= 7 ? 6 : undefined };
    } else if (colCount === 5) {
      idx = { time: 0, open: 1, high: 2, low: 3, close: 4 };
    } else {
      throw new Error(`Unrecognized CSV layout (${colCount} columns, no header row). Expected Date/Time + Open/High/Low/Close[/Volume].`);
    }
  }

  const candles: Candle[] = [];
  let skipped = 0;

  for (const line of dataLines) {
    const cells = splitLine(line, delim);
    if (cells.length < colCount) { skipped++; continue; }

    let timeSec: number | null = null;
    if (idx.date != null) {
      timeSec = combineDateTime(cells[idx.date], idx.timeOnly != null ? cells[idx.timeOnly] : '00:00:00');
    } else if (idx.time != null) {
      const raw = cells[idx.time];
      const n = toNumber(raw);
      timeSec = n != null ? parseNumericTime(n) : parseCombinedDateTime(raw);
    }

    const open = toNumber(cells[idx.open]);
    const high = toNumber(cells[idx.high]);
    const low = toNumber(cells[idx.low]);
    const close = toNumber(cells[idx.close]);
    const volume = idx.volume != null ? toNumber(cells[idx.volume]) : null;

    if (timeSec == null || open == null || high == null || low == null || close == null) { skipped++; continue; }
    if (high < Math.max(open, close, low) - 1e-9 || low > Math.min(open, close, high) + 1e-9) { skipped++; continue; }

    candles.push({ time: timeSec, open, high, low, close, ...(volume != null ? { volume } : {}) });
  }

  candles.sort((a, b) => a.time - b.time);

  // De-dupe identical timestamps (keep the last one seen), which happens
  // when a file has an overlapping re-export at its start/end.
  const deduped: Candle[] = [];
  for (const c of candles) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) deduped[deduped.length - 1] = c;
    else deduped.push(c);
  }

  if (deduped.length === 0) {
    throw new Error('No valid candles could be parsed from this file. Check that it has Date/Time and Open/High/Low/Close columns.');
  }

  return { candles: deduped, skippedRows: skipped, totalRows: dataLines.length };
}
