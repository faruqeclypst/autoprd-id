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

/* Streaming chat completion satu provider: yield string chunks. */
async function* streamChat(p, system, user, opts) {
  opts = opts || {};
  const maxTokens = opts.maxTokens || 4000;
  let res;
  const ctrl = new AbortController();
  // Timeout total 90 detik: jangan pernah gantung selamanya.
  const timer = setTimeout(function(){ ctrl.abort(); }, 90000);
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
    clearTimeout(timer);
    throw new Error(p.name + ' gagal dihubungi: ' + (err && err.message ? err.message : err));
  }
  clearTimeout(timer);

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
 * opts: { maxTokens, temperature, rotate, byok } — rotate: angka attempt, dipakai
 * untuk memutar urutan provider (attempt genap = Tiarina dulu, ganjil = Kenari dulu),
 * sehingga retry tidak mengulang provider yang sama.
 * byok: {baseUrl, apiKey, model} — bila valid, dipakai SENDIRI tanpa fallback
 * ke key server (supaya token pemilik server tidak terpakai pengunjung). */
async function* callAI(system, user, opts) {
  opts = opts || {};
  const byok = byokProvider(opts.byok);
  let list = byok ? [byok] : providers();
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
    for await (const chunk of callAI(SYSTEM, user, { byok })) {
      markdown += chunk;
    }
    prev = markdown;
    yield { id: section.id, title: section.title, markdown };
  }
}

module.exports = { generatePRD, callAI, byokProvider };
