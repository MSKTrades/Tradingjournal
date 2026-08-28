import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Button } from '../lib/ui/button';
import { Input, Label, Select } from '../lib/ui/form';
import { useAccount } from '../lib/accounts';
import { useFetch } from '../lib/api';
import { Trade, StrategyResult } from './data/types';
import { simulateChallenge, ChallengeRules, ChallengeResult, DrawdownType } from './data/challengeSim';

// Rules-form-only persistence (never the computed results, never the account
// selection) - same lazy useState(() => JSON.parse(localStorage...)) +
// try/catch shape Journal.tsx's column-visibility (VIS_KEY) uses, which is
// itself already SSR-safe since a thrown reference to a missing
// `localStorage` global is swallowed by the same catch.
const RULES_KEY = 'forexforge_challenge_sim_rules_v1';

// Every field is stored/edited as a string so an emptied input can be told
// apart from "0" - parsed to numbers (or null) only where simulateChallenge
// actually needs them.
type RulesFormState = {
  startingBalance: string;
  profitTargetPct: string;
  dailyLossPct: string;
  maxDrawdownPct: string;
  drawdownType: DrawdownType;
  minTradingDays: string;
  timeLimitDays: string;      // '' = unlimited
  consistencyRulePct: string; // '' = not checked
};

const BLANK_FORM: RulesFormState = {
  startingBalance: '',
  profitTargetPct: '',
  dailyLossPct: '',
  maxDrawdownPct: '',
  drawdownType: 'static',
  minTradingDays: '',
  timeLimitDays: '',
  consistencyRulePct: '',
};

function loadRulesForm(): RulesFormState {
  try {
    const stored = JSON.parse(localStorage.getItem(RULES_KEY) ?? 'null') as Partial<RulesFormState> | null;
    if (!stored || typeof stored !== 'object') return { ...BLANK_FORM };
    return { ...BLANK_FORM, ...stored };
  } catch {
    return { ...BLANK_FORM };
  }
}

const GENERIC_TEMPLATE: Omit<RulesFormState, 'startingBalance'> = {
  profitTargetPct: '8',
  dailyLossPct: '5',
  maxDrawdownPct: '10',
  drawdownType: 'static',
  minTradingDays: '5',
  timeLimitDays: '',
  consistencyRulePct: '',
};

// label + bold value + optional muted sub-caption, matching the visual
// density of WeeklyDigest.tsx's StatBlock (not exported from that file, so
// duplicated here rather than imported).
function StatBlock({ label, value, accent = 'none', sub }: { label: string; value: string; accent?: 'green' | 'orange' | 'none'; sub?: string }) {
  const color = accent === 'green' ? 'text-green-600 dark:text-green-400'
    : accent === 'orange' ? 'text-orange-700 dark:text-orange-400'
    : '';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<ChallengeResult['status'], { border: string; text: string; badgeBg: string; label: string; stroke: string }> = {
  passed: {
    border: 'border-green-600/50',
    text: 'text-green-600 dark:text-green-400',
    badgeBg: 'bg-green-500/15',
    label: 'Passed',
    stroke: '#16a34a',
  },
  // Same dark-orange "pay attention, not alarm-red" convention
  // RiskGuardrail.tsx uses for a breached limit.
  failed: {
    border: 'border-orange-700/50',
    text: 'text-orange-700 dark:text-orange-400',
    badgeBg: 'bg-orange-700/15',
    label: 'Failed',
    stroke: '#c2410c',
  },
  in_progress: {
    border: 'border-border',
    text: 'text-muted-foreground',
    badgeBg: 'bg-muted',
    label: 'In Progress',
    stroke: '#71717a',
  },
};

const FAIL_REASON_TEXT: Record<NonNullable<ChallengeResult['failReason']>, string> = {
  daily_loss: 'exceeded the daily loss limit',
  max_drawdown: 'exceeded the max drawdown limit',
  time_limit: 'ran out of time before reaching the profit target',
};

function EquitySparkline({ result, startingBalance }: { result: ChallengeResult; startingBalance: number }) {
  const { timeline, status } = result;
  if (timeline.length < 2) return null;

  const equities = timeline.map(p => p.equity);
  const min = Math.min(...equities, startingBalance);
  const max = Math.max(...equities, startingBalance);
  const range = max - min || 1;
  const pad = range * 0.1;
  const yMin = min - pad;
  const yMax = max + pad;
  const yRange = yMax - yMin || 1;

  const w = 400, h = 100;
  const points = timeline
    .map((p, i) => {
      const x = (i / (timeline.length - 1)) * w;
      const y = h - ((p.equity - yMin) / yRange) * h;
      return `${x},${y}`;
    })
    .join(' ');

  const refY = h - ((startingBalance - yMin) / yRange) * h;
  const stroke = STATUS_STYLE[status].stroke;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-24">
      <line x1="0" y1={refY} x2={w} y2={refY} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}

export default function ChallengeSimulator() {
  const { accounts, activeAccountId } = useAccount();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(activeAccountId);

  // Keep the picker following the app-wide active account until the user
  // makes an explicit choice on this page (mirrors how most other pages
  // pick up activeAccountId on load, without fighting a manual selection).
  useEffect(() => {
    setSelectedAccountId(prev => (prev == null ? activeAccountId : prev));
  }, [activeAccountId]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? null;

  const { data: rawTrades, loading } = useFetch<Trade[]>(`/trades?account_id=${selectedAccountId ?? ''}`);

  // Strategies are matched to trades server-side (a strategy's `conditions`
  // are evaluated per-trade, there's no stored trades.strategy_id) — the
  // same /summary endpoint + trades-id-set join Performance.tsx already
  // uses for its own strategy filter is reused here rather than inventing
  // a second way to do the same join.
  const { data: strategiesData } = useFetch<StrategyResult[]>(`/summary?account_id=${selectedAccountId ?? ''}`);
  const strategies = strategiesData ?? [];
  const [strategyId, setStrategyId] = useState<string>('RAW'); // 'RAW' = All Strategies, matching Performance.tsx's sentinel

  // A strategy id selected under one account has no guaranteed meaning under
  // a different account, so drop the filter back to "All Strategies"
  // whenever the account changes rather than silently carrying it over.
  useEffect(() => {
    setStrategyId('RAW');
  }, [selectedAccountId]);

  const trades = useMemo(() => {
    const all = rawTrades ?? [];
    if (strategyId === 'RAW') return all;
    const strat = strategies.find(s => String(s.id) === strategyId);
    const idSet = new Set((strat?.trades ?? []).map(t => t.id));
    return all.filter(t => idSet.has(t.id));
  }, [rawTrades, strategies, strategyId]);

  const [form, setForm] = useState<RulesFormState>(loadRulesForm);

  useEffect(() => {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(form)); } catch { /* ignore - private mode etc. */ }
  }, [form]);

  // Defaults startingBalance to the newly-selected account's balance, but
  // only when the account actually changes - the user is free to override
  // it afterward to simulate a different account size than they're really
  // funded at without it snapping back.
  useEffect(() => {
    if (selectedAccount?.starting_balance != null) {
      setForm(f => ({ ...f, startingBalance: String(selectedAccount.starting_balance) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  function set<K extends keyof RulesFormState>(key: K, value: RulesFormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function loadGenericTemplate() {
    setForm(f => ({ ...f, ...GENERIC_TEMPLATE }));
  }

  const parsed = useMemo(() => {
    const startingBalance = Number(form.startingBalance);
    const profitTargetPct = Number(form.profitTargetPct);
    const dailyLossPct = Number(form.dailyLossPct);
    const maxDrawdownPct = Number(form.maxDrawdownPct);
    const minTradingDays = Number(form.minTradingDays);
    const timeLimitDays = form.timeLimitDays.trim() === '' ? null : Number(form.timeLimitDays);
    const consistencyRulePct = form.consistencyRulePct.trim() === '' ? null : Number(form.consistencyRulePct);

    const valid =
      form.startingBalance.trim() !== '' && !isNaN(startingBalance) && startingBalance > 0 &&
      form.profitTargetPct.trim() !== '' && !isNaN(profitTargetPct) &&
      form.dailyLossPct.trim() !== '' && !isNaN(dailyLossPct) &&
      form.maxDrawdownPct.trim() !== '' && !isNaN(maxDrawdownPct) &&
      form.minTradingDays.trim() !== '' && !isNaN(minTradingDays) &&
      (timeLimitDays === null || !isNaN(timeLimitDays)) &&
      (consistencyRulePct === null || !isNaN(consistencyRulePct));

    if (!valid) return null;

    const rules: ChallengeRules = {
      startingBalance, profitTargetPct, dailyLossPct, maxDrawdownPct,
      drawdownType: form.drawdownType, minTradingDays, timeLimitDays, consistencyRulePct,
    };
    return rules;
  }, [form]);

  const result = useMemo(() => {
    if (!parsed) return null;
    return simulateChallenge(trades, parsed);
  }, [trades, parsed]);

  const noTrades = !loading && trades.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-muted-foreground" /> Challenge Simulator
          </h1>
          <p className="text-sm text-muted-foreground">
            Replay this account's trade history against a set of challenge rules to see whether — and when — it would have passed or failed.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-48">
            <Label className="text-[11px] text-muted-foreground">Account</Label>
            <Select
              value={selectedAccountId ?? ''}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAccountId(Number(e.target.value))}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 && <option value="">No accounts yet</option>}
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Label className="text-[11px] text-muted-foreground">Strategy</Label>
            <Select
              value={strategyId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStrategyId(e.target.value)}
              disabled={strategies.length === 0}
            >
              <option value="RAW">All Strategies</option>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-bold">Challenge Rules</CardTitle>
            <div>
              <Button variant="outline" size="sm" onClick={loadGenericTemplate}>Load a generic starting point</Button>
              <p className="text-[11px] text-muted-foreground mt-1 text-right">
                Common round numbers, not any specific firm's actual rules — replace with your firm's real published terms.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="cs-starting-balance">Starting Balance ($)</Label>
              <Input id="cs-starting-balance" type="number" value={form.startingBalance}
                onChange={e => set('startingBalance', e.target.value)} placeholder="e.g. 100000" />
            </div>
            <div>
              <Label htmlFor="cs-profit-target">Profit Target (%)</Label>
              <Input id="cs-profit-target" type="number" value={form.profitTargetPct}
                onChange={e => set('profitTargetPct', e.target.value)} placeholder="e.g. 8" />
            </div>
            <div>
              <Label htmlFor="cs-daily-loss">Daily Loss Limit (%)</Label>
              <Input id="cs-daily-loss" type="number" value={form.dailyLossPct}
                onChange={e => set('dailyLossPct', e.target.value)} placeholder="e.g. 5" />
            </div>
            <div>
              <Label htmlFor="cs-max-dd">Max Drawdown (%)</Label>
              <Input id="cs-max-dd" type="number" value={form.maxDrawdownPct}
                onChange={e => set('maxDrawdownPct', e.target.value)} placeholder="e.g. 10" />
            </div>
            <div>
              <Label htmlFor="cs-dd-type">Drawdown Type</Label>
              <Select id="cs-dd-type" value={form.drawdownType}
                onChange={e => set('drawdownType', e.target.value as DrawdownType)}>
                <option value="static">Static</option>
                <option value="trailing">Trailing</option>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Static: the floor stays fixed at your starting balance. Trailing: the floor rises with your peak equity.
              </p>
            </div>
            <div>
              <Label htmlFor="cs-min-days">Minimum Trading Days</Label>
              <Input id="cs-min-days" type="number" value={form.minTradingDays}
                onChange={e => set('minTradingDays', e.target.value)} placeholder="e.g. 5" />
            </div>
            <div>
              <Label htmlFor="cs-time-limit">Time Limit (days)</Label>
              <Input id="cs-time-limit" type="number" value={form.timeLimitDays}
                onChange={e => set('timeLimitDays', e.target.value)} placeholder="Blank = unlimited" />
            </div>
            <div>
              <Label htmlFor="cs-consistency">Consistency Rule (%)</Label>
              <Input id="cs-consistency" type="number" value={form.consistencyRulePct}
                onChange={e => set('consistencyRulePct', e.target.value)} placeholder="Blank = not checked" />
            </div>
          </div>
        </CardContent>
      </Card>

      {noTrades ? (
        <p className="text-sm text-muted-foreground italic py-8 text-center">
          {strategyId !== 'RAW'
            ? 'No trades match this strategy on this account — try a different one, or switch back to All Strategies.'
            : "No trades logged on this account yet — nothing to simulate."}
        </p>
      ) : !result ? (
        <p className="text-sm text-muted-foreground italic py-8 text-center">
          Fill in the rules above to see a result.
        </p>
      ) : (
        <ResultView result={result} rules={parsed!} />
      )}
    </div>
  );
}

function ResultView({ result, rules }: { result: ChallengeResult; rules: ChallengeRules }) {
  const style = STATUS_STYLE[result.status];

  let summary: string;
  if (result.status === 'passed') {
    summary = `Would have passed on ${result.resolvedDate} after ${result.tradingDaysCount} trading days, ${result.profitPct}% profit.`;
  } else if (result.status === 'failed') {
    const reason = result.failReason ? FAIL_REASON_TEXT[result.failReason] : 'broke a rule';
    summary = `Would have failed on ${result.resolvedDate} — ${reason}.`;
  } else {
    summary = `Still in progress as of your last logged trade — ${result.profitPct}% of ${rules.profitTargetPct}% target, ${result.tradingDaysCount} of ${rules.minTradingDays} minimum trading days, no rule violations yet.`;
  }

  const showConsistency = rules.consistencyRulePct != null && result.bestDayContributionPct != null;
  const consistencyWarn = showConsistency && result.bestDayContributionPct! > rules.consistencyRulePct!;

  return (
    <Card className={style.border}>
      <CardContent className="pt-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${style.badgeBg} ${style.text}`}>
            {style.label}
          </span>
          <p className="text-sm">{summary}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatBlock label="Profit Progress" value={`${result.profitPct}% of ${rules.profitTargetPct}%`} />
          <StatBlock label="Trading Days" value={`${result.tradingDaysCount} of ${rules.minTradingDays} min`} />
          <StatBlock label="Daily Loss Used" value={`${result.dailyLossUsedPct}% of limit`}
            accent={result.dailyLossUsedPct >= 100 ? 'orange' : 'none'} />
          <StatBlock label="Drawdown Used" value={`${result.drawdownUsedPct}% of limit`}
            accent={result.drawdownUsedPct >= 100 ? 'orange' : 'none'} />
          {showConsistency && (
            <StatBlock
              label="Consistency"
              value={`${result.bestDayContributionPct}% of ${rules.consistencyRulePct}% limit`}
              accent={consistencyWarn ? 'orange' : 'none'}
              sub={consistencyWarn ? 'Best day is over the limit' : undefined}
            />
          )}
        </div>

        <EquitySparkline result={result} startingBalance={rules.startingBalance} />

        <p className="text-[11px] text-muted-foreground">
          This is an approximation based on the rules you enter — confirm against your firm's actual published rules, since exact daily-reset timing, drawdown basis, and other details can vary by platform.
        </p>
      </CardContent>
    </Card>
  );
}
