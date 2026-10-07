import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import './index.css'
import { ThemeProvider } from './lib/theme.jsx'
import { AuthProvider } from './lib/auth.jsx'
import Navbar from './components/Navbar.jsx'
import Landing from './pages/Landing.jsx'
import Generator from './pages/Generator.jsx'
import PrdDetail from './pages/PrdDetail.jsx'
import Riwayat from './pages/Riwayat.jsx'
import Panduan from './pages/Panduan.jsx'
import Pengaturan from './pages/Pengaturan.jsx'

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(function () {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) { el.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function AppShell({ variant, children }) {
  return (
    <>
      <Navbar variant={variant} />
      {children}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<AppShell variant="landing"><Landing /></AppShell>} />
            <Route path="/generator" element={<AppShell variant="app"><Generator /></AppShell>} />
            <Route path="/prd/:id" element={<AppShell variant="app"><PrdDetail /></AppShell>} />
            <Route path="/riwayat" element={<AppShell variant="app"><Riwayat /></AppShell>} />
            <Route path="/panduan" element={<AppShell variant="app"><Panduan /></AppShell>} />
            <Route path="/pengaturan" element={<AppShell variant="app"><Pengaturan /></AppShell>} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
