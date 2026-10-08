'use strict';

/* ============================================================================
 * AutoPRD.id — lib/jobs.js
 * Job generate PRD di background (session): browser boleh ditutup/di-refresh,
 * backend tetap memproses sampai selesai. Frontend memantau via polling.
 *
 * - createJob(ownerId, {...}) → job; langsung jalan di background (setImmediate).
 * - 1 job aktif per owner (mencegah duplikat & buang token).
 * - BYOK tidak pernah disimpan ke disk (hanya di memory).
 * - Persist ke DATA_DIR/jobs.json (maks 50 terakhir). Job 'running' saat
 *   server restart → ditandai error saat load.
 * ========================================================================== */

const path = require('path');
const fs = require('fs');
const db = require('./db');

const jobs = new Map();        // id -> job
const controllers = new Map(); // id -> AbortController
const MAX_JOBS = 50;

function dataDir() { return process.env.DATA_DIR || path.join(__dirname, '..', 'data'); }
function jobFile() { return path.join(dataDir(), 'jobs.json'); }

function makeId() {
  return 'job_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Bentuk job yang aman disimpan / dikirim ke client (tanpa byok).
function publicJob(j) {
  return {
    id: j.id,
    idea: j.idea,
    title: j.title,
    status: j.status, // queued|running|done|error|cancelled
    error: j.error || null,
    prdId: j.prdId || null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    doneCount: j.sections.filter((s) => s.state === 'done').length,
    totalCount: j.sections.length,
    sections: j.sections.map((s) => ({ id: s.id, title: s.title, state: s.state })),
  };
}

function persist() {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const arr = [...jobs.values()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, MAX_JOBS)
      .map((j) => {
        const o = Object.assign({}, j);
        delete o.byok; // JANGAN simpan API key user ke disk
        return o;
      });
    fs.writeFileSync(jobFile(), JSON.stringify(arr, null, 2));
    const keep = new Set(arr.map((j) => j.id));
    for (const id of [...jobs.keys()]) if (!keep.has(id)) jobs.delete(id);
  } catch (_) { /* penyimpanan best-effort */ }
}

function loadJobs() {
  try {
    const arr = JSON.parse(fs.readFileSync(jobFile(), 'utf8'));
    if (!Array.isArray(arr)) return;
    for (const j of arr) {
      if (!j || !j.id) continue;
      if (j.status === 'running' || j.status === 'queued') {
        j.status = 'error';
        j.error = 'Terputus saat server restart. Silakan generate ulang.';
      }
      jobs.set(j.id, j);
    }
  } catch (_) { /* belum ada file = wajar */ }
}

function activeJobOf(ownerId) {
  for (const j of jobs.values()) {
    if (j.ownerId === ownerId && (j.status === 'queued' || j.status === 'running')) return j;
  }
  return null;
}

function createJob(ownerId, input) {
  const dupe = activeJobOf(ownerId);
  if (dupe) {
    const e = new Error('Masih ada generate yang berjalan. Tunggu selesai atau batalkan dulu.');
    e.status = 409;
    e.jobId = dupe.id;
    throw e;
  }
  const { SECTIONS } = require('./prompts');
  const now = new Date().toISOString();
  const job = {
    id: makeId(),
    ownerId,
    idea: String(input.idea || ''),
    title: String(input.title || input.idea || '').trim().slice(0, 120),
    payload: input.payload || {},
    byok: input.byok || null, // memory only, tidak di-persist
    isAdmin: !!input.isAdmin, // memory only, tidak di-persist
    status: 'queued',
    sections: SECTIONS.map((s, i) => ({ id: s.id, title: s.title, num: ('0' + (i + 1)).slice(-2), state: 'wait', markdown: '' })),
    error: null,
    prdId: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  persist();
  setImmediate(function () { runJob(job.id).catch(function () {}); });
  return job;
}

async function runJob(id) {
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') return;
  job.status = 'running';
  job.updatedAt = new Date().toISOString();
  const ac = new AbortController();
  controllers.set(id, ac);
  persist();
  try {
    const { generatePRD } = require('./ai');
    let idx = 0;
    if (job.sections[0]) job.sections[0].state = 'writing';
    for await (const sec of generatePRD(job.idea, job.payload, { byok: job.byok, signal: ac.signal, isAdmin: job.isAdmin })) {
      const s = job.sections[idx];
      if (s) { s.state = 'done'; s.markdown = sec.markdown || ''; }
      idx += 1;
      if (job.sections[idx]) job.sections[idx].state = 'writing';
      job.updatedAt = new Date().toISOString();
      persist();
    }
    const markdown = job.sections.map((s) => s.markdown).join('\n\n');
    const saved = await db.savePRD(job.ownerId, { title: job.title, idea: job.title, markdown });
    job.status = 'done';
    job.prdId = saved.id;
  } catch (e) {
    if (ac.signal.aborted) {
      job.status = 'cancelled';
      job.error = null;
    } else {
      job.status = 'error';
      job.error = (e && e.message) || 'Generate gagal.';
    }
  } finally {
    controllers.delete(id);
    job.updatedAt = new Date().toISOString();
    persist();
  }
}

function getJob(id, ownerId) {
  const j = jobs.get(id);
  if (!j || j.ownerId !== ownerId) return null;
  return j;
}

function listJobs(ownerId, limit) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  return [...jobs.values()]
    .filter((j) => j.ownerId === ownerId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map(publicJob);
}

function cancelJob(id, ownerId) {
  const j = getJob(id, ownerId);
  if (!j) {
    const e = new Error('Job tidak ditemukan.');
    e.status = 404;
    throw e;
  }
  if (j.status === 'queued' || j.status === 'running') {
    const c = controllers.get(id);
    if (c) c.abort();
    else { j.status = 'cancelled'; j.updatedAt = new Date().toISOString(); persist(); }
  }
  return j;
}

loadJobs();

module.exports = { createJob, getJob, listJobs, cancelJob, publicJob, activeJobOf };
