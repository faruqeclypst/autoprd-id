import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, getByok, setByok, withByok } from '../lib/api.js';
import MindmapView from '../components/MindmapView.jsx';
import Turnstile from '../components/Turnstile.jsx';

const DRAFT_LS = 'autoprd_wizard_draft';
const RING_C = 188.5;

/* Contoh ide yang berputar di placeholder step 1 — mengundang aksi, bukan pajangan. */
const PLACEHOLDERS = [
  'contoh: aplikasi e-sarpras sekolah…',
  'contoh: kasir warung kopi dengan QRIS…',
  'contoh: absensi karyawan pakai foto…',
  'contoh: toko online untuk jual kue…',
];

/* Kartu contoh project — klik untuk mengisi ide. */
const EXAMPLES = [
  { icon: '🏫', title: 'E-Sarpras Sekolah', desc: 'Inventaris & peminjaman barang', prompt: 'Aplikasi e-sarpras sekolah: inventaris barang, peminjaman, dan laporan kondisi per semester' },
  { icon: '☕', title: 'Kasir Warung Kopi', desc: 'QRIS + laporan harian', prompt: 'Aplikasi kasir warung kopi dengan pembayaran QRIS dan laporan penjualan harian' },
  { icon: '📸', title: 'Absensi Karyawan', desc: 'Foto selfie + GPS', prompt: 'Aplikasi absensi karyawan pakai foto selfie dan validasi lokasi GPS' },
  { icon: '🛒', title: 'Toko Kue Online', desc: 'Katalog + order WhatsApp', prompt: 'Toko online untuk jual kue: katalog produk dan pemesanan via WhatsApp' },
];

const SECTIONS = [
  { id: 'ringkasan', title: 'Ringkasan Eksekutif' },
  { id: 'latar-belakang', title: 'Latar Belakang' },
  { id: 'tujuan', title: 'Tujuan & Sasaran' },
  { id: 'pengguna', title: 'Target Pengguna' },
  { id: 'user-stories', title: 'User Stories' },
  { id: 'functional', title: 'Kebutuhan Fungsional' },
  { id: 'non-functional', title: 'Kebutuhan Non-Fungsional' },
  { id: 'scope', title: 'Ruang Lingkup' },
  { id: 'tech-stack', title: 'Tech Stack' },
  { id: 'roadmap', title: 'Roadmap Pengembangan' },
  { id: 'asumsi', title: 'Asumsi & Ketergantungan' },
  { id: 'risiko', title: 'Risiko & Mitigasi' },
  { id: 'pertanyaan-terbuka', title: 'Pertanyaan Terbuka' },
];

/* Stepper wizard: konsisten di semua 5 langkah, progress bar animasi. */
const WIZ_STEPS = ['Ide', 'Teknologi', 'Pertanyaan', 'Struktur', 'Generate'];
function Stepper({ step }) {
  return (
    <nav className="wz-steps" aria-label={'Langkah ' + step + ' dari 5: ' + WIZ_STEPS[step - 1]}>
      <p className="wz-steps-cap">Langkah {step} dari 5 · <b>{WIZ_STEPS[step - 1]}</b></p>
      <div className="wz-steps-bar" aria-hidden="true"><i style={{ width: (step / 5 * 100) + '%' }} /></div>
      <ol aria-hidden="true">
        {WIZ_STEPS.map(function (s, i) {
          const n = i + 1;
          const st = n < step ? 'done' : (n === step ? 'now' : '');
          return (
            <li key={s} className={st ? 'wz-step-' + st : ''}>
              <span className="wz-step-dot">{n < step ? '\u2713' : n}</span>
              <span className="wz-step-label">{s}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function fmtAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return Math.floor(s / 86400) + ' hari lalu';
}
function readNDJSON(res, onEvent) {
  return (async function () {
    if (!res.body || !res.body.getReader) throw new Error('Browser tidak mendukung streaming. Coba Chrome/Firefox terbaru.');
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try { onEvent(JSON.parse(line)); } catch (_) { /* lewati baris rusak */ }
      }
    }
  })();
}
function styleClass(style) {
  const s = String(style || '').toLowerCase();
  if (/glass/.test(s)) return 'pv-glass';
  if (/brutal/.test(s)) return 'pv-brutal';
  if (/pixel/.test(s)) return 'pv-pixel';
  if (/neumorph/.test(s)) return 'pv-neu';
  if (/clay/.test(s)) return 'pv-clay';
  if (/retro|vintage/.test(s)) return 'pv-retro';
  if (/flat/.test(s)) return 'pv-flat';
  if (/mono|vercel/.test(s)) return 'pv-mono';
  if (/minimal|apple/.test(s)) return 'pv-minimal';
  return '';
}

export default function Generator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(1);
  const [idea, setIdea] = useState('');
  const [ideaInput, setIdeaInput] = useState('');
  const [ideaError, setIdeaError] = useState('');
  const [techChoice, setTechChoice] = useState('ai');
  const [techCustom, setTechCustom] = useState('');
  const [designChoice, setDesignChoice] = useState('');
  const [designCustom, setDesignCustom] = useState('');
  const [techRecs, setTechRecs] = useState(null); // {list, for, error}
  const [designThemes, setDesignThemes] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [qState, setQState] = useState('idle'); // idle|loading|error
  const [qError, setQError] = useState('');
  const [qNote, setQNote] = useState('AI lagi nyusun pertanyaan…');
  const [mmState, setMmState] = useState('idle');
  const [mmError, setMmError] = useState('');
  const [mmNote, setMmNote] = useState('AI lagi nyusun struktur fitur…');
  const [mmVersion, setMmVersion] = useState(0);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseInput, setReviseInput] = useState('');
  const [reviseStatus, setReviseStatus] = useState('');
  const [reviseSending, setReviseSending] = useState(false);
  const [byok, setByokState] = useState({ baseUrl: '', apiKey: '', model: '' });
  const [byokOpen, setByokOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [toast, setToastState] = useState('');
  const [tplNotice, setTplNotice] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  // generate
  const [genPhase, setGenPhase] = useState('picker'); // picker|generating|error
  const [sections, setSections] = useState([]);
  const [doneCount, setDoneCount] = useState(0);
  const [genStatus, setGenStatus] = useState('AI sedang menulis tiap section satu per satu.');
  const [genError, setGenError] = useState('');
  // Turnstile (aktif bila server mengkonfigurasi site key)
  const [tsSiteKey, setTsSiteKey] = useState(null); // null=belum tahu, ''=nonaktif, string=aktif
  const [tsToken, setTsToken] = useState('');
  const tsRef = useRef(null);
  useEffect(function () {
    apiFetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      setTsSiteKey((c && c.turnstileSiteKey) || '');
    }).catch(function () { setTsSiteKey(''); });
  }, []);

  const mindmapRef = useRef(null);
  const ideaRef = useRef(null);
  const prefetchMap = useRef({});
  const questionsLoadedFor = useRef('');
  const draftTimer = useRef(null);
  const toastTimer = useRef(null);
  const generatingRef = useRef(false);
  const lastWritingId = useRef(null);
  const sectionsRef = useRef([]);
  const stateRef = useRef({});
  stateRef.current = {
    idea: idea, techChoice: techChoice, techCustom: techCustom,
    designChoice: designChoice, designCustom: designCustom,
    questions: questions, answers: answers, step: step,
  };

  function toastMsg(msg) {
    setToastState(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(function () { setToastState(''); }, 4500);
  }

  /* ---------- BYOK ---------- */
  useEffect(function () {
    const b = getByok() || {};
    setByokState({ baseUrl: b.baseUrl || '', apiKey: b.apiKey || '', model: b.model || '' });
  }, []);
  function onByokInput(patch) {
    setByokState(function (prev) {
      const next = Object.assign({}, prev, patch);
      const n = [next.baseUrl.trim(), next.apiKey.trim(), next.model.trim()].filter(Boolean).length;
      setByok(n === 3 ? { baseUrl: next.baseUrl.trim(), apiKey: next.apiKey.trim(), model: next.model.trim() } : null);
      return next;
    });
  }
  function byokForRequest() {
    const b = { baseUrl: byok.baseUrl.trim(), apiKey: byok.apiKey.trim(), model: byok.model.trim() };
    const n = [b.baseUrl, b.apiKey, b.model].filter(Boolean).length;
    if (n === 0) return null;
    if (n < 3) throw new Error('BYOK belum lengkap: isi base URL, API key, dan nama model — atau kosongkan ketiganya untuk pakai key server.');
    if (!/^https?:\/\//i.test(b.baseUrl)) throw new Error('BYOK: base URL harus diawali http:// atau https://');
    return b;
  }
  const byokN = [byok.baseUrl.trim(), byok.apiKey.trim(), byok.model.trim()].filter(Boolean).length;
  const byokStateLabel = byokN === 3 ? '✓ terisi' : (byokN === 0 ? 'belum diisi' : '⚠ belum lengkap');

  /* ---------- prefetch ---------- */
  function prefetchJob(kind, payload) {
    const byokV = byokForRequest();
    const key = kind + '|' + (byokV ? byokV.baseUrl + '|' + byokV.model : 'server') + '|' + stateRef.current.idea;
    if (!prefetchMap.current[key]) {
      const body = withByok(Object.assign({}, payload));
      const p = apiFetch('/api/plan/' + kind, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (res) {
        if (!res.ok) throw new Error('Server error ' + res.status);
        return res.json();
      }).then(function (data) {
        if (kind === 'mindmap') return data.mindmap || data;
        return data;
      });
      p.catch(function () { delete prefetchMap.current[key]; });
      prefetchMap.current[key] = p;
    }
    return prefetchMap.current[key];
  }

  /* ---------- draft ---------- */
  const saveDraftNow = useCallback(function () {
    try {
      const s = stateRef.current;
      if (!s.idea && s.step === 1 && !mindmapRef.current) return;
      localStorage.setItem(DRAFT_LS, JSON.stringify({
        v: 1, step: s.step, idea: s.idea,
        techChoice: s.techChoice, techCustom: s.techCustom,
        designChoice: s.designChoice, designCustom: s.designCustom,
        questions: s.questions, answers: s.answers,
        mindmap: mindmapRef.current, updatedAt: Date.now(),
      }));
    } catch (_) {}
  }, []);
  useEffect(function () {
    // simpan draft tiap ada interaksi (debounced)
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraftNow, 400);
    return function () {};
  }, [step, idea, techChoice, techCustom, designChoice, designCustom, questions, answers, saveDraftNow]);
  useEffect(function () {
    window.addEventListener('beforeunload', saveDraftNow);
    return function () { window.removeEventListener('beforeunload', saveDraftNow); };
  }, [saveDraftNow]);
  useEffect(function () {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_LS) || 'null');
      if (d && d.v === 1 && d.idea && Date.now() - (d.updatedAt || 0) <= 7 * 864e5) {
        setDraft(d);
        setShowDraftBanner(true);
      }
    } catch (_) {}
  }, []);
  function applyDraft(d) {
    setIdea(d.idea || '');
    setIdeaInput(d.idea || '');
    setTechChoice(d.techChoice || 'ai');
    setTechCustom(d.techCustom || '');
    setDesignChoice(d.designChoice || '');
    setDesignCustom(d.designCustom || '');
    setQuestions(d.questions || []);
    setAnswers(d.answers || {});
    if (d.mindmap) { mindmapRef.current = d.mindmap; setMmVersion(function (v) { return v + 1; }); }
    setShowDraftBanner(false);
    setStep(Math.min(Math.max(d.step || 1, 1), 5));
    toastMsg('Sesi terakhir dipulihkan.');
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_LS); } catch (_) {}
    setShowDraftBanner(false);
  }

  /* ---------- placeholder berputar (step 1) ---------- */
  useEffect(function () {
    if (step !== 1) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    var iv = setInterval(function () {
      setPhIdx(function (i) { return (i + 1) % PLACEHOLDERS.length; });
    }, 4000);
    return function () { clearInterval(iv); };
  }, [step]);

  /* ---------- template prefill ---------- */
  useEffect(function () {
    const tplId = searchParams.get('template');
    if (!tplId) return;
    apiFetch('/api/templates').then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (list) {
      const t = (list || []).find(function (x) { return String(x.id) === String(tplId); });
      if (t) {
        setIdeaInput(t.desc || t.name || '');
        setTplNotice('Template "' + t.name + '" dimuat. Sesuaikan dulu kalau perlu, lalu lanjut.');
      }
    }).catch(function () {});
  }, [searchParams]);

  /* ---------- step 1 ---------- */
  function submitIdea() {
    const v = ideaInput.trim();
    if (!v) { setIdeaError('Tulis dulu idemu ya — satu kalimat juga cukup.'); return; }
    setIdeaError('');
    try { byokForRequest(); } catch (e) { setIdeaError(e.message); return; }
    if (idea !== v) {
      setQuestions([]); setAnswers({}); mindmapRef.current = null;
      setTechRecs(null); setDesignThemes(null);
    }
    setIdea(v);
    try { prefetchJob('tech', { idea: v }); } catch (_) {}
    try { prefetchJob('design', { idea: v }); } catch (_) {}
    setStep(2);
  }

  /* ---------- step 2 ---------- */
  async function ensureTechRecs() {
    const cur = stateRef.current;
    if (techRecs && techRecs.for === cur.idea && techRecs.list) return;
    try {
      const result = await prefetchJob('tech', { idea: cur.idea });
      const list = result.recommendations || [];
      setTechRecs({ list: list, for: cur.idea, error: '' });
    } catch (e) {
      setTechRecs({ list: [], for: cur.idea, error: e && e.message });
    }
  }
  async function ensureDesignThemes() {
    const cur = stateRef.current;
    if (designThemes && designThemes.for === cur.idea && designThemes.list) return;
    try {
      const result = await prefetchJob('design', { idea: cur.idea });
      const list = result.themes || [];
      setDesignThemes({ list: list, for: cur.idea, error: '' });
    } catch (e) {
      setDesignThemes({ list: [], for: cur.idea, error: e && e.message });
    }
  }
  function techLabel() {
    return techChoice === 'self' ? (techCustom || '') : '';
  }
  function designLabel() {
    return (designCustom || designChoice || '').trim();
  }

  /* ---------- step 3 ---------- */
  function answersArray() {
    const out = [];
    questions.forEach(function (q, idx) {
      const a = answers[idx];
      const txt = Array.isArray(a) ? a.join(', ') : String(a || '').trim();
      if (txt) out.push({ q: q.q, a: txt });
    });
    return out;
  }
  async function ensureQuestions() {
    const cur = stateRef.current;
    if (cur.questions.length && questionsLoadedFor.current === cur.idea) return;
    setQState('loading');
    setQNote('AI lagi nyusun pertanyaan…');
    const t0 = Date.now();
    const tick = setInterval(function () {
      const s = Math.floor((Date.now() - t0) / 1000);
      setQNote('AI lagi nyusun pertanyaan… (' + s + ' dtk, biasanya 15–30 dtk)');
    }, 1000);
    try {
      const result = await prefetchJob('questions', { idea: cur.idea });
      const qs = result.questions || [];
      if (!Array.isArray(qs) || !qs.length) throw new Error('Tidak ada pertanyaan yang kembali.');
      setQuestions(qs.slice(0, 5).map(function (q) {
        return {
          q: q.q || q.question || q.text || 'Pertanyaan',
          type: q.type || 'text',
          options: Array.isArray(q.options) ? q.options : [],
        };
      }));
      setAnswers({});
      questionsLoadedFor.current = cur.idea;
      setQState('idle');
    } catch (e) {
      setQState('error');
      setQError('Gagal memuat pertanyaan: ' + (e.message || e));
    }
    clearInterval(tick);
  }

  /* ---------- step 4 ---------- */
  function mindmapNames() {
    const mm = mindmapRef.current;
    const out = [];
    if (!mm || !Array.isArray(mm.features)) return out;
    mm.features.forEach(function (f) {
      out.push(f.name);
      (f.subfeatures || []).forEach(function (s) {
        out.push(typeof s === 'string' ? s : (s.text || ''));
      });
    });
    return out.filter(Boolean);
  }
  async function ensureMindmap(force) {
    const cur = stateRef.current;
    if (mindmapRef.current && !force) { setMmState('idle'); return; }
    setMmState('loading');
    setMmError('');
    setMmNote('AI lagi nyusun struktur fitur…');
    try {
      const mm = await prefetchJob('mindmap', {
        idea: cur.idea, tech: techLabel(), answers: answersArray(),
      });
      mindmapRef.current = mm;
      setMmVersion(function (v) { return v + 1; });
      setMmState('idle');
    } catch (e) {
      setMmState('error');
      setMmError('Gagal membuat struktur: ' + (e.message || e));
    }
  }
  function onMindmapChange(d) {
    mindmapRef.current = d;
    saveDraftNow();
  }
  async function reviseMindmapNow(opts) {
    opts = opts || {};
    const instruction = String(opts.instruction || '').trim();
    if (!instruction) throw new Error('Instruksi revisi tidak boleh kosong.');
    const mm = mindmapRef.current;
    if (!mm || !mm.features) throw new Error('Mindmap belum ada.');
    const scoped = opts.featureName
      ? 'Fokus HANYA pada fitur "' + opts.featureName + '". Ubah hanya fitur itu sesuai instruksi; pertahankan fitur dan sub-fitur lain apa adanya.\n' + instruction
      : instruction;
    const s = stateRef.current;
    const payload = {
      idea: s.idea, tech: techLabel(), answers: answersArray(),
      mindmap: mm, instruction: scoped,
    };
    const body = withByok(payload);
    const resp = await apiFetch('/api/plan/mmrevise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let msg = 'Server error ' + resp.status + '.';
      try { const ej = await resp.json(); if (ej && ej.error) msg = ej.error; } catch (_) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    const nm = data.mindmap || data;
    if (!nm || !nm.features || !nm.features.length) throw new Error('AI tidak mengembalikan revisi yang valid.');
    mindmapRef.current = nm;
    setMmVersion(function (v) { return v + 1; });
    saveDraftNow();
  }
  function reviseFeatureNow(feature, instruction) {
    return reviseMindmapNow({ instruction: instruction, featureName: feature && feature.name });
  }
  async function sendRevise() {
    const instruction = reviseInput.trim();
    if (!instruction) { setReviseStatus('Tulis dulu instruksinya.'); return; }
    setReviseSending(true);
    setReviseStatus('AI lagi merevisi…');
    try {
      await reviseMindmapNow({ instruction: instruction });
      setReviseInput('');
      setReviseOpen(false);
      setReviseStatus('');
      toastMsg('Revisi AI selesai ✓');
    } catch (e) {
      setReviseStatus('Gagal: ' + (e.message || e));
    }
    setReviseSending(false);
  }

  /* ---------- step 5 : generate ---------- */
  function buildGeneratePayload() {
    const s = stateRef.current;
    const ans = answersArray();
    const descParts = ans.map(function (x) { return x.q + ' ' + x.a; });
    let features = [];
    ans.forEach(function (x) { if (/fitur/i.test(x.q)) features.push(x.a); });
    const mm = mindmapNames();
    if (mm.length) features = features.concat(mm);
    const design = designLabel();
    if (design) descParts.push('Preferensi tema desain: ' + design + '.');
    return {
      idea: s.idea,
      description: descParts.join('\n') || s.idea,
      audience: ans.length ? ans[0].a : '',
      features: features.join('; '),
      tech: techLabel(),
      design: design,
      answers: ans,
      mindmap: mindmapRef.current,
    };
  }
  function setRowState(id, st, chunk) {
    if (st === 'writing') noteSectionProgress(id);
    setSections(function (prev) {
      return prev.map(function (r) {
        if (r.id !== id || r.state === 'done') return r;
        if (st === 'writing') {
          const md = chunk ? r.markdown + chunk : r.markdown;
          return Object.assign({}, r, {
            state: 'writing',
            markdown: md,
            preview: md.slice(-600),
          });
        }
        return r;
      });
    });
    if (st === 'writing') {
      const idx = SECTIONS.findIndex(function (x) { return x.id === id; });
      if (idx >= 0) setGenStatus('Menulis section ' + (idx + 1) + '/' + SECTIONS.length + ': ' + SECTIONS[idx].title);
    } else if (st === 'done') {
      const r = sectionsRef.current.find(function (x) { return x.id === id; });
      if (r && r.state !== 'done') setDoneCount(function (c) { return c + 1; });
      setSections(function (prev) {
        return prev.map(function (x) { return x.id === id ? Object.assign({}, x, { state: 'done' }) : x; });
      });
    }
  }
  function noteSectionProgress(id) {
    if (lastWritingId.current && lastWritingId.current !== id) {
      const prevId = lastWritingId.current;
      const r = sectionsRef.current.find(function (x) { return x.id === prevId; });
      if (r && r.state !== 'done') {
        setSections(function (prev) {
          return prev.map(function (x) { return x.id === prevId && x.state !== 'done' ? Object.assign({}, x, { state: 'done' }) : x; });
        });
        setDoneCount(function (c) { return c + 1; });
      }
    }
    lastWritingId.current = id;
  }
  function showPicker() {
    generatingRef.current = false;
    lastWritingId.current = null;
    setGenPhase('picker');
    setGenError('');
  }
  async function startGeneration() {
    if (generatingRef.current) return;
    if (tsSiteKey && !tsToken) {
      setGenError('Selesaikan verifikasi keamanan dulu.');
      return;
    }
    generatingRef.current = true;
    setGenPhase('generating');
    setGenError('');
    setDoneCount(0);
    lastWritingId.current = null;
    setSections(SECTIONS.map(function (s, idx) {
      return { id: s.id, title: s.title, num: ('0' + (idx + 1)).slice(-2), state: 'wait', markdown: '', preview: '' };
    }));
    setGenStatus('AI sedang menulis tiap section satu per satu.');
    try {
      const body = withByok(buildGeneratePayload());
      if (tsSiteKey && tsToken) body.turnstileToken = tsToken;
      const res = await apiFetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = 'Server error ' + res.status + '.';
        try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (_) {}
        throw new Error(msg);
      }
      let redirected = false;
      await readNDJSON(res, function (ev) {
        if (ev.type === 'section' && ev.id) {
          setRowState(ev.id, 'writing', ev.markdown || '');
        } else if (ev.type === 'section_done' && ev.id) {
          setRowState(ev.id, 'done');
        } else if (ev.type === 'done' && ev.id) {
          redirected = true;
          try { localStorage.removeItem(DRAFT_LS); } catch (_) {}
          navigate('/prd/' + encodeURIComponent(ev.id));
        } else if (ev.type === 'error') {
          throw new Error(ev.message || 'AI gagal memproses');
        }
      });
      setSections(function (prev) { return prev.map(function (x) { return Object.assign({}, x, { state: 'done' }); }); });
      setDoneCount(SECTIONS.length);
      if (!redirected) throw new Error('Stream selesai tanpa hasil. Coba lagi.');
    } catch (e) {
      setGenError((e && e.message ? e.message : 'Terjadi kesalahan.') + ' Periksa koneksi lalu coba lagi.');
      setGenPhase('error');
    } finally {
      generatingRef.current = false;
      setTsToken('');
      if (tsRef.current) tsRef.current.reset();
    }
  }

  /* ---------- navigasi step ---------- */
  function showStep(n) {
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  useEffect(function () {
    if (step === 2) { ensureDesignThemes(); }
    if (step === 3) { ensureQuestions(); }
    if (step === 4) { ensureMindmap(false); }
    if (step === 5) { showPicker(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ---------- render helpers ---------- */
  function themePreview(t) {
    const colors = (t.colors || []).concat(['#888888', '#aaaaaa', '#cccccc']).slice(0, 3);
    const cls = styleClass(t.style);
    return (
      <div className={'pv ' + cls} style={{ '--c1': colors[0], '--c2': colors[1], '--c3': colors[2] }}>
        <div className="pv-bar"></div><div className="pv-title"></div>
        <div className="pv-row"><div className="pv-btn"></div><div className="pv-btn alt"></div></div>
        <div className="pv-card"><div className="pv-line"></div><div className="pv-line short"></div></div>
      </div>
    );
  }

  sectionsRef.current = sections;
  const answeredCount = answersArray().length;
  const ringOffset = (RING_C * (1 - doneCount / SECTIONS.length)).toFixed(1);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {showDraftBanner && draft && (
        <div className="mb-8 card p-4 sm:p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1" style={{ minWidth: '14rem' }}>
            <p className="font-bold" style={{ color: 'var(--ink)' }}>Ada sesi yang belum selesai</p>
            <p className="text-sm muted mt-1">
              &ldquo;{(draft.idea || '').length > 60 ? (draft.idea || '').slice(0, 60) + '…' : (draft.idea || '')}&rdquo; · tahap {draft.step} dari 5 · {fmtAgo(draft.updatedAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={function () { applyDraft(draft); }}>Lanjutkan</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>Buang</button>
          </div>
        </div>
      )}

      {toast && (
        <div id="toast">
          <div className="bg-[var(--danger)] text-[var(--on-accent)] text-sm font-medium px-5 py-3 rounded-xl shadow-lg">{toast}</div>
        </div>
      )}

      {/* ============ STEP 1 : IDE ============ */}
      {step === 1 && (
        <section className="wizard-step gen-step1">
          <div className="wz-ambient" aria-hidden="true"></div>
          <Stepper step={1} />
          <h1 className="wz-h1 wz-a text-4xl sm:text-5xl tracking-tight text-center mt-6">Mau bikin apa?</h1>
          <p className="wz-a text-[var(--ink-soft)] text-center mt-3 mb-8">Ubah idemu menjadi rencana yang bisa dipahami AI.</p>
          {tplNotice && (
            <div className="mb-6 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent)]">{tplNotice}</div>
          )}
          <div className="wz-b idea-card bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-4 sm:p-5">
            <textarea
              ref={ideaRef}
              rows="4"
              className="field text-lg resize-none"
              style={{ border: 0, background: 'transparent', boxShadow: 'none' }}
              placeholder={ideaInput ? 'contoh: aplikasi e-sarpras sekolah…' : PLACEHOLDERS[phIdx]}
              value={ideaInput}
              onChange={function (e) { setIdeaInput(e.target.value); }}
              onKeyDown={function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitIdea(); }}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--line)]/60">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded-full px-3 py-1.5">🌐 Bahasa Indonesia</span>
              </div>
              <button
                className="idea-send w-11 h-11 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-xl font-bold hover:brightness-110 transition"
                aria-label="Lanjut"
                onClick={submitIdea}
              >➤</button>
            </div>
          </div>
          {ideaError && <p className="text-sm text-[var(--danger)] mt-3 text-center">{ideaError}</p>}

          <div className="wz-c mt-6">
            <p className="text-xs font-semibold text-[var(--ink-faint)] mb-2.5 text-center">atau coba salah satu contoh ini ↓</p>
            <div className="grid grid-cols-2 gap-2.5">
              {EXAMPLES.map(function (ex) {
                return (
                  <button
                    key={ex.title}
                    type="button"
                    className="ex-chip text-left bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3"
                    onClick={function () {
                      setIdeaInput(ex.prompt);
                      setIdeaError('');
                      if (ideaRef.current) ideaRef.current.focus();
                    }}
                  >
                    <div className="text-xl mb-1.5">{ex.icon}</div>
                    <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{ex.title}</div>
                    <div className="text-xs text-[var(--ink-faint)] mt-0.5">{ex.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="wz-d mt-3 rounded-xl border border-[var(--money)]/30 bg-[var(--money)]/5 p-4">
            <button type="button" className="w-full flex items-center justify-between text-left" onClick={function () { setByokOpen(function (o) { return !o; }); }}>
              <span className="text-sm font-bold">🔑 API key sendiri <span className="text-[var(--ink-soft)] font-normal">(BYOK)</span></span>
              <span className="text-xs text-[var(--ink-soft)]">{byokStateLabel}</span>
            </button>
            {byokOpen && (
              <div className="mt-3 space-y-2">
                <input className="field text-sm" placeholder="Base URL — mis. https://api.openai.com/v1" autoComplete="off" autoCapitalize="off" spellCheck="false"
                  value={byok.baseUrl} onChange={function (e) { onByokInput({ baseUrl: e.target.value }); }} />
                <input type="password" className="field text-sm" placeholder="API key — mis. sk-…" autoComplete="off" autoCapitalize="off" spellCheck="false"
                  value={byok.apiKey} onChange={function (e) { onByokInput({ apiKey: e.target.value }); }} />
                <input className="field text-sm" placeholder="Nama model — mis. gpt-4o-mini" autoComplete="off" autoCapitalize="off" spellCheck="false"
                  value={byok.model} onChange={function (e) { onByokInput({ model: e.target.value }); }} />
                <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">Key tersimpan <b className="text-[var(--ink-soft)]">hanya di browser ini</b> (localStorage). Server cuma meneruskan request ke provider di atas — <b className="text-[var(--ink-soft)]">tidak menyimpan</b> key-mu. Bisa untuk endpoint OpenAI-compatible: OpenAI, OpenRouter, Tiarina, Kenari, dsb. Kosongkan semua untuk pakai key server.</p>
              </div>
            )}
          </div>

          <div className="wz-e text-center mt-8">
            <Link to="/riwayat" className="text-sm text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">🕘 Lihat PRD sebelumnya</Link>
          </div>
        </section>
      )}

      {/* ============ STEP 2 : TEKNOLOGI & DESAIN ============ */}
      {step === 2 && (
        <section className="wizard-step">
          <Stepper step={2} />
          <h2 className="text-3xl font-extrabold tracking-tight">Preferensi teknologi & desain</h2>
          <p className="text-[var(--ink-soft)] mt-2 mb-8">Semua rekomendasi di bawah dibuat AI khusus untuk idemu — bukan daftar generik.</p>

          <h3 className="text-lg font-bold mb-3">⚙️ Teknologi</h3>
          <p className="text-[var(--ink-soft)] text-sm mb-4">Udah punya pilihan tech stack, atau mau AI yang tentuin?</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <button type="button" className={'tech-card' + (techChoice === 'ai' ? ' selected' : '')} onClick={function () { setTechChoice('ai'); }}>
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-bold mb-1">Biarkan AI pilih</div>
              <div className="text-sm text-[var(--ink-soft)]">AI rekomendasiin stack yang paling cocok buat project kamu</div>
            </button>
            <button type="button" className={'tech-card' + (techChoice === 'self' ? ' selected' : '')} onClick={function () { setTechChoice('self'); ensureTechRecs(); }}>
              <div className="text-2xl mb-2">⚙️</div>
              <div className="font-bold mb-1">Pilih sendiri</div>
              <div className="text-sm text-[var(--ink-soft)]">Kamu tentuin teknologi yang mau dipakai</div>
            </button>
          </div>

          {techChoice === 'self' && (
            <div className="mt-4">
              <p className="text-sm text-[var(--ink-faint)] mb-3">💡 Rekomendasi AI buat idemu — klik buat pakai, atau tulis sendiri:</p>
              {!techRecs && <div className="text-sm text-[var(--ink-faint)] mb-3">AI lagi nyusun rekomendasi…</div>}
              {techRecs && techRecs.list.length === 0 && (
                <p className="text-sm text-[var(--ink-faint)]">{techRecs.error || 'Rekomendasi gagal dimuat. Tulis manual aja.'}</p>
              )}
              {techRecs && techRecs.list.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {techRecs.list.map(function (r, i) {
                    return (
                      <button key={i} type="button" className="rec-chip" title={r.reason || ''}
                        onClick={function () { setTechCustom(r.name); }}>
                        <span className="font-semibold text-sm">{r.name}</span>
                        {r.reason && <span className="block text-xs text-[var(--ink-faint)] mt-0.5">{r.reason}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <input type="text" className="field" placeholder="mis. Next.js + PostgreSQL" autoComplete="off"
                value={techCustom} onChange={function (e) { setTechCustom(e.target.value); }} />
            </div>
          )}

          <h3 className="text-lg font-bold mt-10 mb-3">🎨 Tema desain</h3>
          <p className="text-[var(--ink-soft)] text-sm mb-4">Pilih mood visual aplikasimu. AI yang rancang khusus buat idemu.</p>
          {!designThemes && <div className="text-sm text-[var(--ink-faint)] mb-3">AI lagi ngerancang tema…</div>}
          {designThemes && designThemes.list.length === 0 && (
            <p className="text-sm text-[var(--ink-faint)]">{designThemes.error || 'Rekomendasi tema gagal dimuat.'}</p>
          )}
          {designThemes && designThemes.list.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {designThemes.list.map(function (t, i) {
                const selected = designChoice && t.name && designChoice.indexOf(t.name) === 0;
                const dots = (t.colors || []).map(function (c, j) {
                  return <span key={j} className="inline-block w-5 h-5 rounded-full border border-[var(--line)]" style={{ background: c }}></span>;
                });
                return (
                  <button key={i} type="button" className={'tech-card text-left' + (selected ? ' selected' : '')}
                    onClick={function () {
                      setDesignChoice(t.name + (t.style ? ' (' + t.style + ')' : ''));
                      setDesignCustom('');
                    }}>
                    {themePreview(t)}
                    {t.style && <span className="inline-block text-[11px] font-semibold text-[var(--accent)] bg-[var(--accent-soft)] border border-[var(--accent)]/30 rounded-full px-2.5 py-0.5 mb-2">{t.style}</span>}
                    {dots.length > 0 && <div className="flex gap-1.5 mb-2">{dots}</div>}
                    <div className="font-bold mb-1">{t.name}</div>
                    <div className="text-sm text-[var(--ink-soft)]">{t.description || t.vibe || ''}</div>
                  </button>
                );
              })}
            </div>
          )}
          <input type="text" className="field mt-3" placeholder="atau tulis gayamu sendiri… mis. flat pastel yang playful" autoComplete="off"
            value={designCustom} onChange={function (e) { setDesignCustom(e.target.value); if (e.target.value.trim()) setDesignChoice(''); }} />
          <p className="text-xs text-[var(--ink-faint)] mt-2">Kosongkan kalau mau AI yang tentuin penuh nanti.</p>

          <div className="flex items-center justify-between mt-10">
            <button className="btn-ghost" onClick={function () { showStep(1); }}>← Kembali</button>
            <button className="btn-accent" onClick={function () {
              try { prefetchJob('questions', { idea: idea }); } catch (_) {}
              showStep(3);
            }}>Lanjut ➤</button>
          </div>
        </section>
      )}

      {/* ============ STEP 3 : PERTANYAAN ============ */}
      {step === 3 && (
        <section className="wizard-step">
          <Stepper step={3} />
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-3xl font-extrabold tracking-tight">Beberapa pertanyaan</h2>
            <span className="text-sm text-[var(--positive)] font-semibold mt-2">{answeredCount}/{questions.length}</span>
          </div>
          <p className="text-[var(--ink-soft)] mt-2 mb-8">Biar PRD-nya lebih akurat. Jawab semua pertanyaan di bawah.</p>

          {qState === 'loading' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--ink-faint)] text-center">{qNote}</p>
              <div className="skeleton h-24"></div>
              <div className="skeleton h-24"></div>
              <div className="skeleton h-24"></div>
            </div>
          )}
          {qState === 'error' && (
            <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-5 text-sm text-[var(--danger)]">
              {qError} <button className="underline font-semibold" onClick={function () { questionsLoadedFor.current = ''; ensureQuestions(); }}>Coba lagi</button>
            </div>
          )}
          {qState !== 'loading' && questions.map(function (q, idx) {
            return (
              <div className="q-card" key={idx}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="font-semibold">{idx + 1}. {q.q}</div>
                  <button className="q-skip text-xs text-[var(--ink-faint)] hover:text-[var(--ink-soft)] shrink-0 mt-1"
                    onClick={function () { setAnswers(function (a) { const n = Object.assign({}, a); delete n[idx]; return n; }); }}>Lewati</button>
                </div>
                {q.type === 'text' ? (
                  <textarea className="field q-text" rows="3" placeholder="Tulis jawabanmu…" value={answers[idx] || ''}
                    onChange={function (e) {
                      const v = e.target.value;
                      setAnswers(function (a) { const n = Object.assign({}, a); if (v.trim()) n[idx] = v; else delete n[idx]; return n; });
                    }} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(q.options || []).map(function (op, oi) {
                      const sel = answers[idx];
                      const selArr = Array.isArray(sel) ? sel : (sel ? [sel] : []);
                      const on = selArr.indexOf(op) >= 0;
                      return (
                        <span key={oi} className={'chip' + (on ? ' selected' : '')}
                          onClick={function () {
                            setAnswers(function (a) {
                              const n = Object.assign({}, a);
                              if (q.type === 'multi') {
                                let arr = Array.isArray(n[idx]) ? n[idx].slice() : [];
                                const at = arr.indexOf(op);
                                if (at >= 0) arr.splice(at, 1); else arr.push(op);
                                if (arr.length) n[idx] = arr; else delete n[idx];
                              } else {
                                if (n[idx] === op) delete n[idx]; else n[idx] = op;
                              }
                              return n;
                            });
                          }}>{op}</span>
                      );
                    })}
                    <span className="chip chip-other" onClick={function () {
                      const v = window.prompt('Tulis jawaban lainnya:');
                      if (v && v.trim()) {
                        const vv = v.trim();
                        setAnswers(function (a) {
                          const n = Object.assign({}, a);
                          if (q.type === 'multi') {
                            let arr = Array.isArray(n[idx]) ? n[idx].slice() : [];
                            if (arr.indexOf(vv) < 0) arr.push(vv);
                            n[idx] = arr;
                          } else { n[idx] = vv; }
                          return n;
                        });
                      }
                    }}>+ Lainnya</span>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between mt-10">
            <button className="btn-ghost" onClick={function () { showStep(2); }}>← Kembali</button>
            <button className="btn-orange" onClick={function () {
              try { prefetchJob('mindmap', { idea: idea, tech: techLabel(), answers: answersArray() }); } catch (_) {}
              showStep(4);
            }}>Bikin Struktur ➤</button>
          </div>
        </section>
      )}

      {/* ============ STEP 4 : MINDMAP ============ */}
      {step === 4 && (
        <section className="wizard-step">
          <Stepper step={4} />
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="font-display text-3xl font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Struktur Fitur</h2>
            <div className="mm-toolbar" role="toolbar" aria-label="Aksi struktur fitur">
              <button type="button" className="mm-toolbtn" onClick={function () { setReviseOpen(function (o) { return !o; }); }}>Revisi AI</button>
              <button type="button" className="mm-toolbtn" onClick={function () { ensureMindmap(true); }}>Buat ulang</button>
            </div>
          </div>
          <p className="text-[var(--ink-soft)] mt-2 mb-4" style={{ maxWidth: '38rem' }}>Peta fitur hasil rancangan AI. Klik kartu untuk membuka atau menutup sub-fitur. Kamu juga bisa menyunting manual atau meminta AI merevisi.</p>
          <ul className="mm-legend" aria-label="Keterangan fase">
            <li><span className="dot" style={{ background: '#22c55e' }} aria-hidden="true"></span>Fase 1: Inti</li>
            <li><span className="dot" style={{ background: '#f59e0b' }} aria-hidden="true"></span>Fase 2: Lanjutan</li>
            <li><span className="dot" style={{ background: '#a78bfa' }} aria-hidden="true"></span>Fase 3: Nanti</li>
          </ul>

          {reviseOpen && (
            <div id="mmRevisePanel" className="open">
              <div className="panel">
                <label className="lbl" htmlFor="mmReviseInput">Instruksi revisi untuk AI</label>
                <textarea id="mmReviseInput" className="field text-sm" rows="2"
                  placeholder="Contoh: tambah fitur pembayaran QRIS di Fase 1, hapus Mode Offline"
                  value={reviseInput} onChange={function (e) { setReviseInput(e.target.value); }} />
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button type="button" className="btn btn-primary btn-sm" disabled={reviseSending} onClick={sendRevise}>Kirim revisi</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={function () { setReviseOpen(false); }}>Batal</button>
                  <span className="text-xs muted" role="status">{reviseStatus}</span>
                </div>
              </div>
            </div>
          )}

          {mmState === 'loading' && (
            <div>
              <p className="mm-statusline"><span className="mm-spinner" aria-hidden="true"></span><span>{mmNote}</span></p>
              <div className="mm-skels" aria-hidden="true">
                <div className="mm-skel-root"></div>
                <div className="mm-skel-cards">
                  <div className="mm-skel-card"></div>
                  <div className="mm-skel-card"></div>
                  <div className="mm-skel-card"></div>
                </div>
              </div>
            </div>
          )}
          {mmState === 'error' && (
            <div className="mm-error" role="alert">
              {mmError} <button className="underline font-semibold" onClick={function () { ensureMindmap(true); }}>Coba lagi</button>
            </div>
          )}
          {mmState !== 'loading' && mindmapRef.current && (
            <div className="mm-wide">
              <MindmapView data={mindmapRef.current} version={mmVersion} onChange={onMindmapChange} onReviseFeature={reviseFeatureNow} />
            </div>
          )}

          <div className="flex items-center justify-between mt-10">
            <button className="btn btn-ghost" onClick={function () { showStep(3); }}>← Kembali</button>
            <button className="btn btn-primary" onClick={function () { showStep(5); }}>Lanjutkan →</button>
          </div>
        </section>
      )}

      {/* ============ STEP 5 : GENERATE ============ */}
      {step === 5 && (
        <section className="wizard-step">
          <Stepper step={5} />

          {genPhase === 'picker' && (
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight mb-2">Siap generate! 🚀</h2>
              <p className="text-sm text-[var(--ink-soft)] mb-6">PRD akan ditulis oleh AI API — teks mengalir live per section.</p>
              {tsSiteKey ? (
                <div className="mb-5">
                  <Turnstile ref={tsRef} siteKey={tsSiteKey}
                    onToken={function (t) { setTsToken(t); setGenError(''); }}
                    onExpire={function () { setTsToken(''); }} />
                </div>
              ) : null}
              <button className="btn-accent w-full sm:w-auto text-base" onClick={startGeneration}
                disabled={!!tsSiteKey && !tsToken}>✨ Generate PRD</button>
              {genError && <p className="text-sm mt-3" role="alert" style={{ color: '#b3261e' }}>{genError}</p>}
            </div>
          )}

          {genPhase === 'generating' && (
            <div>
              <div className="gen-hero">
                <div style={{ minWidth: 0 }}>
                  <span className="kicker">Generate</span>
                  <h2 className="gen-title">Menyusun PRD<span className="gen-dots" aria-hidden="true"><i></i><i></i><i></i></span></h2>
                  <p className="gen-status">{genStatus}</p>
                </div>
                <div className="gen-ring" role="progressbar" aria-label="Progress penyusunan PRD" aria-valuemin="0" aria-valuemax={SECTIONS.length} aria-valuenow={doneCount}>
                  <svg viewBox="0 0 72 72" aria-hidden="true">
                    <circle className="ring-bg" cx="36" cy="36" r="30"></circle>
                    <circle className="ring-fg" cx="36" cy="36" r="30" style={{ strokeDashoffset: ringOffset }}></circle>
                  </svg>
                  <span className="gen-ring-label">{doneCount}/{SECTIONS.length}</span>
                </div>
              </div>
              <ul className="gen-grid">
                {sections.map(function (s, idx) {
                  return (
                    <li key={s.id} className="sec-card" data-state={s.state} style={{ '--d': idx }}>
                      <span className="sec-ico">
                        {s.state === 'writing'
                          ? <span className="spinner" aria-hidden="true"></span>
                          : <span className="sec-idx">{s.num}</span>}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="sec-title">{s.title}</div>
                        <div className="sec-label">{s.state === 'done' ? 'Selesai' : (s.state === 'writing' ? 'Menulis…' : 'Menunggu')}</div>
                      </div>
                      <span className="sec-check" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path pathLength="1" d="M8 12.5l2.5 2.5L16 9.5" /></svg>
                      </span>
                      {s.preview && <pre className="sec-preview">{s.preview}</pre>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {genPhase === 'error' && (
            <div className="mt-6 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-6">
              <h3 className="font-bold text-[var(--danger)] mb-2">😥 Yah, generate gagal</h3>
              <p className="text-sm text-[var(--danger)]/80 mb-4">{genError}</p>
              <button className="btn-accent" onClick={showPicker}>🔄 Coba Lagi</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
