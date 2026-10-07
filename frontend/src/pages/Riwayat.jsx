import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, fmtDate } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Riwayat() {
  const { ready } = useAuth();
  const [view, setView] = useState('loading'); // loading | error | empty | grid
  const [list, setList] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeJobs, setActiveJobs] = useState([]);

  const loadJobs = useCallback(async function () {
    try {
      const r = await apiFetch('/api/jobs?limit=10');
      const d = await r.json().catch(function () { return {}; });
      const jobs = ((d && d.jobs) || []).filter(function (j) { return j.status === 'queued' || j.status === 'running'; });
      setActiveJobs(jobs);
    } catch (_) { /* abaikan */ }
  }, []);

  const loadList = useCallback(async function () {
    setView('loading');
    try {
      const res = await apiFetch('/api/prds');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { setView('empty'); setList([]); return; }
      setList(data);
      setView('grid');
    } catch (e) {
      setErrorMsg('Terjadi kesalahan: ' + e.message);
      setView('error');
    }
  }, []);

  useEffect(function () {
    if (ready) { loadList(); loadJobs(); }
  }, [ready, loadList, loadJobs]);

  async function hapus(p) {
    if (!window.confirm('Hapus PRD "' + p.title + '"?\nTindakan ini tidak bisa dibatalkan.')) return;
    try {
      const res = await apiFetch('/api/prds/' + encodeURIComponent(p.id), { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loadList();
    } catch (e) {
      window.alert('Gagal menghapus: ' + e.message);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="page-h1">Riwayat PRD</h1>
          <p className="muted mt-1">{view === 'grid' ? list.length + ' dokumen tersimpan di sini.' : 'Semua dokumen PRD yang pernah kamu buat tersimpan di sini.'}</p>
        </div>
        <Link to="/generator" className="show-sm-up btn btn-primary">＋ Buat PRD Baru</Link>
      </div>

      {activeJobs.length > 0 && (
        <div className="mb-8 space-y-3">
          {activeJobs.map(function (j) {
            return (
              <Link key={j.id} to="/generator" className="card p-4 flex items-center gap-4 card-hover">
                <span className="spinner" aria-hidden="true"></span>
                <span className="flex-1" style={{ minWidth: 0 }}>
                  <span className="block font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    Generate berjalan: {j.title || j.idea || 'tanpa judul'}
                  </span>
                  <span className="block text-xs muted mt-0.5">{j.doneCount}/{j.totalCount} section — klik untuk memantau</span>
                </span>
                <span className="hist-chev" aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      )}

      {view === 'loading' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map(function (i) {
            return (
              <div className="card p-5" key={i}>
                <div className="skeleton h-6 w-3/4 rounded mb-3"></div>
                <div className="skeleton h-4 w-1/2 rounded mb-4"></div>
                <div className="skeleton h-9 w-full rounded-xl"></div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'error' && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold mb-1">Gagal memuat riwayat</p>
          <p className="muted text-sm mb-5">{errorMsg}</p>
          <button onClick={loadList} className="btn btn-primary">Coba Lagi</button>
        </div>
      )}

      {view === 'empty' && (
        <div className="card p-12 text-center">
          <div className="text-6xl mb-4">📄</div>
          <p className="text-xl font-semibold mb-2">Belum ada PRD. <Link to="/generator" className="accent-text hover:underline">Buat PRD pertamamu →</Link></p>
          <p className="muted text-sm mb-6">Ceritakan ide aplikasimu, AI akan menyusun dokumen PRD lengkap dalam hitungan menit.</p>
          <Link to="/generator" className="btn btn-primary">Mulai Buat PRD</Link>
        </div>
      )}

      {view === 'grid' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map(function (p, i) {
            return (
              <div className="card card-hover hist-card p-5 transition duration-200 flex flex-col" key={p.id}
                style={{ animationDelay: Math.min(i * 0.06, 0.36) + 's' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-bold text-lg leading-snug line-clamp-2 min-h-[3.1rem]">{p.title}</h3>
                </div>
                <div className="flex items-center gap-3 text-xs muted mb-5">
                  <span>🗓️ {fmtDate(p.createdAt)}</span>
                  <span className="badge">{p.sectionCount} section</span>
                </div>
                <div className="mt-auto flex gap-2">
                  <Link to={'/prd/' + encodeURIComponent(p.id)} className="btn btn-primary btn-sm flex-1 text-center">Buka</Link>
                  <button
                    onClick={function () { hapus(p); }}
                    className="btn-del"
                  >Hapus</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
