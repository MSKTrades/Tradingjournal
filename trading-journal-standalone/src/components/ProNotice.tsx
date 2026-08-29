import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { PRO_FEATURES, ProFeatureKey, PROMO_END_LABEL, hasProAccess } from '../lib/proFeatures';

/** Inline note for the couple of spots that would normally be a hard
 * Free-plan limit (adding a 2nd trading account, a 2nd strategy
 * playbook). It never blocks the action — see proFeatures.ts — this is
 * purely "heads up, this is normally a Pro feature, but you have it free
 * right now." Renders nothing once the promo lapses and there's no real
 * access to grant, rather than showing a note that no longer makes
 * sense. */
export default function ProNotice({ feature, className = '' }: { feature: ProFeatureKey; className?: string }) {
  const { message } = PRO_FEATURES[feature];
  if (!hasProAccess()) return null;
  return (
    <div className={`flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/90 ${className}`}>
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <span>
        {message} It's free for every account through <span className="font-medium">{PROMO_END_LABEL}</span> as
        part of our launch promo — nothing to do here.{' '}
        <Link to="/pricing" className="underline hover:text-primary">See plans</Link>
      </span>
    </div>
  );
}
