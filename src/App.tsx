import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components';
import { useAuth } from './hooks/useAuth';
import LandingPage from './LandingPage';
import AuthPage from './AuthPage';
import CuentasPage from './CuentasPage';
import CuentaDetailPage from './CuentaDetailPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-muted)] text-sm">Cargando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-muted)] text-sm">Cargando...</div>;
  if (user) return <Navigate to="/cuentas" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<GuestRoute><AuthPage /></GuestRoute>} />
          <Route path="/cuentas" element={<ProtectedRoute><CuentasPage /></ProtectedRoute>} />
          <Route path="/cuenta/:slug" element={<ProtectedRoute><CuentaDetailPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
