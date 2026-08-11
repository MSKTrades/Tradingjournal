import { Link, useLocation } from 'react-router-dom';
import { BarChart2, BookOpen, Settings, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { to: '/',             label: 'Summary',     icon: BarChart2  },
  { to: '/journal',      label: 'Journal',     icon: BookOpen   },
  { to: '/performance',  label: 'Performance', icon: TrendingUp },
  { to: '/strategies',   label: 'Strategies',  icon: Settings   },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card shadow-sm sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-6 h-14">
          <span className="font-bold text-base tracking-tight text-foreground shrink-0">
            📈 Fractal Backtester
          </span>
          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
