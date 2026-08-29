import { PROMO_END_DATE, PROMO_END_LABEL } from './promo';

/**
 * Central registry of what's "Pro" vs "Free" in PipEcho, and the one
 * function that decides whether the current visitor actually gets to use
 * a Pro feature right now.
 *
 * Nothing is hidden and nothing is blocked today. Every feature listed
 * below still works for every account — Free or Pro — while the launch
 * promo is active (through PROMO_END_DATE, see promo.ts, which already
 * drives the Pricing page and the in-app reminder popups). What changes
 * today is purely visual: Pro features now carry a small "Pro" badge
 * wherever they show up in the real app (not just on the marketing
 * Pricing page), so people get used to seeing it before it ever actually
 * locks anything, and the couple of spots that would normally hard-stop
 * a Free account (a 2nd trading account, a 2nd strategy playbook) show an
 * inline note instead of a block.
 *
 * When real billing exists, `hasProAccess()` is the ONLY function that
 * needs to change — swap the promo check below for a real per-account
 * subscription check, and every badge/notice that reads from this file
 * starts meaning something for real, with no other code to touch.
 */
export { PROMO_END_DATE, PROMO_END_LABEL };

export function isPromoActive(): boolean {
  return new Date() <= new Date(`${PROMO_END_DATE}T23:59:59`);
}

/** Does the current visitor get Pro-level access right now? Today this is
 * just "is the launch promo still active" — everyone, Free or Pro, passes
 * until PROMO_END_DATE. This is intentionally the only place in the app
 * that decides real access; ProBadge/ProNotice are presentation only and
 * both read from this same function, so they can never disagree with
 * whatever actually gates a feature. */
export function hasProAccess(): boolean {
  return isPromoActive();
}

export type ProFeatureKey =
  | 'multi_account'
  | 'multi_strategy'
  | 'backtest'
  | 'checklist_compliance'
  | 'execution_mistakes'
  | 'htf_bias_alignment'
  | 'weekly_digest'
  | 'r_multiple_distribution'
  | 'public_track_record';

/** What each Pro feature actually is, in plain language — shown in the
 * badge's tooltip and in the fuller ProNotice banner. Keep this list in
 * sync with the Pro column on the Pricing page (src/pages/Pricing.tsx) —
 * that page is the sales pitch, this file is what the app itself badges,
 * and the two should never quietly drift apart. */
export const PRO_FEATURES: Record<ProFeatureKey, { message: string }> = {
  multi_account: {
    message: 'Free plan includes 1 trading account — additional accounts are a Pro feature.',
  },
  multi_strategy: {
    message: 'Free plan includes 1 strategy playbook — additional playbooks are a Pro feature.',
  },
  backtest: {
    message: 'Chart Replay & Backtesting is a Pro feature.',
  },
  checklist_compliance: {
    message: 'Checklist Compliance analysis is a Pro feature.',
  },
  execution_mistakes: {
    message: 'Execution Mistakes analysis is a Pro feature.',
  },
  htf_bias_alignment: {
    message: 'HTF Bias Alignment is a Pro feature.',
  },
  weekly_digest: {
    message: 'Weekly Digest is a Pro feature.',
  },
  r_multiple_distribution: {
    message: 'R-Multiple Distribution is a Pro feature.',
  },
  public_track_record: {
    message: 'Public Track Record (your shareable public results page) is a Pro feature.',
  },
};
