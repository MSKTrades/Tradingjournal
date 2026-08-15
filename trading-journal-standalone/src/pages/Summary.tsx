import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../lib/ui/card';
import { Badge, Switch } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { TrendingUp, TrendingDown, Target, RefreshCw, ListChecks, Newspaper, Globe, ExternalLink, Clock3, Gauge } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { useTheme } from '../lib/theme';
import { StrategyResult, Trade, Checklist, NewsEvent, Headline, fmtMoney } from './data/types';
import CurrencyFlag from './ui/CurrencyFlag';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

function RBadge({ r, size = 'sm' }: { r: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'text-base font-bold px-2 py-0.5' : 'text-xs';
  if (r > 0) return <Badge className={`bg-green-500/20 text-green-700 dark:text-green-300 border-green-400/30 ${cls}`}>+{r}R</Badge>;
  if (r < 0) return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>{r}R</Badge>;
  return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>0R</Badge>;
}

// Compliance is computed per checklist, not pooled together — with several
// named checklists (one per setup), a rule that's "broken often" only means
// something in the context of the checklist it belongs to. Only trades that
// explicitly recorded a true/false for a given rule count toward that
// rule's denominator — a rule added after a trade was graded has no
// opinion on it, so it's excluded rather than silently counted as broken.
// Outcome summary for one group of trades — win rate + realized P/L, using
// the trade's own already-computed gain_loss (the real, position-sized
// dollar result) rather than a re-derived R-multiple, so this always
// matches what the Journal table shows for the same trades.
function summarizeOutcome(group: Trade[]) {
  const wins = group.filter(t => t.profit_loss === 'Profit').length;
  const losses = group.filter(t => t.profit_loss === 'Loss').length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const totalGL = group.reduce((s, t) => s + Number(t.gain_loss ?? 0), 0);
  const avgGL = group.length > 0 ? totalGL / group.length : 0;
  return {
    count: group.length,
    wins, losses,
    winRate,
    totalGL: Math.round(totalGL * 100) / 100,
    avgGL: Math.round(avgGL * 100) / 100,
  };
}

function useChecklistCompliance(trades: Trade[], checklists: Checklist[]) {
  return useMemo(() => {
    return checklists
      .map(cl => {
        const clTrades = trades.filter(t => t.checklist_enabled && t.checklist_id === cl.id);
        const ruleStats = cl.items.map(item => {
          let followed = 0, broken = 0;
          clTrades.forEach(t => {
            const v = t.checklist_results?.[String(item.id)];
            if (v === true) followed++;
            else if (v === false) broken++;
          });
          const total = followed + broken;
          const pct = total > 0 ? Math.round((followed / total) * 100) : null;
          return { item, followed, broken, total, pct };
        });
        const totalChecks = ruleStats.reduce((s, r) => s + r.total, 0);
        const totalFollowed = ruleStats.reduce((s, r) => s + r.followed, 0);
        const overallPct = totalChecks > 0 ? Math.round((totalFollowed / totalChecks) * 100) : null;

        // "Followed the checklist" means every single rule was explicitly
        // checked off — one broken (or ungraded) rule puts a trade in the
        // other bucket. That's a stricter bar than the overall follow rate
        // above, but it's the honest reading of "did I follow my rules on
        // this trade" — this is what actually answers whether following
        // the checklist correlates with a better result.
        const fullCompliance = cl.items.length > 0
          ? clTrades.filter(t => cl.items.every(item => t.checklist_results?.[String(item.id)] === true))
          : [];
        const notFullCompliance = cl.items.length > 0
          ? clTrades.filter(t => !cl.items.every(item => t.checklist_results?.[String(item.id)] === true))
          : [];

        return {
          checklist: cl,
          enabledCount: clTrades.length,
          ruleStats,
          overallPct,
          fullCompliance: summarizeOutcome(fullCompliance),
          notFullCompliance: summarizeOutcome(notFullCompliance),
        };
      })
      .filter(s => s.enabledCount > 0);
  }, [trades, checklists]);
}

function ChecklistCompliance({ trades, checklists }: { trades: Trade[]; checklists: Checklist[] }) {
  const stats = useChecklistCompliance(trades, checklists);

  if (stats.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Checklist Compliance</h2>
      </div>
      {stats.map(({ checklist, enabledCount, ruleStats, overallPct, fullCompliance, notFullCompliance }) => {
        const sorted = [...ruleStats].sort((a, b) => b.broken - a.broken);
        return (
          <div key={checklist.id}>
            <p className="text-xs text-muted-foreground mb-2">
              <span className="font-medium text-foreground">{checklist.name}</span>
              {' '}&middot; {enabledCount} trade{enabledCount !== 1 ? 's' : ''} graded
            </p>
            {/* All four cards share one row on large screens (Overall Follow
                Rate, the rule table, and the All/Not-Fully-Followed outcome
                cards used to be two separate stacked rows) - a 12-column
                grid so the rule table (which needs the most horizontal room
                for its four columns) gets the lion's share while the three
                stat cards stay compact alongside it. */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-2">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">Overall Follow Rate</p>
                  <p className="text-2xl font-bold">{overallPct === null ? '—' : `${overallPct}%`}</p>
                </CardContent>
              </Card>
              <Card className="lg:col-span-6">
                <CardContent className="pt-4 pb-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule</TableHead>
                        <TableHead className="text-center">Followed</TableHead>
                        <TableHead className="text-center">Broken</TableHead>
                        <TableHead className="text-center">Follow %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(r => (
                        <TableRow key={r.item.id}>
                          <TableCell className="text-sm">{r.item.text}</TableCell>
                          <TableCell className="text-center text-green-600 dark:text-green-400">{r.followed}</TableCell>
                          <TableCell className="text-center text-red-500 dark:text-red-400">{r.broken}</TableCell>
                          <TableCell className="text-center">{r.pct === null ? '—' : `${r.pct}%`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              {(fullCompliance.count > 0 || notFullCompliance.count > 0) && (
                <>
                  <Card className="lg:col-span-2 border-green-400/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground">All Rules Followed</p>
                      <p className="text-2xl font-bold">
                        {fullCompliance.count} trade{fullCompliance.count !== 1 ? 's' : ''}
                      </p>
                      {fullCompliance.count > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          {fullCompliance.winRate === null ? 'No wins/losses yet' : `${fullCompliance.winRate}% win rate`}
                          {' '}({fullCompliance.wins}W / {fullCompliance.losses}L)
                          {' '}&middot;{' '}
                          <span className={fullCompliance.totalGL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                            {fullCompliance.totalGL > 0 ? '+' : ''}{fmtMoney(fullCompliance.totalGL)} total
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No fully-compliant trades yet</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="lg:col-span-2 border-red-400/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground">Not Fully Followed</p>
                      <p className="text-2xl font-bold">
                        {notFullCompliance.count} trade{notFullCompliance.count !== 1 ? 's' : ''}
                      </p>
                      {notFullCompliance.count > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          {notFullCompliance.winRate === null ? 'No wins/losses yet' : `${notFullCompliance.winRate}% win rate`}
                          {' '}({notFullCompliance.wins}W / {notFullCompliance.losses}L)
                          {' '}&middot;{' '}
                          <span className={notFullCompliance.totalGL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                            {notFullCompliance.totalGL > 0 ? '+' : ''}{fmtMoney(notFullCompliance.totalGL)} total
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">Every graded trade followed all rules</p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NewsImpactBadge({ impact }: { impact: string }) {
  const cls = 'text-xs shrink-0';
  const lower = impact.toLowerCase();
  if (lower === 'high') return <Badge className={`bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30 ${cls}`}>High</Badge>;
  if (lower === 'medium') return <Badge className={`bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 ${cls}`}>Medium</Badge>;
  if (lower === 'holiday') return <Badge className={`bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/30 ${cls}`}>Holiday</Badge>;
  return <Badge variant="secondary" className={cls}>Low</Badge>;
}

// Today is computed from the browser's local clock and compared against
// each event's own ISO timestamp (which carries its source timezone) — so
// "today" always means the trader's today, not the feed's or the server's.
function useTodayNews(events: NewsEvent[]) {
  return useMemo(() => {
    const todayStr = new Date().toDateString();
    return events
      .filter(e => {
        const d = new Date(e.date);
        return !isNaN(d.getTime()) && d.toDateString() === todayStr;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);
}

function fmtHeadlineTime(pubDate: string | null): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Split 50/50: the economic calendar (scheduled, data-driven events) on the
// left, general market/international headlines (unscheduled, narrative
// news) on the right — different kinds of "what's moving the market today"
// that don't belong squeezed into one list.
function NewsWidget() {
  const { data, loading } = useFetch<{
    events: NewsEvent[]; eventsError: string | null;
    headlines: Headline[]; headlinesError: string | null;
  }>('/summary?resource=news');
  const [showAll, setShowAll] = useState(false);
  const todayEvents = useTodayNews(data?.events ?? []);
  const visibleEvents = showAll ? todayEvents : todayEvents.filter(e => e.impact.toLowerCase() !== 'low');
  const headlines = (data?.headlines ?? []).slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 items-stretch">
      <Card>
        <CardContent className="pt-4 pb-4 h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Today's Market News</h2>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show low impact</span>
              <Switch checked={showAll} onCheckedChange={setShowAll} />
            </div>
          </div>

          {loading && <p className="text-sm text-muted-foreground py-2">Loading market news…</p>}

          {!loading && data?.eventsError && (
            <p className="text-sm text-muted-foreground py-2">{data.eventsError}</p>
          )}

          {!loading && !data?.eventsError && visibleEvents.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              {showAll ? 'No economic events scheduled for today.' : 'No high/medium impact events scheduled for today.'}
            </p>
          )}

          {!loading && !data?.eventsError && visibleEvents.length > 0 && (
            <div className="flex flex-col divide-y divide-border max-h-[320px] overflow-y-auto">
              {visibleEvents.map((e, i) => (
                <div key={i} className="flex flex-col gap-0.5 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">
                      {new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground w-14 shrink-0 flex items-center gap-1">
                      <CurrencyFlag code={e.country} />{e.country}
                    </span>
                    <NewsImpactBadge impact={e.impact} />
                    <span className="flex-1 truncate">{e.title}</span>
                  </div>
                  {(e.forecast || e.previous || e.actual) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-[7.25rem]">
                      {e.actual && <span>Actual: <span className="text-foreground font-medium">{e.actual}</span></span>}
                      {e.forecast && <span>Forecast: {e.forecast}</span>}
                      {e.previous && <span>Previous: {e.previous}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4 h-full flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Market &amp; International News</h2>
          </div>

          {loading && <p className="text-sm text-muted-foreground py-2">Loading headlines…</p>}

          {!loading && data?.headlinesError && (
            <p className="text-sm text-muted-foreground py-2">{data.headlinesError}</p>
          )}

          {!loading && !data?.headlinesError && headlines.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">No headlines available right now.</p>
          )}

          {!loading && !data?.headlinesError && headlines.length > 0 && (
            <div className="flex flex-col divide-y divide-border max-h-[320px] overflow-y-auto">
              {headlines.map((h, i) => (
                <a
                  key={i}
                  href={h.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 py-2 text-sm group hover:bg-muted/30 -mx-1 px-1 rounded"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate group-hover:text-primary">{h.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.source}{h.pubDate && <> &middot; {fmtHeadlineTime(h.pubDate)}</>}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Commonly-cited approximate UTC anchors for the four major forex sessions.
// These are the round-hour conventions used across most retail trading
// resources (e.g. 8am-5pm UTC for London) - they are NOT adjusted for
// daylight-saving shifts in London/New York/Sydney, which move the "real"
// local-time windows by an hour for part of the year. The countdown math
// below always works off these true UTC instants (so it stays correct
// regardless of the viewer's clock); only the timeline bar's pixel layout
// and labels are re-expressed in the viewer's local time for display.
const SESSIONS_DEF: { name: string; start: number; end: number; color: string; dot: string }[] = [
  { name: 'Sydney',   start: 22, end: 7,  color: 'bg-blue-500',   dot: 'bg-blue-500' },
  { name: 'Tokyo',    start: 0,  end: 9,  color: 'bg-violet-500', dot: 'bg-violet-500' },
  { name: 'London',   start: 8,  end: 17, color: 'bg-orange-500', dot: 'bg-orange-500' },
  { name: 'New York', start: 13, end: 22, color: 'bg-green-500',  dot: 'bg-green-500' },
];

function useLiveNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}

function isSessionActive(start: number, end: number, utcHourFrac: number): boolean {
  return start < end
    ? utcHourFrac >= start && utcHourFrac < end
    : utcHourFrac >= start || utcHourFrac < end; // wraps midnight (Sydney)
}

// The whole forex market - not just one session - is closed for the
// weekend from Friday 22:00 UTC (New York close) until Sunday 22:00 UTC
// (Sydney's weekly open). A per-session, hour-of-day-only check has no way
// to know this - it would happily report Sydney/Tokyo as "OPEN" every
// Saturday just because the clock hour matches their daily window, which
// is exactly the bug: real brokers (FXBook included) show the whole market
// closed on Sat/Sun regardless of what the hour is.
function isForexWeekendClosed(d: Date): boolean {
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  if (day === 6) return true;                 // all of Saturday
  if (day === 5 && hour >= 22) return true;    // Friday from 22:00 UTC
  if (day === 0 && hour < 22) return true;     // Sunday before 22:00 UTC
  return false;
}

// Next UTC clock-hour occurrence of `hour` that is strictly after `now`
// (today if it hasn't happened yet, otherwise tomorrow). This is the real
// instant the session opens/closes, independent of how it's displayed.
function nextOccurrence(hour: number, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Same as nextOccurrence, but keeps stepping a day at a time past the
// weekend closure - so e.g. asking "when does Tokyo next open" on a
// Saturday correctly lands on Monday 00:00 UTC, not Sunday 00:00 UTC
// (which nextOccurrence alone would return, and which is still closed).
function nextSessionOpenInstant(hour: number, now: Date): Date {
  let candidate = nextOccurrence(hour, now);
  let guard = 0;
  while (isForexWeekendClosed(candidate) && guard < 8) {
    candidate = nextOccurrence(hour, candidate);
    guard++;
  }
  return candidate;
}

function fmtCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Graphical strip of the four major sessions across the day (in the
// viewer's own local time), with a shared "now" marker, an explicit
// OPEN/CLOSED status pill per session (so current status doesn't depend on
// reading the countdown text), and a live opens-in/closes-in countdown -
// mirrors the session clocks most trading platforms show on their home
// screen, so it's obvious at a glance whether London/NY overlap (the
// highest-liquidity window) is currently active.
function SessionsWidget() {
  const now = useLiveNow();

  // Real UTC instant - drives the countdown math and the active/inactive
  // determination, so those stay correct no matter how they're displayed.
  const utcHourFrac = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  // Same instant, expressed as the viewer's local wall-clock hour - drives
  // everything the bar actually draws (segment positions, tick labels,
  // the "now" line).
  const localHourFrac = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const offsetHours = -now.getTimezoneOffset() / 60;
  const nowPct = (localHourFrac / 24) * 100;
  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const weekendClosed = isForexWeekendClosed(now);

  const sessions = SESSIONS_DEF.map(s => {
    const active = !weekendClosed && isSessionActive(s.start, s.end, utcHourFrac);
    const localStart = mod24(s.start + offsetHours);
    const localEnd = mod24(s.end + offsetHours);
    const segments = localStart < localEnd
      ? [{ left: (localStart / 24) * 100, width: ((localEnd - localStart) / 24) * 100 }]
      : [
          { left: (localStart / 24) * 100, width: ((24 - localStart) / 24) * 100 },
          { left: 0, width: (localEnd / 24) * 100 },
        ];
    const countdownMs = active
      ? nextOccurrence(s.end, now).getTime() - now.getTime()
      : nextSessionOpenInstant(s.start, now).getTime() - now.getTime();
    return { ...s, active, segments, countdownMs };
  });

  const activeNames = sessions.filter(s => s.active).map(s => s.name);
  // The market-wide weekly reopen is exactly Sydney's own weekly open
  // (Sunday 22:00 UTC), so this converges to the same instant either way.
  const weeklyReopen = nextSessionOpenInstant(22, now);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trading Sessions</h2>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {weekendClosed ? (
          <>
            <span className="font-medium text-foreground">Forex market closed for the weekend</span>
            {' '}&middot; reopens {weeklyReopen.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            {' '}(in {fmtCountdown(weeklyReopen.getTime() - now.getTime())})
          </>
        ) : activeNames.length > 0 ? (
          <>Active now: <span className="font-medium text-foreground">{activeNames.join(', ')}</span></>
        ) : (
          'No major session currently active'
        )}
        {' '}&middot; times shown in your local time ({tzLabel})
      </p>
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-2 px-0.5">
            <span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span>
          </div>
          <div className="relative flex flex-col gap-1.5">
            {sessions.map(s => (
              <div key={s.name} className={`flex items-center gap-3 rounded-md -mx-1.5 px-1.5 py-1 ${s.active ? 'bg-green-500/5' : ''}`}>
                <span className="w-[100px] text-xs font-medium shrink-0 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.dot} ${s.active ? '' : 'opacity-40'}`} />
                  {s.name}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 w-[58px] text-center ${
                  s.active ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
                }`}>
                  {s.active ? 'OPEN' : 'CLOSED'}
                </span>
                <div className="relative flex-1 h-3 rounded-full bg-muted/40 overflow-hidden">
                  {s.segments.map((seg, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 ${s.color} ${s.active ? 'opacity-90' : 'opacity-30'}`}
                      style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                    />
                  ))}
                </div>
                <span className="w-[110px] text-[11px] text-muted-foreground text-right shrink-0">
                  {s.active ? `closes in ${fmtCountdown(s.countdownMs)}` : `opens in ${fmtCountdown(s.countdownMs)}`}
                </span>
              </div>
            ))}
            {/* One straight "now" line spanning every session row, instead of
                a separate short segment drawn inside each row's bar track.
                The old version looked broken/dashed because each row's bar
                had its own `overflow-hidden` clipping box and the rows were
                separated by gaps/padding, so the line never actually
                connected between rows. This is a single absolutely-positioned
                line over the whole stack instead - the calc() mirrors the
                fixed-width name (100px) + status pill (58px) columns and
                their gaps (3 x 12px) on the left, and the gap + countdown
                column (12px + 110px) on the right, so it lines up exactly
                where each row's bar track starts/ends. */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `calc(182px + (100% - 304px) * ${nowPct} / 100)` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Free, no-API-key TradingView "Screener" widget - a single embed that
// lists many symbols in one compact, non-scrolling table (Symbol +
// Technical Rating columns, plus whatever other columns TradingView's
// default "overview" column set includes), instead of one
// Technical-Analysis gauge widget per pair. This directly answers the
// "don't want scrollable per-card widgets, want to fit more pairs at
// once" feedback: it's ONE widget instance regardless of how many pairs
// it lists, so there's no more one-scrollbar-per-card problem, and it can
// show far more symbols in the same vertical space than 6-8 separate
// cards could.
//
// Caveat (disclosed honestly, same as every other TradingView embed this
// session): this sandbox's network can't load the live TradingView
// script to screenshot the real rendering, so whether the Technical
// Rating column actually renders as a colored bar (like the reference
// screenshot) vs. plain text/arrow, and the exact row height/density, is
// unconfirmed from here. TradingView's docs confirm this is a real
// widget (embed-widget-screener.js) with a "market" field that takes one
// discrete market (here: "forex") and a "defaultColumn" that controls
// which metric columns show - "overview" was the closest documented
// preset to a simple rating view. If the live render doesn't match what
// you're after, the next screenshot will tell us exactly what to adjust
// (defaultColumn, showToolbar, height, etc).
function TradingViewScreener({ theme }: { theme: 'light' | 'dark' }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
    script.async = true;
    script.type = 'text/javascript';
    script.text = JSON.stringify({
      width: '100%',
      // ~6 rows' worth of height (toolbar + column header + 6 data rows)
      // rather than tall enough to show all 49 matches at once - the
      // widget's own row list scrolls internally past that, so this still
      // reaches every pair, it just doesn't take over the whole page to do
      // it. Was 560 (showed all matches unscrolled, per feedback this made
      // the whole section "too big").
      height: 340,
      defaultColumn: 'overview',
      defaultScreen: 'general',
      market: 'forex',
      showToolbar: true,
      locale: 'en',
      colorTheme: theme,
      isTransparent: true,
    });
    script.onerror = () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '<p style="font-size:12px;color:var(--muted-foreground,#888);padding:12px">Sentiment screener unavailable (couldn\'t load TradingView script).</p>';
      }
    };
    container.appendChild(script);
  }, [theme]);

  return <div className="tradingview-widget-container" ref={containerRef} />;
}

// Sentiment here means TradingView's free technical-indicator rating
// (moving averages + oscillators rolled into Buy/Sell/Neutral): one
// compact Screener widget covering forex pairs (no more per-pair cards,
// no more per-card scrollbar), plus small supplementary cards for the
// commodities the screener can't include.
function MarketSentiment() {
  const { theme } = useTheme();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Market Sentiment</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Technical indicator sentiment (moving averages &amp; oscillators) via TradingView &middot; not retail positioning data
      </p>
      <Card>
        <CardContent className="pt-3 pb-3">
          <TradingViewScreener theme={theme} />
        </CardContent>
      </Card>
    </div>
  );
}

// 30 original lines, one per rotation - deliberately not attributed to any
// real trader (misattributing a paraphrased/invented line to a real named
// person is worse than just not naming anyone), and written around the
// discipline/risk/process themes this app already cares about (checklists,
// R-multiples, following rules) rather than generic hustle-culture lines.
// Picked deterministically by day-of-year mod length, so it's stable for
// the whole day and rotates through the full set roughly monthly.
const MOTIVATION_QUOTES = [
  'Your edge shows up over hundreds of trades, not one. Take the setup and let the sample size do its job.',
  'Every rule in your checklist exists because a past trade taught it to you the hard way. Honor the lesson.',
  'Risk management is the job. Being right is just a nice side effect.',
  'A missed trade costs you nothing. A rule broken to chase one can cost you everything.',
  'You don\'t need to be right more than you\'re wrong - you need your wins bigger than your losses.',
  'The market doesn\'t know you\'re in a trade. Trade the chart, not your P/L.',
  'Boredom is not a reason to enter. No setup is still a decision, and often the right one.',
  'Journal the loss as carefully as the win. That\'s where the real edge gets built.',
  'Discipline is choosing what you want most over what you want right now.',
  'One good trade doesn\'t make you a genius. One bad trade doesn\'t make you a failure. Process, not outcome.',
  'Cut losses fast, let winners breathe - it\'s simple to say and the hardest habit to keep.',
  'If you wouldn\'t take the trade on paper, don\'t take it with real money.',
  'Revenge trading is just the market renting out your emotions. Don\'t pay that bill.',
  'Consistency compounds. A small edge, repeated without exception, beats a big edge you abandon under stress.',
  'Your stop loss is a promise to your future self. Keep it.',
  'The best traders aren\'t the ones who never lose - they\'re the ones who lose small and stay in the game.',
  'Overtrading is rarely about opportunity. It\'s usually about impatience wearing a disguise.',
  'Every session doesn\'t need a trade from you. It needs your attention - the trade comes when it comes.',
  'Position size is how you turn "being wrong" from a disaster into a data point.',
  'Confidence comes from preparation, not from the last winning trade.',
  'The setup you skip because you were scared is still a trade - it just went to someone with more discipline.',
  'You\'re not trading the pair. You\'re trading your ability to follow your own plan under pressure.',
  'A green day built on broken rules is a red flag wearing a good mood.',
  'Patience isn\'t doing nothing. It\'s doing the work while you wait for your setup.',
  'The account that survives long enough to compound is the one that respected risk on the boring days too.',
  'Your worst trades will teach you more than your best ones - if you\'re honest enough to look.',
  'Small, repeatable wins beat one heroic trade you can\'t explain afterward.',
  'Trading well is mostly about not trading badly. Subtraction before addition.',
  'The market will still be here tomorrow. Your capital might not be if you force it today.',
  'Rules aren\'t there to slow you down. They\'re there so a bad five minutes doesn\'t undo a good five months.',
];

function quoteOfDay(): string {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return MOTIVATION_QUOTES[dayOfYear % MOTIVATION_QUOTES.length] ?? MOTIVATION_QUOTES[0];
}

export default function Summary() {
  const navigate = useNavigate();
  const { activeAccountId, activeAccount } = useAccount();
  const { data, loading, refetch } = useFetch<StrategyResult[]>(`/summary?account_id=${activeAccountId ?? ''}`);
  const results: StrategyResult[] = data ?? [];
  const { data: rawTrades } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const { data: rawChecklists } = useFetch<Checklist[]>('/checklist');
  const trades: Trade[] = rawTrades ?? [];
  const checklists: Checklist[] = rawChecklists ?? [];

  const bestR = results.length > 0 ? Math.max(...results.map(r => r.total_r)) : null;
  const bestName = results.find(r => r.total_r === bestR)?.name ?? '—';
  const totalTrades = results.length > 0 ? Math.max(...results.map(r => r.total_trades)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Welcome, Manjyot</h1>
          <p className="text-sm text-muted-foreground italic">&ldquo;{quoteOfDay()}&rdquo;</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each strategy independently filters &amp; scores your journal trades
            {activeAccount && <> &middot; <span className="font-medium text-foreground">{activeAccount.name}</span></>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <SessionsWidget />

      {totalTrades > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Target className="w-8 h-8 text-primary opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Total Journal Trades</p>
                <p className="text-2xl font-bold">{totalTrades}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-500 opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Best Strategy (Total R)</p>
                <p className="text-base font-bold truncate">{bestName}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-muted-foreground opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">Active Strategies</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && <div className="text-center py-20 text-muted-foreground">Calculating…</div>}

      {!loading && results.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No active strategies found. Go to <strong>Strategies</strong> to add some.
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mb-6 rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-center">Trades</TableHead>
                <TableHead className="text-center">Wins</TableHead>
                <TableHead className="text-center">Losses</TableHead>
                <TableHead className="text-center">Win %</TableHead>
                <TableHead className="text-center">Profit Factor</TableHead>
                <TableHead className="text-center">Total R</TableHead>
                <TableHead className="text-center">Avg R/Trade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...results].sort((a, b) => b.total_r - a.total_r).map(r => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/strategies/${r.id}`)}
                >
                  <TableCell className="font-medium text-primary hover:underline">{r.name}</TableCell>
                  <TableCell className="text-center">{r.total_trades}</TableCell>
                  <TableCell className="text-center text-green-600 dark:text-green-400">{r.wins}</TableCell>
                  <TableCell className="text-center text-red-500 dark:text-red-400">{r.losses}</TableCell>
                  <TableCell className="text-center">{r.win_rate}%</TableCell>
                  <TableCell className={`text-center font-mono ${r.profit_factor !== null && r.profit_factor < 1 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmtPF(r.profit_factor)}
                  </TableCell>
                  <TableCell className="text-center"><RBadge r={r.total_r} /></TableCell>
                  <TableCell className="text-center">
                    <span className={r.avg_r >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                      {r.avg_r > 0 ? '+' : ''}{r.avg_r}R
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ChecklistCompliance trades={trades} checklists={checklists} />

      <MarketSentiment />

      <NewsWidget />

    </div>
  );
}
