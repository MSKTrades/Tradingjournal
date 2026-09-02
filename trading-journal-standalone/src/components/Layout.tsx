import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, BookOpen, Settings, TrendingUp, Sun, Moon, PanelLeftClose, PanelLeftOpen, ListChecks, History, LogOut, ShieldCheck, Radar, Trophy, Sparkles, DoorOpen, Images, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/admin';
import { DEMO_BASE } from '../lib/demoMode';
import { Button } from '../lib/ui/button';
import ProBadge from './ProBadge';
import Logo from './Logo';
import AccountSwitcher from './AccountSwitcher';
import PromoReminderModal from './PromoReminderModal';
import FeedbackDialog from './FeedbackDialog';
import ContactDialog from './ContactDialog';
import DemoCapToastHost from './DemoCapToastHost';

// `to` is a path SEGMENT (no leading slash), not a full route - navHref()
// below prefixes it with either '' (the real app) or DEMO_BASE (the public
// /demo/app/* sandbox), so the exact same NAV_ITEMS list drives both
// without the demo sidebar accidentally linking into the real, login-gated
// routes (which is what happened when this used to be a flat array of
// absolute paths).
const NAV_ITEMS = [
  { to: '',             label: 'Summary',     icon: BarChart2,  disabled: false },
  { to: 'journal',      label: 'Journal',     icon: BookOpen,   disabled: false },
  { to: 'vision-board', label: 'Vision Board', icon: Images,    disabled: false },
  { to: 'performance',  label: 'Performance', icon: TrendingUp, disabled: false },
  { to: 'strategies',   label: 'Strategies',  icon: Settings,   disabled: false },
  { to: 'checklists',   label: 'Checklists',  icon: ListChecks, disabled: false },
  // Chart Replay & Backtesting - gated to "Coming soon" for everyone right
  // now (see App.tsx's /backtest route rendering BacktestComingSoon, and
  // that file's own doc comment for why). Kept visible-but-disabled rather
  // than removed entirely so the feature isn't a surprise once it ships -
  // same pattern as any other `disabled: true` item below. Not offered
  // inside the demo sandbox either way (see DEMO_HIDDEN below).
  { to: 'backtest',     label: 'Backtest',    icon: History,    disabled: true },
  { to: 'challenge-simulator', label: 'Challenge Simulator', icon: Trophy, disabled: false },
  // Real Stripe billing (src/pages/Billing.tsx, api/stripe.ts) - not shown
  // in the demo sandbox at all (see DEMO_HIDDEN below), same as Backtest/
  // Challenge Simulator/Vision Board.
  { to: 'billing',      label: 'Billing',     icon: CreditCard, disabled: false },
];

// Appended only for the admin account (see lib/admin.ts) — everyone else's
// sidebar never shows either of these items at all, not even disabled/
// greyed out, so their existence isn't hinted at to other users.
// Smart Money Concepts Analysis stays admin-only per an explicit, repeated
// instruction ("keep it to my account, don't release to anyone else") -
// see App.tsx's SmcGate and api/backtest.ts's SMC_ONLY_RESOURCES for the
// route- and API-level gates this pairs with.
const SMC_NAV_ITEM = { to: 'smc-analysis', label: 'SMC Analysis', icon: Radar, disabled: false };
const ADMIN_NAV_ITEM = { to: 'admin', label: 'Admin', icon: ShieldCheck, disabled: false };

// Nav items that need a real backend feature the demo sandbox doesn't mock
// (real historical candles for Backtest; ledger/rules simulation state for
// Challenge Simulator) - hidden from the demo sidebar rather than shown and
// left to error. Vision Board is hidden here too, not because the demo
// backend can't support it (it easily could - it just reads the same
// /trades data every other demo page already uses), but because the seed
// trades don't carry screenshots, so the page would only ever show empty
// placeholders - not a useful preview of what it actually does.
const DEMO_HIDDEN = new Set(['backtest', 'challenge-simulator', 'vision-board', 'billing']);

function navHref(base: string, to: string): string {
  if (to === '') return base || '/';
  return `${base}/${to}`;
}

const COLLAPSE_KEY = 'forexforge_sidebar_collapsed';

export default function Layout({ children, demoMode = false }: { children: React.ReactNode; demoMode?: boolean }) {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(COLLAPSE_KEY) === '1');
  const base = demoMode ? DEMO_BASE : '';
  const navItems = (!demoMode && isAdminEmail(user?.email) ? [...NAV_ITEMS, SMC_NAV_ITEM, ADMIN_NAV_ITEM] : NAV_ITEMS)
    .filter(item => !demoMode || !DEMO_HIDDEN.has(item.to));

  async function handleLogout() {
    if (demoMode) {
      // No real session to end - just leave the sandbox. Calling the real
      // logout() here would fire a real (harmless but pointless) API call
      // for a visitor who was never actually logged in.
      navigate('/', { replace: true });
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  }

  const setAndPersistCollapsed = (v: boolean) => {
    setCollapsed(v);
    window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside
        className={cn(
          'shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col sticky top-0 h-screen transition-[width] duration-150',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        <div className={cn('h-16 flex items-center border-b border-sidebar-border', collapsed ? 'justify-center px-0' : 'px-5')}>
          {demoMode ? (
            // The real, logged-in app has nowhere more "home" than Summary
            // (which "/" already resolves to for a signed-in user - see
            // App.tsx's RootRoute), so the logo stays a plain, unclickable
            // mark there, same as before. In the demo sandbox there IS a
            // real homepage one level up (the marketing site) and, before
            // this, the only way back to it was "Exit demo" at the very
            // bottom of the sidebar, past the theme toggle/feedback/contact/
            // collapse buttons - easy to miss, and its wording reads more
            // like "log out" than "go to the homepage". Making the logo
            // itself a link to "/" covers the far more common instinct of
            // clicking the brand mark to go home.
            <Link to="/" title="Back to pipecho.com" aria-label="Back to pipecho.com" className="hover:opacity-80 transition-opacity">
              <Logo collapsed={collapsed} size={30} />
            </Link>
          ) : (
            <Logo collapsed={collapsed} size={30} />
          )}
        </div>

        <AccountSwitcher collapsed={collapsed} />

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon, disabled }) => {
            const href = navHref(base, to);
            const active = !disabled && pathname === href;

            if (disabled) {
              return (
                <div
                  key={to}
                  title={collapsed ? `${label} (Coming soon)` : undefined}
                  aria-disabled="true"
                  className={cn(
                    'flex items-center gap-3 rounded-md text-sm font-medium relative cursor-not-allowed text-sidebar-muted/50',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                  )}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && (
                    <span className="flex items-center gap-1.5 truncate">
                      {label}
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-sidebar-muted/15 text-sidebar-muted/70 rounded px-1.5 py-0.5">
                        Soon
                      </span>
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={to}
                to={href}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md text-sm font-medium transition-colors relative',
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                  active
                    ? 'bg-sidebar-active/15 text-sidebar-active'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5'
                )}
              >
                {active && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-active" />
                )}
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-1.5 truncate">
                    {label}
                    {/* Only Vision Board is a full nav item that's also a
                        registered Pro feature (see proFeatures.ts) - every
                        other Pro feature badges itself inline on whichever
                        page/card it actually lives on (HTF Bias Alignment,
                        Weekly Digest, etc.), so this doesn't get a general
                        to-key lookup, just the one explicit check. */}
                    {to === 'vision-board' && !demoMode && <ProBadge feature="vision_board" />}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn('border-t border-sidebar-border py-3 px-3 space-y-1', collapsed && 'px-0')}>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
            {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
          <FeedbackDialog collapsed={collapsed} />
          <ContactDialog collapsed={collapsed} />
          <button
            onClick={() => setAndPersistCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" /> : <PanelLeftClose className="w-[18px] h-[18px] shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={handleLogout}
            title={collapsed ? (demoMode ? 'Exit demo' : (user?.email ? `Log out (${user.email})` : 'Log out')) : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            {demoMode ? <DoorOpen className="w-[18px] h-[18px] shrink-0" /> : <LogOut className="w-[18px] h-[18px] shrink-0" />}
            {!collapsed && <span className="truncate">{demoMode ? 'Exit demo' : (user?.email ?? 'Log out')}</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-6 py-6 lg:px-8 lg:py-8 max-w-[1600px]">
        {demoMode && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>
                <strong className="font-semibold">You're in the full demo</strong> — sample data, lives only in
                this browser tab. Closing or reloading resets it. You can add up to 1 of your own trade, strategy,
                and checklist to try it hands-on.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reset demo</Button>
              <Link to="/signup"><Button size="sm">Sign up free</Button></Link>
            </div>
          </div>
        )}
        {children}
      </main>

      <PromoReminderModal />
      {demoMode && <DemoCapToastHost />}
    </div>
  );
}
