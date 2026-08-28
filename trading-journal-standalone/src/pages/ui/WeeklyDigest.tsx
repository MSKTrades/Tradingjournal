import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Button } from '../../lib/ui/button';
import { Trade, Checklist, fmtMoney } from '../data/types';
import { summarizeOutcome } from '../data/risk';
import { EMOTIONS_POSITIVE, EMOTIONS_CAUTION } from './TradeDetailPanel';

// Local-date (not UTC) "today" - trade_placed_at is a plain DATE string with
// no time/timezone attached, so every date computed in this file stays in
// the viewer's own local calendar. Same reasoning/pattern as todayISODate()
// in risk.ts and PropPnlLedger.tsx.
function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayISODate(): string {
  return isoFromDate(new Date());
}

// Parses a plain "YYYY-MM-DD" (or a longer ISO string, truncated) as a LOCAL
// midnight Date - `new Date("YYYY-MM-DD")` alone parses as UTC midnight and
// can land on the wrong calendar day in negative-UTC-offset timezones, so
// the explicit T00:00:00 is required. Same pattern fmtEntryDate() in
// PropPnlLedger.tsx already uses.
function localDateFromISO(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

// Monday of the local calendar week (Mon-Sun) containing `iso`.
function mondayOf(iso: string): Date {
  const d = localDateFromISO(iso);
  const dow = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtWeekRange(mondayISO: string, sundayISO: string): string {
  const start = localDateFromISO(mondayISO);
  const end = localDateFromISO(sundayISO);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

function fmtDayLabel(iso: string): string {
  return localDateFromISO(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type EmotionStat = {
  name: string;
  group: 'positive' | 'caution';
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

type WeekBundle = {
  mondayISO: string;
  sundayISO: string;
  weekTrades: Trade[];
  outcome: ReturnType<typeof summarizeOutcome>;
  compliancePct: number | null;
  compliantCount: number;
  gradedCount: number;
  bestDay: { date: string; total: number } | null;
};

// All the numbers for one Mon-Sun week: trade-outcome stats (via the shared
// summarizeOutcome, same helper ChecklistCompliance/EmotionsRatingSummary
// use), pooled checklist compliance, and the single best (positive-only) day.
function computeWeekBundle(trades: Trade[], checklists: Checklist[], mondayISO: string, sundayISO: string): WeekBundle {
  const weekTrades = trades.filter(t => {
    const d = (t.trade_placed_at ?? '').slice(0, 10);
    return d !== '' && d >= mondayISO && d <= sundayISO;
  });

  const outcome = summarizeOutcome(weekTrades);

  // Checklist compliance, pooled across every checklist for a fast weekly
  // number - same "every item followed" bar useChecklistCompliance()
  // (Summary.tsx) computes per-checklist, just aggregated here. Only trades
  // graded against a checklist that still exists and still has at least one
  // item count toward either side of this fraction.
  const graded = weekTrades.filter(t => {
    if (!t.checklist_enabled || t.checklist_id == null) return false;
    const cl = checklists.find(c => c.id === t.checklist_id);
    return !!cl && cl.items.length > 0;
  });
  const compliant = graded.filter(t => {
    const cl = checklists.find(c => c.id === t.checklist_id)!;
    return cl.items.every(item => t.checklist_results?.[String(item.id)] === true);
  });
  const compliancePct = graded.length > 0 ? Math.round((compliant.length / graded.length) * 100) : null;

  // Best day: local-calendar-date sums of gain_loss, only a positive day
  // counts as a highlight - same reasoning computeConsistency() (risk.ts)
  // uses for its bestDayDollar.
  const byDay = new Map<string, number>();
  for (const t of weekTrades) {
    const day = (t.trade_placed_at ?? '').slice(0, 10);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + Number(t.gain_loss ?? 0));
  }
  let bestDay: { date: string; total: number } | null = null;
  for (const [day, total] of byDay) {
    if (total > 0 && (bestDay === null || total > bestDay.total)) {
      bestDay = { date: day, total };
    }
  }

  return {
    mondayISO, sundayISO, weekTrades, outcome,
    compliancePct, compliantCount: compliant.length, gradedCount: graded.length,
    bestDay,
  };
}

// Per-emotion trade count + win rate for one week's trades, using the same
// EMOTIONS_POSITIVE / EMOTIONS_CAUTION single-source-of-truth lists
// EmotionsRatingSummary.tsx already imports from TradeDetailPanel.tsx.
function computeEmotionStats(weekTrades: Trade[]): EmotionStat[] {
  const withGroup: { name: string; group: 'positive' | 'caution' }[] = [
    ...EMOTIONS_POSITIVE.map(name => ({ name, group: 'positive' as const })),
    ...EMOTIONS_CAUTION.map(name => ({ name, group: 'caution' as const })),
  ];
  const rows: EmotionStat[] = [];
  for (const { name, group } of withGroup) {
    const matched = weekTrades.filter(t => t.emotions?.includes(name));
    if (matched.length === 0) continue;
    const s = summarizeOutcome(matched);
    rows.push({ name, group, count: s.count, wins: s.wins, losses: s.losses, winRate: s.winRate });
  }
  return rows;
}

// Same green/amber badge convention EmotionsRatingSummary.tsx's
// GROUP_BADGE_CLASS uses for these two groups - duplicated here (rather than
// imported) since EmotionsRatingSummary.tsx doesn't export it; keep these
// two class strings in sync with that file if the badge styling ever
// changes.
const GROUP_BADGE_CLASS: Record<'positive' | 'caution', string> = {
  positive: 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300',
  caution: 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

function StatBlock({ label, value, accent = 'none', sub }: { label: string; value: string; accent?: 'green' | 'red' | 'none'; sub?: string }) {
  const color = accent === 'green' ? 'text-green-600 dark:text-green-400'
    : accent === 'red' ? 'text-red-500 dark:text-red-400'
    : '';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/** Full-width "here's your week" card at the very top of the Summary page -
 * a browsable Mon-Sun retrospective built entirely client-side from the
 * trades/checklists the page already loads (no backend change: the Vercel
 * Hobby plan's serverless-function count is already at its cap). Week
 * bucketing follows the same local-calendar-date convention as
 * computeTodayPnL/computeConsistency in risk.ts - trade_placed_at is a
 * plain DATE with no time/timezone attached, so trades are grouped by
 * slice(0, 10) string comparison, never Date-object timezone math. */
export default function WeeklyDigest({ trades, checklists }: { trades: Trade[]; checklists: Checklist[] }) {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week; negative = further back; never > 0 (no future weeks)

  const { selected, prior } = useMemo(() => {
    const currentMonday = mondayOf(todayISODate());
    const selectedMonday = addDays(currentMonday, weekOffset * 7);
    const selectedSunday = addDays(selectedMonday, 6);
    const priorMonday = addDays(selectedMonday, -7);
    const priorSunday = addDays(selectedMonday, -1);

    return {
      selected: computeWeekBundle(trades, checklists, isoFromDate(selectedMonday), isoFromDate(selectedSunday)),
      prior: computeWeekBundle(trades, checklists, isoFromDate(priorMonday), isoFromDate(priorSunday)),
    };
  }, [trades, checklists, weekOffset]);

  const emotionStats = useMemo(() => computeEmotionStats(selected.weekTrades), [selected.weekTrades]);

  // Average self-rated trade rating (1-5) for the selected week - only
  // trades with a non-null trade_rating count, same "nothing to show" bar
  // as the other stat blocks (compliancePct, winRate) already follow.
  const ratingStats = useMemo(() => {
    const rated = selected.weekTrades.filter(t => t.trade_rating != null);
    if (rated.length === 0) return { avg: null as number | null, count: 0 };
    const sum = rated.reduce((acc, t) => acc + Number(t.trade_rating), 0);
    return { avg: Math.round((sum / rated.length) * 10) / 10, count: rated.length };
  }, [selected.weekTrades]);

  // Zero trades anywhere in the account - stay out of the way entirely,
  // same convention RiskGuardrail/EmotionsRatingSummary already follow.
  if (trades.length === 0) return null;

  // --- Narrative: plain, deterministic, rule-based sentences. Each rule is
  // independent and only fires when it has something real to say - no
  // sentence is forced just to fill space. ---
  const narrative: string[] = [];

  // 1. Trade volume
  if (selected.outcome.count > 0) {
    let line = `You logged ${selected.outcome.count} trade${selected.outcome.count !== 1 ? 's' : ''} this week`;
    if (prior.outcome.count > 0) {
      if (selected.outcome.count > prior.outcome.count) line += `, up from ${prior.outcome.count} last week.`;
      else if (selected.outcome.count < prior.outcome.count) line += `, down from ${prior.outcome.count} last week.`;
      else line += `, unchanged from last week.`;
    } else {
      line += '.';
    }
    narrative.push(line);
  }

  // 2. Win rate trend - only when both weeks have a decided win rate and
  // they differ by 10+ points. Framing is positive on the way up, neutral/
  // constructive on the way down - never alarmist.
  if (selected.outcome.winRate !== null && prior.outcome.winRate !== null) {
    const diff = selected.outcome.winRate - prior.outcome.winRate;
    if (Math.abs(diff) >= 10) {
      narrative.push(
        diff > 0
          ? `Win rate climbed to ${selected.outcome.winRate}% from ${prior.outcome.winRate}% last week — keep doing what you're doing.`
          : `Win rate dipped to ${selected.outcome.winRate}% from ${prior.outcome.winRate}% last week — worth a look at what changed.`
      );
    }
  }

  // 3. Net result - stated plainly, sign included.
  if (selected.outcome.count > 0) {
    const sign = selected.outcome.totalGL >= 0 ? '+' : '';
    narrative.push(`Net result: ${sign}${fmtMoney(selected.outcome.totalGL)} this week.`);
  }

  // 4. Best day
  if (selected.bestDay) {
    narrative.push(`Your best day was ${fmtDayLabel(selected.bestDay.date)} (+${fmtMoney(selected.bestDay.total)}).`);
  }

  // 5. Emotion flag - caution. Only one surfaces even if several qualify:
  // most trades first, then lowest win rate as the tiebreaker.
  const cautionFlag = emotionStats
    .filter(e => e.group === 'caution' && e.count >= 2 && e.winRate !== null && e.winRate < 50)
    .sort((a, b) => b.count - a.count || (a.winRate! - b.winRate!))[0];
  if (cautionFlag) {
    narrative.push(
      `${cautionFlag.name} showed up on ${cautionFlag.count} trades this week (${cautionFlag.wins} win${cautionFlag.wins !== 1 ? 's' : ''}) — worth flagging before next week.`
    );
  }

  // 6. Emotion flag - positive. Independent of the caution flag above - both
  // can appear in the same digest. Same one-flag cap, tie-broken by highest
  // win rate.
  const positiveFlag = emotionStats
    .filter(e => e.group === 'positive' && e.count >= 2 && e.winRate !== null && e.winRate >= 70)
    .sort((a, b) => b.count - a.count || (b.winRate! - a.winRate!))[0];
  if (positiveFlag) {
    narrative.push(
      `${positiveFlag.name} trades went ${positiveFlag.wins}-${positiveFlag.losses} this week (${positiveFlag.winRate}% win rate) — that's your best-performing state.`
    );
  }

  // 7. Checklist compliance trend
  if (selected.compliancePct !== null) {
    if (selected.compliancePct === 100) {
      narrative.push('Followed your checklist on every graded trade this week.');
    } else if (selected.compliancePct < 60) {
      const notCompliant = selected.gradedCount - selected.compliantCount;
      narrative.push(`Checklist compliance was ${selected.compliancePct}% this week — ${notCompliant} of ${selected.gradedCount} graded trades didn't fully follow it.`);
    }
  }

  // Most-used emotion first for the pill row.
  const sortedEmotionStats = [...emotionStats].sort((a, b) => b.count - a.count);

  return (
    <Card className="mb-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden opacity-[0.16] dark:opacity-[0.12]">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="weeklyDigestWaveA" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#fb923c" />
            </linearGradient>
            <linearGradient id="weeklyDigestWaveB" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <path d="M0,60 C200,110 400,10 600,55 C800,100 1000,20 1200,60 L1200,120 L0,120 Z" fill="url(#weeklyDigestWaveA)" />
          <path d="M0,80 C250,40 450,120 700,70 C900,30 1050,90 1200,70 L1200,120 L0,120 Z" fill="url(#weeklyDigestWaveB)" opacity="0.6" />
        </svg>
      </div>
      <div className="relative z-10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base font-bold">Weekly Digest</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium mr-1">
              {fmtWeekRange(selected.mondayISO, selected.sundayISO)}
            </span>
            <Button
              variant="outline" size="icon" className="h-7 w-7"
              onClick={() => setWeekOffset(o => o - 1)}
              aria-label="Previous week"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-7 w-7"
              onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
              disabled={weekOffset === 0}
              aria-label="Next week"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {selected.outcome.count === 0 ? (
          <p className="text-sm text-muted-foreground italic">No trades logged this week.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatBlock label="Trades" value={String(selected.outcome.count)} />
              <StatBlock
                label="Win Rate"
                value={selected.outcome.winRate === null ? '—' : `${selected.outcome.winRate}%`}
              />
              <StatBlock
                label="Net $"
                value={`${selected.outcome.totalGL > 0 ? '+' : ''}${fmtMoney(selected.outcome.totalGL)}`}
                accent={selected.outcome.totalGL >= 0 ? 'green' : 'red'}
              />
              <StatBlock
                label="Checklist Compliance"
                value={selected.compliancePct === null ? '—' : `${selected.compliancePct}%`}
                sub={selected.gradedCount > 0 ? `${selected.compliantCount} of ${selected.gradedCount} trades` : undefined}
              />
              <StatBlock
                label="Avg Rating"
                value={ratingStats.avg === null ? '—' : `${ratingStats.avg}★`}
                sub={ratingStats.count > 0 ? `${ratingStats.count} rated` : undefined}
              />
            </div>
            {sortedEmotionStats.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Emotions This Week</p>
                <div className="flex flex-wrap gap-1.5">
                  {sortedEmotionStats.map(e => (
                    <span
                      key={e.name}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${GROUP_BADGE_CLASS[e.group]}`}
                    >
                      {e.name} {e.count}x{e.winRate !== null ? ` · ${e.winRate}%` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {narrative.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm text-foreground/90">
                {narrative.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">&middot;</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
      </div>
    </Card>
  );
}
