import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const SAMPLES = {
  prd: {
    label: 'PRD.md',
    body: '# PRD: Aplikasi To-Do List untuk Guru\n\n## 1. Ringkasan\nAplikasi pencatatan tugas harian untuk guru,\nbisa dipakai offline dari HP maupun laptop.\n\n## 2. Pengguna Sasaran\n- Guru kelas (pengguna utama)\n- Kepala sekolah (melihat rekap)\n\n## 3. Fitur Utama\n1. Tambah, ubah, dan hapus tugas\n2. Pengingat tenggat otomatis\n3. Rekap mingguan'
  },
  spec: {
    label: 'tech_spec.md',
    body: '# Tech Spec: To-Do List Guru\n\n## Fitur 1: Tambah Tugas\n### Task\n- [ ] Form tambah tugas: judul, tenggat\n- [ ] Validasi tanggal tidak boleh lampau\n- [ ] Simpan ke database lokal\n\n## Fitur 2: Pengingat\n### Task\n- [ ] Notifikasi H-1 sebelum tenggat\n- [ ] Tandai tugas sebagai selesai'
  },
  agents: {
    label: 'AGENTS.md',
    body: '# AGENTS.md: To-Do List Guru\n\n## Stack\n- Flutter untuk aplikasi mobile\n- SQLite untuk penyimpanan lokal\n\n## Perintah\n- `flutter run`: jalankan saat development\n- `flutter build apk`: buat file rilis\n\n## Konvensi\n- Satu file, satu tanggung jawab\n- Tulis tes untuk logika tanggal'
  },
  design: {
    label: 'design.md',
    body: '# Design DNA: To-Do List Guru\n\n## Palet\n- Primer: #B5362A (bata)\n- Kanvas: #FBF6EE (krem hangat)\n\n## Tipografi\n- Judul: Archivo Bold\n- Isi: Inter Regular\n\n## Larangan\n- Jangan pakai gradien ungu-biru\n- Jangan pakai bayangan ganda'
  }
};
const TABS = [
  { key: 'prd', id: 'tab-prd', fname: 'PRD.md', desc: 'Kebutuhan produk: pengguna, fitur, scope, dan user stories.' },
  { key: 'spec', id: 'tab-spec', fname: 'tech_spec.md', desc: 'Rincian teknis per fitur plus checklist task siap kerjakan.' },
  { key: 'agents', id: 'tab-agents', fname: 'AGENTS.md', desc: 'Aturan main untuk coding agent: stack, perintah, konvensi.' },
  { key: 'design', id: 'tab-design', fname: 'design.md', desc: 'Panduan visual: warna, tipografi, komponen, dan larangan.' }
];
const STEPS = [
  ['Ceritakan idemu', 'Tulis ide aplikasimu dalam Bahasa Indonesia, lalu pilih teknologi dan tema desain yang kamu mau.'],
  ['Jawab lima pertanyaan', 'AI mengajukan pertanyaan kunci untuk mempertajam scope: siapa penggunanya, fitur apa yang wajib, batasannya di mana.'],
  ['Petakan fiturnya', 'Susun mindmap fitur secara visual. Ubah nama, tambah sub-fitur, atau minta revisi AI langsung dari tiap kartu.'],
  ['Terima empat dokumen', 'PRD 13 bagian disusun lengkap, lalu turunkan jadi tech spec, AGENTS.md, dan design.md. Unduh per file, print ke PDF, atau bundel jadi satu ZIP.']
];

/* Siklus terminal hero: baris muncul berjenjang, jeda, ulangi. Pause saat offscreen. */
function useTermCycle() {
  const ref = useRef(null);
  const [cycle, setCycle] = useState(0);
  const [active, setActive] = useState(false);
  useEffect(function () {
    var el = ref.current;
    if (!el) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setActive(true); return; }
    var iv = null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        setActive(e.isIntersecting);
        if (e.isIntersecting && !iv) iv = setInterval(function () { setCycle(function (c) { return c + 1; }); }, 9000);
        if (!e.isIntersecting && iv) { clearInterval(iv); iv = null; }
      });
    }, { threshold: 0.2 });
    io.observe(el);
    return function () { if (iv) clearInterval(iv); io.disconnect(); };
  }, []);
  return { ref: ref, cycle: cycle, active: active };
}

const TERM_LINES = [
  { pre: '$', cls: 'term-prompt', text: 'autoprd generate "e-sarpras sekolah"' },
  { pre: '✓', cls: 'term-ok', text: 'Ide dianalisis — 5 pertanyaan terjawab' },
  { pre: '✓', cls: 'term-ok', text: 'Struktur fitur disusun — 18 fitur' },
  { pre: '✓', cls: 'term-ok', text: 'Menulis PRD.md — 13 section' },
  { pre: '✓', cls: 'term-ok', text: 'Menulis tech_spec.md' },
  { pre: '✓', cls: 'term-ok', text: 'Menulis AGENTS.md' },
  { pre: '✓', cls: 'term-ok', text: 'Menulis design.md' },
  { pre: '→', cls: 'term-arrow', text: '4 dokumen siap coding' },
];

/* Reveal sekali saat section masuk viewport. */
function useReveal() {
  useEffect(function () {
    var els = document.querySelectorAll('.rv');
    function showAll() { for (var i = 0; i < els.length; i++) els[i].classList.add('in'); }
    if (!('IntersectionObserver' in window)) { showAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    for (var i = 0; i < els.length; i++) io.observe(els[i]);
    return function () { io.disconnect(); };
  }, []);
}

export default function Landing() {
  const [tab, setTab] = useState('prd');
  const term = useTermCycle();
  useReveal();

  function onTabKey(e, idx) {
    var j = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    if (j !== null) { e.preventDefault(); setTab(TABS[j].key); document.getElementById(TABS[j].id).focus(); }
  }

  const sample = SAMPLES[tab];

  return (
    <>
      <main>
        <section className="max-w-7xl mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-20">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="kicker">Generator PRD Bahasa Indonesia</span>
              <h1 className="hero-h1 mt-4">Ubah ide jadi<br /><em>PRD</em> siap coding<span className="dot">.</span></h1>
              <p className="muted mt-5" style={{ maxWidth: '46ch', fontSize: '1.05rem', lineHeight: 1.7 }}>
                Ceritakan idemu, jawab beberapa pertanyaan, dan dapatkan dokumen produk lengkap:
                PRD, spesifikasi teknis, aturan untuk coding agent, sampai panduan desain. Semuanya dalam Bahasa Indonesia.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link to="/generator" className="btn btn-primary btn-shine">Mulai Buat PRD</Link>
                <Link to="/panduan" className="link-arrow">Lihat cara pakai <span className="arr">→</span></Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                <span className="badge badge-green">Gratis</span>
                <span className="badge badge-muted">Bahasa Indonesia</span>
                <span className="badge badge-muted">4 dokumen standar</span>
              </div>
            </div>
            <div>
              <div className="card card-pad">
                <div className="flex items-center gap-2 mb-4">
                  <span className="live-dot"></span>
                  <span className="faint font-mono2" style={{ fontSize: '0.72rem' }}>live — AI sedang bekerja</span>
                </div>
                <div ref={term.ref} className="term" role="img" aria-label="Terminal: AI menulis PRD dan empat dokumen">
                  <div className="term-head">
                    <span className="term-dot" style={{ background: '#e0655a' }}></span>
                    <span className="term-dot" style={{ background: '#d9a441' }}></span>
                    <span className="term-dot" style={{ background: '#7ddb96' }}></span>
                    <span className="term-title">autoprd — generator</span>
                  </div>
                  {term.active && (
                    <div key={term.cycle} className="term-cycle">
                      <div className="term-body">
                        {TERM_LINES.map(function (l, i) {
                          return (
                            <div className="term-line" key={i} style={{ animationDelay: (0.35 + i * 0.4) + 's' }}>
                              <span className={l.cls}>{l.pre}</span>&nbsp;&nbsp;{l.text}
                            </div>
                          );
                        })}
                        <div className="term-line" style={{ animationDelay: '3.9s' }}><span className="term-cursor"></span></div>
                      </div>
                      <div className="term-foot">
                        <div className="term-progress"><i></i></div>
                        <p className="term-cap">13 section · Bahasa Indonesia · 4 dokumen</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="dokumen" className="py-16 md:py-24" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="max-w-7xl mx-auto px-4">
            <div className="rv">
              <span className="kicker">Hasil akhirnya</span>
              <h2 className="sec-h2 mt-3">Satu ide, empat dokumen<br />yang saling nyambung<span className="dot">.</span></h2>
              <p className="muted mt-4" style={{ maxWidth: '62ch' }}>Klik nama file untuk mengintip potongan isinya. Keempatnya disusun dari ide yang sama, jadi tidak ada yang terlewat atau tumpang tindih.</p>
            </div>
            <div className="doc-explorer rv">
              <div className="doc-tabs" role="tablist" aria-label="Pilih dokumen untuk dilihat">
                {TABS.map(function (t, i) {
                  return (
                    <button
                      key={t.key} role="tab" id={t.id} aria-selected={tab === t.key}
                      aria-controls="doc-panel" tabIndex={tab === t.key ? 0 : -1}
                      onClick={function () { setTab(t.key); }}
                      onKeyDown={function (e) { onTabKey(e, i); }}
                    >
                      <span className="doc-fname">{t.fname}</span>
                      <span className="doc-desc">{t.desc}</span>
                    </button>
                  );
                })}
              </div>
              <div className="doc-preview" role="tabpanel" id="doc-panel" aria-labelledby={TABS.find(function (t) { return t.key === tab; }).id} tabIndex="0">
                <div className="doc-preview-head">
                  <span className="font-mono2" id="doc-fname-label" style={{ fontWeight: 700, fontSize: '.85rem' }}>{sample.label}</span>
                  <span className="faint" style={{ fontSize: '.75rem' }}>Contoh potongan isi</span>
                </div>
                <pre className="doc-preview-body" id="doc-body">{sample.body}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="noir">
          <div className="max-w-7xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-12 gap-8">
            <div className="md:col-span-4 rv">
              <span className="kicker">Alurnya</span>
              <h2 className="sec-h2 mt-3">Dari ide mentah sampai dokumen siap coding<span className="dot">.</span></h2>
              <p className="muted mt-4" style={{ lineHeight: 1.7 }}>Wizard lima tahap memandumu dari awal. Kamu yang pegang kendali di tiap langkah, AI yang menuliskan.</p>
              <Link to="/generator" className="link-arrow mt-5">Coba wizardnya <span className="arr">→</span></Link>
            </div>
            <ol className="md:col-span-8 rv" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {STEPS.map(function (s, i) {
                return (
                  <li className="flow-row rv" key={i} style={{ transitionDelay: (i * 0.08) + 's' }}>
                    <span className="flow-num">0{i + 1}</span>
                    <div>
                      <h3>{s[0]}</h3>
                      <p>{s[1]}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="rv" style={{ maxWidth: '62ch' }}>
            <span className="kicker">Mesin AI-nya</span>
            <h2 className="sec-h2 mt-3">Pakai key sendiri<span className="dot">.</span></h2>
            <p className="muted mt-4" style={{ lineHeight: 1.7 }}>Tempel base URL, API key, dan nama model milikmu yang kompatibel OpenAI. Key hanya tersimpan di browser-mu, server tidak mencatatnya.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-8">
            <div className="card card-pad rv">
              <h3 className="font-display" style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ink)' }}>Atur sekali</h3>
              <p className="muted mt-2" style={{ fontSize: '.93rem', lineHeight: 1.7 }}>Isi base URL, API key, dan nama model di Pengaturan. Berlaku untuk semua generate di semua halaman.</p>
              <ul className="mode-list">
                <li>Ada tombol Tes koneksi sebelum dipakai</li>
                <li>Tanpa key sendiri? Pakai key server bila tersedia</li>
              </ul>
              <Link to="/pengaturan" className="link-arrow mt-4">Atur key di Pengaturan <span className="arr">→</span></Link>
            </div>
            <div className="card-pad rv" style={{ background: 'var(--sunken)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <h3 className="font-display" style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ink)' }}>Generate langsung</h3>
              <p className="muted mt-2" style={{ fontSize: '.93rem', lineHeight: 1.7 }}>Teks mengalir live per section selagi AI menulis. Hasil tersimpan otomatis di Riwayat.</p>
              <ul className="mode-list">
                <li>13 section disusun satu per satu</li>
                <li>Lanjut jadi tech spec, AGENTS.md, design.md</li>
              </ul>
              <Link to="/generator" className="link-arrow mt-4">Lihat di generator <span className="arr">→</span></Link>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="max-w-7xl mx-auto px-4 py-16 md:py-24 text-center rv">
            <h2 className="cta-h2">Punya ide aplikasi?<br />Tulis PRD-nya hari ini<span className="dot">.</span></h2>
            <p className="mt-4" style={{ opacity: .92 }}>Gratis untuk mulai. Tanpa daftar.</p>
            <div className="mt-7">
              <Link to="/generator" className="btn cta-btn">Mulai buat PRD</Link>
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center gap-3">
          <Link to="/" className="font-display" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ink)', textDecoration: 'none' }}>autoprd<span style={{ color: 'var(--accent)' }}>.</span></Link>
          <span className="faint" style={{ fontSize: '0.82rem' }}>Generator PRD Bahasa Indonesia, dibuat dengan teliti di Indonesia.</span>
          <nav className="sm:ml-auto flex items-center gap-5" style={{ fontSize: '0.85rem' }}>
            <Link to="/generator" className="muted" style={{ textDecoration: 'none' }}>Buat PRD</Link>
            <Link to="/riwayat" className="muted" style={{ textDecoration: 'none' }}>Riwayat</Link>
            <Link to="/panduan" className="muted" style={{ textDecoration: 'none' }}>Panduan</Link>
            <Link to="/pengaturan" className="muted" style={{ textDecoration: 'none' }}>Pengaturan</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
