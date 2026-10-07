// AutoPRD.id — API client.
// - apiFetch: untuk path /api/* otomatis membawa Bearer token Supabase (bila ada).
// - BYOK: baca/tulis localStorage `bikinprd_byok` ({baseUrl, apiKey, model}).

let authToken = null;
export function setAuthToken(t) { authToken = t || null; }

export async function apiFetch(path, opts) {
  opts = opts || {};
  const headers = new Headers(opts.headers || {});
  if (authToken && path.indexOf('/api/') === 0 && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + authToken);
  }
  return fetch(path, Object.assign({}, opts, { headers }));
}

export async function apiJson(path, body, opts) {
  const res = await apiFetch(path, Object.assign({}, opts, {
    method: (opts && opts.method) || 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {}),
    body: JSON.stringify(body === undefined ? {} : body),
  }));
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const BYOK_KEY = 'bikinprd_byok';
export function getByok() {
  try {
    const v = JSON.parse(localStorage.getItem(BYOK_KEY) || 'null');
    if (v && v.baseUrl && v.apiKey && v.model) return v;
    return null;
  } catch (_) { return null; }
}
export function setByok(v) {
  try {
    if (!v) localStorage.removeItem(BYOK_KEY);
    else localStorage.setItem(BYOK_KEY, JSON.stringify(v));
  } catch (_) {}
}
// Selipkan byok ke body request bila user punya key sendiri.
export function withByok(body) {
  const b = getByok();
  if (!b) return body || {};
  return Object.assign({}, body || {}, { byok: b });
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  const tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  return tgl + ' ' + jam;
}
