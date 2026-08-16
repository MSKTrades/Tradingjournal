import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './lib/theme';
import { AccountProvider } from './lib/accounts';
import { AuthProvider, useAuth } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Summary from './pages/Summary';
import Journal from './pages/Journal';
import Performance from './pages/Performance';
import Strategies from './pages/Strategies';
import StrategyDetail from './pages/StrategyDetail';
import Checklists from './pages/Checklists';
import Backtest from './pages/Backtest';

/** Splash shown while the very first /columns?resource=auth check is in
 * flight, so logged-in visitors don't see a flash of the landing page (and
 * logged-out visitors don't see a flash of the app) before we know which
 * one to render. */
function AuthSplash() {
  return <div className="min-h-screen bg-background" />;
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

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />

            <Route path="/journal" element={<Protected><AuthedShell><Journal /></AuthedShell></Protected>} />
            <Route path="/performance" element={<Protected><AuthedShell><Performance /></AuthedShell></Protected>} />
            <Route path="/strategies" element={<Protected><AuthedShell><Strategies /></AuthedShell></Protected>} />
            <Route path="/strategies/:id" element={<Protected><AuthedShell><StrategyDetail /></AuthedShell></Protected>} />
            <Route path="/checklists" element={<Protected><AuthedShell><Checklists /></AuthedShell></Protected>} />
            <Route path="/backtest" element={<Protected><AuthedShell><Backtest /></AuthedShell></Protected>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
