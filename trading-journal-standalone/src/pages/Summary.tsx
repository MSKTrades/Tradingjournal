import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../lib/ui/card';
import { Badge, Switch } from '../lib/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../lib/ui/table';
import { TrendingUp, TrendingDown, Target, RefreshCw, ListChecks, Newspaper, Globe, ExternalLink } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { StrategyResult, Trade, Checklist, NewsEvent, Headline, fmtMoney, plColor } from './data/types';
import CurrencyFlag from './ui/CurrencyFlag';
import RiskGuardrail from './ui/RiskGuardrail';
import PropPnlLedger from './ui/PropPnlLedger';
import EmotionsRatingSummary from './ui/EmotionsRatingSummary';
import ExecutionMistakeSummary from './ui/ExecutionMistakeSummary';
import HtfBiasAlignment from './ui/HtfBiasAlignment';
import WeeklyDigest from './ui/WeeklyDigest';
import { summarizeOutcome } from './data/risk';
import ProBadge from '../components/ProBadge';
import SessionClockWidget from './ui/SessionClockWidget';
import { isDemoMode, DEMO_BASE } from '../lib/demoMode';

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
        // "Followed the checklist" means every single rule was explicitly
        // checked off — one broken (or ungraded) rule puts a trade in the
        // other bucket. This is a stricter, trade-level bar than "what
        // fraction of individual rule-checks were followed" would be, but
        // it's the honest reading of "did I follow my rules on this trade"
        // — and it's what the headline Overall Follow Rate below is now
        // built from too (see that comment), so the two numbers in this
        // widget can't quietly disagree with each other.
        const fullCompliance = cl.items.length > 0
          ? clTrades.filter(t => cl.items.every(item => t.checklist_results?.[String(item.id)] === true))
          : [];
        const notFullCompliance = cl.items.length > 0
          ? clTrades.filter(t => !cl.items.every(item => t.checklist_results?.[String(item.id)] === true))
          : [];

        // Deliberately trade-level (fully-compliant trades ÷ graded trades),
        // not an average of the per-rule Follow % column to its right. That
        // per-check average used to drive this number, which meant it could
        // read 100% ("Overall Follow Rate") while the All-Rules-Followed /
        // Not-Fully-Followed cards right next to it showed real trades in
        // the "not fully followed" bucket - e.g. every individually-graded
        // rule-check came back true, but a rule nobody graded on 2 of the 5
        // trades still correctly counts those 2 as not fully followed. Two
        // numbers in the same glance disagreeing like that reads as a bug
        // even though each was technically answering a different question -
        // this makes the headline answer the SAME question ("did the whole
        // checklist get followed on this trade") as the cards beside it.
        const overallPct = cl.items.length > 0 && clTrades.length > 0
          ? Math.round((fullCompliance.length / clTrades.length) * 100)
          : null;

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
        <ProBadge feature="checklist_compliance" />
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {fullCompliance.count}/{enabledCount} trades followed every rule
                  </p>
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
                          <span className={plColor(fullCompliance.totalGL)}>
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
                          <span className={plColor(notFullCompliance.totalGL)}>
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
            <div className="flex flex-col divide-y divide-border max-h-[320px] overflow-y-auto scroll-visible-y">
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
            <div className="flex flex-col divide-y divide-border max-h-[320px] overflow-y-auto scroll-visible-y">
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
  const { data: rawChecklists } = useFetch<Checklist[]>(`/checklist?account_id=${activeAccountId ?? ''}`);
  const trades: Trade[] = rawTrades ?? [];
  const checklists: Checklist[] = rawChecklists ?? [];

  const bestR = results.length > 0 ? Math.max(...results.map(r => r.total_r)) : null;
  const bestName = results.find(r => r.total_r === bestR)?.name ?? '—';
  const totalTrades = results.length > 0 ? Math.max(...results.map(r => r.total_trades)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">Welcome, Manjyot</h1>
          <div className="mt-3 mb-1 inline-block rounded-md border border-border bg-card px-3 py-1.5">
            <p className="text-sm text-foreground/90 italic">&ldquo;{quoteOfDay()}&rdquo;</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <SessionClockWidget />

      <WeeklyDigest trades={trades} checklists={checklists} />

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
                  onClick={() => navigate(`${isDemoMode() ? DEMO_BASE : ''}/strategies/${r.id}`)}
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
                    <span className={plColor(r.avg_r)}>
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <RiskGuardrail account={activeAccount} trades={trades} />
        {activeAccount && <PropPnlLedger accountId={activeAccount.id} />}
        <EmotionsRatingSummary trades={trades} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <HtfBiasAlignment trades={trades} />
        <ExecutionMistakeSummary trades={trades} />
      </div>

      <NewsWidget />

    </div>
  );
}
