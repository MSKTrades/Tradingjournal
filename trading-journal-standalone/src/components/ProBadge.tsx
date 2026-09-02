import { Sparkles } from 'lucide-react';
import { PRO_FEATURES, ProFeatureKey, PROMO_END_LABEL, isPromoActive } from '../lib/proFeatures';
import { useAuth } from '../lib/auth';

/** Small "Pro" pill for labeling a Pro-tier feature wherever it actually
 * lives in the app (a card title, a button, a section header) — visible
 * by design, not a way to hide anything. Hovering explains what the
 * feature is and, while the launch promo is running, that it's free for
 * everyone right now regardless of plan; a real paying Pro subscriber
 * (outside the promo, or on it too — either way the badge doesn't need to
 * mention a promo they're not relying on) just gets the plain feature
 * description. Purely presentational: it never blocks anything itself, it
 * just tells the reader what this feature normally costs. */
export default function ProBadge({ feature, className = '' }: { feature: ProFeatureKey; className?: string }) {
  const { user } = useAuth();
  const { message } = PRO_FEATURES[feature];
  const title = isPromoActive() && user?.plan !== 'pro'
    ? `${message} Free for every account through ${PROMO_END_LABEL} as part of our launch promo.`
    : message;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary shrink-0 ${className}`}
    >
      <Sparkles className="w-2.5 h-2.5" />
      Pro
    </span>
  );
}
