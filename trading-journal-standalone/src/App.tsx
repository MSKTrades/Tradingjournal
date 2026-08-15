import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './lib/theme';
import { AccountProvider } from './lib/accounts';
import Summary from './pages/Summary';
import Journal from './pages/Journal';
import Performance from './pages/Performance';
import Strategies from './pages/Strategies';
import StrategyDetail from './pages/StrategyDetail';
import Checklists from './pages/Checklists';

export default function App() {
  return (
    <ThemeProvider>
      <AccountProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Summary />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/strategies" element={<Strategies />} />
              <Route path="/strategies/:id" element={<StrategyDetail />} />
              <Route path="/checklists" element={<Checklists />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AccountProvider>
    </ThemeProvider>
  );
}
