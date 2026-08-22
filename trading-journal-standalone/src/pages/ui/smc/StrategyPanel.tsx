import { useMemo } from 'react';
import { MultiTfAnalysis } from './types';
import { evaluateAllStrategies } from './strategyModels';
import { Card, CardContent } from '../../../lib/ui/card';
import { Badge } from '../../../lib/ui/form';
import RuleChecklist from './RuleChecklist';

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
export default function StrategyPanel({ bundle }: { bundle: MultiTfAnalysis }) {
  const evaluations = useMemo(() => evaluateAllStrategies(bundle), [bundle]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {evaluations.map(ev => (
        <Card key={ev.modelKey}>
          <CardContent className="pt-4 pb-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{ev.modelName}</p>
              <Badge className={STATUS_STYLE[ev.status]}>{STATUS_LABEL[ev.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{ev.summary}</p>
            {ev.setup && (
              <div className="grid grid-cols-4 gap-2 bg-muted/40 rounded-md p-2 text-xs">
                <div><p className="text-muted-foreground">Dir</p><p className="font-mono font-medium">{ev.setup.direction === 'bullish' ? 'Long' : 'Short'}</p></div>
                <div><p className="text-muted-foreground">Entry</p><p className="font-mono font-medium">{ev.setup.entry.toFixed(5)}</p></div>
                <div><p className="text-muted-foreground">SL</p><p className="font-mono font-medium">{ev.setup.sl.toFixed(5)}</p></div>
                <div><p className="text-muted-foreground">TP</p><p className="font-mono font-medium">{ev.setup.tp.toFixed(5)}</p></div>
              </div>
            )}
            <RuleChecklist rules={ev.rules} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
