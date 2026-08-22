import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, BookOpen, Settings, TrendingUp, Sun, Moon, PanelLeftClose, PanelLeftOpen, ListChecks, History, LogOut, ShieldCheck, Radar } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/admin';
import Logo from './Logo';
import AccountSwitcher from './AccountSwitcher';
import PromoReminderModal from './PromoReminderModal';
import FeedbackDialog from './FeedbackDialog';
import ContactDialog from './ContactDialog';

const NAV_ITEMS = [
  { to: '/',             label: 'Summary',     icon: BarChart2,  disabled: false },
  { to: '/journal',      label: 'Journal',     icon: BookOpen,   disabled: false },
  { to: '/performance',  label: 'Performance', icon: TrendingUp, disabled: false },
  { to: '/strategies',   label: 'Strategies',  icon: Settings,   disabled: false },
  { to: '/checklists',   label: 'Checklists',  icon: ListChecks, disabled: false },
];

// Appended only for the admin account (see lib/admin.ts) — everyone else's
// sidebar never shows either of these items at all, not even disabled/
// greyed out, so their existence isn't hinted at to other users. Backtest
// joined this list because it isn't ready for everyone yet (still being
// built/tested) - see App.tsx (BacktestGate) and api/backtest.ts for the
// route- and API-level gates this pairs with; hiding the link is just the
// UX to match, not the real access control.
const BACKTEST_NAV_ITEM = { to: '/backtest', label: 'Backtest', icon: History, disabled: false };
// Smart Money Concepts Analysis - same admin-only reasoning as Backtest
// above (still being built/tested, explicitly restricted to just the admin
// account) - see App.tsx's SmcGate and api/backtest.ts's smc_* resources
// for the route- and API-level gates this pairs with.
const SMC_NAV_ITEM = { to: '/smc-analysis', label: 'SMC Analysis', icon: Radar, disabled: false };
const ADMIN_NAV_ITEM = { to: '/admin', label: 'Admin', icon: ShieldCheck, disabled: false };

const COLLAPSE_KEY = 'forexforge_sidebar_collapsed';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(COLLAPSE_KEY) === '1');
  const navItems = isAdminEmail(user?.email) ? [...NAV_ITEMS, BACKTEST_NAV_ITEM, SMC_NAV_ITEM, ADMIN_NAV_ITEM] : NAV_ITEMS;

  async function handleLogout() {
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
          <Logo collapsed={collapsed} size={30} />
        </div>

        <AccountSwitcher collapsed={collapsed} />

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon, disabled }) => {
            const active = !disabled && pathname === to;

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
                to={to}
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
                {!collapsed && <span>{label}</span>}
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
            title={collapsed ? (user?.email ? `Log out (${user.email})` : 'Log out') : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-white/5 transition-colors w-full',
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            )}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{user?.email ?? 'Log out'}</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-6 py-6 lg:px-8 lg:py-8 max-w-[1600px]">
        {children}
      </main>

      <PromoReminderModal />
    </div>
  );
}
