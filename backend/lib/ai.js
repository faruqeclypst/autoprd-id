'use strict';

/* ============================================================================
 * BikinPRD — AI engine
 * Primary: Muse (muse-spark-1.3 via Meta Model API) • Failover: Tiarina, Kenari
 * Streaming via fetch SSE, tanpa dependency tambahan (global fetch Node 18+).
 *
 * TIDAK memanggil API apa pun saat module di-load — hanya export fungsi.
 * API key TIDAK pernah di-hardcode; dibaca dari environment saat dipanggil.
 * ========================================================================== */

const DEFAULT_META_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_META_MODEL = 'muse-spark-1.3';
const DEFAULT_TIARINA_BASE_URL = 'https://ai.tiarina.cloud/v1';
const DEFAULT_TIARINA_MODEL = 'deepseek-v4-pro';
const DEFAULT_KENARI_BASE_URL = 'https://kenari.id/v1';
const DEFAULT_KENARI_MODEL = 'deepseek-v4-pro';

function providers() {
  const list = [];
  if (process.env.META_API_KEY) {
    list.push({
      name: 'Muse',
      baseUrl: (process.env.META_BASE_URL || DEFAULT_META_BASE_URL).replace(/\/+$/, ''),
      apiKey: process.env.META_API_KEY,
      model: process.env.META_MODEL || DEFAULT_META_MODEL,
    });
  }
  if (process.env.TIARINA_API_KEY) {
    list.push({
      name: 'Tiarina',
      baseUrl: (process.env.TIARINA_BASE_URL || DEFAULT_TIARINA_BASE_URL).replace(/\/+$/, ''),
      apiKey: process.env.TIARINA_API_KEY,
      model: process.env.TIARINA_MODEL || DEFAULT_TIARINA_MODEL,
    });
  }
  if (process.env.KENARI_API_KEY) {
    list.push({
      name: 'Kenari',
      baseUrl: (process.env.KENARI_BASE_URL || DEFAULT_KENARI_BASE_URL).replace(/\/+$/, ''),
      apiKey: process.env.KENARI_API_KEY,
      model: process.env.KENARI_MODEL || DEFAULT_KENARI_MODEL,
    });
  }
  return list;
}

/* BYOK (Bring Your Own Key): pengunjung menempel base URL + API key + model
 * miliknya sendiri di aplikasi (disimpan di localStorage browser masing-masing).
 * Server hanya meneruskan request ke provider itu — TIDAK PERNAH menyimpan
 * atau mencatat key tersebut.
 * byok = {baseUrl, apiKey, model}. Return provider tunggal {name:'BYOK', ...}
 * atau null bila tidak valid. */
function byokProvider(byok) {
  if (!byok || typeof byok !== 'object') return null;
  const baseUrl = String(byok.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(byok.apiKey || '').trim();
  const model = String(byok.model || '').trim();
  if (!/^https?:\/\//i.test(baseUrl) || baseUrl.length > 300) return null;
  if (apiKey.length === 0 || apiKey.length > 1000) return null;
  if (model.length === 0 || model.length > 200) return null;
  return { name: 'BYOK', baseUrl, apiKey, model };
}

/* Streaming chat completion satu provider: yield string chunks.
 * opts.signal (AbortSignal, opsional): bila di-abort (mis. browser ditutup),
 * fetch AI ikut dibatalkan — hemat token. */
async function* streamChat(p, system, user, opts) {
  opts = opts || {};
  const maxTokens = opts.maxTokens || 4000;
  let res;
  const ctrl = new AbortController();
  // Timeout total 90 detik: jangan pernah gantung selamanya.
  const timer = setTimeout(function(){ ctrl.abort(); }, 90000);
  const extSignal = opts.signal;
  const onExtAbort = function () { ctrl.abort(); };
  if (extSignal) {
    if (extSignal.aborted) { clearTimeout(timer); throw new Error('Dibatalkan: klien terputus.'); }
    extSignal.addEventListener('abort', onExtAbort, { once: true });
  }
  const cleanup = function () {
    clearTimeout(timer);
    if (extSignal) extSignal.removeEventListener('abort', onExtAbort);
  };
  try {
    res = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + p.apiKey,
      },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: true,
        temperature: opts.temperature != null ? opts.temperature : 0.7,
        max_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    cleanup();
    throw new Error(p.name + ' gagal dihubungi: ' + (err && err.message ? err.message : err));
  }
  cleanup();

  if (!res.ok) {
    let detail = '';
    try { detail = String(await res.text()).slice(0, 200); } catch (_) { /* abaikan */ }
    throw new Error(p.name + ' HTTP ' + res.status + (detail ? ' — ' + detail : ''));
  }

  const decoder = new TextDecoder();
  let buf = '';

  const emitLine = function* (line) {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const data = t.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let payload;
    try { payload = JSON.parse(data); } catch (_) { return; }
    const c = payload && payload.choices && payload.choices[0] &&
      payload.choices[0].delta && payload.choices[0].delta.content;
    if (c) yield c;
  };

  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      yield* emitLine(line);
    }
  }
  if (buf.trim()) yield* emitLine(buf); // flush sisa buffer
}

/* callAI(system, user, opts): yields string chunks.
 * Coba Tiarina dulu; jika gagal (non-200/exception) dan KENARI_API_KEY ada,
 * coba Kenari sekali. Keduanya gagal -> throw Error('AI tidak tersedia...').
 * opts: { maxTokens, temperature, rotate, byok, isAdmin } — rotate: angka attempt,
 * dipakai untuk memutar urutan provider (attempt genap = Tiarina dulu, ganjil =
 * Kenari dulu), sehingga retry tidak mengulang provider yang sama.
 * byok: {baseUrl, apiKey, model} — bila valid, dipakai SENDIRI tanpa fallback
 * ke key server (supaya token pemilik server tidak terpakai pengunjung).
 * isAdmin: bila true dan Kunci Admin dipasang, Kunci Admin dicoba DULU lalu
 * failover ke kunci umum (provider server). Tamu & user biasa selalu pakai
 * kunci umum. */
async function* callAI(system, user, opts) {
  opts = opts || {};
  const byok = byokProvider(opts.byok);
  let list;
  if (byok) {
    list = [byok];
  } else {
    const umum = applyOverrides(providers());
    const kunciAdmin = opts.isAdmin ? loadAdminKey() : null;
    list = kunciAdmin ? [kunciAdmin].concat(umum) : umum;
  }
  if (list.length === 0) {
    throw new Error('AI tidak tersedia: belum ada API key di server dan tidak ada BYOK. Tempel base URL + API key + model milikmu di Pengaturan (BYOK).');
  }
  if (opts.rotate && list.length > 1) {
    const n = ((opts.rotate % list.length) + list.length) % list.length;
    list = list.slice(n).concat(list.slice(0, n));
  }
  let lastErr = null;
  for (const p of list) {
    try {
      yield* streamChat(p, system, user, opts);
      return;
    } catch (err) {
      // Klien terputus (browser ditutup): jangan failover, langsung berhenti — hemat token.
      if (opts.signal && opts.signal.aborted) throw err;
      lastErr = err;
    }
  }
  throw new Error(
    'AI tidak tersedia: ' + (lastErr && lastErr.message ? lastErr.message : 'semua provider gagal.')
  );
}

function fill(template, vars) {
  let out = String(template);
  for (const key of Object.keys(vars)) {
    const val = vars[key] == null ? '' : String(vars[key]);
    out = out.split('{' + key + '}').join(val);
  }
  return out;
}

/* Bangun blok konteks tambahan dari wizard (jawaban klarifikasi & mindmap).
 * Dipakai generatePRD: di-append ke SETIAP section user prompt.
 * Tanpa answers/mindmap -> string kosong (perilaku lama tidak berubah). */
function buildExtraContext(details) {
  const parts = [];

  if (Array.isArray(details.answers) && details.answers.length > 0) {
    const lines = details.answers
      .map((a) => {
        const q = String((a && (a.q != null ? a.q : a.question)) || '').trim();
        const ans = String((a && (a.a != null ? a.a : a.answer)) || '').trim();
        if (!q && !ans) return null;
        return '- Q: ' + q + '\n  A: ' + ans;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      parts.push('KONTEKS TAMBAHAN DARI USER:\n' + lines.join('\n'));
    }
  }

  const mm = details.mindmap;
  if (mm && typeof mm === 'object') {
    const feats = Array.isArray(mm.features) ? mm.features : [];
    const lines = [];
    if (mm.root != null && String(mm.root).trim()) {
      lines.push('Aplikasi: ' + String(mm.root).trim());
    }
    for (const f of feats) {
      const fname = String((f && f.name) || '').trim();
      if (!fname) continue;
      const phase = String((f && f.phase) || '').trim();
      lines.push('- Fitur: ' + fname + (phase ? ' (' + phase + ')' : ''));
      const subs = Array.isArray(f.subfeatures) ? f.subfeatures : [];
      const clean = subs.map((s) => String(s).trim()).filter(Boolean);
      if (clean.length > 0) lines.push('  - ' + clean.join(', '));
    }
    if (lines.length > 0) {
      parts.push('STRUKTUR FITUR (mindmap):\n' + lines.join('\n'));
    }
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/* generatePRD(idea, details, opts): yields {id, title, markdown} per section.
 * details = {description, audience, features, tech, answers, mindmap}.
 * answers: [{q, a}] dari wizard klarifikasi; mindmap: {root, features[]}.
 * opts = {byok} — diteruskan ke callAI (lihat di atas).
 * {PREV} = 300 karakter terakhir markdown section sebelumnya (kosong utk pertama). */
async function* generatePRD(idea, details, opts) {
  const { SECTIONS, SYSTEM } = require('./prompts.js');
  details = details || {};
  const byok = opts && opts.byok;
  const signal = opts && opts.signal;
  const isAdmin = !!(opts && opts.isAdmin);
  const extra = buildExtraContext(details);
  let prev = '';
  for (const section of SECTIONS) {
    const user = fill(section.prompt, {
      IDEA: idea,
      DESCRIPTION: details.description,
      AUDIENCE: details.audience,
      FEATURES: details.features,
      TECH: details.tech,
      PREV: prev.slice(-300),
    }) + extra;
    let markdown = '';
    for await (const chunk of callAI(SYSTEM, user, { byok, signal, isAdmin })) {
      markdown += chunk;
    }
    prev = markdown;
    yield { id: section.id, title: section.title, markdown };
  }
}

/* ============================================================================
 * Override AI per-provider oleh admin (disimpan di DATA_DIR/ai-overrides.json).
 * Format: { "Muse": {baseUrl, apiKey, model, disabled}, "Tiarina": {...}, ... }
 * Prioritas: override > env. `disabled: true` mematikan provider.
 * ========================================================================== */
const path = require('path');
const fs = require('fs');

function overridesPath() {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(DATA_DIR, 'ai-overrides.json');
}

function loadOverrides() {
  try {
    return JSON.parse(fs.readFileSync(overridesPath(), 'utf8')) || {};
  } catch (_) { return {}; }
}

function saveOverrides(obj) {
  const prev = loadOverrides();
  const clean = JSON.parse(JSON.stringify(prev));
  for (const name of ['Muse', 'Tiarina', 'Kenari']) {
    const o = (obj && obj[name]) || {};
    const e = clean[name] || {};
    if (o.baseUrl !== undefined) e.baseUrl = String(o.baseUrl).trim().replace(/\/+$/, '');
    if (o.apiKey !== undefined) e.apiKey = String(o.apiKey).trim();
    if (o.model !== undefined) e.model = String(o.model).trim();
    if (o.disabled !== undefined) e.disabled = !!o.disabled;
    if (e.baseUrl && !/^https?:\/\//i.test(e.baseUrl)) throw new Error(name + ': base URL harus diawali http(s)://');
    if (e.apiKey && e.apiKey.length > 2000) throw new Error(name + ': API key terlalu panjang');
    // hapus field yang dikosongkan agar kembali ke env
    ['baseUrl', 'apiKey', 'model'].forEach(function (k) { if (!e[k]) delete e[k]; });
    if (Object.keys(e).length) clean[name] = e; else delete clean[name];
  }
  // Kunci Admin (pribadi): di-set admin lewat panel, dipakai duluan saat admin
  // generate; tamu & user biasa tidak pernah memakainya (mereka pakai kunci umum).
  const ak = (obj && obj._adminKey) || {};
  const cur = clean._adminKey || {};
  if (ak.baseUrl !== undefined) cur.baseUrl = String(ak.baseUrl).trim().replace(/\/+$/, '');
  if (ak.apiKey !== undefined) cur.apiKey = String(ak.apiKey).trim();
  if (ak.model !== undefined) cur.model = String(ak.model).trim();
  if (cur.baseUrl && !/^https?:\/\//i.test(cur.baseUrl)) throw new Error('Kunci Admin: base URL harus diawali http(s)://');
  if (cur.apiKey && cur.apiKey.length > 2000) throw new Error('Kunci Admin: API key terlalu panjang');
  ['baseUrl', 'apiKey', 'model'].forEach(function (k) { if (!cur[k]) delete cur[k]; });
  if (Object.keys(cur).length) clean._adminKey = cur; else delete clean._adminKey;
  fs.mkdirSync(path.dirname(overridesPath()), { recursive: true });
  fs.writeFileSync(overridesPath(), JSON.stringify(clean, null, 2));
  return clean;
}

/* Kunci Admin (pribadi): return {name, baseUrl, apiKey, model} atau null bila
 * belum dipasang lengkap. */
function loadAdminKey() {
  const ak = loadOverrides()._adminKey || {};
  const baseUrl = String(ak.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(ak.apiKey || '').trim();
  const model = String(ak.model || '').trim();
  if (!/^https?:\/\//i.test(baseUrl) || !apiKey || !model) return null;
  return { name: 'Kunci Admin', baseUrl, apiKey, model };
}

function applyOverrides(list) {
  const ov = loadOverrides();
  return list.map(function (p) {
    const o = ov[p.name];
    if (!o) return p;
    if (o.disabled) return null;
    return {
      name: p.name,
      baseUrl: o.baseUrl || p.baseUrl,
      apiKey: o.apiKey || p.apiKey,
      model: o.model || p.model,
      overridden: !!(o.baseUrl || o.apiKey || o.model),
    };
  }).filter(Boolean);
}

function maskKey(k) {
  k = String(k || '');
  if (k.length <= 8) return k ? '••••' : '';
  return k.slice(0, 3) + '••••' + k.slice(-4);
}

// Status provider untuk dashboard admin (key disamarkan, tidak pernah full).
// Return { providers: [...], adminKey: {...} } — adminKey = Kunci Admin pribadi.
function providerStatus() {
  const base = providers();
  const withOv = applyOverrides(base);
  const allOv = loadOverrides();
  const names = ['Muse', 'Tiarina', 'Kenari'];
  const daftar = names.map(function (name) {
    const env = base.find(function (p) { return p.name === name; });
    const cur = withOv.find(function (p) { return p.name === name; });
    const ov = allOv[name] || {};
    const sumber = ov.disabled ? 'dimatikan'
      : !cur ? 'belum-dipasang'
      : (cur.overridden ? 'override' : 'env');
    return {
      name,
      aktif: !!cur,
      baseUrl: cur ? cur.baseUrl : (env ? env.baseUrl : (ov.baseUrl || '')),
      model: cur ? cur.model : (env ? env.model : (ov.model || '')),
      keyMasked: cur && cur.apiKey ? maskKey(cur.apiKey) : '',
      sumber,
      byokOnly: process.env.BYOK_ONLY === '1',
    };
  });
  const ak = loadAdminKey();
  return {
    providers: daftar,
    adminKey: ak
      ? { aktif: true, baseUrl: ak.baseUrl, model: ak.model, keyMasked: maskKey(ak.apiKey) }
      : { aktif: false, baseUrl: '', model: '', keyMasked: '' },
  };
}

// Tes koneksi satu provider: satu chat completion kecil non-streaming.
async function testProvider(name) {
  let p;
  if (name === '_adminKey') {
    p = loadAdminKey();
    if (!p) throw new Error('Kunci Admin belum dipasang lengkap.');
  } else {
    p = applyOverrides(providers()).find(function (x) { return x.name === name; });
    if (!p) throw new Error('Provider ' + name + ' tidak aktif / belum dipasang.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 30000);
  let res;
  try {
    res = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'user', content: 'Balas dengan tepat satu kata: ok' }],
        max_tokens: 5, temperature: 0,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(p.name + ' gagal dihubungi: ' + (err && err.message ? err.message : err));
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = '';
    try { detail = String(await res.text()).slice(0, 160); } catch (_) {}
    throw new Error(p.name + ' HTTP ' + res.status + (detail ? ' — ' + detail : ''));
  }
  const d = await res.json().catch(() => ({}));
  const text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  return { ok: true, balasan: String(text || '').slice(0, 60) };
}

module.exports = { generatePRD, callAI, byokProvider, providers, applyOverrides, loadOverrides, loadAdminKey, saveOverrides, providerStatus, testProvider, maskKey };
