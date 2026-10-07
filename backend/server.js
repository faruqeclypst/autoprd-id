/**
 * AutoPRD.id — server.js
 * Express: serve public/ + API. Port dari BikinPRD dengan tambahan:
 *   - Auth opsional via Supabase (lib/auth.js)
 *   - Penyimpanan owner-aware via lib/db.js (lokal JSON / Supabase Postgres)
 *   - GET /api/config → status fitur untuk frontend
 *
 * Streaming memakai NDJSON polos (Content-Type: application/x-ndjson).
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const { authOptional, authEnabled, ownerOf, isAdmin, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '1mb' }));
app.use(authOptional);
app.use(express.static(path.join(__dirname, 'public')));

function ndjsonHeaders(res) {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function sendLine(res, obj) {
  if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n');
}

function errMsg(err, fallback) {
  return err && err.message ? err.message : fallback;
}

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_SITEKEY = process.env.TURNSTILE_SITE_KEY || '';

// Verifikasi token Cloudflare Turnstile. Return true bila valid / bila tidak dikonfigurasi.
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET) return true; // tidak dikonfigurasi → lewati
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: String(token), remoteip: ip || '' }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await res.json().catch(() => ({}));
    return !!(d && d.success);
  } catch (_) {
    return false;
  }
}

// ---- config publik untuk frontend ----
app.get('/api/config', (req, res) => {
  res.json({
    app: 'AutoPRD.id',
    authEnabled: authEnabled(),
    user: req.user || null,
    isAdmin: isAdmin(req.user),
    // kunci publik Supabase aman diekspos ke browser (dirancang untuk itu)
    supabaseUrl: authEnabled() ? SUPABASE_URL : null,
    supabaseAnonKey: authEnabled() ? SUPABASE_ANON_KEY : null,
    turnstileSiteKey: TURNSTILE_SITEKEY || null,
  });
});

// ---- BYOK ----
function byokFrom(req) {
  const b = req.body && req.body.byok;
  if (!b || typeof b !== 'object') return undefined;
  const baseUrl = String(b.baseUrl || '').trim();
  const apiKey = String(b.apiKey || '').trim();
  const model = String(b.model || '').trim();
  if (!baseUrl && !apiKey && !model) return undefined;
  const { byokProvider } = require('./lib/ai');
  const p = byokProvider({ baseUrl, apiKey, model });
  if (!p) {
    const e = new Error('BYOK tidak valid: lengkapi base URL (diawali http:// atau https://), API key, dan nama model.');
    e.status = 400;
    throw e;
  }
  return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model };
}

function aiContextFrom(req) {
  const byok = byokFrom(req);
  if (process.env.BYOK_ONLY === '1' && !byok) {
    const e = new Error('Mode AI API butuh BYOK: isi base URL + API key + model milikmu di aplikasi dulu.');
    e.status = 400;
    throw e;
  }
  return { byok };
}

// POST /api/byok/test — tes koneksi kunci API milik user lewat jalur yang sama
// persis seperti saat generate (POST {baseUrl}/chat/completions).
// Key TIDAK disimpan dan TIDAK dicatat; hanya dipakai untuk satu request tes ini.
app.post('/api/byok/test', async (req, res) => {
  let p;
  try {
    const { byokProvider } = require('./lib/ai');
    const b = req.body || {};
    p = byokProvider({ baseUrl: b.baseUrl, apiKey: b.apiKey, model: b.model });
    if (!p) throw new Error('Lengkapi base URL (http:// atau https://), API key, dan nama model.');
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  const scrub = (s) => String(s || '').split(p.apiKey).join('***');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(p.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.apiKey },
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      let detail = '';
      try { detail = scrub(await r.text()).slice(0, 160); } catch (_) {}
      return res.json({ ok: false, error: 'HTTP ' + r.status + (detail ? ' — ' + detail : '') });
    }
    return res.json({ ok: true });
  } catch (e) {
    clearTimeout(timer);
    const msg = e && e.name === 'AbortError' ? 'timeout (25 detik)' : scrub(e.message || e);
    return res.json({ ok: false, error: 'Tidak bisa menghubungi provider: ' + msg });
  }
});

function callAIWith(byok) {
  const { callAI } = require('./lib/ai');
  if (!byok) return callAI;
  return function (system, user, opts) {
    return callAI(system, user, Object.assign({}, opts, { byok }));
  };
}

// POST /api/generate
app.post('/api/generate', async (req, res) => {
  const { idea, description, audience, features, tech, answers, mindmap } = req.body || {};
  if (!idea || !description) {
    return res.status(400).json({ error: 'Field idea dan description wajib diisi.' });
  }
  if (TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(req.body && req.body.turnstileToken, req.ip);
    if (!ok) return res.status(403).json({ error: 'Verifikasi keamanan gagal. Muat ulang lalu coba lagi.' });
  }
  ndjsonHeaders(res);
  try {
    const { byok } = aiContextFrom(req);
    const { generatePRD } = require('./lib/ai');
    const details = { description, audience, features, tech, answers, mindmap };
    const sections = [];
    for await (const sec of generatePRD(String(idea), details, { byok })) {
      sections.push(sec);
      sendLine(res, { type: 'section', id: sec.id, title: sec.title, markdown: sec.markdown });
    }
    const markdown = sections.map((s) => s.markdown).join('\n\n');
    const title = String(idea).trim();
    const { id } = await db.savePRD(ownerOf(req), { title, idea: title, markdown });
    sendLine(res, { type: 'done', id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal generate PRD.') });
  }
  res.end();
});

// GET /api/prds
app.get('/api/prds', async (req, res) => {
  try {
    res.json(await db.listPRDs(ownerOf(req)));
  } catch (e) {
    res.status(500).json({ error: errMsg(e, 'Gagal memuat riwayat.') });
  }
});

// GET /api/prds/:id
app.get('/api/prds/:id', async (req, res) => {
  const prd = await db.getPRD(ownerOf(req), req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  res.json(prd);
});

// DELETE /api/prds/:id
app.delete('/api/prds/:id', async (req, res) => {
  await db.deletePRD(ownerOf(req), req.params.id);
  res.json({ ok: true });
});

// POST /api/prds/:id/specs
app.post('/api/prds/:id/specs', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  ndjsonHeaders(res);
  try {
    const callAI = callAIWith(aiContextFrom(req).byok);
    const { extractFeatures, generateFeatureSpec } = require('./lib/specs');
    sendLine(res, { type: 'status', message: 'Menganalisis fitur dari PRD...' });
    let features = [];
    for await (const out of extractFeatures(prd.markdown, callAI)) {
      features = (out && out.features) || [];
    }
    sendLine(res, { type: 'features', features });
    const parts = [];
    const n = features.length;
    if (n === 0) sendLine(res, { type: 'status', message: 'Tidak ada fitur yang terdeteksi dari PRD.' });
    for (let i = 0; i < n; i++) {
      const feature = features[i] || {};
      const fid = String(feature.id != null ? feature.id : 'F' + (i + 1));
      const fname = String(feature.name != null ? feature.name : 'Fitur ' + (i + 1));
      sendLine(res, { type: 'spec_start', index: i, total: n, feature: { id: fid, name: fname } });
      try {
        let md = '';
        for await (const chunk of generateFeatureSpec(prd.markdown, { id: fid, name: fname }, callAI)) {
          const text = typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
          md += text;
          sendLine(res, { type: 'spec_chunk', feature_id: fid, markdown: text });
        }
        parts.push(md);
        sendLine(res, { type: 'spec_done', index: i, total: n, feature_id: fid });
      } catch (e) {
        sendLine(res, { type: 'spec_error', feature_id: fid, message: errMsg(e, 'Gagal generate spec fitur ' + fname + '.') });
      }
    }
    await db.setSpecs(owner, req.params.id, parts.join('\n\n---\n\n'));
    sendLine(res, { type: 'done', id: req.params.id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal generate spec.') });
  }
  res.end();
});

function stripMermaidFence(s) {
  return String(s == null ? '' : s)
    .replace(/^```mermaid\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/g, '')
    .trim();
}

// POST /api/prds/:id/flowchart
app.post('/api/prds/:id/flowchart', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  ndjsonHeaders(res);
  try {
    const callAI = callAIWith(aiContextFrom(req).byok);
    sendLine(res, { type: 'status', message: 'Merancang alur aplikasi...' });
    const system = 'Kamu arsitek software. Balas HANYA kode Mermaid, tanpa fence ``` dan tanpa penjelasan.';
    const user = 'Dari PRD berikut, buat flowchart alur utama aplikasi dalam format Mermaid. ' +
      "Pakai 'graph TD', maksimal 15 node, label Bahasa Indonesia singkat.\n\n" +
      'PRD:\n' + String(prd.markdown || '').slice(0, 12000);
    let raw = '';
    for await (const chunk of callAI(system, user)) {
      const text = typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
      raw += text;
      sendLine(res, { type: 'flowchart_chunk', markdown: text });
    }
    const mermaid = stripMermaidFence(raw);
    sendLine(res, { type: 'flowchart', mermaid });
    await db.setFlowchart(owner, req.params.id, mermaid);
    sendLine(res, { type: 'done', id: req.params.id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal membuat flowchart.') });
  }
  res.end();
});

// GET /api/prds/:id/flowchart
app.get('/api/prds/:id/flowchart', async (req, res) => {
  const prd = await db.getPRD(ownerOf(req), req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  res.json({ mermaid: prd.flowchart || '' });
});

// PUT /api/prds/:id/flowchart
app.put('/api/prds/:id/flowchart', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  const mermaid = req.body && req.body.mermaid != null ? String(req.body.mermaid) : '';
  await db.setFlowchart(owner, req.params.id, stripMermaidFence(mermaid));
  res.json({ ok: true });
});

// POST /api/prds/:id/suggest
app.post('/api/prds/:id/suggest', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  ndjsonHeaders(res);
  try {
    const callAI = callAIWith(aiContextFrom(req).byok);
    const { parseJsonArray } = require('./lib/specs');
    sendLine(res, { type: 'status', message: 'Menganalisis peluang fitur...' });
    const system = 'Kamu product manager. Balas HANYA JSON array, tanpa penjelasan, tanpa markdown fence.';
    const user = 'Dari PRD berikut, berikan maksimal 6 saran fitur tambahan yang BELUM ada di PRD. ' +
      'Balas HANYA JSON array dengan format: ' +
      '[{"title":"...","why":"...","priority":"Tinggi/Sedang/Rendah","effort":"Kecil/Sedang/Besar"}]. ' +
      'Bahasa Indonesia.\n\nPRD:\n' + String(prd.markdown || '').slice(0, 12000);
    let raw = '';
    for await (const chunk of callAI(system, user)) {
      const text = typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
      raw += text;
      sendLine(res, { type: 'suggest_chunk', markdown: text });
    }
    const arr = parseJsonArray(raw) || [];
    const validPriority = ['Tinggi', 'Sedang', 'Rendah'];
    const validEffort = ['Kecil', 'Sedang', 'Besar'];
    const suggestions = arr.slice(0, 6).map((s, i) => ({
      title: String((s && s.title != null ? s.title : 'Saran ' + (i + 1))),
      why: String((s && s.why != null ? s.why : '')),
      priority: validPriority.includes(s && s.priority) ? s.priority : 'Sedang',
      effort: validEffort.includes(s && s.effort) ? s.effort : 'Sedang',
    }));
    sendLine(res, { type: 'suggest_done', suggestions });
    await db.setSuggestions(owner, req.params.id, suggestions);
    sendLine(res, { type: 'done', id: req.params.id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal membuat saran fitur.') });
  }
  res.end();
});

// POST /api/prds/:id/agentsmd
app.post('/api/prds/:id/agentsmd', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  ndjsonHeaders(res);
  try {
    const callAI = callAIWith(aiContextFrom(req).byok);
    const { AGENTS_SYSTEM, buildAgentsUser, stripMdFence } = require('./lib/agentsmd');
    sendLine(res, { type: 'status', message: 'Menyusun AGENTS.md...' });
    const user = buildAgentsUser(prd);
    let raw = '';
    for await (const chunk of callAI(AGENTS_SYSTEM, user, { maxTokens: 4000 })) {
      const text = typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
      raw += text;
      sendLine(res, { type: 'agentsmd_chunk', markdown: text });
    }
    const markdown = stripMdFence(raw);
    if (!markdown) throw new Error('AI mengembalikan hasil kosong.');
    sendLine(res, { type: 'agentsmd', markdown });
    await db.setAgentsMd(owner, req.params.id, markdown);
    sendLine(res, { type: 'done', id: req.params.id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal membuat AGENTS.md.') });
  }
  res.end();
});

// POST /api/prds/:id/designmd
app.post('/api/prds/:id/designmd', async (req, res) => {
  const owner = ownerOf(req);
  const prd = await db.getPRD(owner, req.params.id);
  if (!prd) return res.status(404).json({ error: 'PRD tidak ditemukan.' });
  ndjsonHeaders(res);
  try {
    const callAI = callAIWith(aiContextFrom(req).byok);
    const { DESIGN_SYSTEM, buildDesignUser } = require('./lib/designmd');
    const { stripMdFence } = require('./lib/agentsmd');
    sendLine(res, { type: 'status', message: 'Menyusun design.md...' });
    const user = buildDesignUser(prd);
    let raw = '';
    for await (const chunk of callAI(DESIGN_SYSTEM, user, { maxTokens: 4000 })) {
      const text = typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
      raw += text;
      sendLine(res, { type: 'designmd_chunk', markdown: text });
    }
    const markdown = stripMdFence(raw);
    if (!markdown) throw new Error('AI mengembalikan hasil kosong.');
    sendLine(res, { type: 'designmd', markdown });
    await db.setDesignMd(owner, req.params.id, markdown);
    sendLine(res, { type: 'done', id: req.params.id });
  } catch (e) {
    sendLine(res, { type: 'error', message: errMsg(e, 'Gagal membuat design.md.') });
  }
  res.end();
});

// ---- /api/plan/* ----
async function planHandler(req, res, fn, errLabel) {
  const { idea } = req.body || {};
  if (!idea || !String(idea).trim()) return res.status(400).json({ error: 'Field idea wajib diisi.' });
  let byok;
  try { byok = aiContextFrom(req).byok; }
  catch (e) { return res.status(e.status || 500).json({ error: errMsg(e, errLabel) }); }
  try {
    const callAI = callAIWith(byok);
    res.json(await fn(req, callAI));
  } catch (e) {
    res.status(e.status || 500).json({ error: errMsg(e, errLabel) });
  }
}

app.post('/api/plan/tech', (req, res) => planHandler(req, res, async (rq, callAI) => {
  const { generateTechRecommendations } = require('./lib/plan');
  let recommendations = [];
  for await (const out of generateTechRecommendations(String(rq.body.idea), callAI)) recommendations = (out && out.recommendations) || [];
  return { recommendations };
}, 'Gagal membuat rekomendasi tech stack.'));

app.post('/api/plan/design', (req, res) => planHandler(req, res, async (rq, callAI) => {
  const { generateDesignThemes } = require('./lib/plan');
  let themes = [];
  for await (const out of generateDesignThemes(String(rq.body.idea), callAI)) themes = (out && out.themes) || [];
  return { themes };
}, 'Gagal membuat rekomendasi tema desain.'));

app.post('/api/plan/questions', (req, res) => planHandler(req, res, async (rq, callAI) => {
  const { generateQuestions } = require('./lib/plan');
  let questions = [];
  for await (const out of generateQuestions(String(rq.body.idea), callAI)) questions = (out && out.questions) || [];
  return { questions };
}, 'Gagal membuat pertanyaan klarifikasi.'));

app.post('/api/plan/mindmap', (req, res) => planHandler(req, res, async (rq, callAI) => {
  const { generateMindmap } = require('./lib/plan');
  const { idea, tech, answers } = rq.body || {};
  let mindmap = null;
  for await (const out of generateMindmap(String(idea), tech, answers, callAI)) mindmap = (out && out.mindmap) || null;
  return { mindmap };
}, 'Gagal membuat mindmap fitur.'));

app.post('/api/plan/mmrevise', (req, res) => planHandler(req, res, async (rq, callAI) => {
  const { reviseMindmap } = require('./lib/plan');
  const { idea, tech, answers, mindmap, instruction } = rq.body || {};
  if (!mindmap || !Array.isArray(mindmap.features) || !mindmap.features.length) {
    const e = new Error('Mindmap saat ini tidak valid.');
    e.status = 400;
    throw e;
  }
  let out = null;
  for await (const o of reviseMindmap(String(idea), tech, answers, mindmap, String(instruction || ''), callAI)) {
    out = (o && o.mindmap) || null;
  }
  if (!out) throw new Error('AI tidak mengembalikan revisi.');
  return { mindmap: out };
}, 'Gagal merevisi mindmap.'));

// GET /api/templates
app.get('/api/templates', (req, res) => {
  res.json([
    { id: 'kasirku', name: 'KasirKu', desc: 'Aplikasi kasir (POS) untuk UMKM: produk, transaksi, stok, dan laporan harian.', stack: ['React', 'Node.js', 'SQLite'], downloads: 1284 },
    { id: 'absensiqr', name: 'AbsensiQR', desc: 'Sistem absensi karyawan berbasis QR Code dengan rekap kehadiran otomatis.', stack: ['Next.js', 'PostgreSQL'], downloads: 976 },
    { id: 'tokoonline', name: 'TokoOnline', desc: 'Toko online: katalog produk, keranjang, checkout, dan ongkir.', stack: ['Vue', 'Express', 'MySQL'], downloads: 2103 },
  ]);
});

// ---- Admin (khusus ADMIN_EMAIL) ----
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ ok: false, error: 'Khusus admin.' });
  next();
}

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    res.json(Object.assign({ ok: true }, await db.adminStats()));
  } catch (e) {
    res.status(500).json({ ok: false, error: errMsg(e, 'Gagal memuat statistik.') });
  }
});

app.get('/api/admin/prds', requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, prds: await db.listAllPRDs(req.query.limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: errMsg(e, 'Gagal memuat PRD.') });
  }
});

app.get('/api/admin/ai', requireAdmin, (req, res) => {
  const { providerStatus } = require('./lib/ai');
  res.json({ ok: true, providers: providerStatus() });
});

app.post('/api/admin/ai/test', requireAdmin, async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '');
    if (!['Muse', 'Tiarina', 'Kenari'].includes(name)) {
      return res.status(400).json({ ok: false, error: 'Provider tidak dikenal.' });
    }
    const { testProvider } = require('./lib/ai');
    res.json(Object.assign({ ok: true, provider: name }, await testProvider(name)));
  } catch (e) {
    res.status(500).json({ ok: false, error: errMsg(e, 'Tes koneksi gagal.') });
  }
});

app.post('/api/admin/ai', requireAdmin, (req, res) => {
  try {
    const { saveOverrides } = require('./lib/ai');
    const saved = saveOverrides((req.body && req.body.providers) || {});
    res.json({ ok: true, saved });
  } catch (e) {
    res.status(400).json({ ok: false, error: errMsg(e, 'Gagal menyimpan.') });
  }
});

// ---- React SPA: fallback untuk route client-side ----
const SPA_ROUTES = ['/generator', '/riwayat', '/panduan', '/pengaturan'];
SPA_ROUTES.forEach(function (r) {
  app.get(r, function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});
app.get('/prd/:id', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/admin', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Redirect URL lama (.html) ke route baru
app.get('/index.html', function (req, res) { res.redirect(301, '/'); });
app.get('/generator.html', function (req, res) { res.redirect(301, '/generator'); });
app.get('/riwayat.html', function (req, res) { res.redirect(301, '/riwayat'); });
app.get('/panduan.html', function (req, res) { res.redirect(301, '/panduan'); });
app.get('/pengaturan.html', function (req, res) { res.redirect(301, '/pengaturan'); });
app.get('/prd.html', function (req, res) {
  const id = req.query.id ? String(req.query.id) : '';
  res.redirect(301, id ? '/prd/' + encodeURIComponent(id) : '/riwayat');
});

app.listen(PORT, () => {
  console.log(`AutoPRD.id jalan di port ${PORT} (backend: ${db.backend()})`);
});
