// One small, genuinely interactive widget per feature that doesn't already
// have a real product screenshot (Trade Journal/Performance Analytics/
// Strategy Playbooks use the real screenshots already taken for the
// Landing page - see FeatureDetail.tsx). These aren't screenshots or
// static illustrations - every one of them responds to a click, a drag, or
// a toggle, using the same visual language (cards, the dark-orange breach
// convention from RiskGuardrail.tsx, the same badge/pill shapes) as the
// real app, so a feature page reads as "this is what it feels like to use"
// rather than a picture of it. Sample numbers only - nothing here reads
// from or writes to any account.
import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, ChevronLeft, ChevronRight, Plus, Copy, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '../../lib/ui/button';
import { Switch, Input, Select } from '../../lib/ui/form';

const CARD = 'rounded-xl border border-border bg-card p-6';

// --- Pre-Trade Checklists ------------------------------------------------
const CHECKLIST_ITEMS = [
  'Confirmed BOS on the 15m before entry',
  'Asia session liquidity swept',
  'Risking 1% or less',
  'Checked the economic calendar for red-folder news',
];
export function ChecklistVisual() {
  const [checked, setChecked] = useState<boolean[]>([true, true, false, true]);
  const rate = Math.round((checked.filter(Boolean).length / checked.length) * 100);
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">London Reversal Pre-Trade</p>
        <span className={`text-sm font-bold tabular-nums ${rate === 100 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
          {rate}% followed
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {CHECKLIST_ITEMS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setChecked(c => c.map((v, idx) => idx === i ? !v : v))}
            className="flex items-center gap-3 text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors"
          >
            <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${checked[i] ? 'bg-primary border-primary' : 'border-border'}`}>
              {checked[i] && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
            </span>
            <span className={`text-sm ${checked[i] ? '' : 'text-muted-foreground'}`}>{label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">Click a rule to toggle it — this is exactly how grading a trade against a checklist feels in the app.</p>
    </div>
  );
}

// --- Risk Guardrail -------------------------------------------------------
function guardrailColor(pct: number) {
  if (pct >= 100) return { bar: 'bg-orange-700', text: 'text-orange-700 dark:text-orange-400' };
  if (pct >= 75) return { bar: 'bg-orange-500', text: 'text-orange-500' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
  return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}
export function RiskGuardrailVisual() {
  const [pct, setPct] = useState(62);
  const { bar, text } = guardrailColor(pct);
  const breached = pct >= 100;
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">Daily Loss — $10,000 account, 5% limit</p>
        <span className={`text-sm font-mono font-semibold ${text}`}>{pct}% used</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mt-2">
        <div className={`h-full ${bar} transition-[width] duration-200`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <input
        type="range" min={0} max={130} value={pct}
        onChange={e => setPct(Number(e.target.value))}
        className="w-full mt-4 accent-primary"
        aria-label="Simulate today's loss used"
      />
      <p className="text-xs text-muted-foreground mt-1">Drag to simulate today's loss — watch it change color as it climbs.</p>
      {breached && (
        <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mt-3 rounded-md bg-orange-700/10 px-3 py-2">
          Limit reached. This is a warning only — PipEcho never blocks a trade — but it's exactly the kind of thing
          that's easy to lose track of in the middle of a live session.
        </p>
      )}
    </div>
  );
}

// --- MT4/MT5 Auto-Sync -----------------------------------------------------
const SYNC_TRADES = [
  { pair: 'GBPUSD', pl: '+$214.30' },
  { pair: 'EURUSD', pl: '-$86.10' },
  { pair: 'GBPUSD', pl: '+$341.80' },
];
export function SyncVisual() {
  const [step, setStep] = useState(0); // 0 = idle, 1..3 = revealing trades, 4 = done
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setStep(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setStep(s => {
        if (s >= SYNC_TRADES.length + 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return s;
        }
        return s + 1;
      });
    }, 550);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const syncing = step > 0 && step <= SYNC_TRADES.length;
  const done = step > SYNC_TRADES.length;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">MT5 · FTMO-Demo-84213</p>
        <Button size="sm" variant="outline" onClick={start} disabled={syncing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {step === 0 ? 'Sync now' : syncing ? 'Syncing…' : 'Sync again'}
        </Button>
      </div>
      <div className="flex flex-col gap-2 min-h-[92px]">
        {step === 0 && <p className="text-sm text-muted-foreground">Click "Sync now" to see closed trades pull in automatically.</p>}
        {SYNC_TRADES.map((t, i) => (
          <div
            key={i}
            className={`flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-opacity duration-300 ${step > i ? 'opacity-100' : 'opacity-0'}`}
          >
            <span>{t.pair}</span>
            <span className={t.pl.startsWith('+') ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>{t.pl}</span>
          </div>
        ))}
        {done && <p className="text-xs text-green-600 dark:text-green-400 font-medium">3 new trades imported — nothing typed by hand.</p>}
      </div>
    </div>
  );
}

// --- Prop Firm Ledger & Challenge Simulator -------------------------------
type LedgerRow = { type: 'Fee' | 'Payout'; amount: number; note: string };
export function LedgerVisual() {
  const [rows, setRows] = useState<LedgerRow[]>([
    { type: 'Fee', amount: 99, note: 'Phase 1 challenge fee' },
    { type: 'Payout', amount: 850, note: 'First profit split' },
  ]);
  const [type, setType] = useState<'Fee' | 'Payout'>('Fee');
  const [amount, setAmount] = useState('');
  const net = rows.reduce((s, r) => s + (r.type === 'Payout' ? r.amount : -r.amount), 0);

  function addRow() {
    const amt = Number(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) return;
    setRows(r => [...r, { type, amount: amt, note: type === 'Fee' ? 'Manual entry' : 'Manual entry' }]);
    setAmount('');
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">Prop Firm Ledger</p>
        <span className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          Net {net >= 0 ? '+' : ''}${net.toLocaleString()}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm rounded-md border border-border px-3 py-1.5">
            <span className="text-muted-foreground">{r.note} <span className="text-xs">({r.type})</span></span>
            <span className={r.type === 'Payout' ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>
              {r.type === 'Payout' ? '+' : '-'}${r.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Select value={type} onChange={e => setType(e.target.value as 'Fee' | 'Payout')} className="w-28 text-xs shrink-0">
          <option value="Fee">Fee</option>
          <option value="Payout">Payout</option>
        </Select>
        <Input value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)} placeholder="Amount" className="flex-1 text-xs" />
        <Button size="sm" onClick={addRow}><Plus className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

// --- Weekly Digest ---------------------------------------------------------
const DIGEST_WEEKS = [
  { label: 'Aug 17 – Aug 23', trades: 9, winRate: 67, totalR: '+8.4R', note: 'Your best week this month — London session trades carried it.' },
  { label: 'Aug 24 – Aug 30', trades: 5, winRate: 40, totalR: '-1.2R', note: 'Slower week — 3 of 5 losses came outside your usual session window.' },
];
export function DigestVisual() {
  const [i, setI] = useState(1);
  const week = DIGEST_WEEKS[i];
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">Weekly Digest</p>
        <div className="flex items-center gap-1">
          <button aria-label="Previous week" onClick={() => setI(v => Math.max(0, v - 1))} disabled={i === 0} className="p-1 rounded hover:bg-accent disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground w-32 text-center">{week.label}</span>
          <button aria-label="Next week" onClick={() => setI(v => Math.min(DIGEST_WEEKS.length - 1, v + 1))} disabled={i === DIGEST_WEEKS.length - 1} className="p-1 rounded hover:bg-accent disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Trades</p>
          <p className="text-lg font-bold tabular-nums">{week.trades}</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Win Rate</p>
          <p className="text-lg font-bold tabular-nums">{week.winRate}%</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total R</p>
          <p className={`text-lg font-bold tabular-nums ${week.totalR.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{week.totalR}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{week.note}</p>
    </div>
  );
}

// --- HTF Bias Alignment -----------------------------------------------------
const BIAS_ROWS = [
  { label: 'With HTF Bias', trades: 12, winRate: 64, key: 'with' },
  { label: 'Against HTF Bias', trades: 9, winRate: 50, key: 'against' },
  { label: 'Neutral / Ranging', trades: 3, winRate: 67, key: 'neutral' },
];
export function HtfBiasVisual() {
  const [showRate, setShowRate] = useState(true);
  const max = Math.max(...BIAS_ROWS.map(r => r.winRate));
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">Win rate by HTF bias alignment</p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Win %
          <Switch checked={!showRate} onCheckedChange={v => setShowRate(!v)} />
          Trade count
        </label>
      </div>
      <div className="flex flex-col gap-3">
        {BIAS_ROWS.map(r => {
          const value = showRate ? r.winRate : r.trades;
          const pct = showRate ? r.winRate : Math.round((r.trades / Math.max(...BIAS_ROWS.map(x => x.trades))) * 100);
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{showRate ? `${value}%` : value}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-4">Sample data — trading with your own HTF read outperformed trading against it by 14 points here.</p>
    </div>
  );
}

// --- Public Track Record ----------------------------------------------------
export function TrackRecordVisual() {
  const [showDollars, setShowDollars] = useState(true);
  const [copied, setCopied] = useState(false);
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">pipecho.com/track/8f3a1c…</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide bg-accent text-muted-foreground rounded px-1.5 py-0.5">Public</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">What a prop firm or investor sees — no login required.</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Win Rate</p>
          <p className="text-lg font-bold tabular-nums">58%</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Profit Factor</p>
          <p className="text-lg font-bold tabular-nums">2.14</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Total P/L</p>
          <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{showDollars ? '+$4,812' : '+34.2%'}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showDollars} onCheckedChange={setShowDollars} />
          Show dollar amounts
        </label>
        <Button size="sm" variant="outline" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          <Copy className="w-3.5 h-3.5 mr-1.5" /> {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}

// --- Custom Fields & Tags ----------------------------------------------------
const STARTER_FIELDS = ['Confirmation Candle', 'Liquidity Swept'];
export function CustomFieldsVisual() {
  const [fields, setFields] = useState<string[]>(STARTER_FIELDS);
  const [value, setValue] = useState('');
  function add() {
    const v = value.trim();
    if (!v || fields.includes(v)) return;
    setFields(f => [...f, v]);
    setValue('');
  }
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold mb-1">Add a field your strategy actually needs</p>
      <p className="text-xs text-muted-foreground mb-4">Type anything and hit Add — this is the whole process, no schema migration, no support ticket.</p>
      <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
        {fields.map(f => (
          <span key={f} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium px-3 py-1">
            {f}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') add(); }}
          placeholder="e.g. Distance from Asia High/Low"
          className="flex-1 text-sm"
        />
        <Button size="sm" onClick={add}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
      </div>
    </div>
  );
}

// --- Chart Replay & Backtesting ----------------------------------------------
// Hand-picked bar heights (not random) so the "candles" read as a plausible
// price swing rather than noise - same reasoning as Landing.tsx's
// HeroBackground bars.
const REPLAY_BARS = [40, 46, 38, 52, 60, 55, 68, 64, 74, 70, 80, 76, 88, 84, 92];
export function BacktestVisual() {
  const [revealed, setRevealed] = useState(REPLAY_BARS.length);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function play() {
    setRevealed(0);
    setPlaying(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRevealed(r => {
        if (r >= REPLAY_BARS.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPlaying(false);
          return r;
        }
        return r + 1;
      });
    }, 160);
  }
  function reset() {
    if (timerRef.current) clearInterval(timerRef.current);
    setPlaying(false);
    setRevealed(REPLAY_BARS.length);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold">GBPUSD · 15m · replay</p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={play} disabled={playing}>
            <Play className="w-3.5 h-3.5 mr-1" /> Replay
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {REPLAY_BARS.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all duration-150 ${i < revealed ? 'bg-primary/70' : 'bg-transparent'}`}
            style={{ height: i < revealed ? `${h}%` : '0%' }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">Step through real historical candles bar-by-bar and rehearse an entry before it's ever live.</p>
    </div>
  );
}
