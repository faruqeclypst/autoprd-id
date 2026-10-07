/**
 * BikinPRD — lib/store.js (Agen 6)
 * JSON file storage untuk PRD. Data HANYA lewat kontrak ini.
 *
 * savePRD({title, idea, markdown}) -> {id}
 * getPRD(id) -> object|null
 * listPRDs() -> [{id,title,createdAt,sectionCount}]
 * deletePRD(id)
 * appendSpecs(id, specsMarkdown)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'prds.json');

function ensure() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, '[]', 'utf8');
  }
}

function readAll() {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(arr) {
  ensure();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8');
  fs.renameSync(tmp, FILE);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function countSections(markdown) {
  if (!markdown) return 0;
  const m = String(markdown).match(/^## .+/gm);
  return m ? m.length : 0;
}

function savePRD({ title, idea, markdown }) {
  const all = readAll();
  const prd = {
    id: makeId(),
    title: title || 'Tanpa Judul',
    idea: idea || '',
    markdown: markdown || '',
    specs: '',
    flowchart: '',
    suggestions: [],
    sectionCount: countSections(markdown),
    createdAt: new Date().toISOString(),
  };
  all.unshift(prd); // terbaru di depan
  writeAll(all);
  return { id: prd.id };
}

function getPRD(id) {
  const prd = readAll().find((p) => p.id === id);
  return prd || null;
}

function listPRDs() {
  return readAll().map((p) => ({
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    sectionCount: p.sectionCount || 0,
  }));
}

function deletePRD(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}

function appendSpecs(id, specsMarkdown) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.specs = (prd.specs ? prd.specs + '\n\n' : '') + (specsMarkdown || '');
  writeAll(all);
}

/* REPLACE seluruh specs (dipakai alur generate per-fitur yang baru). */
function setSpecs(id, specsMarkdown) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.specs = specsMarkdown || '';
  writeAll(all);
}

function setFlowchart(id, mermaid) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.flowchart = mermaid || '';
  writeAll(all);
}

function setSuggestions(id, arr) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.suggestions = Array.isArray(arr) ? arr : [];
  writeAll(all);
}

function setAgentsMd(id, markdown) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.agentsmd = markdown || '';
  writeAll(all);
}

function setDesignMd(id, markdown) {
  const all = readAll();
  const prd = all.find((p) => p.id === id);
  if (!prd) return;
  prd.designmd = markdown || '';
  writeAll(all);
}

module.exports = { savePRD, getPRD, listPRDs, deletePRD, appendSpecs, setSpecs, setFlowchart, setSuggestions, setAgentsMd, setDesignMd };
