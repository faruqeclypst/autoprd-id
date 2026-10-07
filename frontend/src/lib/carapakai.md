# 📖 Cara Pakai Dokumen .md dengan AI Agent

File dari AutoPRD.id bukan arsip pajangan — ini bahan bakar buat AI coding agent
(Antigravity, Cursor, Claude Code, dsb).

## 1. Kenali file-mu

| File | Isi | Peran |
|------|-----|-------|
| PRD.md | Apa & kenapa aplikasi ini dibuat | Konteks besar — kasih di awal |
| tech_spec.md | Cara teknis + checklist task per fitur | Panduan kerja bertahap |
| AGENTS.md | Aturan main: perintah, struktur, konvensi, deploy | WAJIB di root proyek |
| design.md | Panduan visual: warna, font, komponen | Acuan setiap bikin UI |

## 2. Alur kerja yang benar

1. Buat folder proyek baru, taruh keempat file di dalamnya.
   AGENTS.md harus di ROOT (sejajar src/), bukan subfolder.
2. Buka folder di AI agent (mis. Antigravity → Open Folder).
3. Mulai dengan prompt konteks (jangan langsung "buatkan aplikasinya").
4. Kerjakan PER TASK dari tech_spec.md — satu fitur selesai, review, baru lanjut.
5. Setiap bikin UI, suruh agent merujuk design.md.

## 3. Contoh prompt (Antigravity)

Setup awal:
```
Baca AGENTS.md, PRD.md, dan design.md sampai paham.
Lalu kerjakan task pertama dari tech_spec.md.
Jangan lanjut ke task berikutnya sebelum aku bilang OK.
```

Per fitur:
```
Lanjut ke task berikutnya di tech_spec.md: "[nama fitur]".
Ikuti acceptance criteria yang tertulis di sana.
```

Styling:
```
Buatkan halaman [nama halaman] mengikuti design.md —
pakai token warna dan gaya komponen yang sudah ditentukan.
```

Self-review:
```
Cek ulang kode yang baru kamu tulis terhadap AGENTS.md bagian Konvensi.
Perbaiki yang melanggar.
```

## 4. Tool lain

- Cursor: pakai @AGENTS.md / @PRD.md di chat untuk merujuk file.
- Claude Code: jalankan dari folder proyek (otomatis baca AGENTS.md di root).
- ChatGPT/Claude web: upload keempat file sebagai attachment.

## 5. Tips

- Satu task satu sesi, jangan "buatkan semuanya sekaligus".
- Selalu review hasil sebelum lanjut; commit tiap task selesai.
- Kalau agent ngawur, tunjuk bagian spesifik ("lihat tech_spec.md bagian X").

## 6. Kesalahan umum

- Paste semua file jadi satu prompt raksasa.
- Minta full aplikasi sekaligus tanpa tahapan.
- AGENTS.md ditaruh di subfolder.
- Ubah requirement tengah jalan tanpa update PRD.