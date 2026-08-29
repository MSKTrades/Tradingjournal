import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent } from '../../lib/ui/card';
import { Switch } from '../../lib/ui/form';
import { Sparkles } from 'lucide-react';

/**
 * The landing page's "try it live" demo — a small, fixed sample account
 * (styled after a London Reversal / GBPUSD playbook) where toggling a rule
 * on or off re-filters the trade list and recomputes every stat instantly,
 * client-side, no login and no backend call involved. This is meant to be
 * the fastest possible way for a visitor to feel PipEcho's actual pitch —
 * "log once, test rule variations dynamically" — rather than reading about
 * it.
 *
 * Two render modes share this one component so the underlying demo logic
 * never drifts into two different stories:
 *  - `autoplay` (embedded compact on the Landing page): cycles through a
 *    fixed sequence of rule combinations on a timer, purely as a moving
 *    illustration - nothing to click.
 *  - Interactive (the full /demo page): every toggle is a real checkbox the
 *    visitor operates themselves.
 */

type DemoTrade = {
  id: number;
  date: string; // ISO date
  weekday: number; // 0=Sun..6=Sat
  session: 'London' | 'New York' | 'Asia' | 'London/NY Overlap';
  bos: boolean; // Break of structure confirmed before entry
  asiaSwept: boolean; // Asia session liquidity swept before the move
  rr: number; // realized result in R (positive = win, negative = loss)
};

// Deterministic PRNG (mulberry32) so the sample dataset is stable across
// renders/reloads instead of re-shuffling every time the page mounts -
// nobody should see a DIFFERENT "before" story on a refresh.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSION_OPTIONS: DemoTrade['session'][] = ['London', 'New York', 'Asia', 'London/NY Overlap'];

// Trades are generated with real (if simplified) correlations baked in -
// a confirmed break of structure (BOS), an Asia sweep, and the London
// session each genuinely raise the odds of a winner here, and Monday
// genuinely hurts - so toggling the rules on the page tells an honest,
// coherent story instead of moving randomly. This is a sample account, not
// real trading advice or a promised result.
function generateDemoTrades(): DemoTrade[] {
  const rand = mulberry32(20260214);
  const trades: DemoTrade[] = [];
  const start = new Date('2026-02-02T00:00:00Z'); // a Monday
  let cursor = new Date(start);
  let id = 1;
  while (trades.length < 64) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      // 1-2 trades most weekdays, occasionally none.
      const tradesToday = rand() < 0.7 ? 1 : (rand() < 0.5 ? 0 : 2);
      for (let i = 0; i < tradesToday && trades.length < 64; i++) {
        const bos = rand() < 0.55;
        const asiaSwept = rand() < 0.45;
        const session = SESSION_OPTIONS[Math.floor(rand() * SESSION_OPTIONS.length)];
        let winProb = 0.40;
        if (bos) winProb += 0.18;
        if (asiaSwept) winProb += 0.10;
        if (session === 'London') winProb += 0.08;
        if (weekday === 1) winProb -= 0.16; // Monday chop
        winProb = Math.min(0.92, Math.max(0.06, winProb));
        const win = rand() < winProb;
        const rr = win ? Number((1 + rand() * 2).toFixed(1)) : -1;
        trades.push({
          id: id++,
          date: cursor.toISOString().slice(0, 10),
          weekday,
          session,
          bos,
          asiaSwept,
          rr,
        });
      }
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return trades;
}

type RuleKey = 'bos' | 'asiaSwept' | 'noMonday' | 'londonOnly';

const RULES: { key: RuleKey; label: string; shortLabel: string }[] = [
  { key: 'bos', label: 'BOS confirmed before entry', shortLabel: 'BOS confirmed' },
  { key: 'asiaSwept', label: 'Asia session liquidity swept', shortLabel: 'Asia swept' },
  { key: 'noMonday', label: 'Skip Mondays', shortLabel: 'No Monday' },
  { key: 'londonOnly', label: 'London session only', shortLabel: 'London only' },
];

const NO_RULES: Record<RuleKey, boolean> = { bos: false, asiaSwept: false, noMonday: false, londonOnly: false };

// The sequence an autoplaying demo steps through - each one strictly adds a
// rule on top of the last, so the numbers visibly climb as more of the
// playbook's real rules get applied, ending on "every rule at once" before
// looping back to the raw, unfiltered baseline.
const AUTOPLAY_STEPS: Record<RuleKey, boolean>[] = [
  { bos: false, asiaSwept: false, noMonday: false, londonOnly: false },
  { bos: true, asiaSwept: false, noMonday: false, londonOnly: false },
  { bos: true, asiaSwept: true, noMonday: false, londonOnly: false },
  { bos: true, asiaSwept: true, noMonday: true, londonOnly: true },
];

function applyRules(trades: DemoTrade[], active: Record<RuleKey, boolean>): DemoTrade[] {
  return trades.filter(t => {
    if (active.bos && !t.bos) return false;
    if (active.asiaSwept && !t.asiaSwept) return false;
    if (active.noMonday && t.weekday === 1) return false;
    if (active.londonOnly && t.session !== 'London') return false;
    return true;
  });
}

function computeStats(trades: DemoTrade[]) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.length;
  const wins = sorted.filter(t => t.rr > 0).length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const totalR = sorted.reduce((s, t) => s + t.rr, 0);
  const grossWin = sorted.filter(t => t.rr > 0).reduce((s, t) => s + t.rr, 0);
  const grossLoss = Math.abs(sorted.filter(t => t.rr < 0).reduce((s, t) => s + t.rr, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  let running = 0;
  const curve = sorted.map((t, i) => {
    running += t.rr;
    return { idx: i + 1, r: Number(running.toFixed(2)) };
  });
  if (curve.length === 0) curve.push({ idx: 0, r: 0 });
  return { total, wins, winRate, totalR: Number(totalR.toFixed(1)), profitFactor, curve, sorted };
}

function fmtPF(v: number | null) {
  return v === null ? '∞' : v.toFixed(2);
}

export default function RuleToggleDemo({
  autoplay = false,
  compact = false,
  showTable = false,
}: {
  autoplay?: boolean;
  compact?: boolean;
  showTable?: boolean;
}) {
  const trades = useMemo(() => generateDemoTrades(), []);
  const [manualActive, setManualActive] = useState<Record<RuleKey, boolean>>(NO_RULES);
  const [autoStep, setAutoStep] = useState(0);

  useEffect(() => {
    if (!autoplay) return;
    // Was 3200ms - felt sluggish for a page visitor just skimming, so this
    // now advances roughly twice as fast. Still slow enough that the number
    // change (and which rule chip just lit up) is readable, not a blur.
    const id = setInterval(() => setAutoStep(s => (s + 1) % AUTOPLAY_STEPS.length), 1600);
    return () => clearInterval(id);
  }, [autoplay]);

  const active = autoplay ? AUTOPLAY_STEPS[autoStep] : manualActive;
  const filtered = useMemo(() => applyRules(trades, active), [trades, active]);
  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const baseline = useMemo(() => computeStats(trades), [trades]);

  return (
    <Card className={compact ? 'border-primary/20' : ''}>
      <CardContent className={compact ? 'pt-5 pb-5' : 'pt-6 pb-6'}>
        {!compact && (
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Sample account: London Reversal</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mb-4">
          {autoplay
            ? 'Watching the same journal, one rule filter at a time — no clicking needed.'
            : '64 sample trades, one journal. Toggle a rule and every number below recalculates instantly.'}
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {RULES.map(r => {
            const on = active[r.key];
            // The Switch below is decorative here (its own onCheckedChange is
            // a no-op) - the actual toggle lives on this outer div's onClick.
            // Nesting a real interactive <button> (Switch) inside another
            // clickable element is invalid HTML and double-fires on click
            // (the inner element's handler, then the outer's via bubbling),
            // which would silently cancel every click back to its starting
            // state - keeping exactly one handler live avoids that.
            return (
              <div
                key={r.key}
                role="button"
                tabIndex={autoplay ? -1 : 0}
                onClick={() => !autoplay && setManualActive(a => ({ ...a, [r.key]: !a[r.key] }))}
                onKeyDown={(e) => { if (!autoplay && (e.key === 'Enter' || e.key === ' ')) setManualActive(a => ({ ...a, [r.key]: !a[r.key] })); }}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors select-none ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                } ${autoplay ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <Switch checked={on} onCheckedChange={() => {}} />
                {compact ? r.shortLabel : r.label}
              </div>
            );
          })}
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5`}>
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Trades</p>
            <p className="text-xl font-bold tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Win Rate</p>
            <p className={`text-xl font-bold tabular-nums ${stats.winRate >= baseline.winRate ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
              {stats.winRate}%
            </p>
          </div>
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Total R</p>
            <p className={`text-xl font-bold tabular-nums ${stats.totalR >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {stats.totalR > 0 ? '+' : ''}{stats.totalR}R
            </p>
          </div>
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Profit Factor</p>
            <p className="text-xl font-bold tabular-nums">{fmtPF(stats.profitFactor)}</p>
          </div>
        </div>

        <div className={compact ? 'h-28' : 'h-44'}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.curve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="idx" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} width={30} />
              {!compact && (
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}R`, 'Cumulative R']}
                  labelFormatter={(l) => `Trade #${l}`}
                />
              )}
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="r"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!autoplay}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {showTable && (
          <div className="mt-5 rounded-md border border-border overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="text-left font-medium py-2 px-3">Date</th>
                  <th className="text-left font-medium py-2 px-3">Session</th>
                  <th className="text-center font-medium py-2 px-3">BOS</th>
                  <th className="text-center font-medium py-2 px-3">Asia Swept</th>
                  <th className="text-right font-medium py-2 px-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {stats.sorted.slice(-8).reverse().map(t => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 px-3 text-muted-foreground">{t.date}</td>
                    <td className="py-2 px-3">{t.session}</td>
                    <td className="py-2 px-3 text-center">{t.bos ? '✓' : '—'}</td>
                    <td className="py-2 px-3 text-center">{t.asiaSwept ? '✓' : '—'}</td>
                    <td className={`py-2 px-3 text-right font-medium tabular-nums ${t.rr > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {t.rr > 0 ? '+' : ''}{t.rr}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
