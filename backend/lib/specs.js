'use strict';

/**
 * lib/specs.js — Spesifikasi Fitur per-fitur (streaming + progress real).
 *
 * Masalah yang diperbaiki: dulu 1 request AI raksasa (5+ menit) -> koneksi HP
 * putus -> "Failed to fetch". Sekarang dipecah: ekstrak daftar fitur dulu
 * (1 request pendek), lalu generate spec PER FITUR (request pendek per fitur)
 * sehingga frontend bisa menampilkan progress nyata per fitur.
 *
 * Kontrak:
 *   async function* extractFeatures(prdMarkdown, callAI)
 *     // yields SATU object: {features:[{id,name}, ...]} (maks 10)
 *   async function* generateFeatureSpec(prdMarkdown, feature, callAI)
 *     // yields {markdown} chunks — spec + task list HANYA untuk fitur tsb
 *   parseJsonArray(text) -> array|null  (helper, dipakai server.js juga)
 *
 * - prdMarkdown: string (dipotong ke 12000 char bila lebih panjang).
 * - feature: {id, name}.
 * - callAI: async generator function (system, user) -> yields string chunks.
 *   Di-pass dari server.js (dari lib/ai.js). JANGAN require ./ai.js langsung.
 *
 * Catatan panjang output: interface callAI(system, user) tidak menerima
 * parameter max_tokens, jadi panjang dikendalikan lewat instruksi di prompt
 * ("maksimal ~250 kata"). Kalau mau batasi token secara keras, set
 * default max_tokens di lib/ai.js.
 */

const MAX_PRD_CHARS = 12000;
const MAX_FEATURES = 10;

function trimPRD(prdMarkdown) {
  const prd = String(prdMarkdown == null ? '' : prdMarkdown);
  return prd.length > MAX_PRD_CHARS ? prd.slice(0, MAX_PRD_CHARS) : prd;
}

/* Parse JSON array secara robust: ambil dari '[' pertama sampai ']' terakhir.
 * Mengembalikan array, atau null bila tidak bisa di-parse. */
function parseJsonArray(text) {
  const t = String(text == null ? '' : text);
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function checkCallAI(callAI, fnName) {
  if (typeof callAI !== 'function') {
    throw new TypeError(
      fnName + ' membutuhkan callAI (async generator function) sebagai argumen'
    );
  }
}

/* Ekstrak daftar fitur utama dari PRD. 1 request AI pendek.
 * Yield SATU object: {features:[{id:'F1',name:'...'}, ...]} */
async function* extractFeatures(prdMarkdown, callAI) {
  checkCallAI(callAI, 'extractFeatures');
  const prd = trimPRD(prdMarkdown);

  const system =
    'Kamu analis produk. Tugasmu mengekstrak daftar fitur dari sebuah PRD. ' +
    'Balas HANYA JSON array, tanpa penjelasan, tanpa markdown fence.';
  const user =
    'Dari PRD berikut, ekstrak daftar fitur utama (maksimal ' + MAX_FEATURES + ').\n' +
    'Balas HANYA JSON array dengan format: [{"id":"F1","name":"Nama Fitur"}].\n\n' +
    'PRD:\n' + prd;

  let raw = '';
  for await (const chunk of callAI(system, user)) {
    raw += typeof chunk === 'string' ? chunk : '';
  }

  const arr = parseJsonArray(raw);
  const features = (arr || []).slice(0, MAX_FEATURES).map((f, i) => ({
    id: String(f && f.id != null ? f.id : 'F' + (i + 1)),
    name: String(f && f.name != null ? f.name : 'Fitur ' + (i + 1)),
  }));

  yield { features };
}

/* Generate Spesifikasi Fitur + Task List HANYA untuk satu fitur.
 * Request pendek per fitur -> progress real per fitur di frontend.
 * Yield {markdown} chunks dari callAI. */
async function* generateFeatureSpec(prdMarkdown, feature, callAI) {
  checkCallAI(callAI, 'generateFeatureSpec');
  const prd = trimPRD(prdMarkdown);
  const name = feature && feature.name != null ? String(feature.name) : 'Fitur';

  const system =
    'Kamu technical lead. Tulis Bahasa Indonesia, format Markdown. ' +
    'Singkat dan padat: seluruh jawaban maksimal sekitar 250 kata.';
  const user =
    'Buat Spesifikasi Fitur dan Task List HANYA untuk fitur "' + name + '".\n' +
    'Konteks PRD di bawah ini hanya untuk referensi — JANGAN membahas fitur lain.\n\n' +
    'PRD:\n' + prd + '\n\n' +
    'Gunakan format berikut:\n' +
    '## Spesifikasi: ' + name + '\n' +
    '- Deskripsi singkat\n' +
    '- Input/Output\n' +
    '- Edge cases\n\n' +
    '## Task List\n' +
    "Checklist '- [ ]' yang actionable untuk AI coding agent, " +
    'diurutkan berdasarkan dependensi, tiap task kecil (satu sesi coding).';

  for await (const chunk of callAI(system, user)) {
    yield { markdown: typeof chunk === 'string' ? chunk : '' };
  }
}

module.exports = { extractFeatures, generateFeatureSpec, parseJsonArray };
