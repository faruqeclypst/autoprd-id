import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let scriptPromise = null;

function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise(function (resolve, reject) {
    if (window.turnstile) { resolve(); return; }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('Gagal memuat Turnstile.')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Widget verifikasi manusia Cloudflare Turnstile.
// Props: siteKey, onToken(token), onExpire(). Ref: { reset() }.
const Turnstile = forwardRef(function Turnstile({ siteKey, onToken, onExpire }, ref) {
  const divRef = useRef(null);
  const widgetId = useRef(null);
  const cbRef = useRef({ onToken, onExpire });
  cbRef.current = { onToken, onExpire };

  useImperativeHandle(ref, function () {
    return {
      reset: function () {
        try {
          if (window.turnstile && widgetId.current != null) window.turnstile.reset(widgetId.current);
        } catch (_) {}
      },
    };
  }, []);

  useEffect(function () {
    let cancelled = false;
    loadScript().then(function () {
      if (cancelled || !divRef.current || !window.turnstile) return;
      try {
        widgetId.current = window.turnstile.render(divRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: function (token) { cbRef.current.onToken && cbRef.current.onToken(token); },
          'expired-callback': function () { cbRef.current.onExpire && cbRef.current.onExpire(); },
          'error-callback': function () { cbRef.current.onExpire && cbRef.current.onExpire(); },
        });
      } catch (_) {}
    }).catch(function () {});
    return function () {
      cancelled = true;
      try {
        if (window.turnstile && widgetId.current != null) window.turnstile.remove(widgetId.current);
      } catch (_) {}
      widgetId.current = null;
    };
  }, [siteKey]);

  return <div ref={divRef} aria-label="Verifikasi keamanan" />;
});

export default Turnstile;
