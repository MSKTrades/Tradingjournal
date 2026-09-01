import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock3, ImageOff, MessageSquare, X, BookOpen } from 'lucide-react';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { Trade, NoteBlock, TIMEFRAME_PRESETS, fmtMoney, fmtNum, plColor } from './data/types';
import ProBadge from '../components/ProBadge';
import { stripCommentHtml } from './ui/NotesEditor';

// The "something in common" panel above each column - counts how often a
// tag/tag-group selection/direction/session/pair/entry-type shows up across
// the trades in that column, and surfaces whichever ones clear a 60%
// majority. Deliberately loose (a real edge, in a small sample of 5 trades,
// rarely shows up in literally every single one) rather than requiring
// unanimous agreement, which would show nothing for most traders' real data.
type Pattern = { label: string; count: number };

function commonPatterns(trades: Trade[]): Pattern[] {
  if (trades.length < 2) return [];
  const counts = new Map<string, number>();
  const bump = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1);

  for (const t of trades) {
    for (const tag of t.tags ?? []) bump(tag);
    for (const [group, options] of Object.entries(t.tag_selections ?? {})) {
      for (const opt of options) bump(`${group}: ${opt}`);
    }
    if (t.direction) bump(`${t.direction} trades`);
    const session = tradeSession(t);
    if (session) bump(`${session} session`);
    if (t.coin_token) bump(t.coin_token);
    if (t.entry_type) bump(`${t.entry_type} entry`);
    // Which chart timeframe(s) this trade's screenshots were tagged with -
    // folded into the same verdict as the tags above (not a separate
    // panel), so "these wins mostly looked at 15M + 1H" shows up right
    // alongside "these wins mostly happened in the London session".
    const tfCombo = tfComboLabel(t);
    if (tfCombo) bump(`TFs analyzed: ${tfCombo}`);
    // Day-of-week and time-of-day, same treatment - if a real majority of
    // this column's trades cluster on e.g. Mondays or in the same 3-hour
    // execution window, that's exactly the kind of thing worth surfacing
    // as a pattern chip, not just something you'd have to notice yourself
    // from the precise breakdown panel below.
    const weekday = tradeWeekday(t);
    if (weekday) bump(`${weekday}s`);
    const timeBucket = tradeTimeBucket(t);
    if (timeBucket) bump(`Executed ${timeBucket}`);
  }

  const threshold = Math.ceil(trades.length * 0.6);
  return Array.from(counts.entries())
    .filter(([, count]) => count >= Math.max(2, threshold))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// Every distinct timeframe tagged across a trade's screenshots (see
// NoteBlock's `timeframe` field), in a stable, sensible order - built-in
// presets first in their usual small-to-large order, then any custom ones
// a trader has added, alphabetically. A trade with no tagged screenshots
// contributes nothing here.
function tradeTimeframes(t: Trade): string[] {
  const seen = new Set<string>();
  for (const b of t.notes_blocks ?? []) {
    if (b.type === 'image' && b.timeframe) seen.add(b.timeframe);
  }
  if (seen.size === 0) return [];
  const presetIndex = new Map(TIMEFRAME_PRESETS.map((tf, i) => [tf, i]));
  return Array.from(seen).sort((a, b) => {
    const ai = presetIndex.get(a), bi = presetIndex.get(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

// A short, chart-glance label for the combination of timeframes a trade's
// screenshots covered ("15M + 1H", or just "1H" if only one was tagged) -
// feeds into commonPatterns() above as "TFs analyzed: 15M + 1H".
function tfComboLabel(t: Trade): string | null {
  const tfs = tradeTimeframes(t);
  return tfs.length > 0 ? tfs.join(' + ') : null;
}

function tradeSession(t: Trade): string | null {
  return t.closed_session || t.session_in || null;
}

// Weekday from the date the trade was placed (falling back to the date it
// closed) - deliberately pinned to UTC so a trade logged near midnight
// doesn't land on a different weekday depending on the viewer's own
// timezone than it would for someone else looking at the same trade.
function tradeWeekday(t: Trade): string | null {
  const raw = t.trade_placed_at || t.date_closed;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
}

// Execution time bucketed into 3-hour windows ("07:00–10:00") rather than
// exact minute - two trades executed at 07:12 and 07:48 are the same real
// pattern ("early London") and exact-minute matching would never group them.
function tradeTimeBucket(t: Trade): string | null {
  const raw = t.trade_executed_at;
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const hour = Number(m[1]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  const start = Math.floor(hour / 3) * 3;
  const end = (start + 3) % 24;
  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${fmt(start)}–${fmt(end)}`;
}

// --- Best & worst combinations ---------------------------------------------
//
// Which exact combinations of direction + session + day + time + tags
// actually correlate with the highest (and lowest) win rate - e.g. "Short +
// Tuesday + London session + 18:00–21:00" might genuinely win far more
// than your average, while some other combination loses far more. An
// earlier version of this file showed direction/session/day/time as four
// separate breakdowns; this replaces that with the actual thing that
// matters - not "here's your Long/Short split" on its own, but "here's
// which specific combinations of everything actually correlate with
// winning or losing."
//
// This looks at every 2- and 3-way combination of conditions present on
// each decided (Profit/Loss) trade, tallies win/loss counts per exact
// combination across the account's recent history (win rate is a
// whole-account question, not a "these 10 wins" one - so this uses the
// full trade list, not the winners/losers columns), and keeps whichever
// combinations clear a minimum sample size, ranked by win rate.
//
// A first version of this showed every combination that cleared the sample
// bar, which meant a lot of near-duplicates: if every one of your Tuesday
// losses also happened to be Long and in the London session, "Long +
// Tuesday", "London session + Tuesday", and "Long + London session +
// Tuesday" all show up separately even though they're the exact same
// finding about the exact same trades, just described three different
// ways. Now, any combinations that match the IDENTICAL set of trades are
// collapsed into one - keeping the simplest (fewest conditions) way of
// describing that set, since a longer combo covering the same trades isn't
// telling you anything the shorter one didn't - and only the top 3 distinct
// findings are shown per side.
//
// Worth being upfront about the shape of this: it finds EXACT-match
// combinations - the same single day (not a range like "Tue–Thu"), the
// same fixed 3-hour window (not a custom-fitted one). Actually discovering
// the best boundaries for a range, rather than checking fixed ones, is a
// meaningfully bigger statistics problem than this - a real next step, not
// what a client-side pass like this one is trying to be.
const MIN_COMBO_SAMPLE = 3;
const COMBO_TRADE_LIMIT = 300; // most recent decided trades considered, for cost and relevance
const MAX_COMBOS_SHOWN = 3;

type Combo = { label: string; wins: number; losses: number; total: number; winRate: number };
type ComboCandidate = Combo & { conds: string[]; tradeIds: Set<number> };

// Every atomic condition this trade could take part in a combination with -
// deduped, and capped so one heavily-tagged trade can't blow up the 2-/3-way
// combinatorics below.
function tradeConditions(t: Trade): string[] {
  const conds: string[] = [];
  if (t.direction) conds.push(t.direction);
  const session = tradeSession(t);
  if (session) conds.push(`${session} session`);
  const weekday = tradeWeekday(t);
  if (weekday) conds.push(weekday);
  const timeBucket = tradeTimeBucket(t);
  if (timeBucket) conds.push(timeBucket);
  for (const tag of t.tags ?? []) conds.push(tag);
  for (const [group, options] of Object.entries(t.tag_selections ?? {})) {
    for (const opt of options) conds.push(`${group}: ${opt}`);
  }
  return Array.from(new Set(conds)).slice(0, 10);
}

function combinationsOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const combo: T[] = [];
  function build(start: number) {
    if (combo.length === size) { out.push(combo.slice()); return; }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      build(i + 1);
      combo.pop();
    }
  }
  build(0);
  return out;
}

// Same signature (sorted, comma-joined trade ids) = the exact same set of
// trades matched this combination - the thing we're collapsing duplicates
// on.
function tradeSetSignature(tradeIds: Set<number>): string {
  return Array.from(tradeIds).sort((a, b) => a - b).join(',');
}

// Ranks candidates by `rank`, then walks them in that order keeping only
// the first (best-ranked) combination seen for each distinct set of
// matching trades - but for THAT combination, reports the simplest label
// among every candidate sharing that same trade set (fewest conditions,
// then shortest text), not necessarily the top-ranked one's own label.
// Stops once MAX_COMBOS_SHOWN distinct trade-sets have been kept.
function pickTopDistinct(candidates: ComboCandidate[], rank: (a: ComboCandidate, b: ComboCandidate) => number): Combo[] {
  const bySignature = new Map<string, ComboCandidate[]>();
  for (const c of candidates) {
    const sig = tradeSetSignature(c.tradeIds);
    const group = bySignature.get(sig);
    if (group) group.push(c); else bySignature.set(sig, [c]);
  }

  const orderedSignatures = [...candidates]
    .sort(rank)
    .map(c => tradeSetSignature(c.tradeIds))
    .filter((sig, i, arr) => arr.indexOf(sig) === i); // first (best-ranked) occurrence of each signature

  return orderedSignatures.slice(0, MAX_COMBOS_SHOWN).map(sig => {
    const group = bySignature.get(sig)!;
    const simplest = [...group].sort((a, b) => a.conds.length - b.conds.length || a.label.length - b.label.length)[0];
    return { label: simplest.label, wins: simplest.wins, losses: simplest.losses, total: simplest.total, winRate: simplest.winRate };
  });
}

function bestWorstCombinations(trades: Trade[]): { best: Combo[]; worst: Combo[] } {
  const decided = trades
    .filter(t => t.profit_loss === 'Profit' || t.profit_loss === 'Loss')
    .sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a))
    .slice(0, COMBO_TRADE_LIMIT);

  const stats = new Map<string, { conds: string[]; tradeIds: Set<number>; wins: number; losses: number }>();
  for (const t of decided) {
    const conds = tradeConditions(t);
    if (conds.length < 2) continue;
    const sizes = conds.length >= 3 ? [2, 3] : [2];
    for (const size of sizes) {
      for (const combo of combinationsOf(conds, size)) {
        const sorted = combo.slice().sort();
        const key = sorted.join(' + ');
        const entry = stats.get(key) ?? { conds: sorted, tradeIds: new Set<number>(), wins: 0, losses: 0 };
        entry.tradeIds.add(t.id);
        if (t.profit_loss === 'Profit') entry.wins++; else entry.losses++;
        stats.set(key, entry);
      }
    }
  }

  const candidates: ComboCandidate[] = Array.from(stats.entries())
    .map(([label, { conds, tradeIds, wins, losses }]) => {
      const total = wins + losses;
      return { label, conds, tradeIds, wins, losses, total, winRate: Math.round((wins / total) * 100) };
    })
    .filter(r => r.total >= MIN_COMBO_SAMPLE);

  const best = pickTopDistinct(candidates, (a, b) => b.winRate - a.winRate || b.total - a.total);
  const worst = pickTopDistinct(candidates, (a, b) => a.winRate - b.winRate || b.total - a.total);
  return { best, worst };
}

function ComboList({ combos, tone }: { combos: Combo[]; tone: 'win' | 'loss' }) {
  if (combos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Not enough matching trades yet — need at least {MIN_COMBO_SAMPLE} decided trades sharing the exact same combination of direction/session/day/time/tags.
      </p>
    );
  }
  const chipClass = tone === 'win'
    ? 'border-green-600/20 bg-green-600/5 text-green-700 dark:text-green-400'
    : 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400';
  return (
    <ul className="space-y-1.5">
      {combos.map(c => (
        <li key={c.label} className={`flex items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-xs ${chipClass}`}>
          <span className="text-foreground/90">{c.label}</span>
          <span className="shrink-0 font-semibold whitespace-nowrap">
            {c.winRate}% <span className="font-normal opacity-70">({c.wins}/{c.total})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Comments on screenshots (NoteBlock's `comment` field, set from the Notes
// editor - see NotesEditor.tsx) stay a plain per-trade thing here for now -
// shown on each card below (see TradeCard) so the raw notes are still
// visible and useful on their own. An earlier version of this file also
// tried rolling those comments up into an automatic "what's working / not
// working" narrative per column with a simple keyword-frequency pass. That's
// intentionally shelved for now - the plan is to build that properly later
// as a real AI-driven analysis (in the spirit of what already powers SMC
// Analysis - see schema.sql's smc_chart_markups table) rather than ship a
// keyword-count version now and replace it later.

// Most recent timestamp this trade has, for sorting "latest first" - falls
// back down the chain to whatever's actually populated, same fallback order
// the Journal table's default sort uses.
function tradeTimestamp(t: Trade): number {
  const raw = t.date_closed || t.trade_placed_at || t.trade_executed_at || t.created_at;
  return raw ? new Date(raw).getTime() : 0;
}

function firstScreenshot(t: Trade): { url: string; timeframe?: string; comment?: string } | null {
  const img = (t.notes_blocks ?? []).find((b): b is Extract<NoteBlock, { type: 'image' }> => b.type === 'image');
  return img ? { url: img.url, timeframe: img.timeframe, comment: img.comment } : null;
}

function tradeDateLabel(t: Trade): string {
  const raw = t.date_closed || t.trade_placed_at;
  if (!raw) return '—';
  return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TradeCard({ trade, accent, onZoom }: { trade: Trade; accent: 'win' | 'loss'; onZoom: (url: string) => void }) {
  const shot = firstScreenshot(trade);
  const chips = [
    ...trade.tags ?? [],
    ...Object.entries(trade.tag_selections ?? {}).flatMap(([, opts]) => opts),
  ].slice(0, 4);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-muted/10">
      {shot ? (
        <button className="relative block w-full group" onClick={() => onZoom(shot.url)}>
          <img src={shot.url} alt="Trade screenshot" className="w-full h-40 object-cover" />
          {shot.timeframe && (
            <span className="absolute top-1.5 left-1.5 h-6 px-2 rounded-md bg-black/60 text-white text-[11px] font-medium flex items-center gap-1">
              <Clock3 className="w-3 h-3" /> {shot.timeframe}
            </span>
          )}
          <span className={`absolute top-1.5 right-1.5 h-6 px-2 rounded-md text-[11px] font-semibold flex items-center ${accent === 'win' ? 'bg-green-600/90 text-white' : 'bg-red-500/90 text-white'}`}>
            {trade.rr != null ? `${trade.rr >= 0 ? '+' : ''}${fmtNum(trade.rr, 1)}R` : trade.profit_loss}
          </span>
        </button>
      ) : (
        <div className="h-40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground bg-muted/20">
          <ImageOff className="w-5 h-5" />
          <span className="text-xs">No screenshot on this trade</span>
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{trade.coin_token ?? '—'}</span>
          <span className={`text-sm font-medium ${plColor(trade.gain_loss)}`}>{fmtMoney(trade.gain_loss)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{trade.direction} &middot; {tradeDateLabel(trade)}</p>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {chips.map((c, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground">{c}</span>
            ))}
          </div>
        )}
        {/* Comment on the chart, shown as plain readable text (not a small
            overlay badge on top of the image - that read as too easy to
            miss) so it's actually visible at a glance. */}
        {shot?.comment && (
          <p className="flex items-start gap-1.5 mt-2 text-xs text-foreground/90">
            <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
            {/* Comments can now carry basic formatting (bold/italic/lists -
                see NotesEditor.tsx) - stripped to plain text for this
                compact card blurb, same reasoning as the comment row's own
                collapsed preview in the Notes editor. */}
            <span className="line-clamp-2">{stripCommentHtml(shot.comment)}</span>
          </p>
        )}
        {/* Deep-links into the Journal table with this trade's detail panel
            already open - see the ?trade= handling added to Journal.tsx.
            Kept as a plain text link rather than another icon-only button so
            its purpose is obvious without a hover/tooltip. */}
        <Link
          to={`/journal?trade=${trade.id}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2.5"
        >
          <BookOpen className="w-3 h-3" /> Open in Journal
        </Link>
      </div>
    </div>
  );
}

export default function VisionBoard() {
  const { activeAccountId, activeAccount } = useAccount();
  const { data: rawTrades, loading } = useFetch<Trade[]>(`/trades?account_id=${activeAccountId ?? ''}`);
  const trades = rawTrades ?? [];
  const [lightbox, setLightbox] = useState<string | null>(null);

  const winners = useMemo(
    () => trades.filter(t => t.profit_loss === 'Profit').sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a)).slice(0, 10),
    [trades]
  );
  const losers = useMemo(
    () => trades.filter(t => t.profit_loss === 'Loss').sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a)).slice(0, 10),
    [trades]
  );
  const winPatterns = useMemo(() => commonPatterns(winners), [winners]);
  const lossPatterns = useMemo(() => commonPatterns(losers), [losers]);
  // Best/worst combinations are a whole-account win-rate question, not a
  // "these 10 latest wins" one - computed once from every trade, not from
  // the winners/losers slices above.
  const combos = useMemo(() => bestWorstCombinations(trades), [trades]);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Vision Board</h1>
          <ProBadge feature="vision_board" />
        </div>
        <p className="text-sm text-muted-foreground">
          Your latest wins and losses side by side, so the pattern between them is something you can actually see
          {activeAccount && <> &middot; <span className="font-medium text-foreground">{activeAccount.name}</span></>}
        </p>
      </div>

      {!loading && trades.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          No trades logged yet on this account. Add a few trades with screenshots and they'll show up here.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Winners */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            <h2 className="text-sm font-semibold">Latest Winning Trades</h2>
            <span className="text-xs text-muted-foreground">({winners.length})</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 mb-3">
            {winPatterns.length > 0 ? (
              <>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">What your wins have in common</p>
                <div className="flex flex-wrap gap-1.5">
                  {winPatterns.map(p => (
                    <span key={p.label} className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-600/10 text-green-700 dark:text-green-400 border border-green-600/20">
                      {p.label} &middot; {p.count}/{winners.length}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {winners.length < 2 ? 'Log a couple more winning trades to start seeing what they share.' : 'No strong shared pattern across these yet — try tagging trades more consistently.'}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 mb-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Best combinations (highest win rate)</p>
            <ComboList combos={combos.best} tone="win" />
          </div>
          <div className="space-y-3">
            {winners.map(t => <TradeCard key={t.id} trade={t} accent="win" onZoom={setLightbox} />)}
          </div>
        </div>

        {/* Losers */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
            <h2 className="text-sm font-semibold">Latest Losing Trades</h2>
            <span className="text-xs text-muted-foreground">({losers.length})</span>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 mb-3">
            {lossPatterns.length > 0 ? (
              <>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">What your losses have in common</p>
                <div className="flex flex-wrap gap-1.5">
                  {lossPatterns.map(p => (
                    <span key={p.label} className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                      {p.label} &middot; {p.count}/{losers.length}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {losers.length < 2 ? 'Log a couple more losing trades to start seeing what they share.' : 'No strong shared pattern across these yet — try tagging trades more consistently.'}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 mb-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Worst combinations (lowest win rate)</p>
            <ComboList combos={combos.worst} tone="loss" />
          </div>
          <div className="space-y-3">
            {losers.map(t => <TradeCard key={t.id} trade={t} accent="loss" onZoom={setLightbox} />)}
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Trade screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button className="absolute top-5 right-5 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
