'use strict';

/* ============================================================================
 * BikinPRD — lib/plan.js — Wizard planning (langkah 3-4):
 *   (3) generateQuestions  — 5 pertanyaan klarifikasi AI dari ide aplikasi.
 *   (4) generateMindmap     — pohon fitur (mindmap) AI dari ide+tech+jawaban.
 *
 * Kontrak:
 *   async function* generateQuestions(idea, callAI)      -> yields {questions}
 *   async function* generateMindmap(idea, tech, answers, callAI) -> yields {mindmap}
 *
 * - callAI(system, user): async generator function, di-pass sebagai argumen.
 *   JANGAN require ./ai.js langsung di sini.
 * - Output SELALU divalidasi sebelum di-yield; gagal validasi (2x percobaan)
 *   -> throw Error yang jelas, supaya server bisa balas 500.
 * ========================================================================== */

const MAX_IDEA_CHARS = 2000;
const MAX_ATTEMPTS = 2;
const VALID_Q_TYPES = ['text', 'single', 'multi'];
const VALID_PHASES = ['Fase 1', 'Fase 2', 'Fase 3'];

/* Ambil objek JSON pertama dari teks (tahan terhadap fence/teks tambahan). */
function parseJsonObject(text) {
  const t = String(text == null ? '' : text);
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch (_) {
    return null;
  }
}

/* Kumpulkan seluruh chunk callAI menjadi satu string. */
async function collectAll(callAI, system, user, opts) {
  let raw = '';
  for await (const chunk of callAI(system, user, opts)) {
    raw += typeof chunk === 'string' ? chunk : (chunk && chunk.markdown) || '';
  }
  return raw;
}

function checkCallAI(callAI) {
  if (typeof callAI !== 'function') {
    throw new TypeError('membutuhkan callAI (async generator function) sebagai argumen');
  }
}

/* ------------------------------------------------------------------ */
/* (3) Pertanyaan klarifikasi                                          */
/* ------------------------------------------------------------------ */

function normalizeQuestions(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.slice(0, 5).map((q, i) => ({
    id: String(q && q.id != null ? q.id : 'q' + (i + 1)),
    text: String(q && q.text != null ? q.text : '').trim(),
    type: VALID_Q_TYPES.includes(q && q.type) ? q.type : i === 0 ? 'text' : 'single',
    options: Array.isArray(q && q.options) ? q.options.map(String).slice(0, 6) : [],
  }));
  const valid = out.filter((q) => q.text);
  return valid.length === 5 ? valid : null;
}

async function* generateQuestions(idea, callAI) {
  checkCallAI(callAI);
  const id = String(idea == null ? '' : idea).slice(0, MAX_IDEA_CHARS);
  const system =
    'Kamu product manager. Balas HANYA JSON, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Dari ide aplikasi berikut, buat 5 pertanyaan klarifikasi agar PRD lebih akurat. ' +
    'Pertanyaan 1 bertipe terbuka (text). Pertanyaan 2-5 bertipe pilihan: ' +
    'tipe "single" (pilih satu) atau "multi" (boleh pilih beberapa), ' +
    'masing-masing beri 4-6 opsi jawaban singkat. ' +
    'Balas HANYA JSON: {"questions":[{"id":"q1","text":"...","type":"text|single|multi","options":[]}]}. ' +
    'Bahasa Indonesia.\n\nIde aplikasi: ' + id;

  let questions = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !questions; attempt++) {
    // Output kecil & deterministik: batasi token agar cepat selesai.
    // rotate: attempt-2 coba provider satunya dulu (Tiarina flaky -> Kenari).
    const raw = await collectAll(callAI, system, user, { maxTokens: 800, temperature: 0.3, rotate: attempt });
    const parsed = parseJsonObject(raw);
    questions = normalizeQuestions(parsed && parsed.questions);
  }
  if (!questions) {
    throw new Error('AI tidak mengembalikan 5 pertanyaan klarifikasi yang valid.');
  }
  yield { questions };
}

/* ------------------------------------------------------------------ */
/* (4) Mindmap fitur                                                   */
/* ------------------------------------------------------------------ */

function formatAnswers(answers) {
  if (!Array.isArray(answers) || answers.length === 0) return '';
  const lines = answers
    .map((a) => {
      const q = String(a && a.q != null ? a.q : '').trim();
      const ans = String(a && a.a != null ? a.a : '').trim();
      if (!q && !ans) return null;
      return '- Q: ' + q + '\n  A: ' + ans;
    })
    .filter(Boolean);
  return lines.length > 0 ? 'Jawaban klarifikasi user:\n' + lines.join('\n') + '\n' : '';
}

function normalizeMindmap(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const root = String(parsed.root != null ? parsed.root : '').trim();
  if (!root) return null;
  let features = Array.isArray(parsed.features) ? parsed.features : [];
  features = features
    .map((f, i) => ({
      id: String(f && f.id != null ? f.id : 'F' + (i + 1)),
      name: String(f && f.name != null ? f.name : '').trim(),
      phase: VALID_PHASES.includes(f && f.phase) ? f.phase : 'Fase 2',
      subfeatures: Array.isArray(f && f.subfeatures)
        ? f.subfeatures.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 5)
        : [],
    }))
    .filter((f) => f.name);
  if (features.length < 6 || features.length > 10) return null;
  return { root, features };
}

async function* generateMindmap(idea, tech, answers, callAI) {
  checkCallAI(callAI);
  const id = String(idea == null ? '' : idea).slice(0, MAX_IDEA_CHARS);
  const techStr = String(tech == null ? '' : tech).slice(0, 500);
  const ansBlock = formatAnswers(answers);
  const system =
    'Kamu arsitek software. Balas HANYA JSON, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Dari ide, tech stack, dan jawaban klarifikasi berikut, susun pohon fitur aplikasi. ' +
    'Balas HANYA JSON: ' +
    '{"root":"Nama Aplikasi","features":[{"id":"F1","name":"Nama Fitur","phase":"Fase 1|Fase 2|Fase 3","subfeatures":["..."]}]}. ' +
    '6-10 fitur, tiap fitur 2-5 subfeatures, phase realistis (fitur inti = Fase 1). ' +
    'Bahasa Indonesia.\n\nIde: ' + id +
    '\nTech stack: ' + (techStr.trim() || '-') +
    '\n' + ansBlock;

  let mindmap = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !mindmap; attempt++) {
    const raw = await collectAll(callAI, system, user, { maxTokens: 2000, temperature: 0.5, rotate: attempt });
    mindmap = normalizeMindmap(parseJsonObject(raw));
  }
  if (!mindmap) {
    throw new Error('AI tidak mengembalikan mindmap fitur yang valid (butuh 6-10 fitur).');
  }
  yield { mindmap };
}

/* ------------------------------------------------------------------ */
/* (2b) Rekomendasi tech stack                                              */
/* ------------------------------------------------------------------ */

function normalizeTechRecs(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const r of arr.slice(0, 6)) {
    const name = String((r && r.name) || '').trim();
    if (!name) continue;
    out.push({ name, reason: String((r && r.reason) || '').trim().slice(0, 160) });
  }
  return out.length >= 3 ? out : null;
}

async function* generateTechRecommendations(idea, callAI) {
  checkCallAI(callAI);
  const id = String(idea == null ? '' : idea).slice(0, MAX_IDEA_CHARS);
  const system =
    'Kamu arsitek software. Balas HANYA JSON, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Untuk ide aplikasi berikut, rekomendasikan 4-6 tech stack yang cocok ' +
    '(kombinasi frontend/mobile + backend + database, mis. "Next.js + PostgreSQL"). ' +
    'Variasi: sertakan opsi modern, opsi populer/matang, dan opsi cepat-MVP. ' +
    'Balas HANYA JSON: {"recommendations":[{"name":"...","reason":"satu kalimat kenapa cocok"}]}. ' +
    'Bahasa Indonesia.\n\nIde aplikasi: ' + id;

  let recs = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !recs; attempt++) {
    const raw = await collectAll(callAI, system, user, { maxTokens: 1000, temperature: 0.5, rotate: attempt });
    const parsed = parseJsonObject(raw);
    recs = normalizeTechRecs(parsed && parsed.recommendations);
  }
  if (!recs) {
    throw new Error('AI tidak mengembalikan rekomendasi tech stack yang valid.');
  }
  yield { recommendations: recs };
}

/* ------------------------------------------------------------------ */
/* (2c) Tema desain — digenerate AI sesuai ide, TIDAK hardcode              */
/* ------------------------------------------------------------------ */

function normalizeDesignThemes(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const t of arr.slice(0, 5)) {
    const name = String((t && t.name) || '').trim();
    if (!name) continue;
    let colors = Array.isArray(t.colors) ? t.colors.filter(function(c){
      return /^#[0-9a-fA-F]{6}$/.test(String(c).trim());
    }).slice(0, 3) : [];
    out.push({
      name,
      style: String((t && t.style) || '').trim().slice(0, 40),
      description: String((t && t.description) || '').trim().slice(0, 160),
      colors,
      vibe: String((t && t.vibe) || '').trim().slice(0, 80),
    });
  }
  return out.length >= 3 ? out : null;
}

async function* generateDesignThemes(idea, callAI) {
  checkCallAI(callAI);
  const id = String(idea == null ? '' : idea).slice(0, MAX_IDEA_CHARS);
  const system =
    'Kamu UI/UX designer. Balas HANYA JSON, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Untuk ide aplikasi berikut, rancang 4-5 TEMA DESAIN yang cocok. ' +
    'JANGAN generik: sesuaikan dengan domain, target pengguna, dan mood produknya. ' +
    'PENTING: tiap tema harus memakai STYLE/DNA desain yang jelas dan berbeda satu sama lain — ' +
    'pilih dari gaya yang dikenal: Glassmorphism, Flat, Neumorphism, Brutalism, Pixel Art, ' +
    'Claymorphism, Minimalism (ala Apple), Monokrom (ala Vercel), Retro, dsb. ' +
    'Tiap tema: nama unik yang evocative, style (salah satu gaya di atas), deskripsi 1 kalimat, ' +
    '3 warna hex dominan yang harmonis, dan vibe singkat. ' +
    'Balas HANYA JSON: {"themes":[{"name":"...","style":"...","description":"...","colors":["#hex","#hex","#hex"],"vibe":"..."}]}. ' +
    'Bahasa Indonesia.\n\nIde aplikasi: ' + id;

  let themes = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !themes; attempt++) {
    const raw = await collectAll(callAI, system, user, { maxTokens: 1000, temperature: 0.7, rotate: attempt });
    const parsed = parseJsonObject(raw);
    themes = normalizeDesignThemes(parsed && parsed.themes);
  }
  if (!themes) {
    throw new Error('AI tidak mengembalikan tema desain yang valid.');
  }
  yield { themes };
}

/* ------------------------------------------------------------------ */
/* (4b) Revisi mindmap oleh AI berdasarkan instruksi user                   */
/* ------------------------------------------------------------------ */

async function* reviseMindmap(idea, tech, answers, mindmap, instruction, callAI) {
  checkCallAI(callAI);
  const id = String(idea == null ? '' : idea).slice(0, MAX_IDEA_CHARS);
  const techStr = String(tech == null ? '' : tech).slice(0, 500);
  const ansBlock = formatAnswers(answers);
  const instr = String(instruction == null ? '' : instruction).slice(0, 1000).trim();
  if (!instr) throw new Error('Instruksi revisi tidak boleh kosong.');
  let current = null;
  try { current = JSON.stringify(normalizeMindmap(mindmap) || mindmap); }
  catch (_) { current = String(mindmap).slice(0, 6000); }
  const system =
    'Kamu arsitek software. Balas HANYA JSON, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Revisi pohon fitur (mindmap) berikut sesuai INSTRUKSI USER. ' +
    'Pertahankan bagian yang tidak disinggung instruksi (jangan hapus fitur/sub-fitur tanpa diminta). ' +
    'Balas HANYA JSON: ' +
    '{"root":"Nama Aplikasi","features":[{"id":"F1","name":"Nama Fitur","phase":"Fase 1|Fase 2|Fase 3","subfeatures":["..."]}]}. ' +
    '6-12 fitur, tiap fitur 2-5 subfeatures, phase realistis (fitur inti = Fase 1). ' +
    'Bahasa Indonesia.\n\nIde aplikasi: ' + id +
    '\nTech stack: ' + (techStr.trim() || '-') +
    '\n' + ansBlock +
    '\nMINDMAP SAAT INI:\n' + current +
    '\n\nINSTRUKSI USER:\n' + instr;

  let out = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !out; attempt++) {
    const raw = await collectAll(callAI, system, user, { maxTokens: 2000, temperature: 0.5, rotate: attempt });
    const parsed = normalizeMindmap(parseJsonObject(raw));
    // revisi boleh 4-12 fitur (lebih longgar dari generate awal)
    if (parsed && parsed.features.length >= 4 && parsed.features.length <= 12) out = parsed;
  }
  if (!out) {
    throw new Error('AI tidak mengembalikan revisi mindmap yang valid.');
  }
  yield { mindmap: out };
}

module.exports = { generateQuestions, generateMindmap, generateTechRecommendations, generateDesignThemes, reviseMindmap };
