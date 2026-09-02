import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Button } from '../lib/ui/button';
import { Switch } from '../lib/ui/form';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPromoActive, PROMO_END_LABEL } from '../lib/proFeatures';

// Pricing shown here should stay in sync with the Pro row on src/pages/
// Pricing.tsx (same numbers, same monthly/annual split) - that page is the
// sales pitch, this one is where an already-signed-up person actually acts
// on it.
const PRICE_MONTHLY = 18;
const PRICE_ANNUAL = 15;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment issue',
  canceled: 'Canceled',
  unpaid: 'Payment issue',
  incomplete: 'Incomplete',
  incomplete_expired: 'Expired',
  paused: 'Paused',
};

/** Real billing, on top of the launch promo. Every account is Free/Pro-
 * equal while the promo runs (see the banner below) — this page is where
 * someone can start a real Pro subscription (card collected now, first
 * charge held until the promo ends via Stripe's trial_end — see
 * api/stripe.ts's resource=checkout) or manage one they already have. */
export default function Billing() {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [interval, setIntervalChoice] = useState<'monthly' | 'annual'>('annual');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const checkoutResult = searchParams.get('checkout');

  // Coming back from a successful Checkout redirect - the webhook that
  // actually flips `plan` to 'pro' fires independently and asynchronously
  // (usually within a second or two, but not guaranteed before this page
  // has already loaded), so this refetches `user` once to pick it up if
  // it's already landed, then clears the query param either way so a
  // manual page refresh later doesn't keep re-triggering this.
  useEffect(() => {
    if (checkoutResult === 'success') {
      setSyncing(true);
      refreshUser().finally(() => setSyncing(false));
    }
    if (checkoutResult) {
      navigate('/billing', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = user?.plan ?? 'free';
  const isPro = plan === 'pro';
  const hasEverSubscribed = !!user?.stripe_subscription_status;
  const promoActive = isPromoActive();

  async function startCheckout() {
    setError(null);
    setCheckoutLoading(true);
    try {
      const data: { url: string } = await api.post('/stripe?resource=checkout', { interval });
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message ?? 'Could not start checkout. Please try again.');
      setCheckoutLoading(false);
    }
  }

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const data: { url: string } = await api.post('/stripe?resource=portal');
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message ?? 'Could not open the billing portal. Please try again.');
      setPortalLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your PipEcho plan and payment method.</p>
      </div>

      {promoActive && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground/90">
          <span className="font-semibold text-primary">Launch offer:</span> every account gets full Pro access
          free through <span className="font-semibold">{PROMO_END_LABEL}</span> — nothing below is required
          to keep that.
        </div>
      )}

      {checkoutResult === 'cancelled' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground/90">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {checkoutResult === 'success' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground/90">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          {syncing ? 'Payment received — syncing your plan…' : 'Payment method saved. Your plan is below.'}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            Your plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{isPro ? 'Pro' : 'Free'}</span>
                {isPro && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    <Sparkles className="w-2.5 h-2.5" />
                    {STATUS_LABELS[user?.stripe_subscription_status ?? ''] ?? 'Active'}
                  </span>
                )}
              </div>
              {isPro && user?.stripe_subscription_status === 'trialing' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Card on file — first charge on {formatDate(user.plan_current_period_end)}.
                </p>
              )}
              {isPro && user?.stripe_subscription_status === 'active' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Renews {formatDate(user?.plan_current_period_end ?? null)}.
                </p>
              )}
              {isPro && user?.stripe_subscription_status === 'past_due' && (
                <p className="text-xs text-destructive mt-1">
                  Your last payment failed — update your card to avoid losing Pro access.
                </p>
              )}
              {!isPro && (
                <p className="text-xs text-muted-foreground mt-1">
                  {promoActive
                    ? `You have full Pro access free through ${PROMO_END_LABEL} regardless of plan.`
                    : '1 trading account, 1 strategy playbook, and the rest of the Free feature set.'}
                </p>
              )}
            </div>
            {hasEverSubscribed && (
              <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? 'Opening…' : 'Manage billing'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!isPro && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade to Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-sm font-medium ${interval !== 'annual' ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
              <Switch checked={interval === 'annual'} onCheckedChange={v => setIntervalChoice(v ? 'annual' : 'monthly')} />
              <span className={`text-sm font-medium ${interval === 'annual' ? 'text-foreground' : 'text-muted-foreground'}`}>
                Annual <span className="text-primary">(save 17%)</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-bold tracking-tight">
                ${interval === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY}
              </span>
              <span className="text-muted-foreground text-sm">/ month{interval === 'annual' ? ', billed annually' : ''}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {promoActive
                ? `Your card won't be charged until ${PROMO_END_LABEL}, when the launch promo ends.`
                : 'Unlimited trading accounts, unlimited strategy playbooks, and every Pro analytics view.'}
            </p>
            <Button onClick={startCheckout} disabled={checkoutLoading} className="w-full sm:w-auto">
              {checkoutLoading ? 'Redirecting…' : 'Add payment method'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
