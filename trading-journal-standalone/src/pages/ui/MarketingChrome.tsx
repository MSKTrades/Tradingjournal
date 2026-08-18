/** Shared header/footer for the public marketing site (Landing, Pricing,
 * Blog) so nav links stay consistent across pages instead of copy-pasted
 * per-page and drifting out of sync. Not used inside the authenticated app —
 * that has its own sidebar (components/Layout.tsx). */
import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogoMark } from '../../components/Logo';
import { Button } from '../../lib/ui/button';
import { useTheme } from '../../lib/theme';

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Blog' },
];

/** The public marketing site always shows dark — it's the site's visual
 * identity (same as every trading-tool marketing page and the app's own
 * dark-first default), not something that should flicker to light just
 * because a visitor's OS or browser is set to a light color scheme.
 *
 * This forces the `dark` class onto <html> for as long as a marketing page
 * is mounted, without touching the ThemeProvider's own `theme` state — so
 * it never overwrites a logged-in user's actual light/dark preference for
 * the app itself (important: a logged-in user CAN land on /pricing or
 * /blog, since those routes aren't auth-gated, and if we wrote through
 * ThemeProvider's state here it would persist "dark" to localStorage and
 * could clobber their real preference for the whole app if they close the
 * tab before this unmounts). On unmount it puts the class back to whatever
 * that real preference currently is.
 *
 * Just adding the class once isn't enough: ThemeProvider's own effect
 * (which reflects the real, possibly-light preference) sometimes mounts in
 * the very same commit as this one — e.g. on /pricing, which renders
 * immediately, unlike Landing which mounts a beat later behind the
 * logged-in/out check — and React always runs an ancestor's effects after
 * its descendants', so ThemeProvider's effect can strip the class back off
 * right after this hook sets it. A MutationObserver re-asserts it the
 * instant that happens instead of relying on winning that ordering race. */
function useForceDarkMarketingTheme() {
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const ensureDark = () => {
      if (!root.classList.contains('dark')) root.classList.add('dark');
    };
    ensureDark();

    const observer = new MutationObserver(ensureDark);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      if (themeRef.current === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };
  }, []);
}

export function MarketingHeader() {
  const location = useLocation();
  useForceDarkMarketingTheme();
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
            <li><Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link></li>
            <li><Link to="/signup" className="text-muted-foreground hover:text-foreground">Sign up</Link></li>
            <li><Link to="/login" className="text-muted-foreground hover:text-foreground">Log in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Resources</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link></li>
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
