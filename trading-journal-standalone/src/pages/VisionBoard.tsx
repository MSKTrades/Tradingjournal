import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Clock3, ImageOff, X, BookOpen } from 'lucide-react';
import { useFetch } from '../lib/api';
import { useAccount } from '../lib/accounts';
import { Trade, NoteBlock, fmtMoney, fmtNum, plColor } from './data/types';

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
  }

  const threshold = Math.ceil(trades.length * 0.6);
  return Array.from(counts.entries())
    .filter(([, count]) => count >= Math.max(2, threshold))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// Most recent timestamp this trade has, for sorting "latest first" - falls
// back down the chain to whatever's actually populated, same fallback order
// the Journal table's default sort uses.
function tradeTimestamp(t: Trade): number {
  const raw = t.date_closed || t.trade_placed_at || t.trade_executed_at || t.created_at;
  return raw ? new Date(raw).getTime() : 0;
}

function firstScreenshot(t: Trade): { url: string; timeframe?: string } | null {
  const img = (t.notes_blocks ?? []).find((b): b is Extract<NoteBlock, { type: 'image' }> => b.type === 'image');
  return img ? { url: img.url, timeframe: img.timeframe } : null;
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
    () => trades.filter(t => t.profit_loss === 'Profit').sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a)).slice(0, 5),
    [trades]
  );
  const losers = useMemo(
    () => trades.filter(t => t.profit_loss === 'Loss').sort((a, b) => tradeTimestamp(b) - tradeTimestamp(a)).slice(0, 5),
    [trades]
  );
  const winPatterns = useMemo(() => commonPatterns(winners), [winners]);
  const lossPatterns = useMemo(() => commonPatterns(losers), [losers]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Vision Board</h1>
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
