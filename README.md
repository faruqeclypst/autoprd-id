<div align="center">

# AutoPRD.id

**Ubah ide menjadi PRD Bahasa Indonesia yang siap coding — lengkap dengan tech spec, AGENTS.md, dan design doc.**

[![Deploy](https://github.com/faruqeclypst/autoprd-id/actions/workflows/deploy.yml/badge.svg)](https://github.com/faruqeclypst/autoprd-id/actions)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fprd.alfaruqasri.my.id&label=live)](https://prd.alfaruqasri.my.id/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)

[🌐 **Coba Live Demo**](https://prd.alfaruqasri.my.id/)

</div>

---

## ✨ Fitur

| | |
|---|---|
| 🧙 **Wizard 5 langkah** | Ide → Teknologi → Pertanyaan → Struktur → Generate, dengan autosave draft 7 hari |
| 📄 **PRD 13 section** | Ditulis AI dalam Bahasa Indonesia, streaming real-time |
| 📦 **4 dokumen turunan** | `PRD.md`, `tech_spec.md`, `AGENTS.md`, `design.md` — siap dilempar ke AI coding agent |
| 🗺️ **Mindmap interaktif** | Struktur PRD sebagai pohon, edit inline + revisi per-card via AI |
| 📊 **Flowchart Mermaid** | Dibuat otomatis dari PRD, bisa disunting manual |
| 🔑 **BYOK** | Pakai API key sendiri — tersimpan hanya di localStorage, tidak pernah ke server |
| 🔄 **Failover AI** | Meta → Tiarina → Kenari, otomatis pindah bila satu provider gagal |
| 💾 **Export lengkap** | Per-file `.md`, gabungan, cetak, dan ZIP |
| 🕘 **Riwayat** | Semua PRD tersimpan dan terpantau statusnya |
| 🔐 **Auth Supabase** | Login Google; tanpa Supabase jalan dalam mode lokal (JSON) |

## 🛠️ Tech stack

| Lapisan | Teknologi |
|---|---|
| Frontend | React 19 + Vite 8, react-router-dom, `marked`, Mermaid (lazy-load) |
| Backend | Node.js 22 + Express 4 |
| Auth & DB | Supabase (Auth + Postgres) — opsional |
| Deploy | GitHub Actions → VPS (rsync + systemd) |

## 📁 Struktur

```
autoprd-id/
├── frontend/                  # React + Vite
│   └── src/
│       ├── pages/             # Landing, Generator, PrdDetail, Riwayat, Panduan, Pengaturan
│       ├── components/        # Navbar, MindmapView, …
│       └── lib/               # api, auth, theme, mindmap
├── backend/                   # Express
│   ├── server.js
│   ├── lib/                   # db, auth, ai, plan, prompts, specs, designmd, agentsmd, store
│   ├── deploy/                # autoprd.service, deploy.sh, .env.example
│   ├── supabase-schema.sql
│   └── nginx-autoprd.conf
└── .github/workflows/         # CI: build + deploy otomatis
```

## 🚀 Jalankan lokal

**Backend:**

```bash
cd backend
cp deploy/.env.example .env   # isi seperlunya (boleh kosong → mode lokal)
npm install
node server.js                # http://localhost:3101
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev                   # proxy /api → :3101 (lihat vite.config.js)
```

## ⚙️ Konfigurasi

| Variabel | Fungsi |
|---|---|
| `PORT` | Port HTTP server (default `3101`) |
| `META_API_KEY` / `TIARINA_API_KEY` / `KENARI_API_KEY` | API key AI (failover berurutan) |
| `BYOK_ONLY=1` | Kill switch — key server tidak dipakai sama sekali |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Auth Google + Postgres (kosongkan = mode lokal) |
| `DATA_DIR` | Direktori data JSON mode lokal |

> ⚠️ Jangan pernah commit `.env` — hanya `.env.example` yang ada di repo.

## 🔌 API

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/generate` | Generate PRD (streaming NDJSON) |
| `GET` | `/api/prds` | Daftar PRD |
| `GET` / `DELETE` | `/api/prds/:id` | Ambil / hapus PRD |
| `POST` | `/api/prds/:id/specs` | Generate tech spec |
| `POST` | `/api/prds/:id/agentsmd` | Generate AGENTS.md |
| `POST` | `/api/prds/:id/designmd` | Generate design.md |
| `POST` | `/api/prds/:id/flowchart` | Generate flowchart Mermaid |
| `POST` | `/api/prds/:id/suggest` | Saran perbaikan AI |
| `POST` | `/api/plan/tech`, `/api/plan/questions`, `/api/plan/mindmap`, `/api/plan/mmrevise` | Tahapan wizard |
| `GET` | `/api/templates` | Daftar template PRD |
| `POST` | `/api/byok/test` | Tes koneksi API key pengunjung |

## 📦 Deploy

Otomatis via **GitHub Actions** setiap push ke `main`:

1. Build frontend (`npm ci && npm run build`)
2. Rsync `backend/` → `/opt/autoprd` (melewati `node_modules`, `data`, `queue`, `public`, `.env`)
3. Rsync `frontend/dist/` → `/opt/autoprd/public`
4. `npm ci --omit=dev` → `chown` → `systemctl restart autoprd.service`

Butuh repository secret **`VPS_SSH_KEY`** — private key ed25519 yang public key-nya
terdaftar di `~/.ssh/authorized_keys` user `ubuntu` di VPS.

Deploy manual:

```bash
cd backend/deploy && ./deploy.sh
```

## 📝 Lisensi

[MIT](LICENSE) © 2026 Alfaruq Asri
