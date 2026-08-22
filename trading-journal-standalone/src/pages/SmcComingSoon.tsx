import { Radar } from 'lucide-react';
import { Card, CardContent } from '../lib/ui/card';

/** Placeholder shown at /smc-analysis for anyone but the admin account -
 * same reasoning and same pattern as BacktestComingSoon.tsx: the SMC
 * Analysis feature is admin-only while it's being built/tested (see
 * SmcGate in App.tsx and api/backtest.ts's resource=smc_candles/
 * smc_markups admin gate, which is the REAL access control this matches). */
export default function SmcComingSoon() {
  return (
    <div className="max-w-lg mx-auto mt-16">
      <Card>
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Radar className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">SMC Analysis — Coming soon</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Smart Money Concepts Analysis is still being built and tested and isn't available yet.
            It'll show up here as soon as it's ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
