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
    res.status(400).json({ error: 'resource must be "datasets", "trades", or "drawings"' });
  } else if (req.method === 'POST') {
    if (resource === 'datasets') { res.status(200).json(await upsertDataset(sql, req.body)); return; }
    if (resource === 'trades') { res.status(200).json(await addTrade(sql, req.body)); return; }
    if (resource === 'fetch') { res.status(200).json(await fetchChunk(sql, req.body)); return; }
    if (resource === 'drawings') { res.status(200).json(await addDrawing(sql, req.body)); return; }
    res.status(400).json({ error: 'resource must be "datasets", "trades", "fetch", or "drawings"' });
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
    res.status(400).json({ error: 'resource must be "datasets", "trades", or "drawings"' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
