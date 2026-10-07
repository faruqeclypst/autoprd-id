# AutoPRD.id — Frontend Reskin SPEC

## Konteks
Rebuild total "BikinPRD" menjadi **AutoPRD.id**. Sumber: `~/workspace/prd-clone/app/public/` (BikinPRD, tema dark biru).
Target: `~/workspace/autoprd/public/` — design system baru ala kenari.id, **light + dark mode**.

## Fondasi yang SUDAH ADA (jangan buat ulang)
- `~/workspace/autoprd/public/css/tokens.css` — design tokens + komponen (`.btn`, `.card`, `.field`, `.badge`, `.menu-*`, `.modal-*`, `.md-body`, `.theme-toggle`, util `.ink/.muted/.faint/.accent-text/.bd/.bg-surface/.bg-sunken`).
- `~/workspace/autoprd/public/js/theme.js` — toggle light/dark, **wajib dimuat di `<head>`** tiap halaman.
- Backend lib sudah dicopy ke `~/workspace/autoprd/lib/`.

## Aturan keras
1. **Jangan ubah satu pun `id="..."` elemen.** Logika JS bergantung padanya. Setelah selesai, buktikan dengan `diff` daftar id vs file sumber.
2. **Jangan ubah logika JS.** Hanya ganti string class Tailwind warna di HTML & template/innerHTML JS sesuai tabel mapping. Layout Tailwind (flex/grid/spacing) BOLEH dipertahankan.
3. Tailwind CDN tetap boleh dipakai untuk layout, TAPI jangan ada lagi class warna hardcoded dark (tidak ada `bg-[#111827]`, `text-gray-400`, dsb. untuk elemen bertema).
4. Setiap halaman wajib: `<link>` ke `css/tokens.css`, `<script src="js/theme.js">` di head, Google Fonts (Archivo/Inter/JetBrains Mono), dan header pattern di bawah.
5. Bahasa Indonesia. Wordmark: **autoprd.** (titik aksen). Judul tab: "AutoPRD.id — ...".
6. Tidak ada gambar eksternal. Emoji seperlunya.

### Fonts
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

### Header (tempel di tiap halaman, setelah <body>)
```html
<header class="sticky top-0 z-40" style="background:var(--canvas);border-bottom:1px solid var(--line)">
  <div class="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
    <a href="index.html" class="font-display" style="font-weight:700;font-size:1.35rem;letter-spacing:-0.02em;color:var(--ink);text-decoration:none">autoprd<span style="color:var(--accent)">.</span></a>
    <nav class="hidden sm:flex items-center gap-5 text-sm ml-6">
      <a href="generator.html" class="muted" style="text-decoration:none">Buat PRD</a>
      <a href="riwayat.html" class="muted" style="text-decoration:none">Riwayat</a>
      <a href="panduan.html" class="muted" style="text-decoration:none">Panduan</a>
    </nav>
    <div class="ml-auto flex items-center gap-2">
      <button data-theme-toggle class="theme-toggle" aria-label="Ganti tema">🌙</button>
      <button id="btn-login" class="btn btn-ghost btn-sm" style="display:none">Masuk dengan Google</button>
      <span id="user-chip" class="badge badge-muted" style="display:none"></span>
    </div>
  </div>
</header>
```
(`#btn-login`/`#user-chip` disembunyikan dulu; di-wire belakangan oleh app.js.)

## Tabel mapping class (lama → baru)
| Lama | Baru |
|---|---|
| `bg-[#0b0f19]` di body/wrapper | hapus — body sudah `var(--canvas)` |
| `bg-[#111827]` | `card` (tambah `card-pad` bila perlu padding) atau `bg-surface` |
| `bg-[#0a0e17]` | `bg-sunken` |
| `border-white/10`, `border-gray-800`, `border-gray-700`, `border-slate-*` | `bd` |
| `text-white` (heading) | `ink` (+ `font-display` untuk heading besar) |
| `text-gray-200`, `text-gray-300` | `ink` atau `muted` |
| `text-gray-400` | `muted` |
| `text-gray-500`, `text-gray-600` | `faint` |
| `bg-[#38bdf8]` + `text-[#0b0f19]` | `btn btn-primary` |
| `bg-white/10` + `text-white` | `btn btn-ghost` |
| `text-[#7dd3fc]` | `accent-text` |
| `border-[#38bdf8]` / `border-sky-400` | `style="border-color:var(--accent)"` |
| `bg-[#38bdf8]/15` + `text-[#7dd3fc]` | `badge` |
| `rounded-2xl`/`rounded-xl` pada kartu | biarkan (Tailwind), atau 8px |
| Custom class lama (`tech-card`, `rec-chip`, `.field` lokal) | definisikan ulang di `<style>` halaman memakai `var()` — JANGAN hardcode hex |
| mindmap.js: stylesheet yang di-inject (baris ~79-90) | ganti hex hardcoded (`#161d2e`, `#e5eefc`, `#38bdf8`, `#94a3b8`, `#0b0f19`) dengan `var(--surface)`, `var(--ink)`, `var(--accent)`, `var(--ink-soft)`, `var(--on-accent)` — CSS var BERLAKU di injected stylesheet |

## Tugas per agen
### Agen A — index.html (landing, BARU total)
Kenari-style: kicker "Generator PRD Bahasa Indonesia", hero dua kolom (kiri: headline Archivo 800 "Ubah ide jadi PRD siap coding.", subheadline, CTA `Mulai Buat PRD` → generator.html + link `Lihat cara pakai` → panduan.html; kanan: kartu mini contoh isi PRD / statistik), strip fitur "4 dokumen standar" (PRD, tech_spec, AGENTS.md, design.md sebagai 4 kartu), "Cara kerja" 3 langkah, section BYOK + mode Daslivia, footer minimal. Tombol `.btn btn-primary` / `.btn-ghost`, kartu `.card card-pad`.

### Agen B — generator.html + mindmap.js (PORT)
Copy dari sumber, reskin penuh per mapping. Wizard 5 step, pilihan model AI API/Daslivia, BYOK box, mindmap — SEMUA harus tetap berfungsi identik. Copy `mindmap.js` ke `~/workspace/autoprd/public/` dan sesuaikan stylesheet inject-nya. Verifikasi: daftar `id="..."` hasil = sumber (diff).

### Agen C — prd.html + riwayat.html + panduan.html (PORT)
- prd.html: toolbar (← Riwayat, 🤖 Generate ▾, ⬇️ Export ▾) pakai `.menu-*`, modal konfirmasi pakai `.modal-*`, render markdown pakai `.md-body`. Copy `zip.js` bila ada di sumber. Jangan ubah logika generate/export/BYOK.
- riwayat.html: daftar kartu PRD (`.card`), tombol hapus.
- panduan.html: tulis ulang rapi memakai `.md-body` + `.card` (isi: 4 dokumen, alur 5 langkah, contoh prompt, tips). Sumber: `~/workspace/prd-clone/app/public/panduan.html`.

## Definisi selesai
- Semua file di `~/workspace/autoprd/public/`, halaman terbuka tanpa error console, toggle tema bekerja di tiap halaman, semua ID utuh (bukti diff untuk file port).
