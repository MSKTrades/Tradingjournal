import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../../lib/ui/card';
import { Badge } from '../../../lib/ui/form';
import { SMC_TIMEFRAMES, SMC_TIMEFRAME_LABELS, SmcTimeframe, MultiTfAnalysis } from './types';

// Same trend/position badge styling StructureSummary uses per-tab in
// SmcAnalysis.tsx - kept in sync here on purpose so this at-a-glance strip
// and the detailed per-tab view never disagree visually for the same state.
const POSITION_STYLE: Record<string, string> = {
  premium: 'bg-red-500/15 text-red-600 dark:text-red-400',
  discount: 'bg-green-500/15 text-green-600 dark:text-green-400',
  equilibrium: 'bg-muted text-muted-foreground',
};

type Props = {
  bundle: MultiTfAnalysis;
  activeTf: SmcTimeframe;
  onSelect: (tf: SmcTimeframe) => void;
  // Both optional so this component still works with just a finished
  // bundle and no in-flight fetch to describe (e.g. if it's ever reused
  // somewhere that already has all its data). When set, a timeframe with no
  // data yet shows a spinner instead of a flat "No data" IF the overall
  // fetch is still running and this specific timeframe hasn't already come
  // back with an error - once SmcAnalysis.tsx's per-timeframe fetch loop
  // (see loadCandles) reaches and resolves this timeframe, it's no longer
  // "pending" even while later timeframes in the loop are still loading.
  loading?: boolean;
  errors?: Record<string, string>;
};

// Quick multi-timeframe bias check: trend + Premium/Discount/Equilibrium
// position for every timeframe at once, laid out as one horizontal strip of
// chips rather than a tall narrow table - a vertical row-per-timeframe table
// left most of the page empty around a small box in the corner; this fills
// the same width the header/tabs already use, so no space goes to waste.
// Clicking a chip jumps straight to that timeframe's tab below.
export default function MultiTfSummaryTable({ bundle, activeTf, onSelect, loading = false, errors = {} }: Props) {
  return (
    <Card>
      <CardContent className="p-2">
        <div className="flex items-stretch gap-1.5 overflow-x-auto">
          {SMC_TIMEFRAMES.map(tf => {
            const a = bundle[tf];
            const hasData = !!a && a.candles.length > 0;
            const pending = !hasData && loading && !errors[tf];
            return (
              <button
                key={tf}
                type="button"
                onClick={() => onSelect(tf)}
                className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 min-w-[90px] flex-1 border transition-colors ${tf === activeTf ? 'bg-muted/50 border-border' : 'border-transparent hover:bg-muted/30'}`}
              >
                <span className="text-xs font-semibold">{SMC_TIMEFRAME_LABELS[tf]}</span>
                {hasData ? (
                  <>
                    <Badge className={a!.trend === 'bullish' ? 'bg-green-600 text-white' : a!.trend === 'bearish' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}>
                      {a!.trend === 'unknown' ? 'Forming' : a!.trend === 'bullish' ? 'Bullish' : 'Bearish'}
                    </Badge>
                    {a!.position ? (
                      <Badge className={POSITION_STYLE[a!.position]}>
                        {a!.position === 'equilibrium' ? 'Equilibrium' : a!.position === 'premium' ? 'Premium' : 'Discount'}
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </>
                ) : pending ? (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
                ) : errors[tf] ? (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Unavailable</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">No data</span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
