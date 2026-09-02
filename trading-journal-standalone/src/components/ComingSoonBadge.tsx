import { Clock3 } from 'lucide-react';

/** Small "Coming soon" pill — the marketing-side counterpart to the
 * sidebar's disabled-nav-item "Soon" tag (see Layout.tsx) and the
 * BacktestComingSoon page it links to. Used anywhere a not-yet-available
 * feature still needs to be listed (so its eventual arrival isn't a
 * surprise) without implying it can be tried today. Purely presentational,
 * same spirit as ProBadge — it doesn't gate anything itself, the actual
 * gate is the /backtest route rendering BacktestComingSoon instead of the
 * real page (see App.tsx). */
export default function ComingSoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Still being built — not available in the app yet."
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0 ${className}`}
    >
      <Clock3 className="w-2.5 h-2.5" />
      Coming soon
    </span>
  );
}
