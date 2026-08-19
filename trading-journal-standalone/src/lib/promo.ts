/** Launch promotion: every account (Free or Pro) gets full Pro-level access
 * at no cost through PROMO_END_DATE. There's no billing system wired up
 * yet, so this isn't enforced anywhere in the backend — it's purely a
 * messaging/expectations layer: the Pricing page advertises the offer, and
 * REMINDER_CHECKPOINTS below drive a handful of in-app nudges so nobody is
 * surprised when the promo winds down. Move PROMO_END_DATE (and the
 * checkpoint dates) here if the timeline ever shifts — nothing else in the
 * app needs to change.
 */
export const PROMO_END_DATE = '2026-11-30';
export const PROMO_END_LABEL = 'November 30, 2026';

export type PromoCheckpoint = {
  id: string;
  /** ISO date (YYYY-MM-DD) this checkpoint becomes active on. */
  date: string;
  title: string;
  body: string;
};

/** Ordered oldest -> newest. The modal shows the LATEST checkpoint whose
 * date has passed and that hasn't been dismissed yet — not every checkpoint
 * that's ever fired — so someone who first logs back in during November
 * only sees the November reminder, not a backlog of three. */
export const REMINDER_CHECKPOINTS: PromoCheckpoint[] = [
  {
    id: 'promo-2026-09-30',
    date: '2026-09-30',
    title: 'Quick heads up about your free Pro access',
    body: `You've had full Pro access — unlimited trading accounts, unlimited strategy playbooks — at no cost as part of our launch. That continues through ${PROMO_END_LABEL}. No action needed today; just giving you plenty of notice before anything changes.`,
  },
  {
    id: 'promo-2026-10-31',
    date: '2026-10-31',
    title: 'One month left on free Pro access',
    body: `Just a reminder: the free launch access to Pro features ends ${PROMO_END_LABEL}. If you're using more than one trading account or strategy playbook, you'll want to upgrade before then to keep that access without interruption.`,
  },
  {
    id: 'promo-2026-11-15',
    date: '2026-11-15',
    title: 'Two weeks left on free Pro access',
    body: `Free access to Pro features wraps up on ${PROMO_END_LABEL}. Upgrade now to lock in unlimited accounts and strategy playbooks so nothing changes for you when the promo ends.`,
  },
];
