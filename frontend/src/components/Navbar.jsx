import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, initialsFor } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';

function Avatar({ user }) {
  if (user.avatar) {
    return (
      <span className="account-avatar" aria-hidden="true">
        <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
      </span>
    );
  }
  return <span className="account-avatar" aria-hidden="true">{initialsFor(user)}</span>;
}

const APP_LINKS = [
  { to: '/riwayat', label: 'Riwayat' },
  { to: '/panduan', label: 'Panduan' },
  { to: '/pengaturan', label: 'Pengaturan' },
];
const LANDING_LINKS = [
  { to: '/#dokumen', label: 'Fitur', hash: true },
  { to: '/#alur', label: 'Cara kerja', hash: true },
  { to: '/panduan', label: 'Panduan' },
];

export default function Navbar({ variant }) {
  const { user, isAdmin, login, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef(null);

  const isLanding = variant === 'landing';
  const links = isLanding ? LANDING_LINKS : APP_LINKS;

  useEffect(function () {
    setMobileOpen(false);
    setAcctOpen(false);
  }, [loc.pathname]);

  useEffect(function () {
    if (!acctOpen) return;
    function onDoc(e) {
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setAcctOpen(false); }
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return function () {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [acctOpen]);

  function navLink(l) {
    const active = !l.hash && loc.pathname === l.to;
    if (l.hash) return <a key={l.label} href={l.to}>{l.label}</a>;
    return (
      <Link key={l.to} to={l.to} aria-current={active ? 'page' : undefined}>{l.label}</Link>
    );
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-logo">autoprd<span>.</span></Link>
        <nav className="site-nav" aria-label="Navigasi utama">
          {links.map(navLink)}
        </nav>
        <div className="site-actions">
          {!user && (
            <button onClick={login} className="btn btn-ghost btn-sm hide-mobile">Masuk</button>
          )}
          <Link to="/generator" className="btn btn-primary btn-sm site-cta">＋ Buat PRD</Link>
          {user && (
            <div className="account-menu hide-mobile" ref={acctRef}>
              <button
                className="account-btn"
                aria-haspopup="menu"
                aria-expanded={acctOpen}
                onClick={function (e) { e.stopPropagation(); setAcctOpen(function (o) { return !o; }); }}
              >
                <Avatar user={user} />
                <span className="account-name" title={user.email}>{user.name || user.email || 'Akun'}</span>
                <span className="account-caret" aria-hidden="true">▾</span>
              </button>
              {!acctOpen ? null : (
                <div className="account-dropdown" role="menu" aria-label="Menu akun">
                  <button className="theme-row" role="menuitem" onClick={function () { toggle(); setAcctOpen(false); }}>
                    <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
                    <span>{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</span>
                  </button>
                  <div className="menu-sep"></div>
                  <Link to="/pengaturan" role="menuitem">Pengaturan</Link>
                  <Link to="/riwayat" role="menuitem">Riwayat</Link>
                  {isAdmin && <Link to="/admin" role="menuitem">Admin</Link>}
                  <button role="menuitem" data-logout onClick={logout}>Keluar</button>
                </div>
              )}
            </div>
          )}
          <button
            className="nav-toggle"
            aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={function () { setMobileOpen(function (o) { return !o; }); }}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      {!mobileOpen ? null : (
        <div id="mobile-menu" className="mobile-menu">
          <nav aria-label="Menu navigasi">
            {links.map(function (l) {
              const active = !l.hash && loc.pathname === l.to;
              return l.hash
                ? <a key={l.label} href={l.to} onClick={function () { setMobileOpen(false); }}>{l.label}</a>
                : <Link key={l.to} to={l.to} aria-current={active ? 'page' : undefined}>{l.label}</Link>;
            })}
          </nav>
          <div className="mobile-account">
            {!user && <button onClick={login} className="btn btn-ghost btn-sm">Masuk</button>}
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                <Avatar user={user} />
                <span className="account-name" style={{ fontWeight: 600 }}>{user.name || user.email}</span>
                {isAdmin && <Link to="/admin" className="btn btn-ghost btn-sm" onClick={function () { setMobileOpen(false); }}>Admin</Link>}
                <button onClick={logout} className="btn btn-ghost btn-sm">Keluar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
