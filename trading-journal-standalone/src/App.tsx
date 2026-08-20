import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './lib/theme';
import { AccountProvider } from './lib/accounts';
import { AuthProvider, useAuth } from './lib/auth';
import { useEffect } from 'react';
import { capturePageview } from './lib/analytics';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Summary from './pages/Summary';
import Journal from './pages/Journal';
import Performance from './pages/Performance';
import Strategies from './pages/Strategies';
import StrategyDetail from './pages/StrategyDetail';
import Checklists from './pages/Checklists';
import Admin from './pages/Admin';
import Backtest from './pages/Backtest';
import BacktestComingSoon from './pages/BacktestComingSoon';
import { isAdminEmail } from './lib/admin';
// Chart Replay & Backtesting was gated behind BacktestComingSoon while we
// figured out TradingView's charting library situation — that's resolved
// (this page has always been built on `lightweight-charts`, TradingView's
// separate free/open-source Apache-2.0 library, not the commercially-
// licensed "Advanced Charts" product - no license, fee, or approval needed,
// just the attribution link their Apache NOTICE requires, see
// ReplayChart.tsx's chart options). It's gated again now for a different
// reason: the feature itself (drawing tools, replay, etc.) is still being
// built and tested and isn't ready to hand to every user yet. BacktestGate
// below reuses the same BacktestComingSoon placeholder for that - same
// isAdminEmail check Layout.tsx uses to hide the sidebar link, and the real
// access control lives server-side in api/backtest.ts (this is UX, not
// security - see that file's note).

/** Splash shown while the very first /columns?resource=auth check is in
 * flight, so logged-in visitors don't see a flash of the landing page (and
 * logged-out visitors don't see a flash of the app) before we know which
 * one to render. */
function AuthSplash() {
  return <div className="min-h-screen bg-background" />;
}

/** Fires a PostHog pageview on every client-side route change. This is a
 * separate component (rather than inlined in App) purely so it can sit
 * inside <BrowserRouter> and call useLocation() — it renders nothing.
 * See lib/analytics.ts for why this is manual instead of PostHog's
 * automatic pageview capture (capture_pageview: false). */
function PageviewTracker() {
  const location = useLocation();
  useEffect(() => {
    capturePageview(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

/** Gate for routes that require a signed-in user. Sends unauthenticated
 * visitors to /login and remembers where they were headed so Login can
 * bounce them back after a successful login. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthSplash />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

/** Gate for /login and /signup: an already-authenticated visitor lands back
 * in the app instead of seeing the auth forms again. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthSplash />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** "/" is dual-purpose: the marketing landing page for a logged-out visitor,
 * the Summary dashboard (inside the full app shell) for a logged-in one. */
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AuthSplash />;
  if (!user) return <Landing />;
  return (
    <AuthedShell>
      <Summary />
    </AuthedShell>
  );
}

/** Scopes AccountProvider + Layout (sidebar, account switcher) to only the
 * authenticated part of the app, so public pages (landing/login/signup)
 * don't mount an AccountProvider that immediately fires an unauthorized
 * GET /api/accounts request. */
function AuthedShell({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <Layout>{children}</Layout>
    </AccountProvider>
  );
}

/** Stands in for the real Backtest page for anyone but the admin account -
 * same reasoning as the /admin route below, but shown as the friendly
 * "coming soon" placeholder rather than a bare 404, since a nav item
 * pointing at a 404 would look broken rather than intentional. The actual
 * access control is server-side (api/backtest.ts 404s the API itself for
 * non-admins) - this just keeps a non-admin who lands here (an old
 * bookmark, a shared link) from seeing a half-finished feature. */
function BacktestGate() {
  const { user } = useAuth();
  return isAdminEmail(user?.email) ? <Backtest /> : <BacktestComingSoon />;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PageviewTracker />
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />

            <Route path="/journal" element={<Protected><AuthedShell><Journal /></AuthedShell></Protected>} />
            <Route path="/performance" element={<Protected><AuthedShell><Performance /></AuthedShell></Protected>} />
            <Route path="/strategies" element={<Protected><AuthedShell><Strategies /></AuthedShell></Protected>} />
            <Route path="/strategies/:id" element={<Protected><AuthedShell><StrategyDetail /></AuthedShell></Protected>} />
            <Route path="/checklists" element={<Protected><AuthedShell><Checklists /></AuthedShell></Protected>} />
            <Route path="/backtest" element={<Protected><AuthedShell><BacktestGate /></AuthedShell></Protected>} />
            {/* No client-side email check here on purpose — the API
                (?resource=admin_stats) is the real gate and 404s anyone but
                the admin. Layout.tsx just hides the nav link for everyone
                else; a person who typed /admin directly would still hit a
                real 404 from useFetch, not a fake "not authorized" page
                that confirms the route exists. */}
            <Route path="/admin" element={<Protected><AuthedShell><Admin /></AuthedShell></Protected>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
