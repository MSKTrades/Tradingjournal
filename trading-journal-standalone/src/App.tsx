import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Summary from './pages/Summary';
import Journal from './pages/Journal';
import Performance from './pages/Performance';
import Strategies from './pages/Strategies';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Summary />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/strategies" element={<Strategies />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
