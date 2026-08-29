/** Shared header/footer for the public marketing site (Landing, Pricing,
 * Blog) so nav links stay consistent across pages instead of copy-pasted
 * per-page and drifting out of sync. Not used inside the authenticated app —
 * that has its own sidebar (components/Layout.tsx). */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen, History, Settings2, ListChecks, RefreshCw, Landmark, TrendingUp,
  Globe, ChevronDown,
} from 'lucide-react';
import { LogoMark } from '../../components/Logo';
import { Button } from '../../lib/ui/button';
import { useForceDarkTheme } from '../../lib/theme';
import ContactDialog from '../../components/ContactDialog';
import { featureSlug } from '../../lib/featureSlug';

const NAV_LINKS = [
  { to: '/demo', label: 'Live Demo' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Blog' },
];

// The header's "Features" mega-menu (FX Replay-style: two labeled columns,
// each entry an icon + title + one-line description). Deliberately a
// hand-picked subset of Landing.tsx's full FEATURES list rather than every
// entry - a dropdown people skim from the header should read in a few
// seconds, not repeat the whole marketing page. Each href deep-links to that
// feature's own card on the landing page (see featureSlug/#id in
// Landing.tsx) so clicking one doesn't just dump a visitor at the top of "/"
// - if you add or rename a feature card there, keep this list's titles in
// sync so the anchors keep resolving.
const FEATURE_MENU: {
  column: string;
  items: { icon: typeof BookOpen; title: string; desc: string }[];
}[] = [
  {
    column: 'Core workflow',
    items: [
      { icon: BookOpen, title: 'Trade Journal', desc: 'Log every trade with full context, automatically.' },
      { icon: History, title: 'Chart Replay & Backtesting', desc: 'Rehearse a strategy on real historical candles.' },
      { icon: Settings2, title: 'Strategy Playbooks', desc: 'Define a setup once, track it forever after.' },
      { icon: ListChecks, title: 'Pre-Trade Checklists', desc: 'Your own rules, enforced before every entry.' },
    ],
  },
  {
    column: 'Automation & analytics',
    items: [
      { icon: RefreshCw, title: 'MT4/MT5 Auto-Sync', desc: 'Closed trades import themselves from your broker.' },
      { icon: Landmark, title: 'Prop Firm Ledger & Challenge Simulator', desc: 'Fees, payouts, and a rules stress-test in one place.' },
      { icon: TrendingUp, title: 'Performance Analytics', desc: 'Win rate, R, profit factor — what\'s actually working.' },
      { icon: Globe, title: 'Public Track Record', desc: 'A shareable results page, no login required.' },
    ],
  },
];

/** The "Features" nav item: a button that reveals FEATURE_MENU on hover or
 * click, and closes on an outside click, an Escape press, or navigating away
 * (unmount). Hover-to-open matches how FX Replay and most marketing sites
 * behave; click-to-open is kept too so it still works on touch devices where
 * there's no hover at all. */
function FeaturesMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        Features
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-20">
          <div className="w-[560px] rounded-xl border border-border bg-popover shadow-lg p-5 grid grid-cols-2 gap-6">
            {FEATURE_MENU.map(col => (
              <div key={col.column}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">{col.column}</h4>
                <ul className="flex flex-col gap-3">
                  {col.items.map(item => (
                    <li key={item.title}>
                      <Link
                        to={`/#${featureSlug(item.title)}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-md p-1.5 -m-1.5 hover:bg-accent transition-colors"
                      >
                        <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shrink-0">
                          <item.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-snug">{item.title}</p>
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.desc}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MarketingHeader() {
  const location = useLocation();
  // See useForceDarkTheme in lib/theme.tsx — the whole logged-out site
  // (this header appears on Landing/Pricing/Blog/BlogPost) always renders
  // dark, same as Login/Signup.
  useForceDarkTheme();
  return (
    <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <span className="font-bold tracking-tight text-[17px] leading-none">
            <span className="text-foreground">Pip</span>
            <span className="text-primary">Echo</span>
          </span>
        </Link>
        <nav className="hidden sm:flex items-center gap-1">
          <FeaturesMenu />
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname.startsWith(link.to)
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <ContactDialog variant="nav" />
        </nav>
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
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <LogoMark size={18} />
            <span>PipEcho</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A trading journal and backtesting workspace for forex traders.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Product</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/demo" className="text-muted-foreground hover:text-foreground">Live Demo</Link></li>
            <li><Link to="/demo/app" className="text-muted-foreground hover:text-foreground">Full App Demo</Link></li>
            <li><Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link></li>
            <li><Link to="/signup" className="text-muted-foreground hover:text-foreground">Sign up</Link></li>
            <li><Link to="/login" className="text-muted-foreground hover:text-foreground">Log in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Resources</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link></li>
            <li><Link to="/tools/session-clock" className="text-muted-foreground hover:text-foreground">Free Session Clock</Link></li>
            <li><ContactDialog variant="footer" /></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Legal</h4>
          <ul className="space-y-2 text-sm">
            <li><span className="text-muted-foreground">Terms of Service</span></li>
            <li><span className="text-muted-foreground">Privacy Policy</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} PipEcho. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
