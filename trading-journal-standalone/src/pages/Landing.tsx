import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart2, BookOpen, History, ListChecks, TrendingUp, Settings2,
  AlertTriangle, Layers, Check, X, Clock3, ArrowRight, RefreshCw, Landmark,
  Mail, Compass, Globe,
} from 'lucide-react';
import { Button } from '../lib/ui/button';
import { Badge } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { BLOG_POSTS } from './data/blogPosts';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import RuleToggleDemo from './ui/RuleToggleDemo';
import ProBadge from '../components/ProBadge';
import { ProFeatureKey } from '../lib/proFeatures';
import { featureSlug } from '../lib/featureSlug';

// Decorative ascending-bar heights behind the hero headline — hand-picked
// (not random) so the pattern is stable across renders and reads as a
// gently noisy uptrend rather than a perfectly straight staircase.
const HERO_BARS = [
  34, 48, 40, 60, 50, 72, 58, 88, 68, 100, 82, 116, 96, 132, 108, 150,
  126, 168, 140, 188, 158, 206, 176, 226, 196, 244, 214, 262, 234, 280,
];

/** Purely decorative candlestick/trend-line pattern behind the hero copy —
 * low-opacity, faded at the edges via a mask so it never competes with the
 * headline text sitting on top of it. */
function HeroBackground() {
  const barWidth = 14;
  const gap = 8;
  const baseline = 320;
  const points = HERO_BARS.map((h, i) => {
    const x = i * (barWidth + gap);
    return { x: x + barWidth / 2, y: baseline - h, barX: x, barH: h };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div
      className="absolute inset-x-0 top-0 h-[420px] overflow-hidden pointer-events-none select-none"
      style={{
        WebkitMaskImage: 'radial-gradient(ellipse 75% 100% at 50% 20%, black 40%, transparent 85%)',
        maskImage: 'radial-gradient(ellipse 75% 100% at 50% 20%, black 40%, transparent 85%)',
      }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-10 w-[560px] h-[560px] -translate-x-1/2 rounded-full bg-primary/25 blur-[110px]" />
      <svg
        className="absolute left-1/2 top-24 -translate-x-1/2 opacity-[0.16] dark:opacity-[0.22]"
        width={points[points.length - 1].x + barWidth}
        height={baseline}
        viewBox={`0 0 ${points[points.length - 1].x + barWidth} ${baseline}`}
        fill="none"
      >
        <defs>
          <linearGradient id="heroBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf5c" />
            <stop offset="100%" stopColor="#e8790f" />
          </linearGradient>
          <linearGradient id="heroLineGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e8790f" />
            <stop offset="100%" stopColor="#fbbf5c" />
          </linearGradient>
        </defs>
        {points.map((p, i) => (
          <rect key={i} x={p.barX} y={p.y} width={barWidth} height={p.barH} rx={2.5} fill="url(#heroBarGrad)" />
        ))}
        <path d={linePath} stroke="url(#heroLineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Kept in sync by hand with what's actually shipped (see App.tsx's routes
// and src/pages/ui/*) rather than what the page looked like when it first
// launched — this list drifted behind several real features (broker sync,
// the prop-firm ledger, the Pro analytics widgets) before this pass. SMC
// Analysis is deliberately left off: it's restricted to a single internal
// account and was never meant to be marketed publicly (see the SmcGate
// note in App.tsx).
const FEATURES: { icon: typeof BookOpen; title: string; desc: string; pro?: ProFeatureKey }[] = [
  {
    icon: BookOpen,
    title: 'Trade Journal',
    desc: 'Log every trade with full context — entry/exit, R:R, screenshots, and notes — and let PipEcho compute your running equity curve automatically.',
  },
  {
    icon: History,
    title: 'Chart Replay & Backtesting',
    desc: 'Pull real historical candle data and step through it bar-by-bar to rehearse a strategy before risking live capital.',
  },
  {
    icon: TrendingUp,
    title: 'Performance Analytics',
    desc: 'Win rate, average R, profit factor, and breakdowns by session, day, and setup — see what\'s actually working.',
  },
  {
    icon: Settings2,
    title: 'Strategy Playbooks',
    desc: 'Define your setups once, then track how each one performs over time so you know which edges to keep and which to drop.',
  },
  {
    icon: ListChecks,
    title: 'Pre-Trade Checklists',
    desc: 'Enforce your own rules before every entry — a simple guardrail against revenge trading and FOMO.',
  },
  {
    icon: AlertTriangle,
    title: 'Risk Guardrail',
    desc: 'A live warning the moment a daily or weekly loss limit is breached — visible on your dashboard, not just in your head.',
  },
  {
    icon: RefreshCw,
    title: 'MT4/MT5 Auto-Sync',
    desc: 'Connect a real broker or prop-firm account with your read-only investor login and let closed trades import themselves — nothing typed by hand.',
  },
  {
    icon: Landmark,
    title: 'Prop Firm Ledger & Challenge Simulator',
    desc: 'Track challenge fees and payouts separately from trade P/L, and stress-test a rule set against your own history before you pay for an evaluation.',
  },
  {
    icon: Mail,
    title: 'Weekly Digest',
    desc: 'A standing recap of the week\'s trading — win rate, R, and what changed — without having to go dig for it yourself.',
    pro: 'weekly_digest',
  },
  {
    icon: Compass,
    title: 'HTF Bias Alignment',
    desc: 'See how often your entries actually agreed with the higher-timeframe bias, so you catch a fade-the-trend habit before it costs another month.',
    pro: 'htf_bias_alignment',
  },
  {
    icon: Globe,
    title: 'Public Track Record',
    desc: 'A shareable, read-only results page for a prop firm or investor — no login required, and you control whether dollar amounts are shown.',
    pro: 'public_track_record',
  },
  {
    icon: Layers,
    title: 'Custom Fields & Tags',
    desc: 'Track the specific things your strategy cares about — confirmation candles, liquidity swept, session structure — without fighting a rigid template.',
  },
];

type ComparisonValue = boolean | 'manual';
const COMPARISON: { label: string; spreadsheet: ComparisonValue; notes: ComparisonValue; pipecho: ComparisonValue }[] = [
  { label: 'Automatic equity curve & running balance', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Win rate, profit factor, R-multiple breakdowns', spreadsheet: 'manual', notes: false, pipecho: true },
  { label: 'Bar-by-bar backtesting on real historical data', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Pre-trade checklist enforcement', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Live risk-limit warnings', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Custom fields for your exact strategy', spreadsheet: 'manual', notes: true, pipecho: true },
];

function ComparisonCell({ value }: { value: boolean | 'manual' }) {
  if (value === true) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === 'manual') return <span className="text-xs text-muted-foreground">Manual</span>;
  return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
}

const SCREENSHOTS = [
  { src: '/screenshots/summary.png', alt: 'PipEcho Summary dashboard showing trading sessions, strategy stats, and daily quote', title: 'Summary', desc: 'Your trading day at a glance — sessions, strategy performance, and market news in one dashboard.' },
  { src: '/screenshots/journal.png', alt: 'PipEcho Trade Journal table showing 150 logged trades with P/L, RR, and running capital', title: 'Trade Journal', desc: 'Every trade logged with full context, filterable by asset, side, outcome, tag, and date range.' },
  { src: '/screenshots/performance.png', alt: 'PipEcho Performance page showing profit factor, drawdown chart, and win/loss breakdown', title: 'Performance', desc: 'Expectancy, profit factor, drawdown, and winners/losers breakdown — computed automatically.' },
  { src: '/screenshots/strategies.png', alt: 'PipEcho Strategies page showing two defined strategy playbooks with filter rules', title: 'Strategy Playbooks', desc: 'Define a setup once — filters, TP rules, applicable accounts — and track it forever after.' },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Landing() {
  useDocumentMeta({
    title: 'PipEcho — Trading Journal, Backtesting & Session Analytics for Forex Traders',
    description: 'A trading journal, backtesting and session-analytics workspace built for forex traders — Strategy Playbooks, Risk Guardrail, and pre-trade checklists included free.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'PipEcho',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: 'A trading journal, backtesting and session-analytics workspace built for forex traders.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url: 'https://pipecho.com/',
    },
  });
  // Lets the header's Features mega-menu (MarketingChrome.tsx) deep-link
  // straight to a specific feature card - e.g. Link to="/#trade-journal" -
  // instead of just dumping a visitor at the top of the page. Plain browser
  // anchor scrolling doesn't fire here: react-router's Link intercepts the
  // click and pushes history state rather than doing a real navigation, so
  // nothing scrolls on its own, and a click from another page (Pricing,
  // Blog) mounts Landing fresh with the hash already set. Keying this off
  // location.hash (rather than a plain window.onload check) covers both
  // cases: a fresh mount with a hash already in the URL, and a same-page
  // hash change while already sitting on "/".
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.querySelector(location.hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="relative px-6 pt-20 pb-16 text-center overflow-hidden">
        <HeroBackground />
        <div className="relative max-w-6xl mx-auto">
          <span className="inline-block text-xs font-semibold tracking-wide uppercase text-primary bg-accent px-3 py-1 rounded-full mb-6">
            Built for forex traders
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
            Trade with data, not guesswork.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-5">
            PipEcho is a trading journal and backtesting workspace — log every trade,
            replay historical price action, and see exactly which setups are actually
            making you money.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link to="/signup">
              <Button size="default" className="h-11 px-6 text-base">Get started free</Button>
            </Link>
            <Link to="/demo">
              <Button variant="outline" size="default" className="h-11 px-6 text-base">Try the live demo</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Watch a rule change the numbers</h2>
            <p className="text-muted-foreground mt-2">
              A real sample journal, filtering itself — this is the same journal you'd try in the live demo.
            </p>
          </div>
          <RuleToggleDemo autoplay compact />
          <div className="text-center mt-6">
            <Link to="/demo" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Try it yourself, no signup needed <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">See it before you sign up</h2>
            <p className="text-muted-foreground mt-2">Real screens from the actual app — not mockups.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {SCREENSHOTS.map(s => (
              <div key={s.title} className="rounded-xl border border-border bg-card overflow-hidden">
                <img src={s.src} alt={s.alt} className="w-full h-auto border-b border-border" loading="lazy" />
                <div className="p-5">
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">Everything your trading log should do</h2>
            <p className="text-muted-foreground mt-2">One workspace for journaling, backtesting, and performance review.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, pro }) => (
              <div key={title} id={featureSlug(title)} className="rounded-lg border border-border bg-card p-6 scroll-mt-24">
                <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-semibold">{title}</h3>
                  {pro && <ProBadge feature={pro} />}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">Why not just use a spreadsheet?</h2>
            <p className="text-muted-foreground mt-2">Plenty of traders start there. Here's where it stops being enough.</p>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground py-3 px-5">Feature</th>
                  <th className="font-medium text-muted-foreground py-3 px-3 w-28">Spreadsheet</th>
                  <th className="font-medium text-muted-foreground py-3 px-3 w-28">Notes app</th>
                  <th className="font-semibold text-primary py-3 px-3 w-28">PipEcho</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.label} className="border-b border-border last:border-b-0">
                    <td className="py-3.5 px-5 text-foreground/90">{row.label}</td>
                    <td className="text-center px-3"><ComparisonCell value={row.spreadsheet} /></td>
                    <td className="text-center px-3"><ComparisonCell value={row.notes} /></td>
                    <td className="text-center px-3"><ComparisonCell value={row.pipecho} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">From the blog</h2>
              <p className="text-muted-foreground mt-2">Strategy, risk, and the process behind trading with data.</p>
            </div>
            <Link to="/blog" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              View all posts <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {BLOG_POSTS.slice(-3).reverse().map(post => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="rounded-lg border border-border bg-card p-6 hover:border-primary/50 transition-colors flex flex-col"
              >
                <Badge variant="outline" className="w-fit mb-3">{post.tag}</Badge>
                <h3 className="font-semibold leading-snug mb-2">{post.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 line-clamp-3">{post.excerpt}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
                  <span>{fmtDate(post.date)}</span>
                  <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" />{post.readTime}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/blog" className="sm:hidden flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline mt-8">
            View all posts <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-2xl bg-sidebar text-sidebar-foreground px-8 py-14 text-center">
          <BarChart2 className="w-8 h-8 text-sidebar-active mx-auto mb-4" />
          <h2 className="text-2xl font-semibold tracking-tight">Start journaling in under a minute</h2>
          <p className="text-sidebar-muted mt-2 max-w-xl mx-auto">
            No credit card, no setup wizard. Create an account and start logging trades right away.
          </p>
          <Link to="/signup" className="inline-block mt-6">
            <Button size="default" className="h-11 px-6 text-base">Create your free account</Button>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
