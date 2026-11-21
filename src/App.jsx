import { Route, Routes, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RadarPage from './pages/Radar.jsx';
import Planner from './pages/Planner.jsx';
import NotionPage from './pages/NotionPage.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/notion" element={<NotionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
