/**
 * AutoPRD.id — lib/db.js
 * Abstraksi penyimpanan PRD dengan scoping per pemilik (owner). MURNI fetch —
 * tanpa @supabase/supabase-js (butuh Node 22+, VPS masih Node 20).
 *
 * Backend otomatis:
 *   - Jika SUPABASE_URL + SUPABASE_SERVICE_KEY diset → Supabase Postgres via REST
 *     (tabel `prds`: id, owner_id, title, idea, markdown, specs, flowchart,
 *      suggestions jsonb, agentsmd, designmd, created_at, updated_at).
 *   - Selain itu → JSON lokal (lib/store.js). Bila login aktif (ANON_KEY diset),
 *     data lokal tetap terisolasi per user via ownerId.
 *
 * API: semua fungsi menerima ownerId sebagai argumen pertama.
 */
'use strict';

const local = require('./store');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
// Data memakai SERVICE_KEY (melewati RLS). ANON_KEY hanya untuk Auth (login).
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);
console.log(useSupabase ? '[db] backend: supabase (REST)' : '[db] backend: lokal');

function backend() { return useSupabase ? 'supabase' : 'local'; }

function sbHeaders(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function sbReq(method, path, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    method,
    headers: sbHeaders(body !== undefined ? { Prefer: 'return=representation' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 200));
  }
  if (res.status === 204) return null;
  return res.json();
}

const eq = (v) => 'eq.' + encodeURIComponent(v);

function rowToPrd(r) {
  if (!r) return null;
  return {
    id: r.id, title: r.title, idea: r.idea, markdown: r.markdown,
    specs: r.specs || '', flowchart: r.flowchart || '',
    suggestions: r.suggestions || [], agentsmd: r.agentsmd || '', designmd: r.designmd || '',
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function savePRD(ownerId, { title, idea, markdown }) {
  if (!useSupabase) {
    const { id } = local.savePRD({ title, idea, markdown });
    try {
      const path = require('path');
      const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
      const FILE = path.join(DATA_DIR, 'prds.json');
      const fs = require('fs');
      const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      const p = all.find((x) => x.id === id);
      if (p) { p.ownerId = ownerId; fs.writeFileSync(FILE, JSON.stringify(all, null, 2)); }
    } catch (_) {}
    return { id };
  }
  const id = makeId();
  await sbReq('POST', '/prds', { id, owner_id: ownerId, title, idea, markdown });
  return { id };
}

async function getPRD(ownerId, id) {
  if (!useSupabase) {
    const p = local.getPRD(id);
    if (!p) return null;
    if (p.ownerId && p.ownerId !== ownerId && ownerId !== 'local') return null;
    return p;
  }
  const rows = await sbReq('GET', `/prds?id=${eq(id)}&owner_id=${eq(ownerId)}&select=*`);
  return rowToPrd(rows && rows[0]);
}

async function listPRDs(ownerId) {
  if (!useSupabase) {
    return local.listPRDs().filter((p) => !p.ownerId || p.ownerId === ownerId || ownerId === 'local');
  }
  const rows = await sbReq('GET',
    `/prds?owner_id=${eq(ownerId)}&select=id,title,idea,created_at,updated_at&order=created_at.desc`);
  return (rows || []).map((r) => ({
    id: r.id, title: r.title, idea: r.idea, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

async function deletePRD(ownerId, id) {
  if (!useSupabase) { local.deletePRD(id); return; }
  await sbReq('DELETE', `/prds?id=${eq(id)}&owner_id=${eq(ownerId)}`);
}

async function patchField(ownerId, id, fields) {
  if (!useSupabase) {
    const map = { specs: local.setSpecs, flowchart: local.setFlowchart, agentsmd: local.setAgentsMd, designmd: local.setDesignMd };
    for (const k of Object.keys(fields)) {
      if (k === 'suggestions') local.setSuggestions(id, fields[k]);
      else if (map[k]) map[k](id, fields[k]);
    }
    return;
  }
  const q = `/prds?id=${eq(id)}&owner_id=${eq(ownerId)}`;
  await sbReq('PATCH', q, Object.assign({}, fields, { updated_at: new Date().toISOString() }));
}

const setSpecs = (o, id, v) => patchField(o, id, { specs: v });
const appendSpecs = (o, id, v) => patchField(o, id, { specs: v }); // kompatibel
const setFlowchart = (o, id, v) => patchField(o, id, { flowchart: v });
const setSuggestions = (o, id, v) => patchField(o, id, { suggestions: v });
const setAgentsMd = (o, id, v) => patchField(o, id, { agentsmd: v });
const setDesignMd = (o, id, v) => patchField(o, id, { designmd: v });

module.exports = {
  backend, savePRD, getPRD, listPRDs, deletePRD,
  appendSpecs, setSpecs, setFlowchart, setSuggestions, setAgentsMd, setDesignMd,
  listAllPRDs, adminStats,
};

// ---- Khusus admin: lintas pemilik ----

async function listAllPRDs(limit) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  if (!useSupabase) {
    return local.listPRDs()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, limit)
      .map((p) => ({
        id: p.id, title: p.title, ownerId: p.ownerId || 'local',
        createdAt: p.createdAt, updatedAt: p.updatedAt,
        docs: ['markdown', 'specs', 'agentsmd', 'designmd'].filter((k) => p[k]).length,
      }));
  }
  const rows = await sbReq('GET',
    `/prds?select=id,title,owner_id,created_at,updated_at,markdown,specs,agentsmd,designmd&order=created_at.desc&limit=${limit}`);
  return (rows || []).map((r) => ({
    id: r.id, title: r.title, ownerId: r.owner_id || '-',
    createdAt: r.created_at, updatedAt: r.updated_at,
    docs: ['markdown', 'specs', 'agentsmd', 'designmd'].filter((k) => r[k]).length,
  }));
}

async function sbCount(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    headers: Object.assign(sbHeaders(), { Prefer: 'count=exact' }),
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function adminStats() {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  if (!useSupabase) {
    const all = local.listPRDs();
    return {
      backend: 'local',
      totalPrd: all.length,
      prd7hari: all.filter((p) => String(p.createdAt || '') >= weekAgo).length,
      totalDokumen: all.reduce((n, p) =>
        n + ['markdown', 'specs', 'agentsmd', 'designmd'].filter((k) => p[k]).length, 0),
    };
  }
  const total = await sbCount('/prds?select=id');
  const w = await sbCount(`/prds?select=id&created_at=gte.${encodeURIComponent(weekAgo)}`);
  return { backend: 'supabase', totalPrd: total, prd7hari: w, totalDokumen: null };
}
