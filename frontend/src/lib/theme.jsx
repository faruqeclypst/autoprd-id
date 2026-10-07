import { createContext, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({ theme: 'light', toggle: function () {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(function () {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });
  useEffect(function () {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('autoprd_theme', theme); } catch (_) {}
  }, [theme]);
  function toggle() { setTheme(function (t) { return t === 'dark' ? 'light' : 'dark'; }); }
  return <ThemeCtx.Provider value={{ theme: theme, toggle: toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }
