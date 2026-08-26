import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components';
import LandingPage from './LandingPage';
import CuentasPage from './CuentasPage';
import CuentaDetailPage from './CuentaDetailPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/cuentas" element={<CuentasPage />} />
          <Route path="/cuenta/:id" element={<CuentaDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
