import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { PRO_FEATURES, ProFeatureKey, hasProAccess } from '../lib/proFeatures';
import { useAuth } from '../lib/auth';

/** Wraps a whole Pro-gated block (a Card, a row of cards, a page section).
 * While the visitor has Pro access (launch promo running, OR a real paid
 * subscription — see hasProAccess), renders `children` completely
 * untouched, same as before this component existed.
 *
 * Once access actually lapses (promo ended and no subscription), the block
 * is deliberately NOT unmounted — a Pro feature that just vanishes from the
 * dashboard the day the promo ends looks like a bug, or like something that
 * broke, not like an upsell. Instead the real content stays mounted
 * underneath (so its layout/spacing never shifts) but gets blurred and
 * made non-interactive, with a small "Upgrade to Pro" panel centered on
 * top explaining what's under the blur and linking straight to Billing.
 *
 * This only ever changes what happens once isPromoActive() goes false —
 * every day between now and PROMO_END_DATE it's a no-op for every visitor,
 * Free or Pro, same as ProBadge/ProNotice already are. */
export default function ProLocked({ feature, children }: { feature: ProFeatureKey; children: React.ReactNode }) {
  const { user } = useAuth();
  if (hasProAccess(user?.plan)) return <>{children}</>;

  const { message } = PRO_FEATURES[feature];
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-50" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-xs rounded-lg border border-primary/30 bg-card/95 backdrop-blur px-5 py-4 text-center shadow-lg">
          <Lock className="w-5 h-5 text-primary mx-auto mb-2" />
          <p className="text-sm font-semibold">Pro feature</p>
          <p className="text-xs text-muted-foreground mt-1">{message}</p>
          <Link
            to="/billing"
            className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </div>
      </div>
    </div>
  );
}
