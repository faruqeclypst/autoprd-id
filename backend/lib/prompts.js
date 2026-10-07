// BikinPRD — prompt per section generator PRD (Bahasa Indonesia).
// Dipakai oleh lib/ai.js: tiap `prompt` adalah template dengan placeholder
// {IDEA}, {DESCRIPTION}, {AUDIENCE}, {FEATURES}, {TECH}, {PREV}
// ({PREV} = ringkasan section sebelumnya, diisi ai.js; boleh kosong).

const SYSTEM = `Kamu penulis PRD profesional. Tulis Bahasa Indonesia, format Markdown. Requirement pakai ID unik (FR-001, NFR-001, US-001). Spesifik pakai angka, jangan mengarang fakta. Jangan tambah basa-basi.`;

const SECTIONS = [
  {
    id: 'ringkasan',
    title: 'Ringkasan Eksekutif',
    prompt: `Tulis ringkasan eksekutif untuk produk {IDEA}: apa yang dibangun, untuk siapa ({AUDIENCE}), dan mengapa penting, berdasarkan deskripsi {DESCRIPTION}, fitur utama {FEATURES}, dan preferensi tech {TECH}. Konteks tambahan: {PREV}. Akhiri dengan 3-5 bullet poin nilai utama produk. Tulis 300-600 kata dalam Markdown rapi tanpa basa-basi.`,
  },
  {
    id: 'latar-belakang',
    title: 'Latar Belakang & Masalah',
    prompt: `Jelaskan latar belakang dan masalah yang diselesaikan {IDEA} untuk {AUDIENCE}: kondisi saat ini, pain point pengguna, dan dampak bisnis bila masalah tidak diselesaikan, berdasarkan {DESCRIPTION} dan {FEATURES}. Pertimbangkan konteks tech {TECH} bila relevan. Konteks tambahan: {PREV}. Pakai angka konkret hanya bila tersedia di deskripsi; jangan mengarang data. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'tujuan',
    title: 'Tujuan & Kriteria Sukses',
    prompt: `Tentukan 1 tujuan utama yang terukur untuk {IDEA} ({AUDIENCE}) beserta tabel kriteria sukses (kolom: Metrik | Kondisi Awal | Target | Tenggat), diturunkan dari {DESCRIPTION} dan {FEATURES}. Sesuaikan target dengan realitas tech stack {TECH}. Konteks tambahan: {PREV}. Setiap target harus berupa angka yang bisa diuji. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'pengguna',
    title: 'Target Pengguna',
    prompt: `Buat 2-4 persona target pengguna {IDEA} dari segmen {AUDIENCE}: tiap persona berisi nama samaran, peran, tujuan memakai produk, dan frustrasi utamanya, dikaitkan dengan {DESCRIPTION} dan {FEATURES}. Catat kebutuhan teknis khusus tiap persona bila berkaitan dengan {TECH}. Konteks tambahan: {PREV}. Format sebagai sub-heading per persona. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'user-stories',
    title: 'User Stories',
    prompt: `Tulis user stories untuk {IDEA} dengan format baku 'Sebagai [pengguna], saya ingin [aksi] agar [manfaat]' dan ID unik US-001, US-002, dst., diturunkan dari {FEATURES} untuk {AUDIENCE}. Tiap story kecil (selesai dalam 1 sesi coding), sertakan 2-3 acceptance criteria berupa checklist (- [ ]), dan pastikan selaras dengan {DESCRIPTION} serta batasan {TECH}. Konteks tambahan: {PREV}. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'functional',
    title: 'Functional Requirements',
    prompt: `Tulis functional requirements untuk {IDEA} dengan ID unik FR-001, FR-002, dst. dan prioritas [P0]/[P1]/[P2], memakai pola kalimat 'Sistem HARUS ...'. Cakup seluruh {FEATURES} untuk {AUDIENCE} sesuai {DESCRIPTION}, dan hormati batasan {TECH}. Konteks tambahan: {PREV}. Tiap requirement harus spesifik dan bisa diuji. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'non-functional',
    title: 'Non-Functional Requirements',
    prompt: `Tulis non-functional requirements untuk {IDEA} dengan ID unik NFR-001, NFR-002, dst., dikelompokkan: Performa, Keamanan, Skalabilitas, Usabilitas. Setiap requirement memakai angka target konkret yang realistis untuk {TECH} dan skala {AUDIENCE}, serta mendukung {FEATURES} dalam {DESCRIPTION}. Konteks tambahan: {PREV}. Jangan mengarang angka tanpa dasar; tulis asumsi bila perlu. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'scope',
    title: 'Scope (In/Out)',
    prompt: `Tentukan ruang lingkup {IDEA} dalam dua daftar tegas: 'In Scope' (yang dibangun sekarang dari {FEATURES} untuk {AUDIENCE}) dan 'Out of Scope' (yang eksplisit TIDAK dibangun di fase ini — tulis sebagai larangan agar AI/dev tidak ngide). Pastikan selaras dengan {DESCRIPTION} dan {TECH}. Konteks tambahan: {PREV}. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'tech-stack',
    title: 'Tech Stack',
    prompt: `Rekomendasikan tech stack untuk {IDEA}: platform, bahasa pemrograman, framework, database, dan layanan pendukung — berdasarkan preferensi {TECH}, kebutuhan {FEATURES}, dan profil {AUDIENCE} dalam {DESCRIPTION}. Tambahkan daftar 'DILARANG' berisi teknologi/praktik yang tidak boleh dipakai (mis. password plaintext). Konteks tambahan: {PREV}. Jelaskan alasan tiap pilihan dalam 1 kalimat. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'roadmap',
    title: 'Roadmap & Milestones',
    prompt: `Susun roadmap implementasi {IDEA} dalam fase: Fase 1 (MVP — hanya fitur P0 dari {FEATURES}), Fase 2, dan fase berikutnya; tiap fase berisi daftar deliverable dan estimasi durasi dalam minggu untuk {AUDIENCE}. Pertimbangkan {DESCRIPTION} dan {TECH}. Konteks tambahan: {PREV}. Akhiri dengan checklist Definition of Done untuk MVP. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'asumsi',
    title: 'Asumsi & Ketergantungan',
    prompt: `Daftar asumsi dan ketergantungan untuk {IDEA}: apa yang dianggap benar agar {FEATURES} bisa dibangun (mis. ketersediaan API pihak ketiga, perilaku {AUDIENCE}), dan ketergantungan eksternal pada {TECH} atau layanan lain. Tandai tiap asumsi dengan ID A-001, A-002, dst. dan beri kolom 'Dampak bila salah'. Selaras dengan {DESCRIPTION}. Konteks tambahan: {PREV}. Jangan mengarang fakta; tulis 'perlu validasi' bila tidak yakin. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'risiko',
    title: 'Risiko & Mitigasi',
    prompt: `Identifikasi risiko utama {IDEA} (teknis, bisnis, operasional) dengan format tabel: ID (R-001...), Risiko, Probabilitas (Rendah/Sedang/Tinggi), Dampak, Mitigasi. Kaitkan dengan {FEATURES}, {TECH}, dan skala {AUDIENCE} dari {DESCRIPTION}. Sertakan minimal 1 risiko teknis, 1 risiko adopsi pengguna, dan 1 risiko operasional. Konteks tambahan: {PREV}. Tulis 300-600 kata dalam Markdown rapi.`,
  },
  {
    id: 'pertanyaan-terbuka',
    title: 'Pertanyaan Terbuka',
    prompt: `Tulis daftar pertanyaan terbuka yang MASIH perlu dijawab sebelum {IDEA} bisa dibangun dengan benar: hal yang ambigu di {DESCRIPTION}, keputusan {TECH} yang belum final, atau kebutuhan {AUDIENCE} yang belum tervalidasi. Tiap item beri ID Q-001, Q-002, dst., tulis kenapa penting, dan siapa yang harus menjawab (owner/dev/user). Minimal 5 pertanyaan substansial. Konteks tambahan: {PREV}. Tulis 300-600 kata dalam Markdown rapi.`,
  },
];

module.exports = { SECTIONS, SYSTEM };
