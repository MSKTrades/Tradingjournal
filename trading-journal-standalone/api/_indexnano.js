// Thin wrapper around IndexNano's REST API for connecting a real MT5 broker
// account (FTMO, The5ers, or any other prop firm/broker running MT5) and
// pulling its closed trade history in. Used by api/accounts.ts's
// resource=mt_connect/mt_status/mt_sync/mt_disconnect.
//
// Replaces api/_metaapi.js (still in the repo, unused) as of the move away
// from MetaApi.cloud - MetaApi's $30-100/mo base subscription, charged
// before a single account is even connected, didn't work against PipEcho's
// own subscription price. IndexNano is pure pay-as-you-go per connected
// account-hour with no base fee, which fits a "Sync Now"-style on-demand
// workload (a few minutes connected per sync, then paused) far better - see
// the Connect Broker Pro-gating comment in api/accounts.ts for the actual
// cost numbers this was sized against.
//
// IndexNano is MT5-only today (confirmed against their docs - no mention of
// MT4 anywhere). MT4 accounts are rejected before this file is ever called
// - see handleMtConnect in api/accounts.ts.
//
// Security note (same as _metaapi.js): the MT5 investor password typed into
// the Connect Broker form is sent to IndexNano exactly once, in
// connectAccount() below, to create the connection. It is never written to
// PipEcho's own database - only IndexNano's own connection_id is stored
// going forward (see the mt_connections table in schema.sql). Every
// function below other than connectAccount takes that id, never a password.
//
// IMPORTANT - field names in fetchClosedOrders'/toTradeRow's mapping are a
// best-effort reconstruction from IndexNano's docs (which describe the
// response in prose, not a literal JSON sample) rather than a verified real
// response. mapClosedOrder() below checks several plausible key-name
// variants (their one confirmed example, the `sort=CloseTime` parameter in
// the docs, points at PascalCase field names) and falls back gracefully,
// but this WILL need a once-over against a real response the first time a
// real account is connected and synced - see that function's own comment.

function getConfig() {
  const apiKey = process.env.INDEXNANO_API_KEY;
  const baseUrl = process.env.INDEXNANO_BASE_URL;
  if (!apiKey) throw new Error('INDEXNANO_API_KEY environment variable is not set');
  // IndexNano's own docs note the base URL is per-account/dynamic ("our
  // infrastructure routes you to the most optimal server"), handed out on
  // their dashboard after signup rather than a single fixed global host
  // like MetaApi's - so unlike MetaApi there's no hardcoded default here.
  if (!baseUrl) throw new Error('INDEXNANO_BASE_URL environment variable is not set (find yours at app.indexnano.com)');
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, '') };
}

async function indexNanoFetch(path, opts = {}) {
  const { apiKey, baseUrl } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `IndexNano request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * Creates (provisions) a new IndexNano connection from the broker
 * credentials the user just entered. Returns { connection_id }. `password`
 * is used here and only here - the caller must not persist it. Accepts
 * either the investor (read-only) or the trader/master password per
 * IndexNano's docs, but the Connect Broker form only ever asks for and
 * sends the investor one, same as the MetaApi flow did.
 */
export async function connectAccount({ login, password, server }) {
  const body = await indexNanoFetch('/v1/connect', {
    method: 'POST',
    body: JSON.stringify({ account_number: Number(login), password: String(password), server: String(server) }),
  });
  if (!body?.connection_id) {
    const err = new Error('IndexNano did not return a connection_id - the account may not have connected');
    err.body = body;
    throw err;
  }
  return body;
}

/** Account balance/equity snapshot - used for the Connect Broker status card. */
export async function getAccountSummary(connectionId) {
  return await indexNanoFetch(`/v1/AccountSummary?id=${encodeURIComponent(connectionId)}`, { method: 'GET' });
}

/** Resumes a paused connection (or confirms an already-active one) before a
 * sync - IndexNano bills per connected hour, so every sync explicitly
 * resumes right before pulling data and pauseAccount() below explicitly
 * re-pauses right after, rather than leaving the connection deployed
 * between syncs. See api/accounts.ts's handleMtSync. */
export async function resumeAccount(connectionId) {
  return await indexNanoFetch(`/v1/CheckConnect?id=${encodeURIComponent(connectionId)}`, { method: 'GET' });
}

/** Pauses a connection - called after every sync (to stop the metered clock
 * between syncs) and on Disconnect (IndexNano's docs don't describe a
 * separate hard-delete call; a paused connection auto-disconnects on their
 * side after 7 idle days, which is an acceptable equivalent to "removed"
 * for a connection we've already unlinked locally). Best-effort by design -
 * see both call sites in api/accounts.ts. */
export async function pauseAccount(connectionId) {
  return await indexNanoFetch(`/v1/deployment?id=${encodeURIComponent(connectionId)}`, { method: 'POST' });
}

/**
 * Fetches closed trades for the given connection between startTime and
 * endTime (JS Date objects), sorted oldest-first. Unlike MetaApi's raw
 * per-fill deal log, IndexNano's ClosedOrdersPagination already returns one
 * row per round-trip position - no separate grouping step needed (see
 * api/_metaapi.js's groupClosedPositions, which this replaces the need
 * for). IndexNano's docs describe this as covering accounts with over 100
 * trades in range via date-window pagination rather than an offset/cursor
 * within a single call - if a very active account ever needs finer paging
 * than one date range can return, that's a v1 limitation to revisit once
 * real usage shows it's actually needed, same spirit as the 90-day lookback
 * note in api/accounts.ts's handleMtSync.
 */
export async function fetchClosedOrders(connectionId, startTime, endTime) {
  const params = new URLSearchParams({
    id: connectionId,
    from: startTime.toISOString(),
    to: endTime.toISOString(),
    sort: 'CloseTime',
    ascending: 'true',
  });
  const body = await indexNanoFetch(`/v1/ClosedOrdersPagination?${params.toString()}`, { method: 'GET' });
  // Docs describe the response as an object wrapping an `orders` array
  // (plus internalDeals/internalOrders, which are balance ops / partial
  // fills we don't need for a per-trade journal entry) - fall back to
  // treating the body itself as the array if IndexNano ever returns it
  // unwrapped, so this doesn't silently break on a shape difference.
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.orders)) return body.orders;
  return [];
}

/** Reads the first present key from `obj` out of a list of candidate names -
 * see the field-name uncertainty note at the top of this file. */
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

/**
 * Normalizes one closed order from fetchClosedOrders into the same shape
 * api/_metaapi.js's groupClosedPositions() used to produce, so
 * toTradeRow() below can stay unchanged. See this file's header comment -
 * the exact key names here are a best-effort guess (PascalCase, inferred
 * from the `sort=CloseTime` example in IndexNano's own docs) and should be
 * double-checked against a real response on the first live sync; nothing
 * here throws on a missing field; it just comes through as null so a sync
 * degrades gracefully instead of crashing.
 */
export function mapClosedOrder(o) {
  const direction = String(pick(o, 'Type', 'type', 'Direction', 'direction') || '').toLowerCase();
  const openTime = pick(o, 'OpenTime', 'openTime', 'open_time');
  const closeTime = pick(o, 'CloseTime', 'closeTime', 'close_time');
  return {
    positionId: String(pick(o, 'Ticket', 'ticket', 'Id', 'id', 'OrderId', 'order_id') ?? ''),
    symbol: pick(o, 'Symbol', 'symbol'),
    direction: direction.includes('sell') || direction.includes('short') ? 'Short' : 'Long',
    entryPrice: Number(pick(o, 'OpenPrice', 'openPrice', 'open_price')) || 0,
    exitPrice: Number(pick(o, 'ClosePrice', 'closePrice', 'close_price')) || 0,
    openBrokerTime: openTime,
    closeBrokerTime: closeTime,
    openTimeIso: openTime,
    closeTimeIso: closeTime,
    volume: Number(pick(o, 'Volume', 'volume', 'Lots', 'lots')) || 0,
    netProfit: Math.round(
      ((Number(pick(o, 'Profit', 'profit')) || 0) +
        (Number(pick(o, 'Commission', 'commission')) || 0) +
        (Number(pick(o, 'Swap', 'swap')) || 0)) * 100
    ) / 100,
    raw: o,
  };
}

/** Splits a broker time string ("2020-04-17 07:30:03.223" or ISO
 * "2020-04-17T07:30:03.223Z") into a plain DATE string and an "HH:MM" time
 * string, matching the shape trades.trade_placed_at/trade_executed_at (and
 * date_closed/time_closed) already use for manually-entered trades.
 * Duplicated from api/_metaapi.js rather than imported - same
 * self-contained-per-file convention as api/checklist.ts's MTF_TIMEFRAMES. */
function splitBrokerTime(value) {
  if (!value) return { date: null, time: null };
  const s = String(value).trim();
  const sep = s.includes('T') ? 'T' : ' ';
  const [datePart, timePart] = s.split(sep);
  const date = datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
  const time = timePart && /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : null;
  return { date, time };
}

function computeDuration(openIso, closeIso) {
  if (!openIso || !closeIso) return null;
  const diffMs = new Date(closeIso).getTime() - new Date(openIso).getTime();
  if (isNaN(diffMs) || diffMs < 0) return null;
  const d = Math.floor(diffMs / 86400000);
  const h = Math.floor((diffMs % 86400000) / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m` : '< 1m';
}

/**
 * Maps one normalized closed position (from mapClosedOrder) into the field
 * shape trades INSERT/UPDATE expects - identical contract to
 * api/_metaapi.js's toTradeRow (see that file for the fuller explanation of
 * why position_size is left null and the real lot size goes into
 * extra_data.mt_volume instead).
 */
export function toTradeRow(pos) {
  const opened = splitBrokerTime(pos.openBrokerTime);
  const closed = splitBrokerTime(pos.closeBrokerTime);
  return {
    external_id: pos.positionId,
    source: 'mt_sync',
    coin_token: pos.symbol,
    direction: pos.direction,
    entry_price: pos.entryPrice,
    sl_price: null,
    tp_price: null,
    trade_placed_at: opened.date,
    trade_executed_at: opened.time,
    date_closed: closed.date,
    time_closed: closed.time,
    trade_duration: computeDuration(pos.openTimeIso, pos.closeTimeIso),
    profit_loss: pos.netProfit > 0 ? 'Profit' : pos.netProfit < 0 ? 'Loss' : 'Breakeven',
    gain_loss: pos.netProfit,
    position_size: null,
    extra_data: { mt_volume: pos.volume, mt_exit_price: pos.exitPrice, mt_position_id: pos.positionId },
  };
}
