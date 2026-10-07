import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Marked } from 'marked';
/* mermaid dimuat lazy (1.4MB) hanya saat flowchart dipakai */
let mermaidMod = null;
async function getMermaid(theme) {
  if (!mermaidMod) mermaidMod = (await import('mermaid')).default;
  try { mermaidMod.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'loose' }); } catch (_) {}
  return mermaidMod;
}
import { apiFetch, getByok, setByok, withByok } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.jsx';
import caraPakaiMd from '../lib/carapakai.md?raw';

/* ================= helpers ================= */
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bagian';
}
function fmtDateLong(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' • ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}
function renderMdWithToc(md) {
  const heads = [];
  const used = {};
  const m = new Marked();
  m.use({
    renderer: {
      heading(t) {
        const text = this.parser.parseInline(t.tokens);
        if (t.depth === 2 || t.depth === 3) {
          const base = slugify(t.text);
          let id = base, n = 1;
          while (used[id]) id = base + '-' + (++n);
          used[id] = 1;
          heads.push({ id: id, text: t.text, level: t.depth });
          return '<h' + t.depth + ' id="' + id + '">' + text + '</h' + t.depth + '>';
        }
        return '<h' + t.depth + '>' + text + '</h' + t.depth + '>';
      },
    },
  });
  m.setOptions({ gfm: true, breaks: true });
  return { html: m.parse(md || ''), heads: heads };
}
function renderMd(md) {
  const m = new Marked();
  m.setOptions({ gfm: true, breaks: true });
  return m.parse(md || '');
}
async function readNDJSON(res, onEvent) {
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
      let ev;
      try { ev = JSON.parse(line); } catch (_) { continue; }
      onEvent(ev);
      if (ev.type === 'error') throw new Error(ev.message || 'AI gagal memproses');
    }
  }
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}
function copyText(txt, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
  } else { fallbackCopy(txt); done(); }
}
function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/* ---- ZIP writer minimal (stored/tanpa kompresi, tanpa dependensi) ---- */
const CRC_T = (function () {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function zipBuild(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  function u16(v) { parts.push(new Uint8Array([v & 0xFF, (v >> 8) & 0xFF])); offset += 2; }
  function u32(v) { parts.push(new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF])); offset += 4; }
  function bytes(b) { parts.push(b); offset += b.length; }
  function str(s) { bytes(enc.encode(s)); }
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const now = new Date();
  const dost = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  files.forEach(function (f) {
    const nameB = enc.encode(f.name), dataB = enc.encode(f.text), crc = crc32(dataB);
    const coff = offset;
    str('PK\x03\x04');
    u16(20); u16(0x0800); u16(0); u16(dost); u16(dosd);
    u32(crc); u32(dataB.length); u32(dataB.length);
    u16(nameB.length); u16(0);
    bytes(nameB); bytes(dataB);
    central.push({ nameB: nameB, crc: crc, size: dataB.length, off: coff });
  });
  const cStart = offset;
  central.forEach(function (e) {
    str('PK\x01\x02');
    u16(20); u16(20); u16(0x0800); u16(0); u16(dost); u16(dosd);
    u32(e.crc); u32(e.size); u32(e.size);
    u16(e.nameB.length); u16(0); u16(0); u16(0); u16(0); u32(0);
    u32(e.off);
    bytes(e.nameB);
  });
  const cSize = offset - cStart;
  str('PK\x05\x06');
  u16(0); u16(0); u16(central.length); u16(central.length);
  u32(cSize); u32(cStart); u16(0);
  const res = new Uint8Array(offset);
  let p = 0;
  parts.forEach(function (b) { res.set(b, p); p += b.length; });
  return res;
}

const GEN_ITEMS = [
  { key: 'specs', label: '⚙️ Spec & Task', section: 'specs-section' },
  { key: 'flowchart', label: '📊 Flowchart', section: 'flowchart-section' },
  { key: 'suggest', label: '💡 Saran Fitur', section: 'suggest-section' },
  { key: 'agentsmd', label: '🤖 AGENTS.md', section: 'agentsmd-section' },
  { key: 'designmd', label: '🎨 design.md', section: 'designmd-section' },
];

/* ================= komponen ================= */
export default function PrdDetail() {
  const { id: prdId } = useParams();
  const { ready } = useAuth();
  const { theme } = useTheme();

  const [view, setView] = useState('loading');
  const [prd, setPrd] = useState(null);
  const [activeToc, setActiveToc] = useState('');
  const [readPct, setReadPct] = useState(0);
  const [menuOpen, setMenuOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [byok, setByokSt] = useState({ baseUrl: '', apiKey: '', model: '' });

  const [specsMd, setSpecsMd] = useState('');
  const [specsRun, setSpecsRun] = useState({ running: false, status: '', features: [], itemState: {}, done: 0, fail: 0, total: 0 });
  const [fc, setFc] = useState({ code: '', svg: '', running: false, status: '', error: '', editorOpen: false, editCode: '' });
  const [suggest, setSuggest] = useState({ list: [], running: false, status: '' });
  const [agentsMd, setAgentsMd] = useState({ md: '', running: false, status: '' });
  const [designMd, setDesignMd] = useState({ md: '', running: false, status: '' });

  const articleRef = useRef(null);
  const toastTimer = useRef(null);
  const specsRef = useRef({ features: [], mdById: {}, done: 0, fail: 0, total: 0 });

  function showToast(msg, isErr) {
    setToast({ msg: msg, err: !!isErr });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(function () { setToast(null); }, 2200);
  }

  /* ---------- BYOK ---------- */
  useEffect(function () {
    const b = getByok() || {};
    setByokSt({ baseUrl: b.baseUrl || '', apiKey: b.apiKey || '', model: b.model || '' });
  }, []);
  function onByokInput(patch) {
    setByokSt(function (prev) {
      const next = Object.assign({}, prev, patch);
      const n = [next.baseUrl.trim(), next.apiKey.trim(), next.model.trim()].filter(Boolean).length;
      setByok(n === 3 ? { baseUrl: next.baseUrl.trim(), apiKey: next.apiKey.trim(), model: next.model.trim() } : null);
      return next;
    });
  }
  const byokN = [byok.baseUrl.trim(), byok.apiKey.trim(), byok.model.trim()].filter(Boolean).length;
  const byokLabel = byokN === 3 ? '· ✓ terisi' : (byokN === 0 ? '' : '· ⚠ belum lengkap');

  function aiPost(url, body) {
    return apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withByok(body || {})),
    });
  }

  /* ---------- load PRD ---------- */
  useEffect(function () {
    if (!ready) return;
    if (!prdId) { setView('error'); return; }
    (async function () {
      try {
        const res = await apiFetch('/api/prds/' + encodeURIComponent(prdId));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const p = await res.json();
        if (!p || !p.markdown) throw new Error('notfound');
        setPrd(p);
        setSpecsMd(p.specs || '');
        setAgentsMd({ md: p.agentsmd || '', running: false, status: '' });
        setDesignMd({ md: p.designmd || '', running: false, status: '' });
        setSuggest({ list: Array.isArray(p.suggestions) ? p.suggestions : [], running: false, status: '' });
        setView('content');
        document.title = (p.title || 'PRD') + ' — AutoPRD.id';
      } catch (_) {
        setView('error');
      }
    })();
  }, [ready, prdId]);

  /* ---------- render markdown + TOC ---------- */
  const rendered = useMemo(function () {
    if (!prd) return { html: '', heads: [] };
    return renderMdWithToc(prd.markdown);
  }, [prd]);
  const toc = rendered.heads;

  /* ---------- scrollspy + read progress ---------- */
  useEffect(function () {
    if (view !== 'content') return;
    const bar = document.documentElement;
    let ticking = false;
    function update() {
      ticking = false;
      const max = bar.scrollHeight - bar.clientHeight;
      setReadPct(max > 0 ? (bar.scrollTop / max) * 100 : 0);
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    update();
    return function () { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', update); };
  }, [view]);
  useEffect(function () {
    if (view !== 'content' || !toc.length || !articleRef.current) return;
    const links = articleRef.current.parentElement;
    const obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) setActiveToc(e.target.id);
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    const heads = articleRef.current.querySelectorAll('h2[id], h3[id]');
    heads.forEach(function (h) { obs.observe(h); });
    return function () { obs.disconnect(); };
  }, [view, toc]);

  useEffect(function () {
    if (view !== 'content') return;
    (async function () {
      try {
        const res = await apiFetch('/api/prds/' + encodeURIComponent(prdId) + '/flowchart');
        if (!res.ok) return;
        const d = await res.json();
        if (d && d.mermaid) renderFlowchartSvg(d.mermaid);
      } catch (_) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, prdId]);
  async function renderFlowchartSvg(code) {
    if (!code) { setFc(function (s) { return Object.assign({}, s, { code: '', svg: '', error: '' }); }); return false; }
    try {
      const mm = await getMermaid(theme);
      const out = await mm.render('fc-svg-' + Date.now(), code);
      setFc(function (s) { return Object.assign({}, s, { code: code, svg: out.svg, error: '' }); });
      return true;
    } catch (e) {
      setFc(function (s) {
        return Object.assign({}, s, {
          code: code, svg: '',
          error: 'Gagal menggambar diagram: ' + ((e && e.message) || 'syntax tidak valid') + '. Periksa kode Mermaid lalu tekan "Render Ulang".',
        });
      });
      return false;
    }
  }

  /* ---------- generate: specs ---------- */
  async function generateSpecs() {
    if (specsRun.running) return;
    setSpecsRun({ running: true, status: 'Menghubungi AI…', features: [], itemState: {}, done: 0, fail: 0, total: 0 });
    setSpecsMd('');
    specsRef.current = { features: [], mdById: {}, done: 0, fail: 0, total: 0 };
    try {
      const res = await aiPost('/api/prds/' + encodeURIComponent(prdId) + '/specs');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await readNDJSON(res, function (ev) {
        const s = specsRef.current;
        if (ev.type === 'status') {
          setSpecsRun(function (p) { return Object.assign({}, p, { status: ev.message || '' }); });
        } else if (ev.type === 'features') {
          s.features = ev.features || []; s.total = s.features.length;
          setSpecsRun(function (p) {
            return Object.assign({}, p, {
              features: s.features, total: s.total,
              status: 'Ditemukan ' + s.total + ' fitur. Mulai menulis spesifikasi…',
            });
          });
        } else if (ev.type === 'spec_start') {
          const f = ev.feature || {};
          const fid = f.id || ev.feature_id;
          const idx = (typeof ev.index === 'number') ? (ev.index + 1) : '?';
          setSpecsRun(function (p) {
            const itemState = Object.assign({}, p.itemState); itemState[fid] = 'run';
            return Object.assign({}, p, {
              itemState: itemState,
              status: 'Menulis spec fitur ' + idx + '/' + ev.total + ': ' + (f.name || fid) + '…',
            });
          });
        } else if (ev.type === 'spec_chunk') {
          s.mdById[ev.feature_id] = (s.mdById[ev.feature_id] || '') + (ev.markdown || '');
          setSpecsMd(s.features.map(function (f) { return s.mdById[f.id] || ''; }).join('\n\n'));
        } else if (ev.type === 'spec_done') {
          s.done++;
          setSpecsRun(function (p) {
            const itemState = Object.assign({}, p.itemState); itemState[ev.feature_id] = 'done';
            return Object.assign({}, p, { itemState: itemState, done: s.done, status: 'Selesai ' + (s.done + s.fail) + '/' + s.total + ' fitur…' });
          });
        } else if (ev.type === 'spec_error') {
          s.fail++;
          setSpecsRun(function (p) {
            const itemState = Object.assign({}, p.itemState); itemState[ev.feature_id] = 'fail';
            return Object.assign({}, p, { itemState: itemState, fail: s.fail });
          });
        }
      });
      const s = specsRef.current;
      setSpecsRun(function (p) { return Object.assign({}, p, { running: false, status: '' }); });
      if (s.fail > 0) showToast(s.done + '/' + s.total + ' fitur selesai, ' + s.fail + ' gagal', true);
      else showToast('Spesifikasi selesai dibuat! (' + s.total + ' fitur)');
    } catch (e) {
      setSpecsRun(function (p) { return Object.assign({}, p, { running: false, status: '' }); });
      showToast('Gagal membuat spesifikasi: ' + e.message, true);
    }
  }

  /* ---------- generate: flowchart ---------- */
  async function generateFlowchart() {
    if (fc.running) return;
    setFc(function (s) { return Object.assign({}, s, { running: true, status: 'Menghubungi AI…', error: '' }); });
    let code = '';
    try {
      const res = await aiPost('/api/prds/' + encodeURIComponent(prdId) + '/flowchart');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await readNDJSON(res, function (ev) {
        if (ev.type === 'status') setFc(function (s) { return Object.assign({}, s, { status: ev.message || '' }); });
        else if (ev.type === 'flowchart_chunk' && ev.markdown) code += ev.markdown;
        else if (ev.type === 'flowchart' && ev.mermaid) { code = ev.mermaid; renderFlowchartSvg(code); }
      });
      setFc(function (s) { return Object.assign({}, s, { running: false, status: 'Flowchart selesai dibuat. Tekan "Simpan" untuk menyimpan, atau "Edit" untuk mengubah manual.' }); });
      showToast('Flowchart selesai dibuat!');
    } catch (e) {
      setFc(function (s) { return Object.assign({}, s, { running: false, status: '' }); });
      showToast('Gagal membuat flowchart: ' + e.message, true);
    }
  }
  async function saveFlowchart() {
    const code = fc.editorOpen ? fc.editCode : fc.code;
    try {
      const res = await apiFetch('/api/prds/' + encodeURIComponent(prdId) + '/flowchart', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mermaid: code }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await renderFlowchartSvg(code);
      setFc(function (s) { return Object.assign({}, s, { editorOpen: false }); });
      showToast('Flowchart tersimpan!');
    } catch (e) {
      showToast('Gagal menyimpan: ' + e.message, true);
    }
  }

  /* ---------- generate: suggest ---------- */
  async function generateSuggest() {
    if (suggest.running) return;
    setSuggest({ list: [], running: true, status: '' });
    let last = [];
    try {
      const res = await aiPost('/api/prds/' + encodeURIComponent(prdId) + '/suggest');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await readNDJSON(res, function (ev) {
        if (ev.type === 'status') setSuggest(function (s) { return Object.assign({}, s, { status: ev.message || '' }); });
        else if (ev.type === 'suggest_done') last = ev.suggestions || [];
      });
      setSuggest({ list: last, running: false, status: '' });
      if (last.length) showToast('Saran AI selesai dibuat! (' + last.length + ' saran)');
    } catch (e) {
      setSuggest({ list: [], running: false, status: '' });
      showToast('Gagal meminta saran: ' + e.message, true);
    }
  }
  function copySuggest() {
    if (!suggest.list.length) return;
    const txt = suggest.list.map(function (s, i) {
      return (i + 1) + '. ' + s.title + ' [Prioritas: ' + (s.priority || '-') + ', Effort: ' + (s.effort || '-') + ']\n   ' + (s.why || '');
    }).join('\n\n');
    copyText(txt, function () { showToast('Saran disalin!'); });
  }

  /* ---------- generate: agentsmd / designmd ---------- */
  async function generateDoc(kind) {
    const isAgents = kind === 'agentsmd';
    const setSt = isAgents ? setAgentsMd : setDesignMd;
    const cur = isAgents ? agentsMd : designMd;
    if (cur.running) return;
    setSt({ md: '', running: true, status: 'AI lagi nyusun ' + (isAgents ? 'AGENTS.md' : 'design.md') + ' dari PRD ini…' });
    let md = '';
    try {
      const res = await aiPost('/api/prds/' + encodeURIComponent(prdId) + '/' + kind);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await readNDJSON(res, function (ev) {
        const chunkKey = kind + '_chunk', doneKey = kind;
        if (ev.type === chunkKey && ev.markdown) { md += ev.markdown; setSt({ md: md, running: true, status: '' }); }
        else if (ev.type === doneKey && ev.markdown) { md = ev.markdown; }
        else if (ev.type === 'status' && ev.message) { setSt(function (p) { return Object.assign({}, p, { status: ev.message }); }); }
      });
      setSt({ md: md, running: false, status: '' });
      showToast((isAgents ? 'AGENTS.md' : 'design.md') + ' selesai dibuat!');
    } catch (e) {
      setSt(function (p) { return Object.assign({}, p, { running: false, status: '' }); });
      showToast('Gagal membuat ' + (isAgents ? 'AGENTS.md' : 'design.md') + ': ' + e.message, true);
    }
  }

  /* ---------- request generate (dengan konfirmasi bila sudah ada) ---------- */
  const hasDoc = {
    specs: !!(specsMd && specsMd.trim()),
    flowchart: !!(fc.code && fc.code.trim()),
    suggest: suggest.list.length > 0,
    agentsmd: !!(agentsMd.md && agentsMd.md.trim()),
    designmd: !!(designMd.md && designMd.md.trim()),
  };
  const runners = { specs: generateSpecs, flowchart: generateFlowchart, suggest: generateSuggest, agentsmd: function () { generateDoc('agentsmd'); }, designmd: function () { generateDoc('designmd'); } };
  function requestGenerate(kind) {
    setMenuOpen(null);
    const sec = document.getElementById(GEN_ITEMS.find(function (g) { return g.key === kind; }).section);
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!hasDoc[kind]) { runners[kind](); return; }
    const label = GEN_ITEMS.find(function (g) { return g.key === kind; }).label.replace(/^[^\s]+\s/, '');
    setConfirm({
      title: 'Generate ulang ' + label + '?',
      desc: label + ' sudah ada. Generate ulang akan menimpa hasilnya dan memakai token AI.',
      okLabel: '🔄 Ya, generate ulang',
      onOk: runners[kind],
    });
  }

  /* ---------- export ---------- */
  function docFilename(name) {
    if (name === 'PRD') return slugify(prd.title || 'prd') + '-PRD.md';
    if (name === 'Tech Spec') return 'tech_spec.md';
    return name;
  }
  function allDocs() {
    return [
      { name: 'PRD', md: prd ? prd.markdown : '' },
      { name: 'Tech Spec', md: specsMd },
      { name: 'AGENTS.md', md: agentsMd.md },
      { name: 'design.md', md: designMd.md },
    ].filter(function (d) { return d.md && String(d.md).trim(); });
  }
  function downloadOne(label, md, filename) {
    if (!md || !String(md).trim()) { showToast(label + ' belum dibuat.', true); return; }
    downloadBlob(String(md).trim(), filename);
    showToast(filename + ' diunduh!');
  }
  function downloadZip() {
    const docs = allDocs();
    if (!docs.length) { showToast('Belum ada dokumen untuk diunduh.', true); return; }
    const files = docs.map(function (d) { return { name: docFilename(d.name), text: String(d.md).trim() + '\n' }; });
    if (caraPakaiMd.trim()) files.push({ name: 'CARA_PAKAI.md', text: caraPakaiMd.trim() + '\n' });
    const blob = new Blob([zipBuild(files)], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = slugify(prd.title || 'prd') + '-dokumen.zip';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast(files.length + ' file dibungkus ZIP & diunduh!');
  }
  function printAll() {
    const docs = allDocs();
    if (!docs.length) { showToast('Belum ada dokumen untuk dicetak.', true); return; }
    const box = document.getElementById('print-all');
    if (box) {
      box.innerHTML = docs.map(function (d) {
        return '<div class="print-doc"><h1>' + d.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</h1><div class="md-body">' + renderMd(String(d.md)) + '</div></div>';
      }).join('');
    }
    document.body.classList.add('print-all-mode');
    window.print();
  }
  useEffect(function () {
    function after() { document.body.classList.remove('print-all-mode'); }
    window.addEventListener('afterprint', after);
    return function () { window.removeEventListener('afterprint', after); };
  }, []);
  function doExport(kind) {
    setMenuOpen(null);
    if (kind === 'docPRD') downloadOne('PRD', prd ? prd.markdown : '', docFilename('PRD'));
    else if (kind === 'docSpec') downloadOne('Tech Spec', specsMd, docFilename('Tech Spec'));
    else if (kind === 'docAgents') downloadOne('AGENTS.md', agentsMd.md, docFilename('AGENTS.md'));
    else if (kind === 'docDesign') downloadOne('design.md', designMd.md, docFilename('design.md'));
    else if (kind === 'printPdf') printAll();
    else if (kind === 'zip') downloadZip();
    else if (kind === 'panduan') window.open('/panduan', '_blank');
  }

  /* ---------- render ---------- */
  useEffect(function () {
    function onKey(e) { if (e.key === 'Escape') { setConfirm(null); setMenuOpen(null); } }
    function onDoc(e) { if (!e.target.closest('.menu-wrap')) setMenuOpen(null); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDoc);
    return function () { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDoc); };
  }, []);

  if (view === 'loading') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-10 w-2/3 rounded mb-4"></div>
        <div className="skeleton h-4 w-1/3 rounded mb-8"></div>
        <div className="skeleton h-64 rounded"></div>
      </div>
    );
  }
  if (view === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold mb-2">PRD tidak ditemukan</h1>
        <p className="muted mb-6">Dokumen yang kamu cari tidak ada atau sudah dihapus.</p>
        <Link to="/riwayat" className="btn btn-primary">← Kembali ke Riwayat</Link>
      </div>
    );
  }

  const specsHtml = specsMd ? renderMd(specsMd) : '';
  const agentsHtml = agentsMd.md ? renderMd(agentsMd.md) : '';
  const designHtml = designMd.md ? renderMd(designMd.md) : '';
  const pc = { 'Tinggi': 'pc-high', 'Sedang': 'pc-mid', 'Rendah': 'pc-low' };

  return (
    <>
      <div id="read-progress" aria-hidden="true" style={{ width: readPct + '%' }}></div>
      <div>
        {/* TOOLBAR */}
        <div className="sticky top-[57px] z-30 border-b bd" style={{ background: 'color-mix(in srgb, var(--canvas) 94%, transparent)', backdropFilter: 'blur(8px)' }}>
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
            <Link to="/riwayat" className="text-sm muted hover-ink px-2 py-1.5" style={{ textDecoration: 'none' }}>← Riwayat</Link>
            <span className="faint truncate" style={{ fontSize: '.8rem', maxWidth: '40vw' }}>{prd.title}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="menu-wrap">
                <button className="btn btn-primary btn-sm" onClick={function (e) { e.stopPropagation(); setMenuOpen(menuOpen === 'gen' ? null : 'gen'); }}>Generate ▾</button>
                {menuOpen === 'gen' && (
                  <div className="menu-panel">
                    {GEN_ITEMS.slice(0, 3).map(function (g) {
                      return <button key={g.key} className="menu-item" onClick={function () { requestGenerate(g.key); }}><span>{g.label}</span><span className="st">{hasDoc[g.key] ? '✓' : ''}</span></button>;
                    })}
                    <div className="menu-sep"></div>
                    {GEN_ITEMS.slice(3).map(function (g) {
                      return <button key={g.key} className="menu-item" onClick={function () { requestGenerate(g.key); }}><span>{g.label}</span><span className="st">{hasDoc[g.key] ? '✓' : ''}</span></button>;
                    })}
                  </div>
                )}
              </div>
              <div className="menu-wrap">
                <button className="btn btn-ghost btn-sm" onClick={function (e) { e.stopPropagation(); setMenuOpen(menuOpen === 'exp' ? null : 'exp'); }}>Export ▾</button>
                {menuOpen === 'exp' && (
                  <div className="menu-panel">
                    <button className="menu-item" disabled={!hasDoc.specs && !(prd && prd.markdown)} onClick={function () { doExport('docPRD'); }}><span>⬇️ PRD (.md)</span></button>
                    <button className="menu-item" disabled={!hasDoc.specs} onClick={function () { doExport('docSpec'); }}><span>⬇️ Tech Spec (.md)</span></button>
                    <button className="menu-item" disabled={!hasDoc.agentsmd} onClick={function () { doExport('docAgents'); }}><span>⬇️ AGENTS.md</span></button>
                    <button className="menu-item" disabled={!hasDoc.designmd} onClick={function () { doExport('docDesign'); }}><span>⬇️ design.md</span></button>
                    <div className="menu-sep"></div>
                    <button className="menu-item" onClick={function () { doExport('printPdf'); }}><span>🖨️ Print / PDF</span></button>
                    <button className="menu-item" onClick={function () { doExport('zip'); }}><span>📦 Download Semua (.zip)</span></button>
                    <div className="menu-sep"></div>
                    <button className="menu-item" onClick={function () { doExport('panduan'); }}><span>📖 Cara Pakai .md</span></button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BYOK strip */}
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <details className="card px-4 py-2.5" style={{ borderColor: 'rgba(181,120,31,.45)' }}>
            <summary className="cursor-pointer text-sm" style={{ color: 'var(--money)' }}>🔑 API key sendiri (BYOK) <span className="text-xs faint">{byokLabel}</span></summary>
            <div className="grid sm:grid-cols-3 gap-2 mt-3">
              <input className="field" placeholder="Base URL — mis. https://api.openai.com/v1" autoComplete="off" autoCapitalize="off" spellCheck="false"
                value={byok.baseUrl} onChange={function (e) { onByokInput({ baseUrl: e.target.value }); }} />
              <input type="password" className="field" placeholder="API key" autoComplete="off" autoCapitalize="off" spellCheck="false"
                value={byok.apiKey} onChange={function (e) { onByokInput({ apiKey: e.target.value }); }} />
              <input className="field" placeholder="Nama model — mis. gpt-4o-mini" autoComplete="off" autoCapitalize="off" spellCheck="false"
                value={byok.model} onChange={function (e) { onByokInput({ model: e.target.value }); }} />
            </div>
            <p className="text-[11px] faint mt-2">Tersimpan hanya di browser ini. Dipakai untuk semua tombol AI di halaman ini (Spec, Flowchart, Saran, AGENTS.md) — server tidak menyimpan key-mu. Kosongkan untuk pakai key server.</p>
          </details>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8">
          {/* SIDEBAR TOC */}
          <aside className="toc-desktop">
            <div className={'sticky top-40 max-h-[70vh] overflow-y-auto toc-side' + (toc.length > 10 ? ' toc-mask' : '')}>
              <p className="toc-heading">Daftar isi</p>
              <nav aria-label="Daftar isi dokumen">
                {toc.length === 0 && <p className="faint text-xs">Tidak ada heading.</p>}
                {toc.map(function (h) {
                  return (
                    <a key={h.id} href={'#' + h.id}
                      className={(h.level === 2 ? 'toc-link' : 'toc-sub') + (activeToc === h.id ? ' toc-active' : '')}
                      onClick={function (e) {
                        e.preventDefault();
                        const el = document.getElementById(h.id);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}>{h.text}</a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="flex-1 min-w-0 max-w-3xl">
            <details className="toc-mobile mb-6 card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Daftar isi</summary>
              <nav className="mt-3 space-y-1 text-sm" aria-label="Daftar isi dokumen">
                {toc.map(function (h) {
                  return <a key={h.id} href={'#' + h.id} className={h.level === 2 ? 'toc-link' : 'toc-sub'}>{h.text}</a>;
                })}
              </nav>
            </details>

            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: 'clamp(1.7rem,3.4vw,2.5rem)', letterSpacing: '-0.015em', lineHeight: 1.12, color: 'var(--ink)', margin: '0 0 .4rem' }}>{prd.title || 'Tanpa Judul'}</h1>
            <p className="faint" style={{ fontSize: '.82rem', margin: '0 0 1.25rem' }}>{fmtDateLong(prd.createdAt)}</p>
            {prd.idea && <p className="faint text-sm mb-6 italic">💡 Ide: {prd.idea}</p>}
            <article ref={articleRef} className="md-body" dangerouslySetInnerHTML={{ __html: rendered.html }} />

            {/* SPECS */}
            <section id="specs-section" className="mt-12 pt-8 border-t bd">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-bold ink font-display">Spesifikasi &amp; Task</h2>
                {hasDoc.specs && <span className="badge">dibuat AI</span>}
              </div>
              <div className="mb-4">
                <button className="btn btn-primary btn-sm" disabled={specsRun.running} onClick={function () { requestGenerate('specs'); }}>
                  {specsRun.running ? '⏳ ' + (specsRun.done + specsRun.fail) + '/' + (specsRun.total || '…') + ' fitur…' : '⚙️ Generate Spec & Task'}
                </button>
              </div>
              {specsRun.running && (
                <div className="mb-4 card p-5">
                  <p className="text-sm accent-text font-medium mb-3">{specsRun.status || 'Menyiapkan…'}</p>
                  <div className="h-2.5 bg-sunken rounded-full overflow-hidden mb-4">
                    <div className="h-full rounded-full transition-all duration-500" style={{ background: 'var(--accent)', width: (specsRun.total ? Math.round((specsRun.done + specsRun.fail) / specsRun.total * 100) : 0) + '%' }}></div>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {specsRun.features.map(function (f) {
                      const st = specsRun.itemState[f.id];
                      return (
                        <li key={f.id} className={'flex items-center gap-2 ' + (st === 'run' ? 'accent-text font-medium' : st === 'done' ? 'ink' : st === 'fail' ? 'danger-text' : 'faint')}>
                          <span className="st w-5 text-center">{st === 'run' ? '⏳' : st === 'done' ? '✅' : st === 'fail' ? '❌' : '·'}</span>
                          <span>{f.name || f.id}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {!hasDoc.specs && !specsRun.running && (
                <div className="text-sm faint card p-6 text-center" style={{ borderStyle: 'dashed' }}>
                  Belum ada spesifikasi. Klik tombol di atas untuk meminta AI membuat spesifikasi fitur &amp; task checklist dari PRD ini.
                </div>
              )}
              {specsHtml && <article className="md-body" dangerouslySetInnerHTML={{ __html: specsHtml }} />}
            </section>

            {/* FLOWCHART */}
            <section id="flowchart-section" className="mt-12 pt-8 border-t bd">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-xl font-bold ink font-display mr-auto">Flowchart Alur</h2>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={fc.running} onClick={function () { requestGenerate('flowchart'); }}>
                    {fc.running ? '⏳ Membuat…' : '📊 Buat Flowchart'}
                  </button>
                  {hasDoc.flowchart && <button className="btn btn-ghost btn-sm" onClick={function () { requestGenerate('flowchart'); }}>🔄 Generate Ulang</button>}
                  {hasDoc.flowchart && <button className="btn btn-ghost btn-sm" onClick={function () { setFc(function (s) { return Object.assign({}, s, { editorOpen: true, editCode: s.code }); }); }}>✏️ Edit</button>}
                </div>
              </div>
              {fc.status && <p className="text-sm accent-text mb-3">{fc.status}</p>}
              <div className="card p-4 overflow-x-auto">
                {fc.svg
                  ? <div dangerouslySetInnerHTML={{ __html: fc.svg }} />
                  : <p className="faint text-sm">Belum ada flowchart. Klik "Buat Flowchart" agar AI membuat diagram alur proses dari PRD ini. Kode diagram bisa diedit manual setelah dibuat.</p>}
              </div>
              {fc.error && <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{fc.error}</p>}
              {fc.editorOpen && (
                <div className="mt-4">
                  <label className="block text-xs faint mb-2">Kode diagram (format Mermaid):</label>
                  <textarea rows="10" className="field" spellCheck="false" value={fc.editCode}
                    onChange={function (e) { setFc(function (s) { return Object.assign({}, s, { editCode: e.target.value }); }); }} />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button className="btn btn-ghost btn-sm" onClick={function () { renderFlowchartSvg(fc.editCode); }}>👁️ Render Ulang</button>
                    <button className="btn btn-primary btn-sm" onClick={saveFlowchart}>💾 Simpan</button>
                    <button className="text-sm muted hover-ink px-3 py-2" onClick={function () { setFc(function (s) { return Object.assign({}, s, { editorOpen: false }); }); }}>Batal</button>
                  </div>
                </div>
              )}
            </section>

            {/* SARAN */}
            <section id="suggest-section" className="mt-12 pt-8 border-t bd">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-xl font-bold ink font-display mr-auto">Saran Fitur AI</h2>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={suggest.running} onClick={function () { requestGenerate('suggest'); }}>
                    {suggest.running ? '⏳ Menganalisis…' : '💡 Minta Saran AI'}
                  </button>
                  {hasDoc.suggest && <button className="btn btn-ghost btn-sm" onClick={copySuggest}>📋 Salin saran</button>}
                </div>
              </div>
              {suggest.status && <p className="text-sm accent-text mb-3">{suggest.status}</p>}
              {suggest.running && (
                <div className="space-y-3">
                  <div className="skeleton h-24 w-full"></div><div className="skeleton h-24 w-full"></div><div className="skeleton h-24 w-5/6"></div>
                  <p className="text-sm faint">AI sedang menganalisis PRD dan menyusun rekomendasi fitur…</p>
                </div>
              )}
              {!hasDoc.suggest && !suggest.running && (
                <div className="text-sm faint card p-6 text-center" style={{ borderStyle: 'dashed' }}>
                  Belum ada saran. Klik tombol di atas agar AI memberi rekomendasi fitur tambahan berdasarkan PRD ini.
                </div>
              )}
              <div className="space-y-3">
                {suggest.list.map(function (s, i) {
                  const p = s.priority || 'Sedang';
                  return (
                    <div className="card p-4" key={i}>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h4 className="font-bold ink mr-auto">{s.title || 'Saran'}</h4>
                        <span className={'text-xs px-2.5 py-1 rounded-full ' + (pc[p] || pc['Sedang'])}>Prioritas: {p}</span>
                        {s.effort && <span className="text-xs px-2.5 py-1 rounded-full pc-effort">⚡ {s.effort}</span>}
                      </div>
                      <p className="text-sm muted">{s.why || ''}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* AGENTS.MD */}
            <section id="agentsmd-section" className="mt-12 pt-8 border-t bd">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-xl font-bold ink font-display mr-auto">AGENTS.md</h2>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={agentsMd.running} onClick={function () { requestGenerate('agentsmd'); }}>
                    {agentsMd.running ? '⏳ Menyusun…' : '🤖 Generate AGENTS.md'}
                  </button>
                  {hasDoc.agentsmd && <button className="btn btn-ghost btn-sm" onClick={function () { copyText(agentsMd.md, function () { showToast('AGENTS.md disalin!'); }); }}>📋 Salin</button>}
                  {hasDoc.agentsmd && <button className="btn btn-ghost btn-sm" onClick={function () { downloadBlob(agentsMd.md, 'AGENTS.md'); showToast('AGENTS.md diunduh!'); }}>⬇️ Download</button>}
                </div>
              </div>
              {agentsMd.status && <p className="text-sm accent-text mb-3">{agentsMd.status}</p>}
              {!hasDoc.agentsmd && !agentsMd.running && (
                <div className="text-sm faint card p-6 text-center" style={{ borderStyle: 'dashed' }}>
                  Belum ada AGENTS.md. Klik tombol di atas agar AI menyusun instruksi kerja untuk coding agent — perintah, struktur proyek, env, konvensi, dan target deploy — selaras dengan PRD ini.
                </div>
              )}
              {agentsHtml && <article className="md-body" dangerouslySetInnerHTML={{ __html: agentsHtml }} />}
            </section>

            {/* DESIGN.MD */}
            <section id="designmd-section" className="mt-12 pt-8 border-t bd">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-xl font-bold ink font-display mr-auto">design.md</h2>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={designMd.running} onClick={function () { requestGenerate('designmd'); }}>
                    {designMd.running ? '⏳ Menyusun…' : '🎨 Generate design.md'}
                  </button>
                  {hasDoc.designmd && <button className="btn btn-ghost btn-sm" onClick={function () { copyText(designMd.md, function () { showToast('design.md disalin!'); }); }}>📋 Salin</button>}
                  {hasDoc.designmd && <button className="btn btn-ghost btn-sm" onClick={function () { downloadBlob(designMd.md, 'design.md'); showToast('design.md diunduh!'); }}>⬇️ Download</button>}
                </div>
              </div>
              {designMd.status && <p className="text-sm accent-text mb-3">{designMd.status}</p>}
              {!hasDoc.designmd && !designMd.running && (
                <div className="text-sm faint card p-6 text-center" style={{ borderStyle: 'dashed' }}>
                  Belum ada design.md. Klik tombol di atas agar AI menyusun panduan visual — Design DNA, palet warna, tipografi, komponen — selaras dengan tema desain PRD ini.
                </div>
              )}
              {designHtml && <article className="md-body" dangerouslySetInnerHTML={{ __html: designHtml }} />}
            </section>
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div className={'fixed bottom-6 left-1/2 z-50 font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg pointer-events-none ' + (toast.err ? 'bg-red-500 text-white' : 'toast-ok')}
          style={{ opacity: 1, transform: 'translate(-50%,0)' }}>{toast.msg}</div>
      )}

      {/* PRINT */}
      <div id="print-all"></div>

      {/* KONFIRMASI */}
      {confirm && (
        <div className="modal-overlay open" onClick={function (e) { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal-box">
            <h3 className="text-lg font-bold ink font-display mb-2">{confirm.title}</h3>
            <p className="text-sm muted mb-5">{confirm.desc}</p>
            <div className="flex justify-end gap-2">
              <button className="text-sm muted hover-ink px-4 py-2" onClick={function () { setConfirm(null); }}>Batal</button>
              <button className="text-sm bg-amber-400 hover:brightness-110 text-[#0b0f19] font-semibold px-4 py-2 rounded-xl transition"
                onClick={function () { const cb = confirm.onOk; setConfirm(null); if (cb) cb(); }}>{confirm.okLabel}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
