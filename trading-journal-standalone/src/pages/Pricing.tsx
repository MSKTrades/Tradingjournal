import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { Switch } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';

// Pricing display only — no payment processing wired up yet (deliberate,
// see the delivery README). Numbers here are a starting proposal, not
// locked in anywhere else in the codebase; change them freely without
// touching any other file.
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
      'Core performance analytics',
      'Risk Guardrail (daily/weekly loss limits)',
      'Custom fields & tags',
      'Pre-trade checklists',
      'Excel import',
    ],
  },
  {
    name: 'Pro',
    priceMonthly: 15,
    priceAnnual: 12,
    tagline: 'For traders serious about the process.',
    cta: 'Start free trial',
    highlighted: true,
    features: [
      'Everything in Free',
      'Unlimited trading accounts',
      'Unlimited strategy playbooks',
      'Chart Replay & Backtesting (coming soon)',
      'Priority support',
    ],
  },
];

const FAQS = [
  {
    q: 'Is there a free trial for Pro?',
    a: 'Yes — every Pro signup starts with a trial period, no credit card required to get started. You\'ll only be asked for payment details if you decide to continue.',
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
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-16 pb-8 text-center">
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
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{formatPrice(price)}</span>
                  {price > 0 && <span className="text-muted-foreground text-sm">/ month{annual ? ', billed annually' : ''}</span>}
                </div>
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
