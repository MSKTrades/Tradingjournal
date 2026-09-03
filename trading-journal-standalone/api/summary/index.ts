import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db.js';
import { requireUserId, ownsAccount } from '../_auth.js';

type Trade = {
  id: number;
  trade_placed_at: string | null;
  trade_executed_at: string | null;
  coin_token: string | null;
  cisd_break: number | null;
  inverse_candle_size: number | null;
  distance_from_asia: number | null;
  reached_1r2: boolean;
  reached_1r3: boolean;
  reached_1r4: boolean;
  reached_1r5: boolean;
  max_rr: number | null;
  profit_loss: string | null;
  rr: number | null;
  entry_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  gain_loss: number | null;
  gain_loss_pct: number | null;
  position_size: number | null;
  partial_1: number | null;
  partial_2: number | null;
  extra_data: Record<string, unknown> | null;
  tags: string[] | null;
  tag_selections: Record<string, string[]> | null;
};

// value is a number for every ordinary field, or a tag name (string) for
// the reserved TAG_CONDITION_FIELD - see the matching note on evalCondition
// below and src/pages/data/types.ts's Condition type for the frontend side
// of this. `group` only applies to a tag condition - see matchesTagCondition.
type Condition = { field: string; op: string; value: number | string; group?: string };
const TAG_CONDITION_FIELD = 'has_tag';

type FFRawEvent = {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
};

type NewsEvent = {
  title: string;
  country: string;
  date: string; // ISO timestamp, as sent by the upstream feed
  impact: string; // 'Low' | 'Medium' | 'High' | 'Holiday' (upstream's own labels)
  forecast: string | null;
  previous: string | null;
  actual: string | null;
};

// There's no official Forex Factory API — this is a widely-used unofficial
// JSON mirror of their economic calendar (hosted by FairEconomy, the same
// data many third-party trading tools pull from). It isn't guaranteed to
// stay at this URL or in this shape forever, so every failure mode here
// (network error, non-200, unexpected payload shape) degrades to an empty
// events list with an `error` string instead of throwing — the Home screen
// should never break because a third party changed or dropped this feed.
const FF_CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchForexFactoryNews(): Promise<{ events: NewsEvent[]; error: string | null }> {
  try {
    const resp = await fetchWithTimeout(FF_CALENDAR_URL, 8000);
    if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
    const raw = (await resp.json()) as unknown;
    if (!Array.isArray(raw)) throw new Error('Unexpected feed shape (not an array)');

    const events: NewsEvent[] = (raw as FFRawEvent[])
      .filter((e) => e && e.title && e.date)
      .map((e) => ({
        title: String(e.title),
        country: String(e.country ?? ''),
        date: String(e.date),
        impact: String(e.impact ?? 'Low'),
        forecast: e.forecast != null && e.forecast !== '' ? String(e.forecast) : null,
        previous: e.previous != null && e.previous !== '' ? String(e.previous) : null,
        actual: e.actual != null && e.actual !== '' ? String(e.actual) : null,
      }));

    return { events, error: null };
  } catch (err: any) {
    console.error('Forex Factory news fetch failed:', err);
    return { events: [], error: 'Unable to load market news right now.' };
  }
}

type Headline = {
  title: string;
  link: string;
  pubDate: string | null;
  source: string;
};

// General market/international headlines, alongside the economic calendar.
// Two feeds, fetched independently so one going down doesn't take the other
// with it: ForexLive for market-specific news, BBC World for broader
// international context (macro/geopolitical events move currency pairs even
// when they're not on an economic calendar). Both are plain public RSS —
// no API key, no auth — which also means no contract either; if a feed
// changes shape this degrades to fewer headlines, not a crash.
const HEADLINE_FEEDS: Array<{ url: string; source: string }> = [
  { url: 'https://www.forexlive.com/feed/news', source: 'ForexLive' },
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

// Hand-rolled instead of pulling in an XML parser dependency — RSS 2.0
// <item> blocks are simple and regular enough that a couple of regexes
// cover every feed this function actually points at.
function parseRssItems(xml: string, source: string, limit: number): Headline[] {
  const items: Headline[] = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks.slice(0, limit)) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    if (!title || !link) continue;
    items.push({
      title: decodeXmlEntities(title),
      link: decodeXmlEntities(link),
      pubDate: pubDate ? decodeXmlEntities(pubDate) : null,
      source,
    });
  }
  return items;
}

async function fetchHeadlines(): Promise<{ headlines: Headline[]; error: string | null }> {
  const results = await Promise.all(
    HEADLINE_FEEDS.map(async (feed) => {
      try {
        const resp = await fetchWithTimeout(feed.url, 8000);
        if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
        const xml = await resp.text();
        return parseRssItems(xml, feed.source, 8);
      } catch (err: any) {
        console.error(`Headline fetch failed for ${feed.source}:`, err);
        return [] as Headline[];
      }
    })
  );

  const headlines = results
    .flat()
    .sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });

  // Only surface an error if EVERY feed came back empty — one dead feed
  // among several just means fewer headlines, not a broken widget.
  const error = headlines.length === 0 ? 'Unable to load market news right now.' : null;
  return { headlines, error };
}

function parseJsonArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function matchesDay(trade: Trade, days: number[] | null | undefined): boolean {
  if (!days || days.length === 0) return true;
  if (!trade.trade_placed_at) return false;
  const d = new Date(trade.trade_placed_at);
  if (isNaN(d.getTime())) return false;
  return days.includes(d.getUTCDay());
}

function matchesTime(
  trade: Trade,
  timeStart: string | null,
  timeEnd: string | null
): boolean {
  if (!timeStart && !timeEnd) return true;
  const t = trade.trade_executed_at;
  if (!t) return false;
  const time = String(t).substring(0, 5);
  if (timeStart && time < timeStart) return false;
  if (timeEnd && time > timeEnd) return false;
  return true;
}

// Built-in numeric fields that are still real columns on the trades table
// (as opposed to the CISD/SMC-specific fields, which moved into
// extra_data as ordinary custom columns - see the schema.sql migration
// "move SMC-specific fields... into ordinary user-defined custom fields").
const RAW_NUMERIC_FIELDS: Record<string, keyof Trade> = {
  rr: 'rr',
  max_rr: 'max_rr',
  entry_price: 'entry_price',
  tp_price: 'tp_price',
  sl_price: 'sl_price',
  gain_loss: 'gain_loss',
  gain_loss_pct: 'gain_loss_pct',
  position_size: 'position_size',
  partial_1: 'partial_1',
  partial_2: 'partial_2',
};

// The three original condition fields predate custom columns and kept
// their own short internal names (baked into every strategy saved before
// that migration) - these map to the real extra_data key the value now
// actually lives under. Any other field name is assumed to already BE a
// real custom_columns.col_key (true for both the other migrated built-ins,
// like sl_pips/liquidity_swept_no, and anything the user has added since).
const LEGACY_EXTRA_DATA_ALIASES: Record<string, string> = {
  cisd_break: 'cisd_break',
  inverse_candles: 'inverse_candle_size',
  gap_from_asia_h: 'distance_from_asia',
};

function getFieldValue(trade: Trade, field: string): number | null {
  const rawKey = RAW_NUMERIC_FIELDS[field];
  if (rawKey) {
    const v = trade[rawKey];
    return v != null ? Number(v as any) : null;
  }
  const extraKey = LEGACY_EXTRA_DATA_ALIASES[field] ?? field;
  const v = trade.extra_data?.[extraKey];
  return v != null && v !== '' && !isNaN(Number(v)) ? Number(v) : null;
}

function evalCondition(val: number | null, op: string, threshold: number): boolean {
  if (val === null || val === undefined) return false;
  switch (op) {
    case '<': return val < threshold;
    case '<=': return val <= threshold;
    case '>': return val > threshold;
    case '>=': return val >= threshold;
    case '=': return val === threshold;
    case '!=': return val !== threshold;
    default: return false;
  }
}

// A strategy condition can also require a trade to (not) carry a specific
// tag, using the reserved field TAG_CONDITION_FIELD - `value` there is the
// tag name itself, not a number, so it's checked separately from the
// numeric evalCondition path above rather than trying to coerce a tag name
// through Number(cond.value). Two separate tagging systems both still write
// to real trades - the flat `tags` column (still used by the Backtest tab)
// and tag GROUPS (used by the Journal's TradeDetailPanel, stored per trade
// in `tag_selections` keyed by group name, e.g. { "1M_Price above":
// ["EMA9"] }).
//
// Tag group option names get reused across groups constantly in practice
// (the same "EMA9" option sits under several different timeframe/direction
// groups at once), so "has EMA9" with no group specified is ambiguous about
// which one is meant. When the condition names a specific group (`group` is
// set), only that group's own selections count; otherwise it falls back to
// the old flattened search across every source, which is what every
// condition saved before `group` existed still does.
function matchesTagCondition(trade: Trade, op: string, tagName: string, group?: string): boolean {
  let has: boolean;
  if (group) {
    has = (trade.tag_selections?.[group] ?? []).includes(tagName);
  } else {
    const groupValues = Object.values(trade.tag_selections ?? {}).flat();
    has = (trade.tags ?? []).includes(tagName) || groupValues.includes(tagName);
  }
  return op === '!has' ? !has : has;
}

function matchesCondition(trade: Trade, cond: Condition): boolean {
  if (cond.field === TAG_CONDITION_FIELD) return matchesTagCondition(trade, cond.op, String(cond.value), cond.group);
  return evalCondition(getFieldValue(trade, cond.field), cond.op, Number(cond.value));
}

function getReached(trade: Trade, tp: number): boolean {
  if (tp <= 2) return Boolean(trade.reached_1r2);
  if (tp <= 3) return Boolean(trade.reached_1r3);
  if (tp <= 4) return Boolean(trade.reached_1r4);
  if (tp <= 5) return Boolean(trade.reached_1r5);
  return Number(trade.max_rr ?? -1) >= tp;
}

function calcR(trade: Trade, tp1: number, tp2: number | null, splitPct: number | null): number {
  if (tp2 !== null && splitPct !== null) {
    const half = splitPct / 100;
    if (getReached(trade, tp2)) return half * tp1 + (1 - half) * tp2;
    if (getReached(trade, tp1)) return half * tp1;
    return -1;
  }
  if (getReached(trade, tp1)) return tp1;
  return -1;
}

type StrategyShape = {
  conditions: Condition[];
  days: number[];
  time_start: string | null;
  time_end: string | null;
  tp1_rr: number;
  tp2_rr: number | null;
  split_percent: number | null;
};

// The actual "does this trade qualify, and what R did it produce" engine -
// shared by the authenticated per-account Summary results below AND the
// public Playbook resources further down (a Playbook's stats are exactly
// this same computation, just run against the publishing strategy's own
// accounts instead of the caller's currently-selected one). Pulling this out
// is what keeps a Playbook's numbers guaranteed identical to what that
// strategy's owner already sees on their own Summary page - there is only
// one place that decides "does this trade match, and what R did it score."
function computeStrategyResult(strategy: StrategyShape, trades: Trade[]) {
  const { tp1_rr: tp1, tp2_rr: tp2, split_percent: split } = strategy;

  const qualifying = trades.filter((trade) => {
    if (!matchesDay(trade, strategy.days)) return false;
    if (!matchesTime(trade, strategy.time_start, strategy.time_end)) return false;
    if (!strategy.conditions.length) return true;
    return strategy.conditions.every((cond) => matchesCondition(trade, cond));
  });

  const tradeResults = qualifying.map((trade) => ({
    id: trade.id,
    date: trade.trade_placed_at ?? '',
    pair: trade.coin_token ?? '',
    r: calcR(trade, tp1, tp2, split),
  }));

  const total = tradeResults.length;
  const wins = tradeResults.filter((t) => t.r > 0).length;
  const losses = tradeResults.filter((t) => t.r < 0).length;
  const totalR = tradeResults.reduce((sum, t) => sum + t.r, 0);
  const grossWinR = tradeResults.filter((t) => t.r > 0).reduce((sum, t) => sum + t.r, 0);
  const grossLossR = Math.abs(
    tradeResults.filter((t) => t.r < 0).reduce((sum, t) => sum + t.r, 0)
  );

  const profitFactor =
    grossLossR > 0
      ? Math.round((grossWinR / grossLossR) * 100) / 100
      : grossWinR > 0
        ? null
        : 0;

  return {
    total_trades: total,
    wins,
    losses,
    win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
    total_r: Math.round(totalR * 100) / 100,
    avg_r: total > 0 ? Math.round((totalR / total) * 100) / 100 : 0,
    profit_factor: profitFactor,
    trades: tradeResults,
  };
}

function normalizeStrategyRow(s: any): StrategyShape & { id: number; name: string; user_id: number; account_ids: number[] } {
  return {
    id: s.id,
    name: s.name,
    user_id: s.user_id,
    conditions: parseJsonArray<Condition>(s.conditions),
    days: parseJsonArray<number>(s.days),
    account_ids: parseJsonArray<number>(s.account_ids),
    time_start: s.time_start ?? null,
    time_end: s.time_end ?? null,
    tp1_rr: Number(s.tp1_rr) || 3,
    tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
    split_percent: s.split_percent != null ? Number(s.split_percent) : null,
  };
}

// Every trade belonging to a published strategy's OWNER, scoped to that
// strategy's own account_ids the same way the authenticated Summary results
// are scoped to the caller's selected account - [] means "every account the
// owner has," a non-empty list means only those specific accounts. This is
// what lets a Playbook page show real numbers with zero request-time
// arguments beyond the slug: there's no "which account" to ask a public
// visitor for, so it's always every account the strategy itself applies to.
async function getPublishedStrategyTrades(
  sql: ReturnType<typeof db>,
  strategy: { user_id: number; account_ids: number[] }
): Promise<Trade[]> {
  const accountRows = (!strategy.account_ids || strategy.account_ids.length === 0)
    ? await sql.unsafe('SELECT id FROM accounts WHERE user_id = $1', [strategy.user_id])
    : await sql.unsafe('SELECT id FROM accounts WHERE user_id = $1 AND id = ANY($2::int[])', [strategy.user_id, strategy.account_ids]);
  const accountIds = accountRows.map((r: any) => r.id);
  if (accountIds.length === 0) return [];

  const trades = await sql.unsafe(`
    SELECT id, trade_placed_at, trade_executed_at, coin_token, cisd_break,
           inverse_candle_size, distance_from_asia,
           reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, profit_loss,
           rr, entry_price, tp_price, sl_price, gain_loss, gain_loss_pct,
           position_size, partial_1, partial_2, extra_data, tags, tag_selections
    FROM trades
    WHERE account_id = ANY($1::int[])
    ORDER BY trade_placed_at ASC, id ASC
  `, [accountIds]);
  return trades as Trade[];
}

// GET /api/summary?resource=playbooks - public, unauthenticated: every
// strategy its owner has published as a Playbook (see api/strategies.ts's
// resource=playbook publish action), with just enough stats for a library
// card. No per-trade data and no equity curve here - that's the detail
// page's job (resource=playbook&slug=...) - this stays light since it's one
// query per published strategy.
async function handlePlaybooksList(res: VercelResponse, sql: ReturnType<typeof db>) {
  const rows = await sql.unsafe(
    `SELECT * FROM strategies WHERE playbook_published = true ORDER BY playbook_published_at DESC`
  );

  const list = await Promise.all(rows.map(async (row: any) => {
    const strategy = normalizeStrategyRow(row);
    const trades = await getPublishedStrategyTrades(sql, strategy);
    const result = computeStrategyResult(strategy, trades);
    return {
      slug: row.playbook_slug,
      title: row.playbook_title || row.name,
      description: row.playbook_description,
      publishedAt: row.playbook_published_at,
      totalTrades: result.total_trades,
      winRate: result.win_rate,
      profitFactor: result.profit_factor,
      totalR: result.total_r,
      avgR: result.avg_r,
    };
  }));

  res.status(200).json(list);
}

// GET /api/summary?resource=playbook&slug=... - public, unauthenticated:
// full detail for one published Playbook, including the R-multiple equity
// curve. Deliberately never touches gain_loss/$ figures anywhere in this
// response (unlike api/accounts.ts's public_track_record, which has an
// explicit showDollars toggle) - a Playbook is ratios-only by design, so
// there's no dollar figure to gate in the first place, not just one that's
// turned off by default.
async function handlePlaybookDetail(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>) {
  const slug = String(req.query.slug ?? '').trim();
  if (!slug) { res.status(400).json({ error: 'slug is required' }); return; }

  const rows = await sql.unsafe(
    'SELECT * FROM strategies WHERE playbook_slug = $1 AND playbook_published = true',
    [slug]
  );
  // Unknown slug and a real slug whose strategy was since unpublished must
  // look identical to the caller - same reasoning as public_track_record's
  // "wrong token vs. sharing turned off" handling in api/accounts.ts.
  if (!rows[0]) { res.status(404).json({ error: 'Not found' }); return; }

  const strategy = normalizeStrategyRow(rows[0]);
  const trades = await getPublishedStrategyTrades(sql, strategy);
  const result = computeStrategyResult(strategy, trades);

  let running = 0;
  const equityCurve = result.trades.map((t, i) => {
    running += t.r;
    return { idx: i + 1, r: Math.round(running * 100) / 100 };
  });

  res.status(200).json({
    slug: rows[0].playbook_slug,
    title: rows[0].playbook_title || rows[0].name,
    description: rows[0].playbook_description,
    publishedAt: rows[0].playbook_published_at,
    conditions: strategy.conditions,
    days: strategy.days,
    timeStart: strategy.time_start,
    timeEnd: strategy.time_end,
    tp1Rr: strategy.tp1_rr,
    tp2Rr: strategy.tp2_rr,
    splitPercent: strategy.split_percent,
    totalTrades: result.total_trades,
    wins: result.wins,
    losses: result.losses,
    winRate: result.win_rate,
    profitFactor: result.profit_factor,
    totalR: result.total_r,
    avgR: result.avg_r,
    equityCurve,
    lastUpdated: new Date().toISOString(),
  });
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ?resource=news serves the Home/Summary screen's news widget: the
  // economic calendar (events) and general market/international headlines
  // (headlines) are fetched concurrently and reported independently, so one
  // source failing doesn't blank out the other. Kept in this same
  // file/function (branched by query param) rather than a new endpoint,
  // since this project is already at 11 of the Vercel Hobby plan's
  // 12-function cap.
  if (req.query.resource === 'news') {
    const [calendar, headlines] = await Promise.all([fetchForexFactoryNews(), fetchHeadlines()]);
    res.status(200).json({
      events: calendar.events,
      eventsError: calendar.error,
      headlines: headlines.headlines,
      headlinesError: headlines.error,
    });
    return;
  }

  // Playbooks: two more deliberately public, unauthenticated resources -
  // a strategy its owner has published (see api/strategies.ts's
  // resource=playbook publish action) is meant to be browsed by a visitor
  // with no PipEcho account at all, same reasoning as api/accounts.ts's
  // public_track_record. Checked before requireUserId for that reason, and
  // wrapped in their own try/catch (withApi's outer one is still a
  // safety net, but a raw DB error here shouldn't leak past a generic
  // message any more than the authenticated path below does).
  if (req.query.resource === 'playbooks') {
    try {
      await handlePlaybooksList(res, db());
    } catch (err) {
      console.error('Playbooks list error:', err);
      res.status(500).json({ error: 'Something went wrong loading playbooks. Please try again.' });
    }
    return;
  }
  if (req.query.resource === 'playbook') {
    try {
      await handlePlaybookDetail(req, res, db());
    } catch (err) {
      console.error('Playbook detail error:', err);
      res.status(500).json({ error: 'Something went wrong loading this playbook. Please try again.' });
    }
    return;
  }

  try {
    const sql = db();
    const userId = await requireUserId(req, res, sql);
    if (!userId) return;

    // Tolerant of a missing/invalid account_id (e.g. before the account
    // context has resolved on first render) — return empty results rather
    // than erroring, since the frontend refetches once it has a real id.
    // An account_id that isn't this user's own gets the same treatment.
    const accountIdParam = req.query.account_id;
    const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
    if (!accountId || isNaN(accountId) || !(await ownsAccount(sql, accountId, userId))) {
      res.status(200).json([]);
      return;
    }

    const [tradesRaw, strategiesRaw] = await Promise.all([
      sql.unsafe(`
        SELECT id, trade_placed_at, trade_executed_at, coin_token, cisd_break,
               inverse_candle_size, distance_from_asia,
               reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, profit_loss,
               rr, entry_price, tp_price, sl_price, gain_loss, gain_loss_pct,
               position_size, partial_1, partial_2, extra_data, tags, tag_selections
        FROM trades
        WHERE account_id = $1
      `, [accountId]),
      // account_ids = '[]' (the default every strategy is created with) means
      // "every account" - only strategies deliberately restricted to a
      // specific list (via the Strategies page) get filtered out here when
      // this account isn't in that list. `@>` is jsonb containment: does the
      // array contain this account's id as an element.
      //
      // The param MUST be a raw JS array, not JSON.stringify()'d - binding a
      // value to a `::jsonb`-cast placeholder makes postgres.js serialize it
      // itself, so JSON.stringify([accountId]) here sent the JSON *string*
      // "[2]" instead of the JSON *array* [2]. `@>` containment against a
      // string never matches, so this was silently hiding every
      // account-scoped strategy from every account's Summary page,
      // including the one it was actually scoped to - not just from other
      // accounts as intended.
      sql.unsafe(`
        SELECT * FROM strategies
        WHERE active = true AND user_id = $1
          AND (account_ids = '[]'::jsonb OR account_ids @> $2::jsonb)
        ORDER BY sort_order ASC, id ASC
      `, [userId, [accountId]]),
    ]);

    const trades = tradesRaw as Trade[];

    const strategies = (strategiesRaw as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      conditions: parseJsonArray<Condition>(s.conditions),
      days: parseJsonArray<number>(s.days),
      time_start: s.time_start ?? null,
      time_end: s.time_end ?? null,
      tp1_rr: Number(s.tp1_rr) || 3,
      tp2_rr: s.tp2_rr != null ? Number(s.tp2_rr) : null,
      split_percent: s.split_percent != null ? Number(s.split_percent) : null,
      active: Boolean(s.active),
    }));

    // Same computeStrategyResult used by the public Playbook resources above
    // - this loop used to have its own copy of the matching/R-multiple logic
    // inline; pulling it into one shared function is what guarantees a
    // published Playbook's numbers can never quietly drift from what its
    // owner sees right here on their own Summary page.
    const results = strategies.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      tp1_rr: strategy.tp1_rr,
      tp2_rr: strategy.tp2_rr,
      split_percent: strategy.split_percent,
      conditions: strategy.conditions,
      days: strategy.days,
      time_start: strategy.time_start,
      time_end: strategy.time_end,
      ...computeStrategyResult(strategy, trades),
    }));

    res.status(200).json(results);
  } catch (err: any) {
    // Logged in full server-side; the client only gets a generic message —
    // a raw DB/driver error can leak internal details (table/column names,
    // query fragments) that are more useful to an attacker than to a user
    // seeing an error toast.
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Something went wrong loading your summary. Please try again.' });
  }
});
