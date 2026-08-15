import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';

// Chart Replay / Backtesting: two resources sharing one function (same
// reasoning as api/columns.ts — Vercel Hobby caps serverless functions at
// 12, and this is the last available slot).
//
//   resource=datasets — the registry of uploaded candle datasets (the actual
//     OHLC candles live in Vercel Blob as JSON, uploaded directly from the
//     browser; this table just tracks pair/timeframe -> blob URL + metadata
//     so the Backtest page has something to list and pick from).
//   resource=trades   — practice trades you log while stepping/playing
//     through a dataset's replay. Deliberately separate from the real
//     `trades` table/API — no account_id, no capital-chain recalculation,
//     this is rehearsal data, not money.

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
       (dataset_id, direction, entry_price, sl_price, tp_price, entry_time, exit_time, exit_price, result, rr, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      datasetId, p.direction ?? 'Long', p.entry_price, p.sl_price ?? null, p.tp_price ?? null,
      p.entry_time, p.exit_time ?? null, p.exit_price ?? null, p.result ?? null, p.rr ?? null, p.notes ?? null,
    ]
  );
  return rows[0];
}

async function updateTrade(sql: ReturnType<typeof db>, id: number, p: any) {
  const rows = await sql.unsafe(
    `UPDATE backtest_trades SET
       direction=$1, entry_price=$2, sl_price=$3, tp_price=$4, entry_time=$5,
       exit_time=$6, exit_price=$7, result=$8, rr=$9, notes=$10
     WHERE id=$11
     RETURNING *`,
    [
      p.direction ?? 'Long', p.entry_price, p.sl_price ?? null, p.tp_price ?? null, p.entry_time,
      p.exit_time ?? null, p.exit_price ?? null, p.result ?? null, p.rr ?? null, p.notes ?? null, id,
    ]
  );
  return rows[0];
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const resource = (req.method === 'POST' ? req.body?.resource : req.query.resource) as string | undefined;

  if (req.method === 'GET') {
    if (resource === 'datasets') { res.status(200).json(await listDatasets(sql)); return; }
    if (resource === 'trades') {
      const datasetIdParam = req.query.dataset_id;
      const datasetId = datasetIdParam ? Number(Array.isArray(datasetIdParam) ? datasetIdParam[0] : datasetIdParam) : null;
      res.status(200).json(await listTrades(sql, datasetId && !isNaN(datasetId) ? datasetId : null));
      return;
    }
    res.status(400).json({ error: 'resource must be "datasets" or "trades"' });
  } else if (req.method === 'POST') {
    if (resource === 'datasets') { res.status(200).json(await upsertDataset(sql, req.body)); return; }
    if (resource === 'trades') { res.status(200).json(await addTrade(sql, req.body)); return; }
    res.status(400).json({ error: 'resource must be "datasets" or "trades"' });
  } else if (req.method === 'PUT') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (resource === 'trades') { res.status(200).json(await updateTrade(sql, id, req.body)); return; }
    res.status(400).json({ error: 'resource must be "trades"' });
  } else if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }
    if (resource === 'datasets') {
      await sql.unsafe('DELETE FROM chart_datasets WHERE id = $1', [id]); // cascades to backtest_trades
      res.status(200).json({ deleted: 1 });
      return;
    }
    if (resource === 'trades') {
      await sql.unsafe('DELETE FROM backtest_trades WHERE id = $1', [id]);
      res.status(200).json({ deleted: 1 });
      return;
    }
    res.status(400).json({ error: 'resource must be "datasets" or "trades"' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
