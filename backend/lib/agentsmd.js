'use strict';

/* ============================================================================
 * BikinPRD — generator AGENTS.md dari PRD
 * Menghasilkan file instruksi kerja untuk coding agent (setup, perintah,
 * struktur, env, konvensi, deploy) yang selaras dengan isi PRD.
 * ========================================================================== */

const AGENTS_SYSTEM =
  'Kamu adalah tech lead yang menulis AGENTS.md — file instruksi untuk coding ' +
  'agent yang akan membangun aplikasi ini dari nol. Tulis dalam Bahasa Indonesia ' +
  '(perintah dan kode tetap Bahasa Inggris). ' +
  'KONKRET dan operasional: perintah yang bisa disalin-tempel, nama file/direktori ' +
  'yang jelas, bukan teori umum. ' +
  'JANGAN mengarang fakta: semua klaim stack/fitur harus merujuk isi PRD. ' +
  'Bila info tidak ada di PRD (mis. target deploy, nama repo, port), pilih default ' +
  'yang paling masuk akal untuk stack tersebut dan tandai dengan "(sesuaikan)". ' +
  'Pilih package manager/runtime sesuai stack di PRD (mis. bun untuk proyek JS/TS ' +
  'modern bila cocok, pip/uv untuk Python, go untuk Go, dsb) — konsisten di semua perintah.';

function buildAgentsUser(prd) {
  const title = String((prd && prd.title) || (prd && prd.idea) || 'Aplikasi').trim();
  const md = String((prd && prd.markdown) || '').slice(0, 15000);
  return (
    'Tulis file AGENTS.md lengkap untuk proyek berikut.\n\n' +
    'Judul proyek: ' + title + '\n\n' +
    'PRD:\n' + md + '\n\n' +
    'Struktur AGENTS.md yang wajib ada:\n' +
    '1. `# {Nama Proyek}` + 2-3 kalimat ringkasan: apa aplikasinya, untuk siapa.\n' +
    '2. `## Tech Stack` — tabel: layer, teknologi (dari PRD), catatan singkat.\n' +
    '3. `## Perintah` — blok kode berisi perintah install, dev, build, start/prod, dan test. ' +
    'Satu runtime/package manager yang konsisten (mis. `bun install`, `bun run dev`, `bun run build`, `bun start`).\n' +
    '4. `## Struktur Proyek` — pohon direktori usulan dengan 1 baris penjelasan per direktori penting.\n' +
    '5. `## Environment Variables` — daftar variabel yang dibutuhkan (dari kebutuhan PRD), tanpa nilai rahasia asli.\n' +
    '6. `## Konvensi` — gaya kode, bahasa (Indonesia/Inggris), aturan penting dari NFR PRD.\n' +
    '7. `## Deploy` — target deploy (dari PRD; bila tidak ada, usulkan yang masuk akal + tandai "(sesuaikan)") dan langkah deploy ringkas.\n' +
    '8. `## Batasan` — hal yang TIDAK boleh dilakukan, diringkas dari Scope Out PRD.\n' +
    'Balas HANYA isi file AGENTS.md (boleh pakai markdown fence ```markdown bila perlu, ' +
    'nanti dibersihkan). Bahasa Indonesia.'
  );
}

/* Buang pembungkus ```markdown fence bila AI membungkus output.
 * Tangani juga kasus fence pembuka tanpa penutup. */
function stripMdFence(s) {
  let t = String(s || '').trim();
  t = t.replace(/^```(?:markdown|md)?\s*\n/, '');
  t = t.replace(/\n?```\s*$/, '');
  return t.trim();
}

module.exports = { AGENTS_SYSTEM, buildAgentsUser, stripMdFence };
