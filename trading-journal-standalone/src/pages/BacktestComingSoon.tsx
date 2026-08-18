import { History } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';

/** Placeholder shown at /backtest while the real Chart Replay & Backtesting
 * workspace is on hold pending the TradingView Advanced Charts library
 * approval. Keeps the nav tab visible (so the feature isn't a surprise once
 * it ships) but the route itself never renders the real Backtest page —
 * this stands in for it regardless of how someone arrives here (sidebar
 * click or a direct /backtest link), matching the sidebar tab being
 * disabled in Layout.tsx. */
export default function BacktestComingSoon() {
  return (
    <div className="max-w-lg mx-auto mt-16">
      <Card>
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <History className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Backtest — Coming soon</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Chart Replay &amp; Backtesting is being rebuilt on a proper charting library
            and isn't available yet. It'll show up here as soon as it's ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
