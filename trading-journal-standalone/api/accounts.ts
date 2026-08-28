import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi, recalcAccountCapital } from './_db.js';
import { requireUserId, ownsAccount } from './_auth.js';
import { provisionAccount, getAccountStatus, removeAccount, fetchDealsByTimeRange, groupClosedPositions, toTradeRow } from './_metaapi.js';

// --- MT4/MT5 broker sync (FTMO, The5ers, or any other prop firm/broker on
// MT4 or MT5, via MetaApi.cloud) ---------------------------------------
//
// Lives here, as resource= branches on the accounts endpoint, rather than as
// its own api/*.ts file, because the Vercel Hobby plan caps a project at 12
// serverless functions and this project is already at exactly 12 - see the
// same pattern in api/backtest.ts and api/columns.ts. Everything below is
// scoped to a single PipEcho account (via ownsAccount) the same way the
// plain account CRUD above it is.
//
// The investor password from the Connect Broker form passes through
// mt_connect below and into provisionAccount() in _metaapi.js, and nowhere
// else - it is never written to a variable that outlives that one request,
// and never touches the database. See mt_connections in schema.sql.

async function handleMtConnect(sql: ReturnType<typeof db>, userId: number, p: any) {
  const accountId = Number(p?.account_id);
  if (!accountId || !(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  const { login, password, server, platform, name } = p ?? {};
  if (!login || !password || !server || (platform !== 'mt4' && platform !== 'mt5')) {
    throw new Error('login, password, server, and platform (mt4 or mt5) are all required');
  }

  const existing = await sql.unsafe('SELECT id FROM mt_connections WHERE account_id = $1', [accountId]);
  if (existing[0]) throw new Error('This account is already connected to a broker. Disconnect it first to reconnect.');

  const provisioned = await provisionAccount({ login, password, server, platform, name });
  const state = String(provisioned.state || 'provisioning').toLowerCase();

  const rows = await sql.unsafe(
    `INSERT INTO mt_connections (account_id, user_id, metaapi_account_id, platform, login, server, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, account_id, platform, login, server, state, last_synced_at, created_at`,
    [accountId, userId, provisioned.id, platform, String(login), String(server), state]
  );
  return rows[0];
}

async function handleMtStatus(sql: ReturnType<typeof db>, userId: number, accountId: number) {
  if (!(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  const rows = await sql.unsafe(
    `SELECT id, account_id, metaapi_account_id, platform, login, server, state, region, last_error, last_synced_at, created_at
     FROM mt_connections WHERE account_id = $1`,
    [accountId]
  );
  const conn = rows[0];
  if (!conn) return { connected: false };
  // metaapi_account_id is only needed locally to call MetaApi below - not
  // something the client needs back.
  const { metaapi_account_id, ...connPublic } = conn;

  // Best-effort refresh from MetaApi - if this fails (e.g. temporary
  // outage), still return what we last knew locally rather than erroring
  // the whole status check out.
  try {
    const remote = await getAccountStatus(metaapi_account_id);
    const newState = String(remote.state || conn.state).toLowerCase();
    const newRegion = remote.region ?? conn.region;
    if (newState !== conn.state || newRegion !== conn.region) {
      await sql.unsafe('UPDATE mt_connections SET state = $1, region = $2 WHERE id = $3', [newState, newRegion, conn.id]);
    }
    return { connected: true, ...connPublic, state: newState, region: newRegion, connection_status: remote.connectionStatus ?? null };
  } catch (err: any) {
    return { connected: true, ...connPublic, refresh_error: err.message };
  }
}

async function handleMtSync(sql: ReturnType<typeof db>, userId: number, accountId: number) {
  if (!(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  const rows = await sql.unsafe('SELECT * FROM mt_connections WHERE account_id = $1', [accountId]);
  const conn = rows[0];
  if (!conn) throw new Error('This account is not connected to a broker yet');

  // Re-fetches a rolling 90-day lookback on every sync rather than only
  // "since last_synced_at" - simpler and avoids a real gap: a position can
  // open before last_synced_at and only close after it, and syncing
  // strictly forward from last_synced_at would then see its closing deal
  // with no matching opening deal in the same batch. Re-processing 90 days
  // is safe to repeat because inserts below are upserts keyed on
  // (account_id, external_id) - an already-synced trade is just updated in
  // place, not duplicated. Known v1 limit: a position open longer than 90
  // days won't be picked up until it closes within that window - fine for
  // the kind of intraday/swing trading this journal is built around, worth
  // revisiting if that turns out not to be true in practice.
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);
  const deals = await fetchDealsByTimeRange(conn.metaapi_account_id, conn.region, startTime, endTime);
  const closedPositions = groupClosedPositions(deals);

  let synced = 0;
  for (const pos of closedPositions) {
    const row = toTradeRow(pos);
    await sql.unsafe(
      `INSERT INTO trades (
         account_id, source, external_id, coin_token, direction, entry_price, sl_price, tp_price,
         trade_placed_at, trade_executed_at, date_closed, time_closed, trade_duration,
         profit_loss, gain_loss, position_size, extra_data
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
       ON CONFLICT (account_id, source, external_id) WHERE source = 'mt_sync' DO UPDATE SET
         coin_token = EXCLUDED.coin_token, direction = EXCLUDED.direction,
         entry_price = EXCLUDED.entry_price, trade_placed_at = EXCLUDED.trade_placed_at,
         trade_executed_at = EXCLUDED.trade_executed_at, date_closed = EXCLUDED.date_closed,
         time_closed = EXCLUDED.time_closed, trade_duration = EXCLUDED.trade_duration,
         profit_loss = EXCLUDED.profit_loss, gain_loss = EXCLUDED.gain_loss,
         extra_data = EXCLUDED.extra_data`,
      [
        accountId, row.source, row.external_id, row.coin_token, row.direction, row.entry_price, row.sl_price, row.tp_price,
        row.trade_placed_at, row.trade_executed_at, row.date_closed, row.time_closed, row.trade_duration,
        row.profit_loss, row.gain_loss, row.position_size, row.extra_data,
      ]
    );
    synced++;
  }

  if (synced > 0) await recalcAccountCapital(sql, accountId);
  await sql.unsafe('UPDATE mt_connections SET last_synced_at = now(), last_error = NULL WHERE id = $1', [conn.id]);

  return { synced, checked: deals.length };
}

async function handleMtDisconnect(sql: ReturnType<typeof db>, userId: number, accountId: number) {
  if (!(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  const rows = await sql.unsafe('SELECT * FROM mt_connections WHERE account_id = $1', [accountId]);
  const conn = rows[0];
  if (!conn) throw new Error('This account is not connected to a broker');

  // Best-effort on MetaApi's side - if their API is briefly unavailable, we
  // still want to be able to unlink locally rather than get stuck.
  try { await removeAccount(conn.metaapi_account_id); } catch { /* ignore - see above */ }
  await sql.unsafe('DELETE FROM mt_connections WHERE id = $1', [conn.id]);

  // Trades already pulled in stay exactly as they are (source='mt_sync' is
  // just a label at that point) - disconnecting stops future syncing, it
  // doesn't retroactively erase journal history.
  return { disconnected: true };
}

async function listAccounts(sql: ReturnType<typeof db>, userId: number) {
  return await sql.unsafe(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY sort_order ASC, id ASC`, [userId]);
}

async function createAccount(sql: ReturnType<typeof db>, userId: number, p: any) {
  const name = String(p?.name ?? '').trim();
  if (!name) throw new Error('Account name is required');
  const rows = await sql.unsafe(
    `INSERT INTO accounts (name, type, starting_balance, active, sort_order, daily_loss_limit_pct, max_drawdown_limit_pct, consistency_rule_pct, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      name,
      p.type ?? null,
      p.starting_balance ?? null,
      p.active ?? true,
      p.sort_order ?? 0,
      p.daily_loss_limit_pct ?? null,
      p.max_drawdown_limit_pct ?? null,
      p.consistency_rule_pct ?? null,
      userId,
    ]
  );
  return rows[0];
}

// --- Prop P&L Ledger (fees paid / payouts received) --------------------
//
// Lives here as resource= branches, same reasoning as mt_connect/etc above
// - account-level cash movements to/from the prop firm, entirely separate
// from per-trade P&L (never feeds recalcAccountCapital, gain_loss, or the
// drawdown/equity-curve math). See ledger_entries in schema.sql.

async function listLedgerEntries(sql: ReturnType<typeof db>, userId: number, accountId: number) {
  if (!(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  return await sql.unsafe(
    `SELECT * FROM ledger_entries WHERE account_id = $1 ORDER BY entry_date DESC, id DESC`,
    [accountId]
  );
}

async function createLedgerEntry(sql: ReturnType<typeof db>, userId: number, p: any) {
  const accountId = Number(p?.account_id);
  if (!accountId || !(await ownsAccount(sql, accountId, userId))) throw new Error('Account not found');
  const entryType = p?.entry_type;
  if (entryType !== 'fee' && entryType !== 'payout') throw new Error("entry_type must be 'fee' or 'payout'");
  const amount = Number(p?.amount);
  if (!isFinite(amount)) throw new Error('amount is required');
  const entryDate = String(p?.entry_date ?? '').trim();
  if (!entryDate) throw new Error('entry_date is required');

  const rows = await sql.unsafe(
    `INSERT INTO ledger_entries (account_id, user_id, entry_type, amount, entry_date, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [accountId, userId, entryType, amount, entryDate, p?.note ?? null]
  );
  return rows[0];
}

async function deleteLedgerEntry(sql: ReturnType<typeof db>, userId: number, id: number) {
  if (!id || isNaN(id)) throw new Error('id is required');
  // Verify the entry's account belongs to the requesting user before
  // deleting - mirrors the account-ownership check every other branch here
  // does, just joined through ledger_entries.account_id instead of taking
  // an account_id directly.
  const rows = await sql.unsafe(
    `DELETE FROM ledger_entries USING accounts
     WHERE ledger_entries.id = $1 AND accounts.id = ledger_entries.account_id AND accounts.user_id = $2
     RETURNING ledger_entries.id`,
    [id, userId]
  );
  if (!rows[0]) throw new Error('Ledger entry not found');
  return { deleted: 1 };
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  // resource= branches for MT4/MT5 broker sync - checked first and kept
  // completely separate from the plain account CRUD below, which has no
  // concept of `resource` at all and must keep working exactly as before
  // for every request that doesn't pass one.
  const resource = (req.method === 'POST' ? req.body?.resource : req.query.resource) as string | undefined;
  if (resource) {
    try {
      if (resource === 'mt_connect' && req.method === 'POST') {
        res.status(200).json(await handleMtConnect(sql, userId, req.body));
        return;
      }
      if (resource === 'mt_status' && req.method === 'GET') {
        res.status(200).json(await handleMtStatus(sql, userId, Number(req.query.account_id)));
        return;
      }
      if (resource === 'mt_sync' && req.method === 'POST') {
        res.status(200).json(await handleMtSync(sql, userId, Number(req.body?.account_id)));
        return;
      }
      if (resource === 'mt_disconnect' && req.method === 'POST') {
        res.status(200).json(await handleMtDisconnect(sql, userId, Number(req.body?.account_id)));
        return;
      }
      if (resource === 'ledger' && req.method === 'GET') {
        res.status(200).json(await listLedgerEntries(sql, userId, Number(req.query.account_id)));
        return;
      }
      if (resource === 'ledger' && req.method === 'POST') {
        res.status(200).json(await createLedgerEntry(sql, userId, req.body));
        return;
      }
      if (resource === 'ledger' && req.method === 'DELETE') {
        res.status(200).json(await deleteLedgerEntry(sql, userId, Number(req.query.id)));
        return;
      }
      res.status(404).json({ error: 'Not found' });
      return;
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Broker sync request failed' });
      return;
    }
  }

  if (req.method === 'GET') {
    res.status(200).json(await listAccounts(sql, userId));
    return;
  }

  if (req.method === 'POST') {
    res.status(200).json(await createAccount(sql, userId, req.body));
    return;
  }

  // PUT and DELETE both operate on a single account, identified by ?id= —
  // every query below is scoped WHERE ... AND user_id = $userId, not just
  // WHERE id = $id, so an id that belongs to someone else's account behaves
  // exactly like an id that doesn't exist at all (404), instead of silently
  // operating on it.
  const id = Number(req.query.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: 'id is required' }); return; }

  if (req.method === 'PUT') {
    const p = req.body;
    const name = String(p?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'Account name is required' }); return; }

    const rows = await sql.unsafe(
      `UPDATE accounts SET
        name = $1, type = $2, starting_balance = $3, active = $4, sort_order = $5,
        daily_loss_limit_pct = $6, max_drawdown_limit_pct = $7, consistency_rule_pct = $8
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        name, p.type ?? null, p.starting_balance ?? null, p.active ?? true, p.sort_order ?? 0,
        p.daily_loss_limit_pct ?? null, p.max_drawdown_limit_pct ?? null, p.consistency_rule_pct ?? null, id, userId,
      ]
    );

    if (!rows[0]) { res.status(404).json({ error: 'Account not found' }); return; }
    // starting_balance may have changed — every trade's capital chain in
    // this account is derived from it, so recompute the whole chain.
    await recalcAccountCapital(sql, id);
    res.status(200).json(rows[0]);
  } else if (req.method === 'DELETE') {
    const ownRows = await sql.unsafe('SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!ownRows[0]) { res.status(404).json({ error: 'Account not found' }); return; }

    const tradeCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM trades WHERE account_id = $1', [id]);
    const tradeCount = tradeCountRows[0]?.count ?? 0;
    if (tradeCount > 0) {
      res.status(400).json({
        error: `This account still has ${tradeCount} trade${tradeCount === 1 ? '' : 's'}. Delete or move them before deleting the account.`,
      });
      return;
    }

    // "Last remaining account" is checked per-user, not globally — another
    // user having exactly one account of their own shouldn't block this
    // user from deleting theirs, and vice versa.
    const accountCountRows = await sql.unsafe('SELECT COUNT(*)::int AS count FROM accounts WHERE user_id = $1', [userId]);
    if ((accountCountRows[0]?.count ?? 0) <= 1) {
      res.status(400).json({ error: 'Cannot delete the last remaining account.' });
      return;
    }

    await sql.unsafe('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [id, userId]);
    res.status(200).json({ deleted: 1 });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
});
