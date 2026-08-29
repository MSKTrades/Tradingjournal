import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { Switch } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { PROMO_END_LABEL } from '../lib/promo';

// Pricing display only — no payment processing wired up yet (deliberate,
// see the delivery README). Numbers here are a starting proposal, not
// locked in anywhere else in the codebase; change them freely without
// touching any other file.
//
// Launch promo: every signup gets full Pro-level access free through
// PROMO_END_LABEL (see src/lib/promo.ts — that's also what drives the
// in-app reminder popups as the date approaches). Nothing here is enforced
// in the backend, so this is purely the messaging layer.
//
// The Pro feature list below is the source of truth this page pitches —
// it should stay in sync with src/lib/proFeatures.ts, which is what
// actually badges these same features inside the app itself (Summary,
// Performance, Strategies, Account settings). If a feature gets added or
// removed from one, update the other.
const PLANS = [
  {
    name: 'Free',
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: 'Get your journal running today.',
    cta: 'Sign up free',
    features: [
      '1 trading account',
      '1 strategy playbook',
      'Unlimited trade logging',
      'Core performance charts (P/L, drawdown, account balance)',
      'Risk Guardrail (daily/weekly loss limits)',
      'Custom fields & tags',
      'Pre-trade checklists',
      'Excel import',
      'Chart Replay & Backtesting — up to 6 months of history',
    ],
  },
  {
    name: 'Pro',
    priceMonthly: 15,
    priceAnnual: 12,
    tagline: 'For traders serious about the process.',
    cta: 'Get Pro free',
    highlighted: true,
    features: [
      'Everything in Free',
      'Unlimited trading accounts',
      'Unlimited strategy playbooks',
      'Public Track Record (shareable results page)',
      'Weekly Digest',
      'Checklist Compliance analysis',
      'Execution Mistakes analysis',
      'HTF Bias Alignment',
      'R-Multiple Distribution',
      'Chart Replay & Backtesting — unlimited history',
      'Priority support',
    ],
  },
];

const FAQS = [
  {
    q: 'Is Pro really free right now?',
    a: `Yes. As a launch offer, every account — Free or Pro — gets full Pro-level access at no cost through ${PROMO_END_LABEL}. No credit card required to get started. You'll get a few reminders in-app as that date approaches, and you can upgrade at any point to keep uninterrupted access afterward.`,
  },
  {
    q: 'Can I switch between monthly and annual billing?',
    a: 'Yes, at any time from your account settings. Switching to annual billing applies the discounted rate to your next invoice.',
  },
  {
    q: 'What happens to my data if I downgrade from Pro to Free?',
    a: 'Your data is never deleted. If you\'re over the Free plan\'s single-account limit, extra accounts are simply hidden (not removed) until you either upgrade again or bring your account count back down.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Reach out within 14 days of a charge and we\'ll refund it, no questions asked.',
  },
];

function formatPrice(n: number) {
  return n === 0 ? '$0' : `$${n}`;
}

export default function Pricing() {
  useDocumentMeta({
    title: 'Pricing — PipEcho',
    description: 'Free forever for a single account with 1 strategy playbook, Risk Guardrail, and custom fields. Upgrade to Pro for unlimited accounts and strategies, starting at $12/month.',
  });
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <div className="px-6 pt-8">
        <div className="max-w-3xl mx-auto rounded-lg border border-primary/30 bg-primary/10 px-5 py-3 text-center text-sm text-foreground/90">
          <span className="font-semibold text-primary">Launch offer:</span> every account gets full Pro
          access free through <span className="font-semibold">{PROMO_END_LABEL}</span> — no credit card needed.
        </div>
      </div>

      <section className="px-6 pt-10 pb-8 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight">Simple pricing, no surprises</h1>
          <p className="text-lg text-muted-foreground mt-4">
            Start free. Upgrade when backtesting and strategy tracking become part of how you trade.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className={`text-sm font-medium ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={`text-sm font-medium ${annual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annual <span className="text-primary">(save 20%)</span>
            </span>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map(plan => {
            const price = annual ? plan.priceAnnual : plan.priceMonthly;
            return (
              <div
                key={plan.name}
                className={`rounded-xl border p-7 flex flex-col ${
                  plan.highlighted ? 'border-primary shadow-lg relative bg-card' : 'border-border bg-card'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-7 bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{plan.tagline}</p>
                {plan.highlighted ? (
                  <div className="mt-5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tight">$0</span>
                      <span className="text-muted-foreground text-sm line-through">{formatPrice(price)}/mo</span>
                    </div>
                    <p className="text-xs text-primary font-medium mt-1">Free through {PROMO_END_LABEL}</p>
                  </div>
                ) : (
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{formatPrice(price)}</span>
                    {price > 0 && <span className="text-muted-foreground text-sm">/ month{annual ? ', billed annually' : ''}</span>}
                  </div>
                )}
                <Link to="/signup" className="mt-6">
                  <Button size="default" className="w-full h-10" variant={plan.highlighted ? 'default' : 'outline'}>
                    {plan.cta}
                  </Button>
                </Link>
                <ul className="mt-7 space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-card/50">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-center mb-10">Frequently asked questions</h2>
          <div className="space-y-6">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-6 last:border-b-0 last:pb-0">
                <h3 className="font-semibold mb-1.5">{q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
