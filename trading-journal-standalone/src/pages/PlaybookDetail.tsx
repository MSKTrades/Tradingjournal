import { Link, useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ArrowRight, ShieldAlert, Target, Percent, TrendingUp, Sigma } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { useFetch } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { PlaybookDetail as PlaybookDetailType, FIELD_LABELS, WEEKDAYS, TAG_CONDITION_FIELD, Condition } from './data/types';

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

function condLabel(c: Condition): string {
  if (c.field === TAG_CONDITION_FIELD) {
    const suffix = c.group ? ` in "${c.group}"` : '';
    return c.op === '!has' ? `Not tagged "${c.value}"${suffix}` : `Tagged "${c.value}"${suffix}`;
  }
  const field = FIELD_LABELS[c.field] ?? c.field;
  return `${field} ${c.op} ${c.value}`;
}

function StatCard({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${
        tone === 'good' ? 'text-green-600 dark:text-green-400' : tone === 'bad' ? 'text-red-500 dark:text-red-400' : ''
      }`}>
        {value}
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-20">
      <div className="max-w-sm text-center text-muted-foreground text-sm">{children}</div>
    </div>
  );
}

/** In-app, admin-only detail page for one published Playbook — the
 * strategy's real rules plus its win rate / profit factor / R-multiple
 * equity curve, computed live server-side (see api/summary/index.ts's
 * resource=playbook&slug=...). Deliberately no dollar figures anywhere on
 * this page - the API response itself never carries any (see that
 * handler's comment), so there's nothing to accidentally render even by
 * mistake. This used to be a public, unauthenticated page (see App.tsx's
 * history) but was pulled back inside the account — see App.tsx's
 * PlaybookDetailGate. */
export default function PlaybookDetail() {
  const { slug } = useParams<{ slug: string }>();
  useDocumentMeta({
    title: 'Playbook — PipEcho',
    description: 'A real trading strategy with live-computed win rate, profit factor, and R-multiple results.',
  });

  const { data, loading, error } = useFetch<PlaybookDetailType>(`/summary?resource=playbook&slug=${encodeURIComponent(slug ?? '')}`);

  if (loading) return <Centered>Loading playbook…</Centered>;

  if (error || !data) {
    return (
      <Centered>
        <ShieldAlert className="w-8 h-8 mx-auto mb-3 opacity-60" />
        <p>This playbook isn't available — the link may be incorrect or it's no longer published.</p>
        <Link to="/playbooks" className="inline-flex items-center gap-1 text-primary hover:underline mt-4 text-sm">
          Browse all Playbooks <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </Centered>
    );
  }

  const {
    title, description, totalTrades, winRate, profitFactor, totalR, avgR,
    equityCurve, conditions, days, timeStart, timeEnd, tp1Rr, tp2Rr, splitPercent, publishedAt,
  } = data;

  return (
    <div>
      <div className="mb-4">
        <Badge variant="outline" className="mb-2">Playbook</Badge>
        <h1 className="text-xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Target} label="Trades" value={String(totalTrades)} />
        <StatCard icon={Percent} label="Win Rate" value={`${winRate}%`} />
        <StatCard icon={TrendingUp} label="Total R" value={`${totalR > 0 ? '+' : ''}${totalR}R`} tone={totalR >= 0 ? 'good' : 'bad'} />
        <StatCard icon={Sigma} label="Profit Factor" value={fmtPF(profitFactor)} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-5">
          <p className="text-sm font-semibold mb-3">R-Multiple Equity Curve</p>
          {equityCurve.length < 2 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Not enough matching trades yet to plot a curve.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} width={36} />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}R`, 'Cumulative R']}
                    labelFormatter={(l) => `Trade #${l}`}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="r" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">Avg {avgR > 0 ? '+' : ''}{avgR}R per trade</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 flex flex-col gap-4">
          <p className="text-sm font-semibold">Setup Rules</p>

          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Filter Conditions</p>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">All trades qualify (no conditions)</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {conditions.map((c, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-mono">{condLabel(c)}</Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1.5">Days Traded</p>
            {days.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">All days</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.filter(d => days.includes(d.value)).map(d => (
                  <Badge key={d.value} variant="outline" className="text-xs">{d.label}</Badge>
                ))}
              </div>
            )}
          </div>

          {(timeStart || timeEnd) && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1.5">Time Window</p>
              <Badge variant="outline" className="text-xs font-mono">
                {timeStart ?? '—'} – {timeEnd ?? '—'}
              </Badge>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2.5 leading-relaxed">
            {tp2Rr != null && splitPercent != null ? (
              <>
                <strong>Win (both):</strong> {(splitPercent / 100 * tp1Rr + (1 - splitPercent / 100) * tp2Rr).toFixed(1)}R
                &nbsp;·&nbsp;
                <strong>Partial (TP1 only):</strong> {(splitPercent / 100 * tp1Rr).toFixed(1)}R
                &nbsp;·&nbsp;
                <strong>Loss:</strong> −1R
              </>
            ) : (
              <>
                <strong>Win:</strong> +{tp1Rr}R &nbsp;·&nbsp; <strong>Loss:</strong> −1R
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-6">
        Published {new Date(publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.
        These are self-reported trading results tracked in PipEcho. Past performance does not guarantee future results.
      </p>
    </div>
  );
}
