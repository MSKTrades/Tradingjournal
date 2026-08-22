import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, Save, Trash2, Crosshair, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';
import { Button } from '../lib/ui/button';
import { Select, Input, Label, Textarea, Badge } from '../lib/ui/form';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../lib/ui/tabs';
import { api, useFetch } from '../lib/api';
import { COMMON_PAIRS } from './data/types';
import {
  SMC_TIMEFRAMES, SMC_TIMEFRAME_LABELS, SmcTimeframe, Candle, MultiTfAnalysis,
  Direction, StrategyModelKey, SmcMarkup, StrategyEvaluation,
} from './ui/smc/types';
import { analyzeAll } from './ui/smc/marketStructure';
import { STRATEGY_MODEL_NAMES, STRATEGY_MODEL_ENTRY_TF } from './ui/smc/strategyModels';
import { gradeMarkup } from './ui/smc/markupGrading';
import SmcChart from './ui/smc/SmcChart';
import StrategyPanel from './ui/smc/StrategyPanel';
import RuleChecklist from './ui/smc/RuleChecklist';
import ChartMarkupPanel from './ui/smc/ChartMarkupPanel';
import MultiTfSummaryTable from './ui/smc/MultiTfSummaryTable';

const DEFAULT_PAIR = 'GBPUSD';

const POSITION_STYLE: Record<string, string> = {
  premium: 'bg-red-500/15 text-red-600 dark:text-red-400',
  discount: 'bg-green-500/15 text-green-600 dark:text-green-400',
  equilibrium: 'bg-muted text-muted-foreground',
};

type ArmField = 'entry' | 'sl' | 'tp' | null;

function StructureSummary({ tf, bundle }: { tf: SmcTimeframe; bundle: MultiTfAnalysis }) {
  const a = bundle[tf];
  if (!a || a.candles.length === 0) {
    return <p className="text-xs text-muted-foreground">No candle data loaded for {SMC_TIMEFRAME_LABELS[tf]} yet.</p>;
  }
  const unmitigatedObs = a.orderBlocks.filter(o => !o.mitigated);
  const openFvgs = a.fvgs.filter(f => !f.filled);
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={a.trend === 'bullish' ? 'default' : 'secondary'} className={a.trend === 'bullish' ? 'bg-green-600 text-white' : a.trend === 'bearish' ? 'bg-red-600 text-white' : ''}>
          {a.trend === 'unknown' ? 'Trend: forming' : `Trend: ${a.trend === 'bullish' ? 'Bullish' : 'Bearish'}`}
        </Badge>
        {a.position && <Badge className={POSITION_STYLE[a.position]}>{a.position === 'equilibrium' ? 'At Equilibrium' : a.position === 'premium' ? 'Premium' : 'Discount'}</Badge>}
      </div>
      {a.range && (
        <p>Active range: <span className="font-mono">{a.range.low.toFixed(5)}</span> – <span className="font-mono">{a.range.high.toFixed(5)}</span>, EQ <span className="font-mono">{a.range.eq.toFixed(5)}</span></p>
      )}
      <p>{unmitigatedObs.length} unmitigated Order Block{unmitigatedObs.length === 1 ? '' : 's'}, {openFvgs.length} open FVG{openFvgs.length === 1 ? '' : 's'}</p>
      <p>{a.liquidity.eqHighs.filter(l => !l.swept).length} unswept EQH pool(s), {a.liquidity.eqLows.filter(l => !l.swept).length} unswept EQL pool(s)</p>
      <p className="text-muted-foreground">Last close: <span className="font-mono">{a.lastClose?.toFixed(5) ?? '—'}</span></p>
    </div>
  );
}

export default function SmcAnalysis() {
  const [pair, setPair] = useState(DEFAULT_PAIR);
  const [pairInput, setPairInput] = useState(DEFAULT_PAIR);
  const [rawCandles, setRawCandles] = useState<Partial<Record<SmcTimeframe, Candle[]>> | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-timeframe fetch errors (e.g. one TF still hitting a Dukascopy 429
  // after retries) - the request as a whole no longer throws for this, so
  // these render as a small notice on just that TF's tab instead of the
  // page-wide error banner above.
  const [candleErrors, setCandleErrors] = useState<Record<string, string>>({});
  const [activeTf, setActiveTf] = useState<SmcTimeframe>('15m');
  const tabsRef = useRef<HTMLDivElement>(null);

  const [markupDirection, setMarkupDirection] = useState<Direction>('bullish');
  const [markupModel, setMarkupModel] = useState<StrategyModelKey>('pro_trend_m15_m1');
  const [markupTf, setMarkupTf] = useState<SmcTimeframe>('15m');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [notes, setNotes] = useState('');
  const [armField, setArmField] = useState<ArmField>(null);
  const [gradeResult, setGradeResult] = useState<StrategyEvaluation | null>(null);
  const [saving, setSaving] = useState(false);
  // On by default (the full auto-read is the point of this page), but
  // "View this setup on chart" below switches it off so that one trade idea
  // isn't buried under every other detected Order Block/FVG - the trader can
  // always flip it back on with the toggle above the chart.
  const [showZones, setShowZones] = useState(true);

  const { data: rawMarkups, refetch: refetchMarkups } = useFetch<SmcMarkup[]>(`/backtest?resource=smc_markups&pair=${encodeURIComponent(pair)}`);
  const markups = rawMarkups ?? [];

  async function loadCandles(p: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/backtest?resource=smc_candles&pair=${encodeURIComponent(p)}`);
      setRawCandles(data.timeframes);
      setFetchedAt(data.fetchedAt);
      setCandleErrors(data.errors ?? {});
    } catch (e: any) {
      setError(e.message ?? 'Failed to load candle data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCandles(pair); }, [pair]);

  const bundle: MultiTfAnalysis = useMemo(() => analyzeAll(pair, rawCandles ?? {}), [pair, rawCandles]);

  function handlePairSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = pairInput.trim().toUpperCase();
    if (!next) return;
    setPair(next);
    setGradeResult(null);
  }

  // Arming a "pick from chart" field also jumps the active tab to the
  // markup's own timeframe - without this, clicking the crosshair button
  // while looking at a DIFFERENT timeframe tab arms a field but the visible
  // chart never receives armField (SmcChart only gets it when
  // markupTf === the tab being rendered), so clicks silently do nothing.
  // This was caught by an end-to-end test that stayed on one tab while the
  // markup timeframe defaulted to another.
  function toggleArm(field: ArmField) {
    setArmField(prev => (prev === field ? null : field));
    if (field) setActiveTf(markupTf);
  }

  function handleChartPriceClick(price: number) {
    if (armField === 'entry') setEntry(price.toFixed(5));
    else if (armField === 'sl') setSl(price.toFixed(5));
    else if (armField === 'tp') setTp(price.toFixed(5));
    setArmField(null);
  }

  // "View this setup on chart" (from a valid strategy-model card below) -
  // jumps to the timeframe that model's entry zone actually lives on (see
  // STRATEGY_MODEL_ENTRY_TF) and loads this exact setup's direction/entry/
  // SL/TP into the markup form, so the chart shows only this one trade
  // idea's lines rather than whatever was previously typed in. Any earlier
  // grade result is cleared since it belonged to a different markup.
  function handleViewSetup(ev: StrategyEvaluation) {
    if (!ev.setup) return;
    const tf = STRATEGY_MODEL_ENTRY_TF[ev.modelKey];
    setActiveTf(tf);
    setMarkupTf(tf);
    setMarkupModel(ev.modelKey);
    setMarkupDirection(ev.setup.direction);
    setEntry(ev.setup.entry.toFixed(5));
    setSl(ev.setup.sl.toFixed(5));
    setTp(ev.setup.tp.toFixed(5));
    setArmField(null);
    setGradeResult(null);
    setShowZones(false);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildMarkupInput() {
    const e = Number(entry), s = Number(sl), t = Number(tp);
    if (!entry.trim() || !sl.trim() || !tp.trim() || isNaN(e) || isNaN(s) || isNaN(t)) return null;
    return { model_key: markupModel, timeframe: markupTf, direction: markupDirection, entry_price: e, sl_price: s, tp_price: t, entry_time: null as string | null };
  }

  function handleGrade() {
    const input = buildMarkupInput();
    if (!input) { setError('Enter Entry, SL, and TP before grading.'); return; }
    setError(null);
    setGradeResult(gradeMarkup(bundle, input));
  }

  async function handleSaveMarkup() {
    const input = buildMarkupInput();
    if (!input) { setError('Enter Entry, SL, and TP before saving.'); return; }
    setSaving(true);
    setError(null);
    try {
      const graded = gradeMarkup(bundle, input);
      setGradeResult(graded);
      await api.post('/backtest', {
        resource: 'smc_markups', pair, timeframe: input.timeframe, model_key: input.model_key,
        direction: input.direction, entry_price: input.entry_price, sl_price: input.sl_price, tp_price: input.tp_price,
        entry_time: null, points: [], notes, grade: graded,
      });
      refetchMarkups();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save markup.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMarkup(id: number | string) {
    await api.del(`/backtest?resource=smc_markups&id=${id}`);
    refetchMarkups();
  }

  const activeAnalysis = bundle[activeTf];

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Smart Money Concepts Analysis</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live structure, liquidity, Order Blocks and FVGs across 7 timeframes — read against Lewis Kelly's
            market-structure-hierarchy / PD-array framework. Second opinion only — see the note at the bottom before acting on anything here.
          </p>
        </div>
        <form onSubmit={handlePairSubmit} className="flex items-center gap-2">
          <Input list="smc-pairs" value={pairInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPairInput(e.target.value)} className="w-32 uppercase" placeholder="GBPUSD" />
          <datalist id="smc-pairs">{COMMON_PAIRS.map(p => <option key={p} value={p} />)}</datalist>
          <Button type="submit" size="sm" variant="outline">Load</Button>
          <Button type="button" size="sm" onClick={() => loadCandles(pair)} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Refresh
          </Button>
        </form>
      </div>

      {fetchedAt && <p className="text-[11px] text-muted-foreground mb-2">Candles last fetched {new Date(fetchedAt).toLocaleString()} for {pair}.</p>}
      {error && <Card className="mb-4"><CardContent className="pt-4 pb-4 text-sm text-destructive">{error}</CardContent></Card>}

      <div className="mb-4">
        <MultiTfSummaryTable bundle={bundle} activeTf={activeTf} onSelect={setActiveTf} />
      </div>

      <div ref={tabsRef} />
      <Tabs value={activeTf} onValueChange={(v: string) => setActiveTf(v as SmcTimeframe)}>
        <TabsList>
          {SMC_TIMEFRAMES.map(tf => <TabsTrigger key={tf} value={tf}>{SMC_TIMEFRAME_LABELS[tf]}</TabsTrigger>)}
        </TabsList>
        {SMC_TIMEFRAMES.map(tf => (
          <TabsContent key={tf} value={tf}>
            {bundle[tf] && bundle[tf]!.candles.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
                <Card><CardContent className="pt-4 pb-2">
                  <div className="flex items-center justify-end mb-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowZones(v => !v)}>
                      {showZones
                        ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Hide zones</>
                        : <><Eye className="w-3.5 h-3.5 mr-1" /> Show zones</>}
                    </Button>
                  </div>
                  <SmcChart
                    key={tf}
                    tf={tf}
                    analysis={bundle[tf]!}
                    markup={{ entry: markupTf === tf ? Number(entry) || null : null, sl: markupTf === tf ? Number(sl) || null : null, tp: markupTf === tf ? Number(tp) || null : null, direction: markupDirection }}
                    armField={markupTf === tf ? armField : null}
                    onChartPriceClick={handleChartPriceClick}
                    showZones={showZones}
                  />
                </CardContent></Card>
                <Card><CardContent className="pt-4 pb-4">
                  <p className="text-sm font-semibold mb-3">{SMC_TIMEFRAME_LABELS[tf]} Structure</p>
                  <StructureSummary tf={tf} bundle={bundle} />
                </CardContent></Card>
              </div>
            ) : (
              <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                {loading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading {SMC_TIMEFRAME_LABELS[tf]} candles…</span>
                ) : candleErrors[tf] ? (
                  <>
                    <span>{SMC_TIMEFRAME_LABELS[tf]} data is temporarily unavailable — Dukascopy's feed rate-limited this timeframe.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => loadCandles(pair)} disabled={loading}>Try refreshing</Button>
                  </>
                ) : (
                  `No ${SMC_TIMEFRAME_LABELS[tf]} data yet.`
                )}
              </CardContent></Card>
            )}
            <div className="mt-4">
              <ChartMarkupPanel pair={pair} tf={tf} analysis={bundle[tf]} />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-6">
        <h2 className="text-sm font-bold mb-3">Strategy Models — live scan</h2>
        <StrategyPanel bundle={bundle} onViewSetup={handleViewSetup} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-col gap-3">
            <p className="text-sm font-semibold">Grade Your Own Markup</p>
            <p className="text-xs text-muted-foreground">
              Mark up your own entry/SL/TP idea and check it against one of the six models' exact rules — you'll see precisely which rules it does and doesn't satisfy.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Direction</Label>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant={markupDirection === 'bullish' ? 'default' : 'outline'} onClick={() => setMarkupDirection('bullish')} className="flex-1">Long</Button>
                  <Button type="button" size="sm" variant={markupDirection === 'bearish' ? 'default' : 'outline'} onClick={() => setMarkupDirection('bearish')} className="flex-1">Short</Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Timeframe</Label>
                <Select value={markupTf} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setMarkupTf(e.target.value as SmcTimeframe); setActiveTf(e.target.value as SmcTimeframe); }}>
                  {SMC_TIMEFRAMES.map(tf => <option key={tf} value={tf}>{SMC_TIMEFRAME_LABELS[tf]}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Strategy Model</Label>
              <Select value={markupModel} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMarkupModel(e.target.value as StrategyModelKey)}>
                {Object.entries(STRATEGY_MODEL_NAMES).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Entry</Label>
                <div className="flex gap-1">
                  <Input value={entry} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEntry(e.target.value)} className="text-xs" />
                  <Button type="button" size="icon" variant={armField === 'entry' ? 'default' : 'outline'} onClick={() => toggleArm('entry')} title="Pick from chart"><Crosshair className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">SL</Label>
                <div className="flex gap-1">
                  <Input value={sl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSl(e.target.value)} className="text-xs" />
                  <Button type="button" size="icon" variant={armField === 'sl' ? 'default' : 'outline'} onClick={() => toggleArm('sl')} title="Pick from chart"><Crosshair className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">TP</Label>
                <div className="flex gap-1">
                  <Input value={tp} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTp(e.target.value)} className="text-xs" />
                  <Button type="button" size="icon" variant={armField === 'tp' ? 'default' : 'outline'} onClick={() => toggleArm('tp')} title="Pick from chart"><Crosshair className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
            <Textarea value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder="Why this setup? (optional)" className="text-xs" rows={2} />
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleGrade} className="flex-1">Grade Markup</Button>
              <Button type="button" size="sm" onClick={handleSaveMarkup} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />} Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Switch to the {SMC_TIMEFRAME_LABELS[markupTf]} tab above to see your Entry/SL/TP lines drawn on that chart.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-semibold mb-3">Grade Result</p>
            {gradeResult ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Badge className={gradeResult.status === 'valid' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : gradeResult.status === 'invalid' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}>
                    {gradeResult.status === 'valid' ? 'Fits the model' : gradeResult.status === 'invalid' ? 'Does not fit' : 'Partially confirmed'}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{gradeResult.summary}</p>
                </div>
                <RuleChecklist rules={gradeResult.rules} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Fill in Entry/SL/TP and click Grade Markup to see feedback here.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {markups.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold mb-3">Saved Markups — {pair}</h2>
          <div className="flex flex-col gap-2">
            {markups.map(m => (
              <Card key={m.id}>
                <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                    <span className="font-medium">{SMC_TIMEFRAME_LABELS[m.timeframe]} · {m.direction === 'bullish' ? 'Long' : 'Short'}</span>
                    <span>{m.model_key ? STRATEGY_MODEL_NAMES[m.model_key] : 'No model'}</span>
                    <span className="font-mono">E {Number(m.entry_price).toFixed(5)} / SL {Number(m.sl_price).toFixed(5)} / TP {Number(m.tp_price).toFixed(5)}</span>
                    {m.grade && (
                      <Badge className={m.grade.status === 'valid' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : m.grade.status === 'invalid' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}>
                        {m.grade.status}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteMarkup(m.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardContent className="pt-4 pb-4 text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">This is a second opinion, not a signal.</span> Swing detection, structure/BOS/CHoCH
          labeling, Order Block and FVG marking, and every rule in the six models above are one specific, documented
          reading of Smart Money Concepts — not a guarantee of what actually happens next. Always check the read
          against your own analysis before risking real capital, especially on a funded/prop-firm account.
        </CardContent>
      </Card>
    </div>
  );
}
