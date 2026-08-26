// Thin wrapper around MetaApi.cloud's REST API for connecting a real MT4/MT5
// broker account (FTMO, The5ers, or any other prop firm/broker running one
// of those platforms) and pulling its trade history in. Used by
// api/accounts.ts's resource=mt_connect/mt_status/mt_sync/mt_disconnect.
//
// Deliberately calling the plain REST endpoints with fetch() rather than
// importing the metaapi.cloud-sdk npm package: that SDK is built around a
// long-lived WebSocket connection object you .deploy() and keep open
// (`connection.subscribe()`, internal reconnect/heartbeat state, etc), which
// fits a always-on server, not a Vercel serverless function that spins up,
// does one thing, and exits. The REST endpoints underneath it are stateless
// request/response, which is exactly what a serverless function is good at.
//
// Security note (this is the important part): the MT4/5 "investor" password
// the user types into the Connect Broker form is sent to MetaApi exactly
// once, in the provisionAccount() call below, to create the connection.
// It is never written to PipEcho's own database - only MetaApi's own
// account id (metaapi_account_id) is stored going forward (see the
// mt_connections table in schema.sql). Every function below other than
// provisionAccount takes that id, never a password.

const PROVISIONING_BASE = 'https://mt-provisioning-api-v1.agiliumtrade.ai';
// MetaApi's client-facing (trading/history) API is region-sharded - each
// account is provisioned into one region, returned as `region` on the
// account object, and every subsequent history/status call has to be made
// against that region's host, not a fixed global one.
const CLIENT_BASE = (region) => `https://mt-client-api-v1.${region || 'new-york'}.agiliumtrade.ai`;

function getToken() {
  const token = process.env.METAAPI_TOKEN;
  if (!token) throw new Error('METAAPI_TOKEN environment variable is not set');
  return token;
}

function randomTransactionId() {
  // MetaApi requires a unique `transaction-id` header per provisioning
  // request (their own idempotency-ish mechanism) - doesn't need to be
  // cryptographically random, just unique per call.
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

async function metaApiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'auth-token': getToken(), 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `MetaApi request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * Creates (provisions) a new MetaApi account from the broker credentials the
 * user just entered. Returns { id, state }. `password` is used here and only
 * here - the caller must not persist it.
 */
export async function provisionAccount({ login, password, server, platform, name }) {
  const body = await metaApiFetch(`${PROVISIONING_BASE}/users/current/accounts`, {
    method: 'POST',
    headers: { 'transaction-id': randomTransactionId() },
    body: JSON.stringify({
      login: String(login),
      password: String(password),
      name: name || `PipEcho - ${login}`,
      server: String(server),
      platform, // 'mt4' | 'mt5'
      magic: 0,
      type: 'cloud-g2',
    }),
  });
  return body; // { id, state } (201) - state may still be DEPLOYING
}

/** Looks up a previously-provisioned account's current state/region/connectionStatus. */
export async function getAccountStatus(metaapiAccountId) {
  return await metaApiFetch(`${PROVISIONING_BASE}/users/current/accounts/${metaapiAccountId}`, { method: 'GET' });
}

/** Deprovisions (deletes) the MetaApi account entirely - used on Disconnect. */
export async function removeAccount(metaapiAccountId) {
  try {
    await metaApiFetch(`${PROVISIONING_BASE}/users/current/accounts/${metaapiAccountId}`, { method: 'DELETE' });
  } catch (err) {
    // Already gone is fine - disconnecting should never get stuck because
    // the remote side no longer has anything to delete.
    if (err.status !== 404) throw err;
  }
}

/**
 * Fetches raw deals (individual fills, not round-trip trades) for the given
 * account between startTime and endTime (JS Date objects), following
 * pagination up to `maxPages` pages of 1000 deals each - a safety cap so one
 * "Sync Now" click against a very high-frequency account can't run past
 * Vercel's function time limit. Returns a flat array of deal objects
 * (MetatraderDeal shape: id, type, entryType, time, brokerTime, symbol,
 * orderId, positionId, volume, price, commission, swap, profit, ...).
 */
export async function fetchDealsByTimeRange(metaapiAccountId, region, startTime, endTime, maxPages = 3) {
  const base = CLIENT_BASE(region);
  const all = [];
  let offset = 0;
  const limit = 1000;
  for (let page = 0; page < maxPages; page++) {
    const url = `${base}/users/current/accounts/${metaapiAccountId}/history-deals/time/${startTime.toISOString()}/${endTime.toISOString()}?offset=${offset}&limit=${limit}`;
    const batch = await metaApiFetch(url, { method: 'GET' });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < limit) break; // last page
    offset += limit;
  }
  return all;
}

/**
 * Groups a flat deal list into one entry per MT4/5 position (positionId),
 * and returns only the positions that are fully closed - i.e. that have at
 * least one closing deal (entryType DEAL_ENTRY_OUT or DEAL_ENTRY_OUT_BY).
 * A position with only opening deals so far (still open in the terminal) is
 * left out entirely; it'll show up on a later sync once it closes. Deposits/
 * withdrawals/credits (deals with no real positionId, e.g. "0") are ignored.
 */
export function groupClosedPositions(deals) {
  const byPosition = new Map();
  for (const d of deals) {
    const posId = d.positionId;
    if (!posId || posId === '0') continue; // balance/credit ops etc, not a trade
    if (!byPosition.has(posId)) byPosition.set(posId, []);
    byPosition.get(posId).push(d);
  }

  const closed = [];
  for (const [positionId, group] of byPosition) {
    const hasClose = group.some(d => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY');
    if (!hasClose) continue;

    group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const opens = group.filter(d => d.entryType === 'DEAL_ENTRY_IN');
    const closes = group.filter(d => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY');
    const firstOpen = opens[0] ?? group[0];
    const lastClose = closes[closes.length - 1] ?? group[group.length - 1];

    const netProfit = group.reduce((sum, d) => sum + (Number(d.profit) || 0) + (Number(d.commission) || 0) + (Number(d.swap) || 0), 0);
    const totalVolume = opens.reduce((sum, d) => sum + (Number(d.volume) || 0), 0) || Number(firstOpen.volume) || 0;

    closed.push({
      positionId,
      symbol: firstOpen.symbol,
      direction: firstOpen.type === 'DEAL_TYPE_SELL' ? 'Short' : 'Long',
      entryPrice: Number(firstOpen.price),
      exitPrice: Number(lastClose.price),
      // brokerTime (no timezone, printed exactly as the broker's own
      // terminal would show it) is what we show the user for the trade's
      // date/time-of-day - it's what they'd recognize from their platform.
      // The real ISO `time` (UTC, always tz-aware) is kept separately for
      // duration math, where an actual timezone-correct diff matters.
      openBrokerTime: firstOpen.brokerTime || firstOpen.time,
      closeBrokerTime: lastClose.brokerTime || lastClose.time,
      openTimeIso: firstOpen.time,
      closeTimeIso: lastClose.time,
      volume: totalVolume,
      netProfit: Math.round(netProfit * 100) / 100,
      raw: group,
    });
  }
  return closed;
}

/** Splits a MetaApi brokerTime string ("2020-04-17 07:30:03.223" or ISO
 * "2020-04-17T07:30:03.223Z") into a plain DATE string and an "HH:MM" time
 * string, matching the shape trades.trade_placed_at/trade_executed_at
 * (and date_closed/time_closed) already use for manually-entered trades. */
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
 * Maps one closed position (from groupClosedPositions) into the field shape
 * trades INSERT/UPDATE expects. position_size is deliberately left null -
 * see schema.sql's note on trades.source: PipEcho's existing position_size
 * column means "% of account capital risked", which isn't something we can
 * derive from a broker fill (that would require knowing the stop-loss
 * distance, which MT4/5 deal history doesn't carry). The real lot size is
 * kept in extra_data.mt_volume instead, visible in the trade's custom
 * fields, and gain_loss is set directly from the broker's own numbers
 * rather than derived - see _db.js's recalcAccountCapital for the other
 * half of this.
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
    sl_price: null, // not derivable from deal history - see note above
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
