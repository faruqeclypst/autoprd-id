import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { setAuthToken, apiFetch } from './api';

const AuthCtx = createContext({
  user: null, isAdmin: true, authEnabled: false, ready: false,
  login: function () {}, logout: function () {},
});

function toUser(session) {
  if (!session || !session.user) return null;
  const umd = session.user.user_metadata || {};
  return {
    id: session.user.id,
    email: session.user.email,
    name: umd.full_name || umd.name || '',
    avatar: umd.avatar_url || umd.picture || '',
  };
}

export function initialsFor(user) {
  const name = ((user && user.name) || '').trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }
  const email = ((user && user.email) || '').trim();
  return email ? email.slice(0, 2).toUpperCase() : '?';
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, isAdmin: true, authEnabled: false, ready: false });
  const clientRef = useRef(null);

  useEffect(function () {
    let cancelled = false;
    let unsubscribe = null;
    (async function () {
      try {
        const cfg = await (await fetch('/api/config')).json();
        if (!cfg || !cfg.authEnabled) {
          if (!cancelled) setState({ user: null, isAdmin: true, authEnabled: false, ready: true });
          return;
        }
        const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        clientRef.current = client;

        async function applySession(session) {
          if (cancelled) return;
          const user = toUser(session);
          if (session) {
            setAuthToken(session.access_token);
            let isAdmin = false;
            try {
              const c2 = await (await apiFetch('/api/config')).json();
              isAdmin = !!(c2 && c2.isAdmin);
            } catch (_) {}
            if (!cancelled) setState({ user: user, isAdmin: isAdmin, authEnabled: true, ready: true });
          } else {
            setAuthToken(null);
            if (!cancelled) setState({ user: null, isAdmin: false, authEnabled: true, ready: true });
          }
        }

        const got = await client.auth.getSession();
        await applySession(got.data.session);
        // Bersihkan token OAuth dari address bar setelah sesi terbaca.
        if (window.location.hash && /access_token|refresh_token/.test(window.location.hash)) {
          try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
        }
        const sub = client.auth.onAuthStateChange(function (_ev, session) { applySession(session); });
        unsubscribe = function () { try { sub.data.subscription.unsubscribe(); } catch (_) {} };
      } catch (_) {
        if (!cancelled) setState(function (s) { return Object.assign({}, s, { ready: true }); });
      }
    })();
    return function () { cancelled = true; if (unsubscribe) unsubscribe(); };
  }, []);

  function login() {
    const c = clientRef.current;
    if (c) {
      c.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
    }
  }
  function logout() {
    if (!window.confirm('Keluar dari AutoPRD.id?')) return;
    const c = clientRef.current;
    setAuthToken(null);
    if (c) c.auth.signOut().then(function () { window.location.href = '/'; });
    else window.location.href = '/';
  }

  return <AuthCtx.Provider value={Object.assign({}, state, { login: login, logout: logout })}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }
