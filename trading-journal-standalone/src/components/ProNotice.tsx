import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { PRO_FEATURES, ProFeatureKey, PROMO_END_LABEL, hasProAccess, isPromoActive } from '../lib/proFeatures';
import { useAuth } from '../lib/auth';

/** Inline note for the couple of spots that would normally be a hard
 * Free-plan limit (adding a 2nd trading account, a 2nd strategy
 * playbook). It never blocks the action — see proFeatures.ts — this is
 * purely "heads up, this is normally a Pro feature." Renders nothing for
 * someone with no access at all right now (promo lapsed, no subscription —
 * there's no real access to explain away). A real Pro subscriber sees a
 * plain "this is included in your plan" version instead of the promo
 * copy, since they're not relying on the promo for it. */
export default function ProNotice({ feature, className = '' }: { feature: ProFeatureKey; className?: string }) {
  const { user } = useAuth();
  const { message } = PRO_FEATURES[feature];
  if (!hasProAccess(user?.plan)) return null;
  const onRealPlan = user?.plan === 'pro';
  return (
    <div className={`flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/90 ${className}`}>
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <span>
        {onRealPlan && !isPromoActive() ? (
          <>{message} Included in your Pro plan.</>
        ) : (
          <>
            {message} It's free for every account through <span className="font-medium">{PROMO_END_LABEL}</span> as
            part of our launch promo — nothing to do here.{' '}
            <Link to="/pricing" className="underline hover:text-primary">See plans</Link>
          </>
        )}
      </span>
    </div>
  );
}
