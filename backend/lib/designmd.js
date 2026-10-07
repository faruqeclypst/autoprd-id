'use strict';

/* ============================================================================
 * BikinPRD — generator design.md dari PRD
 * Menghasilkan panduan visual (Design DNA, warna, tipografi, komponen) yang
 * selaras dengan preferensi tema desain di PRD.
 * ========================================================================== */

const DESIGN_SYSTEM =
  'Kamu adalah UI/UX designer yang menulis design.md — panduan visual untuk ' +
  'frontend developer yang akan membangun tampilan aplikasi. Tulis dalam Bahasa ' +
  'Indonesia (nama teknis tetap Bahasa Inggris). ' +
  'KONKRET: kode hex warna yang spesifik, nama font yang jelas, ukuran dan contoh ' +
  'komponen yang bisa langsung dipakai — bukan saran umum seperti "pilih warna ' +
  'yang menarik". ' +
  'JANGAN mengarang fakta: pakai preferensi tema desain / Design DNA yang tertulis ' +
  'di PRD (termasuk style DNA-nya seperti Glassmorphism, Brutalism, dsb). ' +
  'Bila PRD tidak menyebut detail visual tertentu, rancang yang harmonis dengan ' +
  'Design DNA tersebut dan tandai dengan "(sesuaikan)".';

function buildDesignUser(prd) {
  const title = String((prd && prd.title) || (prd && prd.idea) || 'Aplikasi').trim();
  const design = String((prd && prd.design) || '').trim();
  const md = String((prd && prd.markdown) || '').slice(0, 15000);
  return (
    'Tulis file design.md lengkap untuk proyek berikut.\n\n' +
    'Judul proyek: ' + title + '\n' +
    (design ? 'Preferensi tema desain user: ' + design + '\n' : '') +
    '\nPRD:\n' + md + '\n\n' +
    'Struktur design.md yang wajib ada:\n' +
    '1. `# Design Guide — {Nama Proyek}` + 2-3 kalimat: karakter visual yang ingin dicapai.\n' +
    '2. `## Design DNA` — style yang dipakai (mis. Glassmorphism) + 3-4 prinsip visualnya.\n' +
    '3. `## Warna` — tabel: nama token (mis. `--bg-primary`), kode hex, dipakai untuk apa. ' +
    'Minimal: background, surface, primary/accent, teks, sukses, warning, error.\n' +
    '4. `## Tipografi` — font heading, font body, skala ukuran (h1-h4, body, small) + kapan dipakai.\n' +
    '5. `## Komponen` — spesifikasi: tombol (primary/secondary, radius, padding), kartu, input/form, ' +
    'badge/chip — dengan gaya sesuai Design DNA.\n' +
    '6. `## Layout & Spacing` — pola layout halaman, skala spacing, radius sudut, shadow/elevasi.\n' +
    '7. `## Contoh Penerapan` — 2-3 contoh: "halaman X memakai ..." yang merujuk fitur di PRD.\n' +
    '8. `## Jangan Lakukan` — 4-6 larangan visual yang melanggar Design DNA.\n' +
    'Balas HANYA isi file design.md (boleh pakai markdown fence ```markdown bila perlu, ' +
    'nanti dibersihkan). Bahasa Indonesia.'
  );
}

module.exports = { DESIGN_SYSTEM, buildDesignUser };
