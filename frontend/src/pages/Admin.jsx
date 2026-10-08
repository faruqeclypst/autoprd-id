import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiJson } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const TABS = [
  ['ringkasan', 'Ringkasan'],
  ['prd', 'PRD Terbaru'],
  ['ai', 'Pengaturan AI'],
];

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortOwner(id) {
  if (!id || id === 'local') return 'lokal';
  return String(id).slice(0, 8) + '…';
}

async function getJson(path) {
  const r = await apiFetch(path);
  const d = await r.json().catch(function () { return {}; });
  if (!r.ok || d.ok === false) throw new Error((d && d.error) || ('HTTP ' + r.status));
  return d;
}

// ---------- Tab Ringkasan ----------
function Ringkasan() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(function () {
    getJson('/api/admin/stats').then(setS).catch(function (e) { setErr(e.message); });
  }, []);
  if (err) return <p className="muted text-sm">Gagal memuat: {err}</p>;
  if (!s) return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
      {[1, 2, 3, 4].map(function (i) { return <div key={i} className="card p-5"><div className="skeleton skel h-8 w-16 mb-2"></div><div className="skeleton skel h-4 w-24"></div></div>; })}
    </div>
  );
  const cards = [
    ['Total PRD', s.totalPrd],
    ['PRD 7 hari terakhir', s.prd7hari],
    ['Dokumen dibuat', s.totalDokumen == null ? '—' : s.totalDokumen],
    ['Backend', s.backend === 'supabase' ? 'Supabase' : 'Lokal'],
  ];
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
      {cards.map(function (c) {
        return (
          <div key={c[0]} className="card p-5">
            <div className="font-display" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink)' }}>{c[1]}</div>
            <div className="text-sm muted mt-1">{c[0]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Tab PRD Terbaru ----------
function PrdTerbaru() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(function () {
    getJson('/api/admin/prds?limit=20').then(function (d) { setList(d.prds || []); }).catch(function (e) { setErr(e.message); });
  }, []);
  if (err) return <p className="muted text-sm">Gagal memuat: {err}</p>;
  if (!list) return <div className="card p-4 space-y-3"><div className="skeleton skel h-5 w-2/3"></div><div className="skeleton skel h-5 w-1/2"></div></div>;
  if (list.length === 0) return <p className="muted text-sm">Belum ada PRD.</p>;
  return (
    <div className="card overflow-hidden" role="list" aria-label="PRD terbaru semua pengguna">
      {list.map(function (p) {
        return (
          <Link key={p.id} className="hist-row" role="listitem" to={'/prd/' + encodeURIComponent(p.id)}>
            <span className="flex-1" style={{ minWidth: 0 }}>
              <span className="block font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.title || 'Tanpa judul'}</span>
              <span className="block text-xs muted mt-0.5">{fmtDate(p.createdAt)} · pemilik {shortOwner(p.ownerId)} · {p.docs == null ? '?' : p.docs} dari 4 dokumen</span>
            </span>
            <span className="hist-chev" aria-hidden="true">›</span>
          </Link>
        );
      })}
    </div>
  );
}

// ---------- Tab Pengaturan AI ----------
const SUMBER_LABEL = { env: 'Aktif (env)', override: 'Aktif (override)', 'belum-dipasang': 'Belum dipasang', dimatikan: 'Dimatikan' };

function KartuProvider({ p, onUji, onSimpan, hasilUji, sedangUji }) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [nonaktif, setNonaktif] = useState(false);
  const [msg, setMsg] = useState('');
  const [showKey, setShowKey] = useState(false);

  function simpan() {
    setMsg('');
    onSimpan(p.name, {
      baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), disabled: nonaktif,
    }).then(function () {
      setMsg('Tersimpan. Berlaku langsung tanpa restart.');
      setOpen(false); setApiKey('');
    }).catch(function (e) { setMsg('Gagal: ' + e.message); });
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <b style={{ fontSize: '1.05rem', color: 'var(--ink)' }}>{p.name}</b>
        <span className={'badge ' + (p.aktif ? 'badge-green' : 'badge-muted')}>{SUMBER_LABEL[p.sumber] || p.sumber}</span>
        {p.byokOnly && <span className="badge badge-muted">BYOK_ONLY</span>}
        <span className="flex-1"></span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={sedangUji || !p.aktif}
          onClick={function () { onUji(p.name); }}>
          {sedangUji ? 'Menguji…' : 'Tes koneksi'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setOpen(function (o) { return !o; }); }}>
          {open ? 'Tutup' : 'Ubah'}
        </button>
      </div>
      <div className="text-sm muted mt-3 space-y-1">
        <div>Base URL: <code>{p.baseUrl || '—'}</code></div>
        <div>Model: <code>{p.model || '—'}</code></div>
        <div>Key: <code>{p.keyMasked || '—'}</code></div>
      </div>
      {hasilUji && <p className="text-sm mt-2" role="status" style={{ color: hasilUji.ok ? 'var(--green, #2e7d32)' : '#b3261e' }}>{hasilUji.pesan}</p>}
      {open && (
        <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--line, #e8e0d2)' }}>
          <p className="text-sm muted">Override tanpa ubah file <code>.env</code> / restart. Kosongkan kolom key untuk tetap memakai key env.</p>
          <div>
            <label className="lbl" htmlFor={'bu-' + p.name}>Base URL</label>
            <input id={'bu-' + p.name} className="field" placeholder={p.baseUrl || 'https://…'} autoComplete="off" spellCheck="false"
              value={baseUrl} onChange={function (e) { setBaseUrl(e.target.value); }} />
          </div>
          <div>
            <label className="lbl" htmlFor={'ky-' + p.name}>API key</label>
            <div className="field-wrap">
              <input id={'ky-' + p.name} type={showKey ? 'text' : 'password'} className="field" style={{ paddingRight: '4.5rem' }}
                placeholder="kosongkan = pakai env" autoComplete="off" spellCheck="false"
                value={apiKey} onChange={function (e) { setApiKey(e.target.value); }} />
              <button type="button" className="show-btn" onClick={function () { setShowKey(function (s) { return !s; }); }}>
                {showKey ? 'Sembunyi' : 'Tampil'}
              </button>
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor={'md-' + p.name}>Model</label>
            <input id={'md-' + p.name} className="field" placeholder={p.model || 'nama-model'} autoComplete="off" spellCheck="false"
              value={model} onChange={function (e) { setModel(e.target.value); }} />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={nonaktif} onChange={function (e) { setNonaktif(e.target.checked); }} />
            Nonaktifkan provider ini
          </label>
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={simpan}>Simpan override</button>
            {msg && <span className="text-sm muted" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Kartu Kunci Admin (pribadi) ----------
function KartuKunciAdmin({ info, onUji, onSimpan, hasilUji, sedangUji }) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [msg, setMsg] = useState('');
  const [showKey, setShowKey] = useState(false);

  function simpan() {
    setMsg('');
    onSimpan({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() })
      .then(function () {
        setMsg('Tersimpan. Berlaku langsung tanpa restart.');
        setOpen(false); setApiKey('');
      })
      .catch(function (e) { setMsg('Gagal: ' + e.message); });
  }

  function hapus() {
    setMsg('');
    onSimpan({ baseUrl: '', apiKey: '', model: '' })
      .then(function () { setMsg('Kunci admin dihapus. Admin kembali memakai kunci umum.'); })
      .catch(function (e) { setMsg('Gagal: ' + e.message); });
  }

  return (
    <div className="card p-5" style={{ borderColor: 'var(--accent, #b5362a)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <b style={{ fontSize: '1.05rem', color: 'var(--ink)' }}>Kunci Admin <span className="muted" style={{ fontWeight: 400 }}>(pribadi)</span></b>
        <span className={'badge ' + (info.aktif ? 'badge-green' : 'badge-muted')}>{info.aktif ? 'Aktif' : 'Belum dipasang'}</span>
        <span className="flex-1"></span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={sedangUji || !info.aktif}
          onClick={function () { onUji('_adminKey'); }}>
          {sedangUji ? 'Menguji…' : 'Tes koneksi'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setOpen(function (o) { return !o; }); }}>
          {open ? 'Tutup' : 'Ubah'}
        </button>
      </div>
      <p className="text-sm muted mt-3" style={{ maxWidth: '38rem' }}>
        Dipakai <b>duluan</b> setiap kali admin generate (gagal → failover ke kunci umum di bawah).
        Tamu &amp; user biasa tidak pernah memakai key ini.
      </p>
      <div className="text-sm muted mt-2 space-y-1">
        <div>Base URL: <code>{info.baseUrl || '—'}</code></div>
        <div>Model: <code>{info.model || '—'}</code></div>
        <div>Key: <code>{info.keyMasked || '—'}</code></div>
      </div>
      {hasilUji && <p className="text-sm mt-2" role="status" style={{ color: hasilUji.ok ? 'var(--green, #2e7d32)' : '#b3261e' }}>{hasilUji.pesan}</p>}
      {open && (
        <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--line, #e8e0d2)' }}>
          <div>
            <label className="lbl" htmlFor="ak-bu">Base URL</label>
            <input id="ak-bu" className="field" placeholder="https://…" autoComplete="off" spellCheck="false"
              value={baseUrl} onChange={function (e) { setBaseUrl(e.target.value); }} />
          </div>
          <div>
            <label className="lbl" htmlFor="ak-ky">API key</label>
            <div className="field-wrap">
              <input id="ak-ky" type={showKey ? 'text' : 'password'} className="field" style={{ paddingRight: '4.5rem' }}
                placeholder="kunci pribadi admin" autoComplete="off" spellCheck="false"
                value={apiKey} onChange={function (e) { setApiKey(e.target.value); }} />
              <button type="button" className="show-btn" onClick={function () { setShowKey(function (s) { return !s; }); }}>
                {showKey ? 'Sembunyi' : 'Tampil'}
              </button>
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor="ak-md">Model</label>
            <input id="ak-md" className="field" placeholder="nama-model" autoComplete="off" spellCheck="false"
              value={model} onChange={function (e) { setModel(e.target.value); }} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={simpan}>Simpan kunci admin</button>
            {info.aktif && <button type="button" className="btn btn-ghost btn-sm" onClick={hapus}>Hapus</button>}
            {msg && <span className="text-sm muted" role="status">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function PengaturanAI() {
  const [providers, setProviders] = useState(null);
  const [adminKey, setAdminKey] = useState(null);
  const [err, setErr] = useState('');
  const [uji, setUji] = useState({}); // name -> {ok, pesan}
  const [sedangUji, setSedangUji] = useState(null);

  function muat() {
    setErr('');
    getJson('/api/admin/ai').then(function (d) {
      setProviders(d.providers || []);
      setAdminKey(d.adminKey || { aktif: false, baseUrl: '', model: '', keyMasked: '' });
    }).catch(function (e) { setErr(e.message); });
  }
  useEffect(muat, []);

  async function onUji(name) {
    setSedangUji(name);
    setUji(function (u) { return Object.assign({}, u, { [name]: null }); });
    try {
      const d = await apiJson('/api/admin/ai/test', { name });
      setUji(function (u) { return Object.assign({}, u, { [name]: { ok: true, pesan: 'Koneksi OK' + (d.balasan ? ' — balasan: "' + d.balasan + '"' : '') } }); });
    } catch (e) {
      setUji(function (u) { return Object.assign({}, u, { [name]: { ok: false, pesan: 'Gagal: ' + e.message } }); });
    }
    setSedangUji(null);
  }

  async function onSimpan(name, v) {
    await apiJson('/api/admin/ai', { providers: { [name]: v } });
    muat();
  }

  async function onSimpanAdmin(v) {
    await apiJson('/api/admin/ai', { _adminKey: v });
    muat();
  }

  if (err) return <p className="muted text-sm">Gagal memuat: {err}</p>;
  if (!providers || !adminKey) return <div className="space-y-4"><div className="card p-5"><div className="skeleton skel h-6 w-1/3"></div></div></div>;
  return (
    <div className="space-y-4">
      <KartuKunciAdmin info={adminKey} onUji={onUji} onSimpan={onSimpanAdmin}
        hasilUji={uji._adminKey} sedangUji={sedangUji === '_adminKey'} />
      <p className="text-sm muted" style={{ maxWidth: '38rem' }}>
        <b>Kunci umum</b> — dipakai tamu (tanpa akun) &amp; user biasa yang tidak punya key sendiri
        (failover berurutan). Key dari <code>.env</code> bisa di-override dari sini tanpa restart —
        override tersimpan di server dan berlaku langsung.
      </p>
      {providers.map(function (p) {
        return <KartuProvider key={p.name} p={p} onUji={onUji} onSimpan={onSimpan}
          hasilUji={uji[p.name]} sedangUji={sedangUji === p.name} />;
      })}
    </div>
  );
}

// ---------- Halaman ----------
export default function Admin() {
  const { isAdmin, ready } = useAuth();
  const [tab, setTab] = useState('ringkasan');

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Admin</h1>
      <p className="muted mt-2 mb-8">Dashboard khusus admin AutoPRD.id.</p>

      {!ready && <div className="skeleton skel h-10 w-64"></div>}

      {ready && !isAdmin && (
        <div className="card p-8 text-center">
          <p className="font-semibold mb-2" style={{ color: 'var(--ink)' }}>Khusus admin.</p>
          <p className="muted text-sm mb-4">Halaman ini hanya bisa diakses akun admin.</p>
          <Link to="/" className="btn btn-primary btn-sm">Kembali ke beranda</Link>
        </div>
      )}

      {ready && isAdmin && (
        <div>
          <div className="flex gap-2 mb-8" role="tablist" aria-label="Tab admin">
            {TABS.map(function (t) {
              const aktif = tab === t[0];
              return (
                <button key={t[0]} role="tab" aria-selected={aktif} type="button"
                  onClick={function () { setTab(t[0]); }}
                  className={'btn btn-sm ' + (aktif ? 'btn-primary' : 'btn-ghost')}>
                  {t[1]}
                </button>
              );
            })}
          </div>
          {tab === 'ringkasan' && <Ringkasan />}
          {tab === 'prd' && <PrdTerbaru />}
          {tab === 'ai' && <PengaturanAI />}
        </div>
      )}
    </main>
  );
}
