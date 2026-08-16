import { Link } from 'react-router-dom';
import { BarChart2, BookOpen, History, ListChecks, TrendingUp, Settings2, ShieldCheck } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Button } from '../lib/ui/button';

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

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Trade Journal',
    desc: 'Log every trade with full context — entry/exit, R:R, screenshots, and notes — and let ForexForge compute your running equity curve automatically.',
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
    icon: ShieldCheck,
    title: 'Your Data, Your Rules',
    desc: 'Multiple accounts, custom columns, and tags — built to match how you actually trade, not a rigid template.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-bold tracking-tight text-[17px] leading-none">
              <span className="text-foreground">Forex</span>
              <span className="text-primary">Forge</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Sign up free</Button>
            </Link>
          </div>
        </div>
      </header>

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
            ForexForge is a trading journal and backtesting workspace — log every trade,
            replay historical price action, and see exactly which setups are actually
            making you money.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link to="/signup">
              <Button size="default" className="h-11 px-6 text-base">Get started free</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="default" className="h-11 px-6 text-base">Log in</Button>
            </Link>
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
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
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

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LogoMark size={18} />
            <span>ForexForge</span>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} ForexForge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
