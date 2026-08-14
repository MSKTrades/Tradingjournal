import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from '../_db.js';

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
};

type Condition = { field: string; op: string; value: number };

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

function getFieldValue(trade: Trade, field: string): number | null {
  if (field === 'cisd_break') return trade.cisd_break != null ? Number(trade.cisd_break) : null;
  if (field === 'inverse_candles') return trade.inverse_candle_size != null ? Number(trade.inverse_candle_size) : null;
  if (field === 'gap_from_asia_h') return trade.distance_from_asia != null ? Number(trade.distance_from_asia) : null;
  return null;
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

  try {
    const sql = db();

    // Tolerant of a missing/invalid account_id (e.g. before the account
    // context has resolved on first render) — return empty results rather
    // than erroring, since the frontend refetches once it has a real id.
    const accountIdParam = req.query.account_id;
    const accountId = Number(Array.isArray(accountIdParam) ? accountIdParam[0] : accountIdParam);
    if (!accountId || isNaN(accountId)) {
      res.status(200).json([]);
      return;
    }

    const [tradesRaw, strategiesRaw] = await Promise.all([
      sql.unsafe(`
        SELECT id, trade_placed_at, trade_executed_at, coin_token, cisd_break,
               inverse_candle_size, distance_from_asia,
               reached_1r2, reached_1r3, reached_1r4, reached_1r5, max_rr, profit_loss
        FROM trades
        WHERE account_id = $1
      `, [accountId]),
      sql.unsafe(`
        SELECT * FROM strategies 
        WHERE active = true 
        ORDER BY sort_order ASC, id ASC
      `),
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

    const results = strategies.map((strategy) => {
      const tp1 = strategy.tp1_rr;
      const tp2 = strategy.tp2_rr;
      const split = strategy.split_percent;

      const qualifying = trades.filter((trade) => {
        if (!matchesDay(trade, strategy.days)) return false;
        if (!matchesTime(trade, strategy.time_start, strategy.time_end)) return false;
        if (!strategy.conditions.length) return true;
        return strategy.conditions.every((cond) =>
          evalCondition(getFieldValue(trade, cond.field), cond.op, Number(cond.value))
        );
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
        id: strategy.id,
        name: strategy.name,
        tp1_rr: tp1,
        tp2_rr: tp2,
        split_percent: split,
        conditions: strategy.conditions,
        days: strategy.days,
        time_start: strategy.time_start,
        time_end: strategy.time_end,
        total_trades: total,
        wins,
        losses,
        win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
        total_r: Math.round(totalR * 100) / 100,
        avg_r: total > 0 ? Math.round((totalR / total) * 100) / 100 : 0,
        profit_factor: profitFactor,
        trades: tradeResults,
      };
    });

    res.status(200).json(results);
  } catch (err: any) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});
