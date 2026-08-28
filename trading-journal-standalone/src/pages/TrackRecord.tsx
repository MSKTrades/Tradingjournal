import { Link, useParams } from 'react-router-dom';
import {
  Target, TrendingUp, TrendingDown, Percent, CalendarDays, ShieldAlert,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent } from '../lib/ui/card';
import { LogoMark } from '../components/Logo';
import { useFetch } from '../lib/api';
import { useForceDarkTheme } from '../lib/theme';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { fmtMoney } from './data/types';

/** Response shape for GET /api/accounts?resource=public_track_record&token=…
 * Kept local to this file rather than in ./data/types since the endpoint
 * (api/accounts.ts) and its type are owned by a parallel change this same
 * turn — see the note in that file. Mirror it exactly if it ever moves. */
type PublicTrackRecord = {
  displayName: string;
  startDate: string | null;
  endDate: string | null;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalReturnPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  equityCurve: { idx: number; date: string; pct: number }[];
  showDollars: boolean;
  totalReturnDollar: number | null;
  maxDrawdownDollar: number | null;
  startingBalanceDollar: number | null;
  lastUpdated: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtSignedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/** Minimal, non-navigational header for a page shared outside the product —
 * the brand mark and a label saying what kind of page this is, nothing
 * that invites a signed-out visitor to poke around the rest of the site.
 * Deliberately not MarketingChrome's MarketingHeader: that one carries a
 * full nav + login/signup CTAs meant for a prospective PipEcho user, not
 * for a prop firm or investor being handed a read-only results page. */
function TrackRecordHeader() {
  return (
    <header className="border-b border-border">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={26} />
          <span className="font-bold tracking-tight text-[16px] leading-none">
            <span className="text-foreground">Pip</span>
            <span className="text-primary">Echo</span>
          </span>
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide border border-border rounded-full px-3 py-1">
          Public Track Record
        </span>
      </div>
    </header>
  );
}

function TrackRecordFooter() {
  return (
    <footer className="border-t border-border mt-10">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          These are self-reported trading results tracked in PipEcho. Past performance does not guarantee future results.
        </p>
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <LogoMark size={14} />
          Powered by PipEcho
        </Link>
      </div>
    </footer>
  );
}

function StatCard({ icon: Icon, label, value, iconClassName }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  iconClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 flex items-center gap-3">
        <Icon className={`w-7 h-7 opacity-70 shrink-0 ${iconClassName ?? 'text-primary'}`} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TrackRecordHeader />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-sm text-center text-muted-foreground text-sm">{children}</div>
      </div>
    </div>
  );
}

export default function TrackRecord() {
  const { token } = useParams<{ token: string }>();
  // Public page shown outside the logged-in app — force the same dark
  // brand look as Landing/Pricing/Blog/Login so it reads as one consistent
  // product regardless of the viewer's system theme (they're very likely
  // not a PipEcho user at all, so there's no "their preference" to honor).
  useForceDarkTheme();
  useDocumentMeta({
    title: 'Public Track Record — PipEcho',
    description: 'A shared, read-only trading performance summary.',
  });

  const { data, loading, error } = useFetch<PublicTrackRecord>(
    `/accounts?resource=public_track_record&token=${encodeURIComponent(token ?? '')}`
  );

  if (loading) {
    return <Centered>Loading track record…</Centered>;
  }

  // Any failure — 404 (unknown token / sharing disabled) or otherwise —
  // renders the same calm message. Not our job to say which; a
  // distinguishing error would just tell a curious visitor more than they
  // need to know about why a token doesn't work.
  if (error || !data) {
    return (
      <Centered>
        <ShieldAlert className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-60" />
        <p>This track record isn't available — the link may be incorrect or no longer active.</p>
      </Centered>
    );
  }

  const {
    displayName, startDate, endDate, totalTrades, winRate, totalReturnPct,
    maxDrawdownPct, equityCurve, showDollars, totalReturnDollar,
    maxDrawdownDollar, lastUpdated,
  } = data;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TrackRecordHeader />

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>
            {startDate && endDate ? `${fmtDate(startDate)} – ${fmtDate(endDate)}` : 'No trading activity yet'}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8">{displayName}</h1>

        {totalTrades === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground text-sm">
              No trades logged yet — check back once this account has some trading history.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                icon={Percent}
                label="Win Rate"
                value={winRate === null ? '—' : `${winRate.toFixed(1)}%`}
                iconClassName="text-blue-400"
              />
              <StatCard icon={Target} label="Total Trades" value={String(totalTrades)} />
              <StatCard
                icon={totalReturnPct >= 0 ? TrendingUp : TrendingDown}
                label="Total Return"
                value={
                  showDollars && totalReturnDollar !== null
                    ? `${fmtSignedPct(totalReturnPct)} (${fmtMoney(totalReturnDollar)})`
                    : fmtSignedPct(totalReturnPct)
                }
                iconClassName={totalReturnPct >= 0 ? 'text-green-500' : 'text-red-400'}
              />
              <StatCard
                icon={TrendingDown}
                label="Max Drawdown"
                value={
                  showDollars && maxDrawdownDollar !== null
                    ? `${maxDrawdownPct.toFixed(1)}% (${fmtMoney(maxDrawdownDollar)})`
                    : `${maxDrawdownPct.toFixed(1)}%`
                }
                iconClassName="text-red-400"
              />
            </div>

            <Card className="mb-6">
              <CardContent className="pt-4">
                <p className="text-sm font-semibold mb-3">Equity Curve</p>
                {equityCurve.length < 2 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    Not enough trade history yet to plot a curve.
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="trackRecordEquityFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.32} />
                            <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={(v) => `${v}%`} domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{ fontSize: 11 }}
                          labelFormatter={(v) => `Trade #${v}`}
                          formatter={(v: number) => [`${v.toFixed(1)}%`, 'Equity']}
                        />
                        <ReferenceLine y={100} stroke="hsl(var(--border))" strokeWidth={1.5} />
                        <Area
                          type="monotone"
                          dataKey="pct"
                          stroke="hsl(var(--chart-3))"
                          fill="url(#trackRecordEquityFill)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Last updated {new Date(lastUpdated).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      </main>

      <TrackRecordFooter />
    </div>
  );
}
