import { Link } from 'react-router-dom';
import { TrendingUp, Percent, Target, Megaphone } from 'lucide-react';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { useFetch } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { PlaybookSummary } from './data/types';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

/** Public, unauthenticated library of published Playbooks — real strategies
 * with real win rate / profit factor / R-multiple stats, computed live from
 * matching trades (see api/summary/index.ts's resource=playbooks). No login
 * required to browse, same as Blog/Pricing — this is meant to be found and
 * shared, not hidden behind the app. Publishing is currently admin-only (see
 * Strategies.tsx), so today this is a curated shelf of one owner's real
 * results rather than an open marketplace — same shape TradeZella uses for
 * their own "Playbooks" feature. */
export default function Playbooks() {
  useDocumentMeta({
    title: 'Playbooks — PipEcho',
    description: 'Real trading strategies with real, live-computed win rate, profit factor, and R-multiple results — not backtested claims.',
  });

  const { data, loading, error } = useFetch<PlaybookSummary[]>('/summary?resource=playbooks');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-16 pb-12 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight">Playbooks</h1>
          <p className="text-lg text-muted-foreground mt-4">
            Real strategies, real numbers — win rate, profit factor, and the R-multiple equity curve,
            computed live from actual logged trades. Not a backtest claim, not a screenshot; the same
            numbers you'd see on the strategy owner's own Summary page.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          {loading && <div className="text-center py-16 text-muted-foreground">Loading…</div>}

          {!loading && (error || !data || data.length === 0) && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-50" />
              No Playbooks published yet — check back soon.
            </div>
          )}

          {!loading && data && data.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {data.map(pb => (
                <Link
                  key={pb.slug}
                  to={`/playbooks/${pb.slug}`}
                  className="rounded-lg border border-border bg-card p-6 hover:border-primary/50 transition-colors flex flex-col"
                >
                  <h2 className="font-semibold text-lg leading-snug mb-2">{pb.title}</h2>
                  {pb.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">{pb.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    <div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" /> Trades</p>
                      <p className="text-sm font-bold tabular-nums">{pb.totalTrades}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Win Rate</p>
                      <p className="text-sm font-bold tabular-nums">{pb.winRate}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Profit Factor</p>
                      <p className="text-sm font-bold tabular-nums">{fmtPF(pb.profitFactor)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
