import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../lib/ui/card';
import { Account, Trade, fmtMoney } from '../data/types';
import { computeDrawdown, computeTodayPnL, computeConsistency } from '../data/risk';

type GaugeProps = {
  label: string;
  usedDollar: number;   // positive number - how much of the limit has been used up so far
  limitDollar: number;
  usedPct: number;      // usedDollar / limitDollar * 100, pre-computed by caller (handles limitDollar === 0)
  sub: string;
};

function statusColor(pct: number): { bar: string; text: string } {
  if (pct >= 100) return { bar: 'bg-red-500', text: 'text-red-500' };
  if (pct >= 75) return { bar: 'bg-orange-500', text: 'text-orange-500' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
  return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}

function Gauge({ label, usedDollar, limitDollar, usedPct, sub }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, usedPct));
  const { bar, text } = statusColor(usedPct);
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`text-xs font-mono font-semibold ${text}`}>{usedPct.toFixed(0)}% used</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-[width]`} style={{ width: `${clamped}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {fmtMoney(usedDollar)} of {fmtMoney(limitDollar)} limit &middot; {sub}
      </p>
    </div>
  );
}

export default function RiskGuardrail({ account, trades }: { account: Account | null; trades: Trade[] }) {
  if (!account) return null;
  if (account.daily_loss_limit_pct == null && account.max_drawdown_limit_pct == null && account.consistency_rule_pct == null) return null;

  const startingBalance = account.starting_balance ?? 0;
  const todayPnL = computeTodayPnL(trades);
  const dd = computeDrawdown(trades, account.starting_balance);
  const consistency = computeConsistency(trades);

  const showDaily = account.daily_loss_limit_pct != null;
  const showMaxDD = account.max_drawdown_limit_pct != null;
  const showConsistency = account.consistency_rule_pct != null;

  const dailyLimitDollar = showDaily ? startingBalance * (account.daily_loss_limit_pct! / 100) : 0;
  const dailyUsedDollar = Math.max(0, -todayPnL); // only a loss counts against the limit
  const dailyUsedPct = dailyLimitDollar > 0 ? (dailyUsedDollar / dailyLimitDollar) * 100 : 0;

  const maxDDLimitDollar = showMaxDD ? startingBalance * (account.max_drawdown_limit_pct! / 100) : 0;
  const maxDDUsedPct = maxDDLimitDollar > 0 ? (dd.currentDDDollar / maxDDLimitDollar) * 100 : 0;

  // Dollar amount a single day is allowed to be, per the account's
  // consistency_rule_pct - e.g. 20% of total profit so far. usedPct is
  // bestDayDollar relative to THAT limit (not relative to total profit,
  // which is what computeConsistency's own usedPct is) - same
  // used-of-limit percentage the other two gauges show.
  const consistencyLimitDollar = showConsistency ? consistency.totalProfitDollar * (account.consistency_rule_pct! / 100) : 0;
  const consistencyUsedPct = consistencyLimitDollar > 0 ? (consistency.bestDayDollar / consistencyLimitDollar) * 100 : 0;

  const breached = (showDaily && dailyUsedPct >= 100) || (showMaxDD && maxDDUsedPct >= 100) || (showConsistency && consistencyUsedPct >= 100);

  return (
    <Card className={breached ? 'border-red-500/50' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">Risk Guardrail — {account.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {breached && (
          <p className="text-xs font-medium text-red-500 mb-3">
            A limit below has been reached. This is a warning only — PipEcho doesn't block trades — but check
            your challenge/account rules before placing another one today.
          </p>
        )}
        <div className="flex flex-wrap gap-6">
          {showDaily && (
            <Gauge
              label="Daily Loss"
              usedDollar={dailyUsedDollar}
              limitDollar={dailyLimitDollar}
              usedPct={dailyUsedPct}
              sub={todayPnL >= 0 ? `up ${fmtMoney(todayPnL)} today` : `down ${fmtMoney(Math.abs(todayPnL))} today`}
            />
          )}
          {showMaxDD && (
            <Gauge
              label="Max Drawdown"
              usedDollar={dd.currentDDDollar}
              limitDollar={maxDDLimitDollar}
              usedPct={maxDDUsedPct}
              sub={`${dd.currentDDPct.toFixed(1)}% below peak equity`}
            />
          )}
          {showConsistency && (
            <Gauge
              label="Consistency Rule"
              usedDollar={consistency.bestDayDollar}
              limitDollar={consistencyLimitDollar}
              usedPct={consistencyUsedPct}
              sub={
                consistency.totalProfitDollar <= 0
                  ? 'No profit yet to evaluate'
                  : `${fmtMoney(consistency.bestDayDollar)} on ${consistency.bestDayDate} of ${fmtMoney(consistency.totalProfitDollar)} total profit`
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
