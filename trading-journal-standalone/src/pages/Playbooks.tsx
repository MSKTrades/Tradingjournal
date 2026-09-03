import { Link } from 'react-router-dom';
import { TrendingUp, Percent, Target, Megaphone } from 'lucide-react';
import { useFetch } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { PlaybookSummary } from './data/types';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

/** In-app, admin-only library of published Playbooks — real strategies with
 * real win rate / profit factor / R-multiple stats, computed live from
 * matching trades (see api/summary/index.ts's resource=playbooks). This
 * used to be a public, unauthenticated page (see App.tsx's history) but was
 * pulled back inside the account: "once we've added a few strategies, we'll
 * open it for all... show it only to me and hide it for all" other users in
 * the meantime. Publishing itself was always admin-only (see
 * Strategies.tsx) — this only changes who can *browse* the library, not who
 * can add to it. See App.tsx's PlaybooksGate for the actual admin check. */
export default function Playbooks() {
  useDocumentMeta({
    title: 'Playbooks — PipEcho',
    description: 'Real trading strategies with real, live-computed win rate, profit factor, and R-multiple results — not backtested claims.',
  });

  const { data, loading, error } = useFetch<PlaybookSummary[]>('/summary?resource=playbooks');

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Playbooks</h1>
        <p className="text-sm text-muted-foreground">
          Real strategies, real numbers — win rate, profit factor, and the R-multiple equity curve,
          computed live from actual logged trades. Admin-only preview for now; publish more from
          Strategies before opening this up to everyone.
        </p>
      </div>

      {loading && <div className="text-center py-16 text-muted-foreground">Loading…</div>}

      {!loading && (error || !data || data.length === 0) && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-50" />
          No Playbooks published yet — publish one from the Strategies page.
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
  );
}
