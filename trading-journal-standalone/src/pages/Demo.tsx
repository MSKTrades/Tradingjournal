import { Link } from 'react-router-dom';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import RuleToggleDemo from './ui/RuleToggleDemo';

/** Public, no-login "try it live" page — a real, interactive version of
 * PipEcho's core pitch (log a trade once, dynamically test rule variations
 * against it) using a fixed sample account instead of a real one. Linked
 * from the Landing page hero and nav; not gated behind signup on purpose —
 * the whole point is to let the recalculation SELL the product before
 * anyone has to create an account. */
export default function Demo() {
  useDocumentMeta({
    title: 'Live Demo — PipEcho',
    description: 'Try PipEcho\'s dynamic rule filtering on a real sample trading journal — toggle CISD confirmation, session, and day-of-week rules and watch win rate, R, and the equity curve recalculate instantly.',
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-14 pb-4 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-primary bg-accent px-3 py-1 rounded-full mb-6">
            <MousePointerClick className="w-3.5 h-3.5" /> No signup required
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Log once. Test every rule variation.
          </h1>
          <p className="text-muted-foreground mt-4">
            This is a real sample journal — a London Reversal setup on GBPUSD, 64 trades. Toggle
            any rule below and every number recalculates on the spot, the same way it would on
            your own journal once you're logging real trades.
          </p>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <RuleToggleDemo showTable />

          <div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-6 mt-8 text-center">
            <h2 className="font-semibold">This is exactly what your own journal does</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
              No more "7 different Excel tabs" for every rule variation you want to test — log a
              trade once in PipEcho, and try as many rule combinations as you want, on demand.
            </p>
            <Link to="/signup" className="inline-block mt-5">
              <Button size="default" className="h-11 px-6 text-base">
                Start your own journal free <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
