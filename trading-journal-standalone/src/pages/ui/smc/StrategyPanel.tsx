import { useMemo, useState } from 'react';
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { MultiTfAnalysis, StrategyEvaluation, StrategyModelKey } from './types';
import { evaluateAllStrategies } from './strategyModels';
import { STRATEGY_MODEL_INFO } from './strategyInfo';
import { Card, CardContent } from '../../../lib/ui/card';
import { Badge } from '../../../lib/ui/form';
import RuleChecklist from './RuleChecklist';
import StrategyDiagram from './StrategyDiagram';

const STATUS_STYLE: Record<string, string> = {
  valid: 'bg-green-500/15 text-green-600 dark:text-green-400',
  partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  invalid: 'bg-muted text-muted-foreground',
};
const STATUS_LABEL: Record<string, string> = { valid: 'Setup Valid', partial: 'Forming', invalid: 'Not Valid' };

// Live dashboard of all six strategy models evaluated against the current
// multi-timeframe bundle - runs on every render (cheap: the rule engines
// are plain array scans over already-analyzed structures, not re-detecting
// anything), so it always reflects whatever timeframe/candle data is
// currently loaded.
//
// Cards are collapsed by default and stacked one below the other - with six
// models each carrying a description, an example diagram and a full rule
// checklist, showing everything expanded at once (the old 2-column grid)
// was a wall of text before you'd even glanced at which ones were actually
// close to triggering. Collapsed, the list is just six rows of "name +
// status" - open whichever one you actually want to read right now.
type Props = {
  bundle: MultiTfAnalysis;
  // Called when the trader clicks "View on chart" on a valid setup - the
  // parent (SmcAnalysis.tsx) jumps to that model's execution timeframe and
  // pre-fills the markup form with exactly this setup's direction/entry/SL/
  // TP, so the chart shows this one trade idea's lines and nothing else.
  onViewSetup?: (ev: StrategyEvaluation) => void;
};

export default function StrategyPanel({ bundle, onViewSetup }: Props) {
  const evaluations = useMemo(() => evaluateAllStrategies(bundle), [bundle]);
  const [open, setOpen] = useState<Set<StrategyModelKey>>(new Set());

  function toggle(key: StrategyModelKey) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {evaluations.map(ev => {
        const isOpen = open.has(ev.modelKey);
        const info = STRATEGY_MODEL_INFO[ev.modelKey];
        return (
          <Card key={ev.modelKey}>
            <button
              type="button"
              onClick={() => toggle(ev.modelKey)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2 min-w-0">
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                <span className="text-sm font-semibold truncate">{ev.modelName}</span>
              </span>
              <Badge className={`shrink-0 ${STATUS_STYLE[ev.status]}`}>{STATUS_LABEL[ev.status]}</Badge>
            </button>
            {isOpen && (
              <CardContent className="pt-0 pb-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">{info.whatItDoes}</p>
                  <p className="text-[11px] font-medium text-muted-foreground/80">Timeframe: {info.timeframeNote}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2">
                  <StrategyDiagram spec={info.diagram} />
                  <p className="text-[10px] text-muted-foreground/70 text-center mt-1">Illustrative long example — not live data. Works symmetrically for shorts.</p>
                </div>
                <p className="text-xs text-muted-foreground">{ev.summary}</p>
                {ev.setup && (
                  <div className="bg-muted/40 rounded-md p-2 text-xs flex flex-col gap-2">
                    <div className="grid grid-cols-4 gap-2">
                      <div><p className="text-muted-foreground">Dir</p><p className="font-mono font-medium">{ev.setup.direction === 'bullish' ? 'Long' : 'Short'}</p></div>
                      <div><p className="text-muted-foreground">Entry</p><p className="font-mono font-medium">{ev.setup.entry.toFixed(5)}</p></div>
                      <div><p className="text-muted-foreground">SL</p><p className="font-mono font-medium">{ev.setup.sl.toFixed(5)}</p></div>
                      <div><p className="text-muted-foreground">TP</p><p className="font-mono font-medium">{ev.setup.tp.toFixed(5)}</p></div>
                    </div>
                    {onViewSetup && (
                      <button
                        type="button"
                        onClick={() => onViewSetup(ev)}
                        className="self-start flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> View this setup on chart
                      </button>
                    )}
                  </div>
                )}
                <RuleChecklist rules={ev.rules} />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
