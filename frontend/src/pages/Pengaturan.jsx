import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getByok, setByok } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function fmtDateShort(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ email }) {
  const initial = ((email || '').charAt(0) || '?').toUpperCase();
  return <div className="avatar" aria-hidden="true">{initial}</div>;
}

export default function Pengaturan() {
  const { user, isAdmin, authEnabled, ready, login, logout } = useAuth();

  // ---- Kunci API ----
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(function () {
    const b = getByok() || {};
    setBaseUrl(b.baseUrl || '');
    setApiKey(b.apiKey || '');
    setModel(b.model || '');
  }, []);

  function paintKeyStatus(b) {
    const n = [b.baseUrl, b.apiKey, b.model].filter(Boolean).length;
    setKeyStatus(n === 3 ? 'Kunci tersimpan (' + b.model + ').' : (n === 0 ? 'Belum ada kunci tersimpan.' : 'Kunci belum lengkap.'));
  }

  function saveKey() {
    const v = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };
    const n = [v.baseUrl, v.apiKey, v.model].filter(Boolean).length;
    if (n > 0 && n < 3) { setKeyStatus('Lengkapi ketiga kolom, atau kosongkan semuanya.'); return; }
    if (v.baseUrl && !/^https?:\/\//i.test(v.baseUrl)) { setKeyStatus('Base URL harus diawali http:// atau https://.'); return; }
    setByok(n === 3 ? v : null);
    paintKeyStatus(n === 3 ? v : {});
    setKeyStatus(n === 3 ? 'Kunci tersimpan.' : 'Kunci dihapus. Kembali memakai kunci server.');
  }
  function clearKey() {
    setByok(null);
    setBaseUrl(''); setApiKey(''); setModel('');
    setKeyStatus('Kunci dihapus. Kembali memakai kunci server.');
  }
  async function testKey() {
    const v = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() };
    if (!v.baseUrl || !v.apiKey || !v.model) { setKeyStatus('Isi dulu ketiga kolom sebelum tes koneksi.'); return; }
    setTesting(true);
    setKeyStatus('Menghubungi ' + v.model + '…');
    try {
      const r = await apiFetch('/api/byok/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
      });
      const d = await r.json();
      setKeyStatus(d && d.ok ? 'Koneksi OK. Model merespons.' : 'Tes gagal: ' + ((d && d.error) || 'tidak diketahui'));
    } catch (e) {
      setKeyStatus('Tes gagal: ' + (e.message || e));
    }
    setTesting(false);
  }

  // ---- Riwayat ----
  const [hist, setHist] = useState(null); // null=loading, []=empty, array=list, 'error'
  useEffect(function () {
    if (!ready) return;
    if (authEnabled && !user) { setHist('login'); return; }
    apiFetch('/api/prds').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (list) {
      setHist(Array.isArray(list) ? list : []);
    }).catch(function () { setHist('error'); });
  }, [ready, authEnabled, user]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Pengaturan</h1>
      <p className="muted mt-2 mb-10">Satu tempat untuk akun, riwayat PRD, dan kunci API.</p>

      <section aria-labelledby="tProfil" className="pb-10">
        <h2 id="tProfil" className="sec-title mb-5">Profil</h2>
        {!ready && (
          <div className="flex items-center gap-4">
            <div className="avatar skel skeleton" style={{ width: '3.25rem', height: '3.25rem' }}>&nbsp;</div>
            <div className="flex-1 space-y-2">
              <div className="skeleton skel h-4 w-48"></div>
              <div className="skeleton skel h-3 w-32"></div>
            </div>
          </div>
        )}
        {ready && !authEnabled && (
          <div className="flex items-center gap-4">
            <div className="avatar" aria-hidden="true">L</div>
            <div className="flex-1">
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Mode lokal</p>
              <p className="text-sm muted">Tanpa login. Kamu admin perangkat ini.</p>
            </div>
            <span className="badge badge-green">Admin</span>
          </div>
        )}
        {ready && authEnabled && !user && (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1" style={{ minWidth: '12rem' }}>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Kamu belum masuk.</p>
              <p className="text-sm muted mt-1">Masuk untuk menyimpan riwayat PRD ke akunmu.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={login}>Masuk dengan Google</button>
          </div>
        )}
        {ready && user && (
          <div className="flex items-center gap-4">
            <Avatar email={user.email} />
            <div className="flex-1" style={{ minWidth: 0 }}>
              <p className="font-semibold truncate" style={{ color: 'var(--ink)' }}>{user.email}</p>
              <div className="mt-1">
                {isAdmin
                  ? <span className="badge badge-green">Admin</span>
                  : <span className="badge badge-muted">Pengguna</span>}
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>Keluar</button>
          </div>
        )}
      </section>

      <section aria-labelledby="tRiwayat" className="sec-div py-10">
        <div className="flex items-baseline justify-between mb-5">
          <h2 id="tRiwayat" className="sec-title">Riwayat PRD</h2>
          <Link to="/riwayat" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>Lihat semua</Link>
        </div>
        <div className="card overflow-hidden" role="list" aria-label="PRD terbaru">
          {hist === null && (
            <div className="p-4 space-y-3">
              <div className="skeleton skel h-5 w-2/3"></div>
              <div className="skeleton skel h-5 w-1/2"></div>
              <div className="skeleton skel h-5 w-3/5"></div>
            </div>
          )}
          {hist === 'login' && (
            <div className="p-6 text-center"><p className="muted text-sm">Masuk untuk melihat riwayat PRD milikmu.</p></div>
          )}
          {hist === 'error' && (
            <div className="p-6 text-center">
              <p className="muted text-sm mb-3">Gagal memuat riwayat.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setHist(null); window.location.reload(); }}>Coba lagi</button>
            </div>
          )}
          {Array.isArray(hist) && hist.length === 0 && (
            <div className="p-6 text-center">
              <p className="muted text-sm mb-3">Belum ada PRD yang dibuat.</p>
              <Link to="/generator" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Buat PRD pertama</Link>
            </div>
          )}
          {Array.isArray(hist) && hist.length > 0 && hist.slice(0, 5).map(function (p) {
            let docs = 0;
            ['markdown', 'specs', 'agentsmd', 'designmd'].forEach(function (k) { if (p[k]) docs++; });
            return (
              <Link className="hist-row" role="listitem" to={'/prd/' + encodeURIComponent(p.id)} key={p.id}>
                <span className="flex-1" style={{ minWidth: 0 }}>
                  <span className="block font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.title || 'Tanpa judul'}</span>
                  <span className="block text-xs muted mt-0.5">{fmtDateShort(p.createdAt)} · {docs} dari 4 dokumen</span>
                </span>
                <span className="hist-chev" aria-hidden="true">›</span>
              </Link>
            );
          })}
          {Array.isArray(hist) && hist.length > 5 && (
            <Link className="hist-row" to="/riwayat">
              <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--accent)' }}>Lihat semua ({hist.length})</span>
              <span className="hist-chev" aria-hidden="true">›</span>
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="tApi" className="sec-div py-10">
        <h2 id="tApi" className="sec-title mb-2">Kunci API</h2>
        <p className="muted text-sm mb-6" style={{ maxWidth: '36rem' }}>Pakai kunci API milikmu sendiri. Bisa untuk endpoint yang kompatibel dengan OpenAI: OpenAI, OpenRouter, Tiarina, Kenari.</p>
        <div className="space-y-4" style={{ maxWidth: '36rem' }}>
          <div>
            <label className="lbl" htmlFor="setBaseUrl">Base URL</label>
            <input id="setBaseUrl" className="field" placeholder="https://api.openai.com/v1" autoComplete="off" autoCapitalize="off" spellCheck="false" inputMode="url" value={baseUrl} onChange={function (e) { setBaseUrl(e.target.value); }} />
          </div>
          <div>
            <label className="lbl" htmlFor="setKey">API key</label>
            <div className="field-wrap">
              <input id="setKey" type={showKey ? 'text' : 'password'} className="field" style={{ paddingRight: '4.5rem' }} placeholder="sk-…" autoComplete="off" autoCapitalize="off" spellCheck="false" value={apiKey} onChange={function (e) { setApiKey(e.target.value); }} />
              <button type="button" className="show-btn" aria-pressed={showKey} onClick={function () { setShowKey(function (s) { return !s; }); }}>
                {showKey ? 'Sembunyi' : 'Tampil'}
              </button>
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor="setModel">Model</label>
            <input id="setModel" className="field" placeholder="gpt-4o-mini" autoComplete="off" autoCapitalize="off" spellCheck="false" value={model} onChange={function (e) { setModel(e.target.value); }} />
          </div>
        </div>
        <p className="text-sm muted mt-4" style={{ maxWidth: '36rem' }}>Kunci tersimpan hanya di peramban ini. Server meneruskan request ke provider di atas tanpa menyimpan kuncimu. Tombol Tes koneksi mengirim satu request kecil lewat server (tanpa menyimpan kunci) untuk memastikan base URL, key, dan model valid. Kosongkan semua kolom lalu simpan untuk kembali memakai kunci server.</p>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button type="button" className="btn btn-primary" onClick={saveKey}>Simpan kunci</button>
          <button type="button" className="btn btn-ghost" onClick={testKey} disabled={testing}>Tes koneksi</button>
          <button type="button" className="btn btn-ghost" onClick={clearKey}>Hapus</button>
          <span className="text-sm muted" role="status">{keyStatus}</span>
        </div>
      </section>

    </main>
  );
}
