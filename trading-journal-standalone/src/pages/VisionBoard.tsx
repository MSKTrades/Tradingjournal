import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock3, ImageOff, MessageSquare, X, BookOpen } from 'lucide-react';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { Trade, NoteBlock, TIMEFRAME_PRESETS, fmtMoney, fmtNum, plColor } from './data/types';
import ProBadge from '../components/ProBadge';

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
    const session = t.closed_session || t.session_in;
    if (session) bump(`${session} session`);
    if (t.coin_token) bump(t.coin_token);
    if (t.entry_type) bump(`${t.entry_type} entry`);
    // Which chart timeframe(s) this trade's screenshots were tagged with -
    // folded into the same verdict as the tags above (not a separate
    // panel), so "these wins mostly looked at 15M + 1H" shows up right
    // alongside "these wins mostly happened in the London session".
    const tfCombo = tfComboLabel(t);
    if (tfCombo) bump(`TFs analyzed: ${tfCombo}`);
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

// --- Comment narrative -----------------------------------------------------
//
// A lightweight keyword-frequency read of the free-text comments left on
// screenshots (NoteBlock's `comment` field) - deliberately NOT an
// AI-generated summary. It counts which meaningful words show up across a
// real share of a column's commented trades (same "needs a real majority,
// not just one mention" spirit as commonPatterns above, just tuned looser
// since comments are free text and rarely repeat a word verbatim the way a
// picked tag does). This is a genuine first pass at "what's the narrative
// here" without quietly bolting a new AI call/cost onto a feature that
// wasn't asked to include one. A true generative narrative - reusing
// whatever already powers SMC Analysis (see schema.sql's smc_chart_markups
// table) - would be a natural, larger next step, and a reasonable
// candidate for its own Pro tier on top of this.
const COMMENT_STOPWORDS = new Set([
  'the', 'and', 'but', 'was', 'were', 'this', 'that', 'these', 'those', 'with', 'from', 'into',
  'have', 'has', 'had', 'having', 'does', 'did', 'doing', 'about', 'again', 'after', 'before',
  'because', 'been', 'being', 'between', 'during', 'each', 'more', 'most', 'once', 'only', 'other',
  'same', 'some', 'such', 'than', 'then', 'there', 'they', 'them', 'their', 'here', 'when', 'where',
  'which', 'while', 'your', 'youre', 'just', 'still', 'also', 'chart', 'trade', 'entry', 'price',
]);

function tokenizeComment(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(w => w.length >= 4 && !COMMENT_STOPWORDS.has(w));
}

// Every meaningful word across all of a trade's screenshot comments,
// deduped WITHIN the trade first - so one trade that repeats a word
// several times in its own notes can't outweigh "how many different
// trades actually mention this" when counted across the column.
function tradeCommentWords(t: Trade): Set<string> {
  const words = new Set<string>();
  for (const b of t.notes_blocks ?? []) {
    if (b.type === 'image' && b.comment?.trim()) {
      for (const w of tokenizeComment(b.comment)) words.add(w);
    }
  }
  return words;
}

function hasComment(t: Trade): boolean {
  return (t.notes_blocks ?? []).some(b => b.type === 'image' && !!b.comment?.trim());
}

type NarrativePoint = { label: string; count: number; total: number };

function commentNarrative(trades: Trade[]): NarrativePoint[] {
  const commented = trades.filter(hasComment);
  if (commented.length < 2) return [];
  const counts = new Map<string, number>();
  for (const t of commented) {
    for (const w of tradeCommentWords(t)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  // Looser than commonPatterns' 60% - comments are free text, so even a
  // word repeated by ~a third of the group is a real, noticeable thread.
  const threshold = Math.max(2, Math.ceil(commented.length * 0.34));
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([label, count]) => ({ label, count, total: commented.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

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
          {shot.comment && (
            <span
              title={shot.comment}
              className="absolute bottom-1.5 left-1.5 h-6 max-w-[80%] px-2 rounded-md bg-black/60 text-white text-[11px] font-medium flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3 shrink-0" /> <span className="truncate">{shot.comment}</span>
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
  const winNarrative = useMemo(() => commentNarrative(winners), [winners]);
  const lossNarrative = useMemo(() => commentNarrative(losers), [losers]);

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
            {winNarrative.length > 0 ? (
              <>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">What's working — from your comments</p>
                <div className="flex flex-wrap gap-1.5">
                  {winNarrative.map(p => (
                    <span key={p.label} className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-600/10 text-green-700 dark:text-green-400 border border-green-600/20">
                      "{p.label}" &middot; {p.count}/{p.total}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                Add a comment to a couple more screenshots (click the comment badge on any chart) and a narrative of what's working will show up here.
              </p>
            )}
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
            {lossNarrative.length > 0 ? (
              <>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">What's not working — from your comments</p>
                <div className="flex flex-wrap gap-1.5">
                  {lossNarrative.map(p => (
                    <span key={p.label} className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                      "{p.label}" &middot; {p.count}/{p.total}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                Add a comment to a couple more screenshots (click the comment badge on any chart) and a narrative of what's not working will show up here.
              </p>
            )}
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
