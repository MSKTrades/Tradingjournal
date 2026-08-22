import { Card, CardContent } from '../../../lib/ui/card';
import { Badge } from '../../../lib/ui/form';
import { SMC_TIMEFRAMES, SMC_TIMEFRAME_LABELS, SmcTimeframe, MultiTfAnalysis } from './types';

// Same trend/position badge styling StructureSummary uses per-tab in
// SmcAnalysis.tsx - kept in sync here on purpose so this at-a-glance table
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
};

// Quick multi-timeframe bias check: trend + Premium/Discount/Equilibrium
// position for every timeframe at once, so you can see at a glance whether
// the higher timeframes and the timeframe you're about to trade actually
// agree before digging into any one tab. Clicking a row jumps straight to
// that timeframe's tab below.
export default function MultiTfSummaryTable({ bundle, activeTf, onSelect }: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left font-medium text-muted-foreground py-2 px-3">Timeframe</th>
              <th className="text-left font-medium text-muted-foreground py-2 px-3">Trend</th>
              <th className="text-left font-medium text-muted-foreground py-2 px-3">Position</th>
            </tr>
          </thead>
          <tbody>
            {SMC_TIMEFRAMES.map(tf => {
              const a = bundle[tf];
              const hasData = !!a && a.candles.length > 0;
              return (
                <tr
                  key={tf}
                  onClick={() => onSelect(tf)}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${tf === activeTf ? 'bg-muted/30' : ''}`}
                >
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{SMC_TIMEFRAME_LABELS[tf]}</td>
                  <td className="py-2 px-3">
                    {hasData ? (
                      <Badge className={a!.trend === 'bullish' ? 'bg-green-600 text-white' : a!.trend === 'bearish' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}>
                        {a!.trend === 'unknown' ? 'Forming' : a!.trend === 'bullish' ? 'Bullish' : 'Bearish'}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {hasData && a!.position ? (
                      <Badge className={POSITION_STYLE[a!.position]}>
                        {a!.position === 'equilibrium' ? 'Equilibrium' : a!.position === 'premium' ? 'Premium' : 'Discount'}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
