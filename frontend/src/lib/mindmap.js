/* =====================================================================
 * mindmap.js — pohon fitur horizontal AutoPRD.id
 *
 * Layout: root (kiri) → fitur (kolom) → sub-fitur (selalu ke kanan,
 * makin dalam makin ke kanan). Semua aksi edit langsung di tiap card:
 * klik nama = ubah nama, klik badge = ganti fase, hover = aksi
 * (+ Sub, Revisi AI, Hapus). Tanpa mode edit global.
 *
 * Data: { root, features:[{ id, name, phase, collapsed,
 *          subfeatures:[ string | { text, children:[...], collapsed } ] }] }
 * Bentuk string tetap didukung (kompatibel dengan output AI lama).
 *
 * API: Mindmap.render(container, data, opts)
 *      opts = { onChange(data), reviseFeature(feature, instruction)->Promise }
 *      Mindmap.destroy()
 * ===================================================================== */
'use strict';

var PHASES = ['Fase 1', 'Fase 2', 'Fase 3'];
var PHASE_COLOR = { 'Fase 1': '#22c55e', 'Fase 2': '#f59e0b', 'Fase 3': '#a78bfa' };

var state = {
  container: null,
  data: null,
  opts: {},
  zoom: 1,
  styleEl: null,
  onResize: null,
  uid: 0
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------------- normalisasi ---------------- */
function normSub(s) {
  if (typeof s === 'string') return { text: s, children: [], collapsed: false };
  s = s || {};
  var kids = s.children || s.subfeatures || s.items || [];
  return {
    text: String(s.text != null ? s.text : (s.name != null ? s.name : '')).trim(),
    children: (Array.isArray(kids) ? kids : []).map(normSub),
    collapsed: !!s.collapsed
  };
}
function normData(d) {
  d = d || {};
  return {
    root: String(d.root != null ? d.root : 'Aplikasi').trim() || 'Aplikasi',
    features: ((Array.isArray(d.features) ? d.features : [])).map(function (f, i) {
      f = f || {};
      var subs = f.subfeatures != null ? f.subfeatures : (f.items || []);
      return {
        id: String(f.id != null ? f.id : 'F' + (i + 1)),
        name: String(f.name != null ? f.name : '').trim() || 'Fitur ' + (i + 1),
        phase: PHASES.indexOf(f.phase) >= 0 ? f.phase : 'Fase 1',
        collapsed: !!f.collapsed,
        subfeatures: (Array.isArray(subs) ? subs : []).map(normSub)
      };
    })
  };
}
function commit() {
  if (state.opts.onChange) { try { state.opts.onChange(state.data); } catch (_) {} }
}

/* ---------------- CSS ---------------- */
function injectCss() {
  if (state.styleEl) return;
  var st = document.createElement('style');
  st.textContent = [
    '.mm{position:relative;}',
    '.mm-links{position:absolute;left:0;top:0;pointer-events:none;overflow:visible;}',
    '.mm-links path{fill:none;stroke:var(--line);stroke-width:2;}',
    '.mm-zoom{position:absolute;top:0;right:0;display:flex;gap:6px;z-index:5;}',
    '.mm-zoom button{width:34px;height:34px;border-radius:9px;background:var(--surface);border:1px solid var(--line);color:var(--ink);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}',
    '.mm-zoom button:hover{border-color:var(--accent);color:var(--accent);}',
    '.mm-zoom button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}',
    '.mm-tree{position:relative;display:flex;align-items:center;gap:64px;width:max-content;min-width:100%;padding:56px 24px 24px 8px;transform-origin:left center;}',
    '.mm-fcol{display:flex;flex-direction:column;gap:30px;}',
    '.mm-branch{display:flex;align-items:center;gap:56px;}',
    '.mm-subcol{display:flex;flex-direction:column;gap:14px;}',
    /* root */
    '.mm-root{min-width:170px;max-width:210px;background:var(--accent);color:var(--on-accent);border-radius:16px;padding:16px 18px;box-shadow:0 6px 18px -6px var(--accent);}',
    '.mm-root .t{font-family:Archivo,Inter,sans-serif;font-weight:800;font-size:1.02rem;letter-spacing:-0.01em;line-height:1.3;}',
    '.mm-root .c{font-size:.75rem;opacity:.85;margin-top:4px;}',
    /* feature card */
    '.mm-fcard{width:236px;flex:none;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;position:relative;transition:border-color .15s ease, box-shadow .15s ease;}',
    '.mm-fcard:hover{border-color:var(--accent);box-shadow:0 8px 22px -10px rgba(0,0,0,.25);}',
    '.mm-fcard .hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
    '.mm-phase{font-size:.68rem;font-weight:800;letter-spacing:.04em;color:#fff;border:none;border-radius:999px;padding:3px 10px;cursor:pointer;text-transform:uppercase;}',
    '.mm-phase:focus-visible{outline:2px solid var(--ink);outline-offset:2px;}',
    '.mm-chev{margin-left:auto;width:26px;height:26px;flex:none;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--ink-faint);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;padding:0;}',
    '.mm-chev:hover{border-color:var(--line);color:var(--ink);}',
    '.mm-chev:focus-visible{outline:2px solid var(--accent);}',
    '.mm-name{font-weight:700;font-size:.95rem;color:var(--ink);line-height:1.35;cursor:text;border-radius:6px;padding:2px 4px;margin:-2px -4px;}',
    '.mm-name:hover{background:var(--accent-soft);}',
    '.mm-nameedit{width:100%;font:inherit;font-weight:700;color:var(--ink);background:var(--canvas);border:1px solid var(--accent);border-radius:6px;padding:2px 6px;}',
    '.mm-nameedit:focus{outline:none;}',
    /* action bar: muncul saat hover/focus, selalu tampil di layar sentuh */
    '.mm-actions{display:none;gap:2px;margin-top:10px;padding-top:8px;border-top:1px dashed var(--line);}',
    '.mm-fcard:hover .mm-actions,.mm-fcard:focus-within .mm-actions,',
    '.mm-scard:hover .mm-actions,.mm-scard:focus-within .mm-actions{display:flex;}',
    '@media (hover:none){.mm-actions{display:flex;}}',
    '.mm-act{background:none;border:none;color:var(--ink-soft);font-size:.72rem;font-weight:600;cursor:pointer;padding:4px 6px;border-radius:6px;white-space:nowrap;}',
    '.mm-act:hover{color:var(--accent);background:var(--accent-soft);}',
    '.mm-act:focus-visible{outline:2px solid var(--accent);}',
    '.mm-act.danger:hover{color:var(--danger);background:color-mix(in srgb, var(--danger) 10%, transparent);}',
    '.mm-act:disabled{opacity:.5;cursor:wait;}',
    /* sub card */
    '.mm-scard{width:208px;flex:none;background:var(--canvas);border:1px solid var(--line);border-radius:11px;padding:9px 12px;position:relative;transition:border-color .15s ease;}',
    '.mm-scard:hover{border-color:var(--accent);}',
    '.mm-scard.d2{width:188px;}',
    '.mm-scard.d3,.mm-scard.d4{width:172px;}',
    '.mm-scard .row{display:flex;align-items:center;gap:8px;}',
    '.mm-scard .dot{width:6px;height:6px;border-radius:99px;background:var(--accent);flex:none;}',
    '.mm-scard .mm-name{font-size:.83rem;font-weight:600;}',
    '.mm-scard .mm-actions{margin-top:7px;padding-top:6px;}',
    '.mm-kids{font-size:.68rem;color:var(--ink-faint);margin-top:4px;}',
    /* inline add */
    '.mm-addrow{display:flex;gap:6px;margin-top:8px;}',
    '.mm-addrow input{flex:1;min-width:0;font-size:.8rem;background:var(--canvas);border:1px solid var(--accent);border-radius:7px;padding:5px 8px;color:var(--ink);}',
    '.mm-addrow input:focus{outline:none;}',
    /* revise form */
    '.mm-rv{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);}',
    '.mm-rv textarea{width:100%;font-size:.78rem;background:var(--canvas);border:1px solid var(--line);border-radius:8px;padding:7px 9px;color:var(--ink);resize:vertical;min-height:52px;}',
    '.mm-rv textarea:focus{outline:none;border-color:var(--accent);}',
    '.mm-rv-row{display:flex;gap:8px;margin-top:8px;align-items:center;}',
    '.mm-rv-st{font-size:.72rem;color:var(--ink-soft);margin-top:6px;min-height:1em;}',
    '.mm-btn{font-size:.75rem;font-weight:700;border-radius:8px;padding:6px 12px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--ink);}',
    '.mm-btn:hover{border-color:var(--accent);color:var(--accent);}',
    '.mm-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent);}',
    '.mm-btn.primary:hover{filter:brightness(1.07);color:var(--on-accent);}',
    '.mm-btn:disabled{opacity:.55;cursor:wait;}',
    '.mm-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}',
    /* tambah fitur */
    '.mm-addfeat{align-self:flex-start;border:1.5px dashed var(--line);background:transparent;color:var(--ink-soft);border-radius:14px;padding:12px 18px;font-size:.82rem;font-weight:600;cursor:pointer;}',
    '.mm-addfeat:hover{border-color:var(--accent);color:var(--accent);}',
    '.mm-addfeat:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}',
    /* entrance */
    '@keyframes mm-in{from{opacity:0;transform:translateX(14px);}to{opacity:1;transform:none;}}',
    '.mm-branch{animation:mm-in .35s ease both;}',
    '@media (prefers-reduced-motion:reduce){.mm-branch{animation:none;}.mm-fcard,.mm-scard{transition:none;}}',
    '.mm-empty{color:var(--ink-faint);font-size:.85rem;padding:28px 8px;}'
  ].join('\n');
  document.head.appendChild(st);
  state.styleEl = st;
}

/* ---------------- builders ---------------- */
function phaseBadge(f) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'mm-phase';
  b.style.background = PHASE_COLOR[f.phase] || '#888';
  b.textContent = f.phase;
  b.title = 'Klik untuk ganti fase';
  b.setAttribute('aria-label', 'Fase ' + f.phase + '. Klik untuk ganti fase.');
  b.addEventListener('click', function (e) {
    e.stopPropagation();
    var i = PHASES.indexOf(f.phase);
    f.phase = PHASES[(i + 1) % PHASES.length];
    commit(); render();
  });
  return b;
}

function chevBtn(collapsed, hasKids, onToggle) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'mm-chev';
  b.textContent = collapsed ? '▶' : '▼';
  b.style.visibility = hasKids ? 'visible' : 'hidden';
  b.setAttribute('aria-label', collapsed ? 'Buka' : 'Tutup');
  b.setAttribute('aria-expanded', String(!collapsed));
  b.addEventListener('click', function (e) { e.stopPropagation(); onToggle(); });
  return b;
}

function inlineRename(nameEl, current, onCommit) {
  var input = document.createElement('input');
  input.className = 'mm-nameedit';
  input.value = current;
  input.setAttribute('aria-label', 'Ubah nama');
  var done = false;
  function finish(save) {
    if (done) return; done = true;
    var v = input.value.trim();
    if (save && v && v !== current) onCommit(v);
    else render();
  }
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', function () { finish(true); });
  input.addEventListener('click', function (e) { e.stopPropagation(); });
  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

function inlineAdd(host, placeholder, onAdd) {
  if (host.querySelector('.mm-addrow')) return;
  var row = document.createElement('div');
  row.className = 'mm-addrow';
  var input = document.createElement('input');
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  var done = false;
  function finish(save) {
    if (done) return; done = true;
    var v = input.value.trim();
    row.remove();
    if (save && v) onAdd(v);
  }
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', function () { finish(true); });
  input.addEventListener('click', function (e) { e.stopPropagation(); });
  row.appendChild(input);
  host.appendChild(row);
  input.focus();
}

function actionBar(acts) {
  var bar = document.createElement('div');
  bar.className = 'mm-actions';
  acts.forEach(function (a) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mm-act' + (a.danger ? ' danger' : '');
    b.textContent = a.label;
    b.addEventListener('click', function (e) { e.stopPropagation(); a.fn(); });
    bar.appendChild(b);
  });
  return bar;
}

function reviseForm(card, feature) {
  if (card.querySelector('.mm-rv')) return;
  var box = document.createElement('div');
  box.className = 'mm-rv';
  var ta = document.createElement('textarea');
  ta.placeholder = 'Contoh: tambah login Google di fitur ini';
  ta.setAttribute('aria-label', 'Instruksi revisi untuk ' + feature.name);
  var row = document.createElement('div');
  row.className = 'mm-rv-row';
  var send = document.createElement('button');
  send.type = 'button'; send.className = 'mm-btn primary'; send.textContent = 'Kirim';
  var cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'mm-btn'; cancel.textContent = 'Batal';
  var st = document.createElement('p');
  st.className = 'mm-rv-st'; st.setAttribute('role', 'status');
  row.appendChild(send); row.appendChild(cancel);
  box.appendChild(ta); box.appendChild(row); box.appendChild(st);
  card.appendChild(box);
  ta.focus();
  cancel.addEventListener('click', function (e) { e.stopPropagation(); box.remove(); });
  ta.addEventListener('click', function (e) { e.stopPropagation(); });
  ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
  send.addEventListener('click', function (e) {
    e.stopPropagation();
    var instr = ta.value.trim();
    if (!instr) { st.textContent = 'Tulis dulu instruksinya.'; ta.focus(); return; }
    send.disabled = true; cancel.disabled = true;
    st.textContent = 'AI merevisi…';
    var p = null;
    try { p = state.opts.reviseFeature ? state.opts.reviseFeature(feature, instr) : Promise.reject(new Error('Revisi tidak tersedia.')); }
    catch (err) { p = Promise.reject(err); }
    p.then(function () { /* generator me-render ulang */ }, function (err) {
      st.textContent = 'Gagal: ' + ((err && err.message) || err);
      send.disabled = false; cancel.disabled = false;
    });
  });
}

/* sub node rekursif → .mm-branch (card + kolom anak ke kanan) */
function subBranch(node, depth, parentArr, idx) {
  var branch = document.createElement('div');
  branch.className = 'mm-branch';
  branch.style.gap = '40px';

  var card = document.createElement('div');
  card.className = 'mm-scard' + (depth >= 2 ? ' d' + Math.min(depth, 4) : '');
  var rowEl = document.createElement('div');
  rowEl.className = 'row';
  var dot = document.createElement('span');
  dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true');
  var nameEl = document.createElement('span');
  nameEl.className = 'mm-name';
  nameEl.textContent = node.text;
  nameEl.title = 'Klik untuk ubah nama';
  nameEl.tabIndex = 0;
  nameEl.setAttribute('role', 'button');
  nameEl.setAttribute('aria-label', 'Ubah nama: ' + node.text);
  function doRename() { inlineRename(nameEl, node.text, function (v) { node.text = v; commit(); render(); }); }
  nameEl.addEventListener('click', function (e) { e.stopPropagation(); doRename(); });
  nameEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doRename(); }
  });
  rowEl.appendChild(dot); rowEl.appendChild(nameEl);
  if (node.children.length) rowEl.appendChild(chevBtn(node.collapsed, true, function () {
    node.collapsed = !node.collapsed; commit(); render();
  }));
  card.appendChild(rowEl);

  if (!node.collapsed && node.children.length) {
    var kc = document.createElement('div');
    kc.className = 'mm-kids';
    kc.textContent = node.children.length + ' sub';
    card.appendChild(kc);
  }

  card.appendChild(actionBar([
    { label: '+ Sub', fn: function () {
        inlineAdd(card, 'Nama sub baru…', function (v) {
          node.children.push({ text: v, children: [], collapsed: false });
          node.collapsed = false; commit(); render();
        });
      } },
    { label: 'Hapus', danger: true, fn: function () {
        parentArr.splice(idx, 1); commit(); render();
      } }
  ]));

  branch.appendChild(card);
  branch._linkFrom = card;

  var subcol = document.createElement('div');
  subcol.className = 'mm-subcol';
  if (!node.collapsed) {
    node.children.forEach(function (ch, ci) {
      var b = subBranch(ch, depth + 1, node.children, ci);
      subcol.appendChild(b);
      linkPairs.push({ from: card, to: b._linkFrom });
    });
  }
  branch.appendChild(subcol);
  return branch;
}

function featureCard(f, fi) {
  var card = document.createElement('div');
  card.className = 'mm-fcard';
  card.style.animationDelay = Math.min(fi * 60, 600) + 'ms';

  var hd = document.createElement('div');
  hd.className = 'hd';
  hd.appendChild(phaseBadge(f));
  hd.appendChild(chevBtn(f.collapsed, f.subfeatures.length > 0, function () {
    f.collapsed = !f.collapsed; commit(); render();
  }));
  card.appendChild(hd);

  var nameEl = document.createElement('div');
  nameEl.className = 'mm-name';
  nameEl.textContent = f.name;
  nameEl.title = 'Klik untuk ubah nama';
  nameEl.tabIndex = 0;
  nameEl.setAttribute('role', 'button');
  nameEl.setAttribute('aria-label', 'Ubah nama fitur: ' + f.name);
  function doRename() { inlineRename(nameEl, f.name, function (v) { f.name = v; commit(); render(); }); }
  nameEl.addEventListener('click', function (e) { e.stopPropagation(); doRename(); });
  nameEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doRename(); }
  });
  card.appendChild(nameEl);

  if (!f.collapsed && f.subfeatures.length) {
    var kc = document.createElement('div');
    kc.className = 'mm-kids';
    kc.textContent = f.subfeatures.length + ' sub-fitur';
    card.appendChild(kc);
  }

  card.appendChild(actionBar([
    { label: '+ Sub', fn: function () {
        inlineAdd(card, 'Nama sub-fitur…', function (v) {
          f.subfeatures.push({ text: v, children: [], collapsed: false });
          f.collapsed = false; commit(); render();
        });
      } },
    { label: 'Revisi', fn: function () { reviseForm(card, f); } },
    { label: 'Hapus', danger: true, fn: function () {
        if (!window.confirm('Hapus fitur "' + f.name + '" beserta sub-fiturnya?')) return;
        state.data.features.splice(fi, 1); commit(); render();
      } }
  ]));
  return card;
}

var linkPairs = [];

function render() {
  var c = state.container;
  if (!c || !state.data) return;
  linkPairs = [];
  c.innerHTML = '';

  var root = document.createElement('div');
  root.className = 'mm';
  c.appendChild(root);

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mm-links');
  svg.setAttribute('aria-hidden', 'true');

  var zoomBar = document.createElement('div');
  zoomBar.className = 'mm-zoom';
  [['−', -0.15, 'Perkecil'], ['+', 0.15, 'Perbesar'], ['1:1', 0, 'Reset']].forEach(function (z) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = z[0]; b.title = z[2];
    b.setAttribute('aria-label', z[2]);
    b.addEventListener('click', function () {
      state.zoom = z[1] === 0 ? 1 : Math.min(1.6, Math.max(0.5, +(state.zoom + z[1]).toFixed(2)));
      applyZoom();
    });
    zoomBar.appendChild(b);
  });
  root.appendChild(zoomBar);

  var tree = document.createElement('div');
  tree.className = 'mm-tree';
  tree.appendChild(svg);
  root.appendChild(tree);

  /* root card */
  var rc = document.createElement('div');
  rc.className = 'mm-root';
  var rt = document.createElement('div'); rt.className = 't'; rt.textContent = state.data.root;
  var rcc = document.createElement('div'); rcc.className = 'c';
  rcc.textContent = state.data.features.length + ' fitur';
  rc.appendChild(rt); rc.appendChild(rcc);
  tree.appendChild(rc);

  /* kolom fitur */
  var fcol = document.createElement('div');
  fcol.className = 'mm-fcol';
  state.data.features.forEach(function (f, fi) {
    var branch = document.createElement('div');
    branch.className = 'mm-branch';
    branch.style.animationDelay = Math.min(80 + fi * 70, 900) + 'ms';
    var card = featureCard(f, fi);
    branch.appendChild(card);
    linkPairs.push({ from: rc, to: card });

    var subcol = document.createElement('div');
    subcol.className = 'mm-subcol';
    if (!f.collapsed) {
      f.subfeatures.forEach(function (s, si) {
        var b = subBranch(s, 1, f.subfeatures, si);
        subcol.appendChild(b);
        linkPairs.push({ from: card, to: b._linkFrom });
      });
    }
    branch.appendChild(subcol);
    fcol.appendChild(branch);
  });

  var addF = document.createElement('button');
  addF.type = 'button';
  addF.className = 'mm-addfeat';
  addF.textContent = '+ Tambah fitur';
  addF.addEventListener('click', function () {
    var nf = { id: 'F' + (++state.uid + state.data.features.length), name: 'Fitur baru', phase: 'Fase 1', collapsed: false, subfeatures: [] };
    state.data.features.push(nf);
    commit(); render();
  });
  fcol.appendChild(addF);
  tree.appendChild(fcol);

  if (!state.data.features.length) {
    var em = document.createElement('p');
    em.className = 'mm-empty';
    em.textContent = 'Belum ada fitur. Tambahkan manual atau tekan "Buat ulang".';
    tree.appendChild(em);
  }

  applyZoom();
  requestAnimationFrame(drawLinks);
}

function applyZoom() {
  var tree = state.container && state.container.querySelector('.mm-tree');
  if (tree) tree.style.transform = 'scale(' + state.zoom + ')';
  requestAnimationFrame(drawLinks);
}

function drawLinks() {
  var c = state.container;
  if (!c) return;
  var tree = c.querySelector('.mm-tree');
  var svg = c.querySelector('.mm-links');
  if (!tree || !svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  function pos(el) {
    var x = 0, y = 0, n = el;
    while (n && n !== tree) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  svg.setAttribute('width', tree.scrollWidth);
  svg.setAttribute('height', tree.scrollHeight);
  linkPairs.forEach(function (p) {
    if (!p.from.isConnected || !p.to.isConnected) return;
    var a = pos(p.from), b = pos(p.to);
    var x1 = a.x + a.w, y1 = a.y + a.h / 2;
    var x2 = b.x, y2 = b.y + b.h / 2;
    var dx = Math.max(20, (x2 - x1) / 2);
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ',' + (x2 - dx) + ' ' + y2 + ',' + x2 + ' ' + y2);
    svg.appendChild(path);
  });
}

/* ---------------- public API ---------------- */
function renderFn(container, data, opts) {
  injectCss();
  if (state.onResize) window.removeEventListener('resize', state.onResize);
  state.container = container;
  state.opts = opts || {};
  state.data = normData(data);
  state.uid = state.data.features.length + 1;
  render();
  state.onResize = function () { drawLinks(); };
  window.addEventListener('resize', state.onResize);
  commit();
}

function destroy() {
  if (state.onResize) window.removeEventListener('resize', state.onResize);
  state.container = null; state.data = null; state.opts = {};
  state.onResize = null;
}


export const Mindmap = { render: renderFn, destroy: destroy };
