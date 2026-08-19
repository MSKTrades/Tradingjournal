/** Shared header/footer for the public marketing site (Landing, Pricing,
 * Blog) so nav links stay consistent across pages instead of copy-pasted
 * per-page and drifting out of sync. Not used inside the authenticated app —
 * that has its own sidebar (components/Layout.tsx). */
import { Link, useLocation } from 'react-router-dom';
import { LogoMark } from '../../components/Logo';
import { Button } from '../../lib/ui/button';
import { useForceDarkTheme } from '../../lib/theme';
import ContactDialog from '../../components/ContactDialog';

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Blog' },
];

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
            <li><Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link></li>
            <li><Link to="/signup" className="text-muted-foreground hover:text-foreground">Sign up</Link></li>
            <li><Link to="/login" className="text-muted-foreground hover:text-foreground">Log in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Resources</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link></li>
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
