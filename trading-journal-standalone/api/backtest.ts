import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHistoricalRates } from 'dukascopy-node';
import { put } from '@vercel/blob';
import { db, withApi } from './_db.js';
import { getUserFromRequest, isAdminEmail } from './_auth.js';

// Chart Replay / Backtesting: three resources sharing one function (same
// reasoning as api/columns.ts — Vercel Hobby caps serverless functions at
// 12, and this is the last available slot).
//
//   resource=datasets — the registry of candle datasets (the actual OHLC
//     candles live in Vercel Blob as JSON; this table just tracks
//     pair/timeframe -> blob URL + metadata so the Backtest page has
//     something to list and pick from).
//   resource=trades   — practice trades you log while stepping/playing
//     through a dataset's replay. Deliberately separate from the real
//     `trades` table/API — no account_id, no capital-chain recalculation,
//     this is rehearsal data, not money.
//   resource=fetch     — pulls real candles directly from Dukascopy's free,
//     no-signup public historical feed (via dukascopy-node) instead of
//     requiring a manual CSV export/upload. The Backtest page's "Fetch Data"
//     dialog calls this once per smaller date-range chunk (see FetchDatasetDialog
//     for why: a 5-month 1-minute pull is a lot of individual hourly files to
//     download/decompress from Dukascopy, and chunking keeps each call well
//     inside this function's time budget and gives the UI something to show
//     a progress bar against) and each call merges its new candles into
//     whatever's already stored for that pair+timeframe.
//   resource=drawings  — trend lines / horizontal lines / rectangles / Fib
//     retracements placed on a dataset's replay chart. Scoped by dataset_id
//     and shared across whoever views that dataset (same pattern as the
//     candle data itself, see chart_datasets above) - not per-account, since
//     nothing else in this Backtest feature is account-scoped either.
//   resource=smc_candles — live multi-timeframe candles for the Smart Money
//     Concepts Analysis page (src/pages/SmcAnalysis.tsx). Pulls fresh
//     Dukascopy history per pair across every fetchable timeframe (1m
//     through 1d - Weekly is derived from Daily, see resampleWeeklyServer
//     below, since dukascopy-node has no native weekly granularity), cached
//     per pair+timeframe in smc_candle_cache with a short TTL (see
//     SMC_CACHE_TTL_SECONDS) so switching timeframe tabs or reloading the
//     page doesn't re-hit Dukascopy every time, while staying "live" within
//     a few minutes. All the actual SMC analysis (structure/OB/FVG/range/
//     strategy evaluation) happens client-side in src/pages/ui/smc/ against
//     these raw candles - this endpoint only ever returns OHLC data.
//   resource=smc_markups — the user's own manually-drawn entry/SL/TP
//     markups on the SMC Analysis page, graded client-side against one of
//     the six strategy models (see src/pages/ui/smc/markupGrading.ts) and
//     persisted here purely as a record of what was graded and when - the
//     server does not recompute or trust the grade, it just stores whatever
//     the client computed.
//
// Backtest isn't ready for other users yet (still being built/tested), so
// the whole file is gated to the admin account only, same pattern and same
// isAdminEmail check as api/columns.ts's resource=admin_stats - a 404, not
// a 401/403, so a non-admin request can't even tell this route exists.
// This is the REAL gate; Layout.tsx hiding the sidebar link and App.tsx
// swapping in BacktestComingSoon for anyone else are just the UX to match -
// neither of those stops a direct request to this URL on their own.

// Same public Blob store api/upload.ts uploads screenshots/candles to — see
// that file's note on why the forexblob_ prefixed token is tried first.
const BLOB_TOKEN = process.env.forexblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

// Our REPLAY_TIMEFRAMES ('1m'/'5m'/...) -> dukascopy-node's own timeframe
// enum values (mostly identical, but spelled out explicitly so a mismatch
// fails loudly instead of silently passing through a wrong string).
const DUKA_TIMEFRAME: Record<string, string> = {
  '1m': 'm1', '5m': 'm5', '15m': 'm15', '1h': 'h1', '4h': 'h4', '1d': 'd1',
};

type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };

// resource=fetch downloads and decompresses a chunk of real Dukascopy
// history per call - comfortably fast for the day/week/month-sized chunks
// FetchDatasetDialog requests, but well past Vercel's un-configured default
// on some account setups. Hobby already defaults to 300s under fluid
// compute, but pinning this explicitly means the fetch resource keeps
// working even on an account where that default differs.
export const config = { maxDuration: 60 };

async function listDatasets(sql: ReturnType<typeof db>) {
  return sql.unsafe('SELECT * FROM chart_datasets ORDER BY pair ASC, timeframe ASC');
}

async function upsertDataset(sql: ReturnType<typeof db>, p: any) {
  const pair = String(p.pair ?? '').trim().toUpperCase();
  const timeframe = String(p.timeframe ?? '').trim();
  const blobUrl = String(p.blob_url ?? '').trim();
  if (!pair || !timeframe || !blobUrl) throw new Error('pair, timeframe, and blob_url are required');

  const rows = await sql.unsafe(
    `INSERT INTO chart_datasets (pair, timeframe, blob_url, candle_count, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pair, timeframe) DO UPDATE SET
       blob_url = EXCLUDED.blob_url,
       candle_count = EXCLUDED.candle_count,
       start_time = EXCLUDED.start_time,
       end_time = EXCLUDED.end_time,
       uploaded_at = now()
     RETURNING *`,
    [pair, timeframe, blobUrl, p.candle_count ?? 0, p.start_time ?? null, p.end_time ?? null]
  );
  return rows[0];
}

async function fetchChunk(sql: ReturnType<typeof db>, p: any) {
  const pair = String(p.pair ?? '').trim().toUpperCase();
  const timeframe = String(p.timeframe ?? '').trim();
  const dukaTf = DUKA_TIMEFRAME[timeframe];
  if (!pair || !dukaTf) throw new Error('A valid pair and timeframe are required');
  if (!p.from || !p.to) throw new Error('from and to dates are required');
  if (!BLOB_TOKEN) throw new Error('Blob storage is not configured for this Vercel project (see api/upload.ts).');

  let raw: any[];
  try {
    raw = (await getHistoricalRates({
      instrument: pair.toLowerCase() as any,
      dates: { from: new Date(`${p.from}T00:00:00Z`), to: new Date(`${p.to}T00:00:00Z`) },
      timeframe: dukaTf as any,
      priceType: 'bid',
      format: 'json',
      useCache: false,
      // With the library's own default (retryCount: 0), a failed request
      // (bad instrument id, Dukascopy hiccup, network issue) comes back as
      // a *silently empty* result instead of an error - fetchChunk would
      // then report "0 candles added" as if the range genuinely had no
      // market activity, hiding a real failure. Retrying a couple of times
      // and then actually throwing on persistent failure means a bad pair
      // name or a real outage surfaces as an error instead of quietly
      // doing nothing.
      retryCount: 2,
      pauseBetweenRetriesMs: 500,
      failAfterRetryCount: true,
    })) as any[];
  } catch (e: any) {
    throw new Error(
      `Fetching ${pair} from Dukascopy failed: ${e?.message ?? 'unknown error'}. ` +
      `Double-check the pair matches a real Dukascopy instrument id (e.g. gbpusd, eurusd, xauusd).`
    );
  }

  const fresh: Candle[] = (raw ?? []).map(r => ({
    time: Math.round(r.timestamp / 1000), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
  }));

  const existingRows = await sql.unsafe('SELECT * FROM chart_datasets WHERE pair = $1 AND timeframe = $2', [pair, timeframe]);
  const existing = existingRows[0] ?? null;

  if (fresh.length === 0) {
    // Nothing new for this date range (e.g. a weekend/holiday chunk with no
    // market activity) - not an error, just nothing to merge.
    return { added: 0, total: existing?.candle_count ?? 0, dataset: existing };
  }

  // Merge into whatever's already stored for this pair+timeframe, keyed by
  // candle time so re-fetching an overlapping range (the UI intentionally
  // uses slightly overlapping chunk boundaries) de-dupes instead of
  // duplicating bars.
  let merged = fresh;
  if (existing) {
    try {
      const res = await fetch(existing.blob_url);
      if (res.ok) {
        const prior: Candle[] = await res.json();
        const byTime = new Map<number, Candle>();
        for (const c of prior) byTime.set(c.time, c);
        for (const c of fresh) byTime.set(c.time, c);
        merged = Array.from(byTime.values());
      }
    } catch { /* couldn't read the prior blob - fall back to just this chunk rather than fail the whole request */ }
  }
  merged.sort((a, b) => a.time - b.time);

  // Deterministic path (not addRandomSuffix'd) so re-fetching more of the
  // same pair+timeframe overwrites the same blob object instead of
  // accumulating orphaned versions in storage.
  const blob = await put(`candle-datasets/${pair}-${timeframe}.json`, JSON.stringify(merged), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN,
  });

  const dataset = await upsertDataset(sql, {
    pair, timeframe, blob_url: blob.url,
    candle_count: merged.length,
    start_time: new Date(merged[0].time * 1000).toISOString(),
    end_time: new Date(merged[merged.length - 1].time * 1000).toISOString(),
  });

  return { added: fresh.length, total: merged.length, dataset };
}

async function listTrades(sql: ReturnType<typeof db>, datasetId: number | null) {
  if (datasetId) {
    return sql.unsafe(
      'SELECT * FROM backtest_trades WHERE dataset_id = $1 ORDER BY entry_time DESC, id DESC',
      [datasetId]
    );
  }
  return sql.unsafe('SELECT * FROM backtest_trades ORDER BY entry_time DESC, id DESC');
}

async function addTrade(sql: ReturnType<typeof db>, p: any) {
  const datasetId = Number(p.dataset_id);
  if (!datasetId || isNaN(datasetId)) throw new Error('dataset_id is required');
  if (p.entry_price == null) throw new Error('entry_price is required');
  if (!p.entry_time) throw new Error('entry_time is required');

  const rows = await sql.unsafe(
    `INSERT INTO backtest_trades
       (dataset_id, direction, entry_price, sl_price, tp_price, entry_time, exit_time, exit_price, result, rr, notes, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING *`,
    [
      datasetId, p.direction ?? 'Long', p.entry_price, p.sl_price ?? null, p.tp_price ?? null,
      p.entry_time, p.exit_time ?? null, p.exit_price ?? null, p.result ?? null, p.rr ?? null, p.notes ?? null,
      // Raw array, not JSON.stringify()'d - the `::jsonb` cast above makes
      // the `postgres` driver serialize it itself; pre-stringifying would
      // double-encode it (see the note in api/trades/index.ts for the bug
      // this caused there).
      p.tags ?? [],
    ]
  );
  return rows[0];
}

async function updateTrade(sql: ReturnType<typeof db>, id: number, p: any) {
  const rows = await sql.unsafe(
    `UPDATE backtest_trades SET
       direction=$1, entry_price=$2, sl_price=$3, tp_price=$4, entry_time=$5,
       exit_time=$6, exit_price=$7, result=$8, rr=$9, notes=$10, tags=$11::jsonb
     WHERE id=$12
     RETURNING *`,
    [
      p.direction ?? 'Long', p.entry_price, p.sl_price ?? null, p.tp_price ?? null, p.entry_time,
      p.exit_time ?? null, p.exit_price ?? null, p.result ?? null, p.rr ?? null, p.notes ?? null, p.tags ?? [], id,
    ]
  );
  return rows[0];
}

const DRAWING_TYPES = ['trendline', 'horizontal', 'rectangle', 'fib'];

async function listDrawings(sql: ReturnType<typeof db>, datasetId: number) {
  return sql.unsafe('SELECT * FROM chart_drawings WHERE dataset_id = $1 ORDER BY id ASC', [datasetId]);
}

async function addDrawing(sql: ReturnType<typeof db>, p: any) {
  const datasetId = Number(p.dataset_id);
  if (!datasetId || isNaN(datasetId)) throw new Error('dataset_id is required');
  const type = String(p.type ?? '').trim();
  if (!DRAWING_TYPES.includes(type)) throw new Error(`type must be one of ${DRAWING_TYPES.join(', ')}`);
  if (!Array.isArray(p.points) || p.points.length === 0) throw new Error('points are required');

  const rows = await sql.unsafe(
    `INSERT INTO chart_drawings (dataset_id, type, points, color)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING *`,
    [
      datasetId, type,
      // Raw array, not JSON.stringify()'d - same reasoning as tags in
      // addTrade above: the ::jsonb cast makes the `postgres` driver
      // serialize it itself, so pre-stringifying would double-encode it.
      p.points,
      String(p.color ?? '#3b82f6'),
    ]
  );
  return rows[0];
}

// --- Smart Money Concepts Analysis: live multi-timeframe candle fetch -------

// How far back each timeframe pulls, and how long a cached pull stays
// "fresh" before the next request re-fetches from Dukascopy. Deliberately
// bounded windows (not the multi-year ranges Backtest datasets use) - this
// feature is about reading CURRENT structure, not backtesting history, and
// keeping the windows small keeps every timeframe's fetch fast enough that
// a cold cache (all 6 timeframes fetched in parallel) still comfortably
// fits inside this function's time budget.
const SMC_WINDOW_DAYS: Record<string, number> = { '1m': 3, '5m': 7, '15m': 14, '1h': 60, '4h': 180, '1d': 500 };
const SMC_CACHE_TTL_SECONDS: Record<string, number> = { '1m': 300, '5m': 300, '15m': 900, '1h': 900, '4h': 3600, '1d': 3600 };
const SMC_FETCH_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

// Weekly candles for the SMC page: dukascopy-node's own Timeframe type has
// no native weekly granularity (only up to d1, then it jumps to mn1/
// monthly - confirmed directly against its type defs), so Weekly is always
// derived server-side from the Daily pull, bucketed to Monday-00:00-UTC
// weeks. Deliberately duplicated here (not imported from
// src/pages/ui/smc/marketStructure.ts's resampleWeekly) so this API
// function stays self-contained and doesn't pull the client bundle's
// analysis code into a serverless function - same reasoning every other
// resource in this file keeps its own small helpers rather than importing
// from src/.
function resampleWeeklyServer(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let current: Candle | null = null;
  let currentStart = -1;
  for (const c of daily) {
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const start = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday) / 1000);
    if (!current || start !== currentStart) {
      if (current) out.push(current);
      currentStart = start;
      current = { time: start, open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
    }
  }
  if (current) out.push(current);
  return out;
}

async function readBlobJson(url: string): Promise<Candle[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getSmcCandlesForTf(sql: ReturnType<typeof db>, pair: string, tf: string): Promise<Candle[]> {
  const dukaTf = DUKA_TIMEFRAME[tf];
  const cacheRows = await sql.unsafe('SELECT * FROM smc_candle_cache WHERE pair = $1 AND timeframe = $2', [pair, tf]);
  const cached = cacheRows[0] ?? null;
  const ttlMs = (SMC_CACHE_TTL_SECONDS[tf] ?? 900) * 1000;
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs) {
    const fresh = await readBlobJson(cached.blob_url);
    if (fresh) return fresh;
  }

  const days = SMC_WINDOW_DAYS[tf] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400 * 1000);
  let raw: any[];
  try {
    raw = (await getHistoricalRates({
      instrument: pair.toLowerCase() as any,
      dates: { from, to },
      timeframe: dukaTf as any,
      priceType: 'bid',
      format: 'json',
      useCache: false,
      // Dukascopy's public feed rate-limits by request burst, not by
      // timeframe - a single getHistoricalRates call is normally a small
      // handful of requests (minute-granularity timeframes fetch one file
      // per DAY, hour-granularity one per MONTH, day-granularity one per
      // YEAR - see node_modules/dukascopy-node's url-generator), so the
      // real risk isn't any one call, it's SIX of these firing at once (see
      // smcCandles below, which now sequences them instead). A longer,
      // slightly jittered backoff here is what lets a transient 429 from
      // that burst actually clear before the retry, instead of retrying
      // straight into the same still-active rate-limit window.
      retryCount: 3,
      pauseBetweenRetriesMs: 1200 + Math.floor(Math.random() * 600),
      failAfterRetryCount: true,
    })) as any[];
  } catch (e: any) {
    // A fetch failure falls back to whatever's cached (even if stale)
    // rather than breaking the whole page - one timeframe being a bit
    // behind is far better than the SMC page erroring out entirely.
    if (cached) {
      const stale = await readBlobJson(cached.blob_url);
      if (stale) return stale;
    }
    throw new Error(`Fetching ${pair} ${tf} from Dukascopy failed: ${e?.message ?? 'unknown error'}.`);
  }

  const candles: Candle[] = (raw ?? []).map(r => ({
    time: Math.round(r.timestamp / 1000), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
  }));

  if (candles.length === 0 && cached) {
    const stale = await readBlobJson(cached.blob_url);
    if (stale) return stale;
  }
  if (!BLOB_TOKEN) throw new Error('Blob storage is not configured for this Vercel project (see api/upload.ts).');

  const blob = await put(`smc-candles/${pair}-${tf}.json`, JSON.stringify(candles), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, token: BLOB_TOKEN,
  });

  await sql.unsafe(
    `INSERT INTO smc_candle_cache (pair, timeframe, blob_url, candle_count, from_time, to_time, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (pair, timeframe) DO UPDATE SET
       blob_url = EXCLUDED.blob_url, candle_count = EXCLUDED.candle_count,
       from_time = EXCLUDED.from_time, to_time = EXCLUDED.to_time, fetched_at = now()`,
    [
      pair, tf, blob.url, candles.length,
      candles.length ? new Date(candles[0].time * 1000).toISOString() : null,
      candles.length ? new Date(candles[candles.length - 1].time * 1000).toISOString() : null,
    ]
  );

  return candles;
}

async function smcCandles(sql: ReturnType<typeof db>, p: any) {
  const pair = String(p.pair ?? '').trim().toUpperCase();
  if (!pair) throw new Error('pair is required');

  // Fetched ONE AT A TIME, not via Promise.all. Six concurrent
  // getHistoricalRates calls used to burst past Dukascopy's public-feed
  // rate limit and come back as a 429 on whichever timeframe lost the race
  // - and because Promise.all fails fast, that single rejection used to
  // take the ENTIRE request down (the page-wide "Something went wrong"
  // error the user saw, with every timeframe/model stuck showing no data,
  // even though 5 of the 6 fetches had actually succeeded). Sequencing
  // them keeps request volume low enough to stay under the limit, and each
  // fetch gets its own try/catch below so ONE persistently-failing
  // timeframe (already unlikely after the retry/backoff bump above) comes
  // back as an empty array plus a note in `errors`, instead of failing
  // every other timeframe that loaded fine.
  const timeframes: Record<string, Candle[]> = {};
  const errors: Record<string, string> = {};
  for (const tf of SMC_FETCH_TIMEFRAMES) {
    try {
      timeframes[tf] = await getSmcCandlesForTf(sql, pair, tf);
    } catch (e: any) {
      console.error(`smcCandles: ${pair} ${tf} failed`, e);
      timeframes[tf] = [];
      errors[tf] = e?.message ?? 'Failed to load candles for this timeframe.';
    }
    // Small stagger between sequential requests too - Dukascopy's limit is
    // burst-based, so even one-at-a-time back-to-back-to-back requests with
    // zero gap can still trip it under load.
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  timeframes['1w'] = resampleWeeklyServer(timeframes['1d']);

  return { pair, timeframes, errors, fetchedAt: new Date().toISOString() };
}

// --- Smart Money Concepts Analysis: user markups ----------------------------

async function listSmcMarkups(sql: ReturnType<typeof db>, pair: string | null) {
  if (pair) return sql.unsafe('SELECT * FROM smc_markups WHERE pair = $1 ORDER BY created_at DESC', [pair]);
  return sql.unsafe('SELECT * FROM smc_markups ORDER BY created_at DESC');
}

async function addSmcMarkup(sql: ReturnType<typeof db>, p: any) {
  const pair = String(p.pair ?? '').trim().toUpperCase();
  const timeframe = String(p.timeframe ?? '').trim();
  if (!pair || !timeframe) throw new Error('pair and timeframe are required');
  if (p.entry_price == null || p.sl_price == null || p.tp_price == null) throw new Error('entry_price, sl_price, and tp_price are required');

  const rows = await sql.unsafe(
    `INSERT INTO smc_markups (pair, timeframe, model_key, direction, entry_price, sl_price, tp_price, entry_time, points, notes, grade)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb)
     RETURNING *`,
    [
      pair, timeframe, p.model_key ?? null, p.direction ?? 'bullish',
      p.entry_price, p.sl_price, p.tp_price, p.entry_time ?? null,
      p.points ?? [], p.notes ?? '', p.grade ?? null,
    ]
  );
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();

  const requester = await getUserFromRequest(req, sql);
  if (!requester || !isAdminEmail(requester.email)) { res.status(404).json({ error: 'Not found' }); return; }

  const resource = (req.method === 'POST' ? req.body?.resource : req.query.resource) as string | undefined;

  if (req.method === 'GET') {
    if (resource === 'datasets') { res.status(200).json(await listDatasets(sql)); return; }
    if (resource === 'trades') {
      const datasetIdParam = req.query.dataset_id;
      const datasetId = datasetIdParam ? Number(Array.isArray(datasetIdParam) ? datasetIdParam[0] : datasetIdParam) : null;
      res.status(200).json(await listTrades(sql, datasetId && !isNaN(datasetId) ? datasetId : null));
      return;
    }
    if (resource === 'drawings') {
      const datasetIdParam = req.query.dataset_id;
      const datasetId = datasetIdParam ? Number(Array.isArray(datasetIdParam) ? datasetIdParam[0] : datasetIdParam) : NaN;
      if (!datasetId || isNaN(datasetId)) { res.status(400).json({ error: 'dataset_id is required' }); return; }
      res.status(200).json(await listDrawings(sql, datasetId));
      return;
    }
    if (resource === 'smc_candles') {
      const pairParam = req.query.pair;
      const pair = Array.isArray(pairParam) ? pairParam[0] : pairParam;
      res.status(200).json(await smcCandles(sql, { pair }));
      return;
    }
    if (resource === 'smc_markups') {
      const pairParam = req.query.pair;
      const pair = Array.isArray(pairParam) ? pairParam[0] : pairParam;
      res.status(200).json(await listSmcMarkups(sql, pair ? String(pair).trim().toUpperCase() : null));
      return;
    }
    res.status(400).json({ error: 'resource must be "datasets", "trades", "drawings", "smc_candles", or "smc_markups"' });
  } else if (req.method === 'POST') {
    if (resource === 'datasets') { res.status(200).json(await upsertDataset(sql, req.body)); return; }
    if (resource === 'trades') { res.status(200).json(await addTrade(sql, req.body)); return; }
    if (resource === 'fetch') { res.status(200).json(await fetchChunk(sql, req.body)); return; }
    if (resource === 'drawings') { res.status(200).json(await addDrawing(sql, req.body)); return; }
    if (resource === 'smc_markups') { res.status(200).json(await addSmcMarkup(sql, req.body)); return; }
    res.status(400).json({ error: 'resource must be "datasets", "trades", "fetch", "drawings", or "smc_markups"' });
  } else if (req.method === 'PUT') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (resource === 'trades') { res.status(200).json(await updateTrade(sql, id, req.body)); return; }
    res.status(400).json({ error: 'resource must be "trades"' });
  } else if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (resource === 'datasets') {
      await sql.unsafe('DELETE FROM chart_datasets WHERE id = $1', [id]); // cascades to backtest_trades, chart_drawings
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (resource === 'trades') {
      await sql.unsafe('DELETE FROM backtest_trades WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (resource === 'drawings') {
      await sql.unsafe('DELETE FROM chart_drawings WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (resource === 'smc_markups') {
      await sql.unsafe('DELETE FROM smc_markups WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    res.status(400).json({ error: 'resource must be "datasets", "trades", "drawings", or "smc_markups"' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
