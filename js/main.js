import * as M from './model.js';
import { Stage } from './stage.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const fmtS = (s) => `${+(+s).toFixed(2)}s`;
// Counts are the main unit; seconds are secondary.
const cts = (sec) => Math.round((sec / M.beatLen(dance)) * 100) / 100;
const fmtC = (sec) => { const c = cts(sec); return `${+c.toFixed(2)} ct`; };
const fmtPos = (t) => { const c = M.countAt(dance, t); return c.beat < 0 ? 'Intro' : `${c.eight} · ${c.count}`; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let dance;
const ui = {
  sel: new Set(), fi: 0, t: 0, playing: false, stopAt: null,
  view: '3d', paths: true, grid: true, labels: true, snap: true, pps: 32,
  metronome: false, taps: [], lastBeat: null,
  collisions: [],
};
const hist = { past: [], future: [] };
const audio = { el: new Audio(), name: null, url: null, duration: 0, peaks: null };
audio.el.preload = 'auto';

/* ================= Stage ================= */
let drag = null;
const stage = new Stage($('#stage'), $('#labels'), $('#marquee'), {
  onTick: tick,
  onDancerDown(id, additive) {
    if (ui.playing) pause();
    parkAtFormation();
    if (additive) ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id);
    else if (!ui.sel.has(id)) { ui.sel.clear(); ui.sel.add(id); }
    if (!ui.sel.has(id)) { selectionChanged(); return false; }
    const f = cur();
    drag = { before: snap(), start: new Map([...ui.sel].map((k) => [k, { x: f.pos[k].x, z: f.pos[k].z }])) };
    selectionChanged();
    return true;
  },
  onDrag(dx, dz) {
    if (!drag) return;
    const f = cur(), b = M.bounds(dance);
    for (const [id, s] of drag.start) {
      f.pos[id].x = clamp(snapV(s.x + dx), -b.x, b.x);
      f.pos[id].z = clamp(snapV(s.z + dz), -b.z, b.z);
    }
    refreshGuides();
    checkCollisions();
  },
  onDragEnd(moved) {
    if (drag && moved) commit(drag.before);
    drag = null;
  },
  onMarquee(ids, additive) {
    if (!additive) ui.sel.clear();
    ids.forEach((id) => ui.sel.add(id));
    selectionChanged();
  },
  // Path dots: solid = a bend (drag to move), hollow = drag to add a bend.
  onHandleStart(h) {
    if (ui.playing) pause();
    parkAtFormation();
    const prev = dance.formations[ui.fi - 1];
    const e = cur().pos[h.handleFor];
    drag = { before: snap(), id: h.handleFor, index: h.index };
    if (!prev) return;
    // Upgrade a single legacy curve into a waypoint list.
    if (!e.wp) e.wp = M.controlPts(prev.pos[h.handleFor], e, e).slice(1, -1).map((p) => ({ x: M.round(p.x), z: M.round(p.z) }));
    delete e.h;
    if (h.kind === 'add') { e.wp.splice(h.index, 0, { x: M.round(h.x), z: M.round(h.z) }); drag.index = h.index; }
  },
  onHandleDrag(h, x, z) {
    if (!drag) return;
    const e = cur().pos[drag.id], b = M.bounds(dance);
    if (!e.wp?.[drag.index]) return;
    e.wp[drag.index] = { x: clamp(snapV(x), -b.x, b.x), z: clamp(snapV(z), -b.z, b.z) };
    refreshGuides();
    checkCollisions();
  },
  onHandleEnd(moved) {
    if (drag) {
      const e = cur().pos[drag.id];
      if (e && e.wp && !e.wp.length) delete e.wp;
      if (moved) commit(drag.before); else { dance = JSON.parse(drag.before); changed(false); refreshGuides(); }
    }
    drag = null;
  },
  onHandleReset(h) {
    if (h.kind !== 'wp') return;
    mutate(() => {
      const e = cur().pos[h.handleFor];
      if (!e.wp) e.wp = M.controlPts(dance.formations[ui.fi - 1].pos[h.handleFor], e, e).slice(1, -1);
      delete e.h;
      e.wp.splice(h.index, 1);
      if (!e.wp.length) delete e.wp;
    });
    toast('Bend removed');
  },
  onDancerDblClick(id) { openCast(); setTimeout(() => $(`.dancer[data-id="${id}"] .name`)?.select(), 50); },
});

const cur = () => dance.formations[ui.fi];
const snapV = (v) => (ui.snap ? Math.round(v * 4) / 4 : M.round(v));
const snap = () => JSON.stringify(dance);

/* ================= History & saving ================= */
function mutate(fn, { render = true } = {}) {
  const before = snap();
  fn();
  commit(before, render);
}
function commit(before, render = true) {
  if (before === snap()) return;
  hist.past.push(before);
  if (hist.past.length > 200) hist.past.shift();
  hist.future = [];
  changed(render);
}
function checkCollisions() {
  ui.collisions = M.findCollisions(dance);
  renderCollisions();
}
function changed(render = true) {
  ui.collisions = M.findCollisions(dance);
  ui.fi = clamp(ui.fi, 0, dance.formations.length - 1);
  const ids = new Set(dance.dancers.map((d) => d.id));
  for (const id of [...ui.sel]) if (!ids.has(id)) ui.sel.delete(id);
  dance.updated = Date.now();
  saveSoon();
  if (render) renderAll();
}
function undo() {
  if (!hist.past.length) return;
  hist.future.push(snap());
  dance = JSON.parse(hist.past.pop());
  changed();
}
function redo() {
  if (!hist.future.length) return;
  hist.past.push(snap());
  dance = JSON.parse(hist.future.pop());
  changed();
}
let saveTimer;
function saveSoon() {
  $('#saved').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = M.saveDance(dance);
    $('#saved').textContent = ok ? 'Saved' : 'Not saved — storage is full or blocked';
  }, 350);
}

/* ================= Time ================= */
const endTime = () => Math.max(M.timing(dance).total, audio.duration || 0);
function fiAt(t) {
  const l = M.locate(dance, t);
  return l.phase === 'move' && l.u > 0.5 ? l.i + 1 : l.i;
}
function parkAtFormation() {
  const { segs } = M.timing(dance);
  const s = segs[ui.fi];
  if (ui.t < s.start - 1e-6 || ui.t > s.holdEnd + 1e-6) ui.t = s.start;
}
function goTo(i, { keepTime = false } = {}) {
  ui.fi = clamp(i, 0, dance.formations.length - 1);
  if (!keepTime) ui.t = M.timing(dance).segs[ui.fi].start;
  renderStoryboard();
  renderTimeline();
  renderCast();
  renderInspector();
  refreshGuides();
  renderMinimap();
  renderCollisions();
  scrollCardIntoView();
}
function play({ from, stopAt } = {}) {
  if (from != null) ui.t = from;
  if (ui.t >= endTime() - 0.02) ui.t = 0;
  ui.stopAt = stopAt ?? null;
  ui.playing = true;
  if (audio.url && ui.t < audio.duration) {
    audio.el.currentTime = ui.t;
    audio.el.play().catch(() => {});
  }
  stage.setGuides([]);
  stage.setWarnings([]);
  renderPlayButton();
}
function pause() {
  ui.playing = false;
  ui.stopAt = null;
  audio.el.pause();
  renderPlayButton();
  goTo(fiAt(ui.t), { keepTime: true });
}
const togglePlay = () => (ui.playing ? pause() : play());

function tick(dt) {
  if (!dance) return;
  if (ui.playing) {
    if (audio.url && !audio.el.paused && !audio.el.ended) ui.t = audio.el.currentTime;
    else ui.t += dt;
    const stop = ui.stopAt ?? endTime();
    if (ui.t >= stop) { ui.t = stop; pause(); }
    const fi = fiAt(ui.t);
    if (fi !== ui.fi) { ui.fi = fi; highlightCard(); }
  }
  const frame = M.sample(dance, ui.t);
  stage.setFrame(frame, { selected: ui.sel, playing: ui.playing });
  updateMinimapDots(frame);
  $('#time-now').textContent = fmtT(ui.t);
  $('#count-now').textContent = fmtPos(ui.t);
  const beat = Math.floor(M.beatAt(dance, ui.t) + 1e-6);
  if (ui.playing && ui.metronome && ui.lastBeat !== null && beat !== ui.lastBeat && beat >= 0) click(beat % 8 === 0);
  ui.lastBeat = ui.playing ? beat : null;
  updateCaption();
  const ph = $('#playhead');
  ph.style.transform = `translateX(${16 + ui.t * ui.pps}px)`;
  if (ui.playing) {
    const body = $('#tl-body'), x = 16 + ui.t * ui.pps;
    if (x > body.scrollLeft + body.clientWidth - 60) body.scrollLeft = x - 120;
  }
}

/* ================= Rendering ================= */
function renderAll() {
  $('#title').value = dance.title;
  document.title = `${dance.title} · Dance Studio`;
  stage.setStageSize(dance.stage.w, dance.stage.d);
  stage.setDancers(dance.dancers);
  renderStoryboard();
  renderCast();
  renderInspector();
  renderTimeline();
  renderMinimap();
  refreshGuides();
  renderCollisions();
  $('[data-action=undo]').disabled = !hist.past.length;
  $('[data-action=redo]').disabled = !hist.future.length;
  hydrateIcons();
}

function selectionChanged() {
  renderCast();
  renderInspector();
  refreshGuides();
  renderMinimap();
}

function refreshGuides() {
  if (!ui.paths || ui.playing || ui.fi === 0) { stage.setGuides([]); renderMinimapPaths(); return; }
  const prev = dance.formations[ui.fi - 1], f = cur();
  const items = [];
  for (const dn of dance.dancers) {
    const p0 = prev.pos[dn.id], p1 = f.pos[dn.id];
    if (!p0 || !p1 || (!p0.on && !p1.on)) continue;
    const moves = Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.05 || p1.wp?.length || p1.h;
    if (!moves) continue;
    items.push({ id: dn.id, color: dn.color, a: p0, b: p1, entry: p1, edit: ui.sel.has(dn.id) });
  }
  stage.setGuides(items);
  updatePathHint();
  renderMinimapPaths();
}

/* ---------- Storyboard (left) ---------- */
function renderStoryboard() {
  const list = $('#fb-list');
  const n = dance.formations.length;
  list.innerHTML = dance.formations.map((f, i) => {
    const isCur = i === ui.fi;
    const tmCount = Object.values(f.pos).filter((p) => p.tm || p.h).length;
    return `
    <li class="fcard${isCur ? ' cur' : ''}" data-fi="${i}" draggable="true">
      <div class="fcard-top">
        <span class="num">${i + 1}</span>
        <span class="fname">${esc(f.name)}</span>
        ${(() => { const n = ui.collisions.filter((c) => c.fi === i).length; return n ? `<span class="cbadge" title="${n} collision${n > 1 ? 's' : ''} in or moving into this formation">${n}</span>` : ''; })()}
        <span class="fdur">${fmtC(f.hold)}</span>
      </div>
      <div class="fthumb">${M.thumbSVG(dance, i, { w: 200, h: 110 })}</div>
      ${f.notes?.length ? `<div class="fnote"><b>${esc(f.notes[0].counts)}</b> ${esc(f.notes[0].text)}${f.notes.length > 1 ? ` <span>+${f.notes.length - 1}</span>` : ''}</div>` : ''}
      ${isCur ? `
      <div class="fedit">
        <label class="field"><span>Name</span><input class="input" data-fedit="name" value="${esc(f.name)}" maxlength="60"></label>
        <div class="field-row">
          <label class="field"><span>Hold</span><span class="unit" data-unit="ct"><input class="input" type="number" min="0" max="512" step="1" data-fedit="hold" value="${cts(f.hold)}"></span></label>
          ${i < n - 1 ? `<label class="field"><span>Move to next</span><span class="unit" data-unit="ct"><input class="input" type="number" min="1" max="512" step="1" data-fedit="transition" value="${cts(f.transition)}"></span></label>` : ''}
        </div>
        <div class="btn-row">
          <button class="btn small" data-action="dup-formation"><i data-icon="copy"></i>Duplicate</button>
          <button class="icon-btn" data-action="move-formation" data-dir="-1" title="Move earlier" ${i === 0 ? 'disabled' : ''}><i data-icon="up"></i></button>
          <button class="icon-btn" data-action="move-formation" data-dir="1" title="Move later" ${i === n - 1 ? 'disabled' : ''}><i data-icon="down"></i></button>
          <button class="icon-btn danger-icon" data-action="del-formation" title="Delete formation" ${n === 1 ? 'disabled' : ''}><i data-icon="trash"></i></button>
        </div>
      </div>` : ''}
    </li>
    ${i < n - 1 ? `<li class="fgap" data-gap="${i}"><span class="fgap-line"></span><span class="fgap-label">${icon('down', 12)} ${fmtC(f.transition)} move${gapSummary(dance.formations[i + 1])}</span></li>` : ''}`;
  }).join('') + '<li class="fadd"><button class="add-card" data-action="add-formation"><i data-icon="plus"></i>New formation</button></li>';
  $('#formation-count').textContent = n;
  hydrateIcons(list);
}
function gapSummary(next) {
  if (!next) return '';
  const entries = Object.values(next.pos);
  const styles = [...new Set(entries.map((p) => M.styleOf(p.tr)))];
  const parts = [];
  if (styles.length === 1 && styles[0] !== 'walk') parts.push(M.STYLES[styles[0]].label.toLowerCase());
  else if (styles.length > 1) parts.push('mixed');
  if (entries.some((p) => p.tm)) parts.push('rhythm');
  if (entries.some((p) => p.wp || p.h)) parts.push('paths');
  return parts.length ? ` · ${parts.join(', ')}` : '';
}
function highlightCard() {
  document.querySelectorAll('.fcard').forEach((el) => el.classList.toggle('playing', +el.dataset.fi === ui.fi));
}
function scrollCardIntoView() {
  $(`.fcard[data-fi="${ui.fi}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------- Cast (right top) ---------- */
function renderCast() {
  const f = cur();
  $('#dancer-count').textContent = dance.dancers.length;
  const row = (d) => {
    const on = f.pos[d.id]?.on !== false;
    return `<li class="dancer${ui.sel.has(d.id) ? ' sel' : ''}${on ? '' : ' off'}${d.group ? ' grouped' : ''}" data-id="${d.id}">
      <button class="swatch" style="background:${d.color}" data-action="color" aria-label="Change ${esc(d.name)}'s color"></button>
      <input class="name" value="${esc(d.name)}" maxlength="40" aria-label="Dancer name" spellcheck="false">
      <span class="row-actions">
        <button class="icon-btn" data-action="toggle-on" title="${on ? 'On stage in this formation — click to mark offstage' : 'Offstage in this formation — click to bring on'}"><i data-icon="${on ? 'eye' : 'eye-off'}"></i></button>
        <button class="icon-btn" data-action="remove-dancer" title="Remove from the dance"><i data-icon="trash"></i></button>
      </span>
    </li>`;
  };
  const seen = new Set();
  let html = '';
  for (const d of dance.dancers) {
    if (!d.group) { html += row(d); continue; }
    if (seen.has(d.group)) continue;
    seen.add(d.group);
    const g = dance.groups.find((x) => x.id === d.group);
    const mem = M.members(dance, g.id);
    const allSel = mem.every((m) => ui.sel.has(m.id));
    html += `<li class="group${allSel ? ' sel' : ''}" data-gid="${g.id}">
      <button class="group-head" data-action="select-group" title="Select ${esc(g.name)}">
        <span class="group-dots">${mem.map((m) => `<span style="background:${m.color}"></span>`).join('')}</span>
        <span class="group-name">${esc(g.name)}</span>
        <span class="group-mode">${g.mode === 'same' ? 'Matching' : 'Shades'}</span>
      </button>
      <ul>${mem.map(row).join('')}</ul>
    </li>`;
  }
  $('#dancer-list').innerHTML = html || '<li class="empty">No dancers yet. Add as many as you need — you can add more any time.</li>';
  hydrateIcons($('#dancer-list'));
}

/* ---------- Inspector (right bottom) ---------- */
function shapeIcon(key) {
  const pts = M.SHAPES[key].pts(7, 1);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const k = Math.min(32 / (maxX - minX || 1), 18 / (maxZ - minZ || 1));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return `<svg viewBox="0 0 38 24" aria-hidden="true">${pts.map((p) => `<circle cx="${(19 + (p.x - cx) * k).toFixed(1)}" cy="${(12 + (p.z - cz) * k).toFixed(1)}" r="2.3" fill="currentColor"/>`).join('')}</svg>`;
}
function paceIcon(key) {
  const fn = M.PACES[key].fn;
  const d = Array.from({ length: 21 }, (_, i) => { const u = i / 20; return `${i ? 'L' : 'M'}${(3 + u * 26).toFixed(1)},${(17 - fn(u) * 14).toFixed(1)}`; }).join('');
  return `<svg viewBox="0 0 32 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function renderInspector() {
  const el = $('#insp');
  const f = cur();
  const ids = [...ui.sel];
  const onstage = dance.dancers.filter((d) => f.pos[d.id]?.on !== false).map((d) => d.id);
  const target = ids.length ? ids : onstage;
  const shapes = Object.entries(M.SHAPES).map(([k, s]) => `<button class="shape" data-shape="${k}">${shapeIcon(k)}<span>${s.label}</span></button>`).join('');
  const arrange = `
    <section class="section">
      <h3>Arrange ${ids.length ? (ids.length === 1 ? esc(dance.dancers.find((d) => d.id === ids[0]).name) : `${ids.length} selected`) : `everyone onstage (${onstage.length})`}</h3>
      <div class="shapes">${shapes}</div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn small" data-action="mirror"><i data-icon="mirror"></i>Mirror</button>
        <button class="btn small" data-action="tighter"><i data-icon="shrink"></i>Tighter</button>
        <button class="btn small" data-action="wider"><i data-icon="expand"></i>Wider</button>
        ${ui.fi > 0 ? '<button class="btn small" data-action="copy-prev" title="Put them back where they were in the previous formation">Same as previous</button>' : ''}
      </div>
    </section>`;

  if (!ids.length) {
    el.innerHTML = `${countSheet(f, [])}${ui.fi > 0 ? moveSection(f, onstage, f.pos[onstage[0]] || {}, true) : ''}${arrange}
      <section class="section">
        <h3>Stage</h3>
        <div class="field-row">
          <label class="field"><span>Width</span><span class="unit" data-unit="m"><input class="input" type="number" min="4" max="40" step="1" data-stage="w" value="${dance.stage.w}"></span></label>
          <label class="field"><span>Depth</span><span class="unit" data-unit="m"><input class="input" type="number" min="3" max="30" step="1" data-stage="d" value="${dance.stage.d}"></span></label>
        </div>
      </section>
      <section class="section"><div class="hint-card">Click a dancer to edit just them, or drag across the floor to select a group. Their path, rhythm and travel style show up here.</div></section>`;
    hydrateIcons(el);
    return;
  }

  const first = dance.dancers.find((d) => d.id === ids[0]);
  const p = f.pos[first.id];
  const allOn = ids.every((id) => f.pos[id]?.on !== false);
  const colors = M.PALETTE.map((c) => `<button style="background:${c}" class="${ids.length === 1 && first.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-color="${c}" aria-label="Color ${c}"></button>`).join('');

  let timing = '';
  if (ui.fi > 0) timing = moveSection(f, ids, p);
  const groupsHit = [...new Set(ids.map((id) => dance.dancers.find((d) => d.id === id).group).filter(Boolean))];
  const exactGroup = groupsHit.length === 1 && M.members(dance, groupsHit[0]).length === ids.length && ids.every((id) => dance.dancers.find((d) => d.id === id).group === groupsHit[0]) ? dance.groups.find((g) => g.id === groupsHit[0]) : null;
  const soloGroup = ids.length === 1 && first.group ? dance.groups.find((g) => g.id === first.group) : null;
  const g = exactGroup || soloGroup;
  let grouping = '';
  if (g) {
    const mem = M.members(dance, g.id);
    grouping = `
    <section class="section group-section">
      <h3>${mem.length === 2 ? 'Pair' : 'Group'}</h3>
      <label class="field"><span>Name</span><input class="input" data-group-name="${g.id}" value="${esc(g.name)}" maxlength="40"></label>
      <div class="field"><span>Color</span><div class="swatches">${M.PALETTE.map((c) => `<button style="background:${c}" class="${c.toLowerCase() === g.color.toLowerCase() ? 'on' : ''}" data-group-color="${c}" aria-label="Group color ${c}"></button>`).join('')}</div></div>
      <div class="seg small-seg" role="group" aria-label="Color style">
        <button class="${g.mode === 'same' ? 'on' : ''}" data-group-mode="same">Matching</button>
        <button class="${g.mode !== 'same' ? 'on' : ''}" data-group-mode="shades">Shades</button>
      </div>
      <p class="muted" style="margin-top:8px">${mem.map((m) => esc(m.name)).join(' & ')}</p>
      <div class="btn-row" style="margin-top:8px">
        ${soloGroup && !exactGroup ? '<button class="btn small" data-action="select-group-of">Select whole group</button>' : ''}
        <button class="btn small ghost" data-action="ungroup" data-gid="${g.id}">Split up</button>
      </div>
    </section>`;
  } else if (ids.length >= 2) {
    grouping = `
    <section class="section">
      <h3>${ids.length === 2 ? 'Partners?' : 'Group them?'}</h3>
      <p class="muted" style="margin-bottom:10px">Give ${ids.length === 2 ? 'these two' : `these ${ids.length}`} one shared color and keep them together in the cast list.</p>
      <div class="btn-row">
        <button class="btn small" data-action="pair-up" data-mode="shades">${ids.length === 2 ? 'Pair up' : 'Group'} · shades</button>
        <button class="btn small" data-action="pair-up" data-mode="same">${ids.length === 2 ? 'Pair up' : 'Group'} · matching</button>
      </div>
    </section>`;
  }

  el.innerHTML = `
    <section class="section">
      <h3>${ids.length === 1 ? esc(first.name) : `${ids.length} dancers`} <button class="icon-btn" data-action="clear-sel" title="Clear selection (Esc)"><i data-icon="x"></i></button></h3>
      <div class="swatches">${colors}</div>
      <label class="switch" style="margin-top:12px">On stage in this formation<input type="checkbox" data-action="onstage" ${allOn ? 'checked' : ''}></label>
      ${ids.length === 1 ? `
      <div class="field-row" style="margin-top:10px">
        <label class="field"><span>Across</span><span class="unit" data-unit="m"><input class="input" type="number" step="0.25" data-pos="x" value="${p.x}"></span></label>
        <label class="field"><span>Depth</span><span class="unit" data-unit="m"><input class="input" type="number" step="0.25" data-pos="z" value="${p.z}"></span></label>
      </div>` : ''}
    </section>
    ${grouping}
    ${timing}
    ${countSheet(f, ids)}
    ${arrange}`;
  hydrateIcons(el);
}

function moveSection(f, ids, p, everyone = false) {
  const prev = dance.formations[ui.fi - 1];
  const n = Math.max(1, Math.round(cts(prev.transition)));
  const w = M.toRhythm(p.tm, n);
  const b0 = Math.round(M.beatAt(dance, M.timing(dance).segs[ui.fi - 1].holdEnd));
  const lab = (k) => ((((b0 + k) % 8) + 8) % 8) + 1;
  const firstGo = w.findIndex((v) => v > 0), lastGo = w.length - 1 - [...w].reverse().findIndex((v) => v > 0);
  const summary = firstGo < 0 ? 'Stays put' : `Leaves on ${lab(firstGo)} · arrives on ${lab(lastGo)}${lastGo + 1 < n ? `, then holds` : ''}`;
  const style = M.styleOf(p.tr), facing = M.facingOf(p.tr);
  const bends = ids.reduce((m, id) => Math.max(m, f.pos[id].wp?.length || (f.pos[id].h ? 1 : 0)), 0);
  const who = everyone ? `Everyone onstage (${ids.length})` : ids.length === 1 ? esc(dance.dancers.find((d) => d.id === ids[0]).name) : `${ids.length} dancers`;
  return `
    <section class="section move">
      <h3>Move into “${esc(f.name)}” <button class="btn small ghost" data-action="preview-move">${icon('play', 12)}Preview</button></h3>
      <p class="muted" style="margin-bottom:10px">${who} · ${n} count${n > 1 ? 's' : ''}</p>
      <div class="field"><span>Rhythm <b class="rsum">${summary}</b></span>
        <div class="rhythm" data-n="${n}" style="--n:${n}">
          ${w.map((v, i) => `<button class="rcell" data-ri="${i}" data-v="${v}" title="Count ${lab(i)}: ${M.SPEEDS[v]}"><span class="rbar" style="height:${(v / 3) * 100}%"></span><span class="rlab">${lab(i)}</span></button>`).join('')}
        </div>
        <span class="rlegend">Click a count to change its speed (hold → slow → medium → fast), or drag across counts to paint.</span>
        <div class="presets">${Object.entries(M.RHYTHM_PRESETS).map(([k, v]) => `<button class="chip" data-rpreset="${k}">${v.label}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Travel</span>
        <div class="styles">${Object.entries(M.STYLES).map(([k, v]) => `<button class="style-chip${k === style ? ' on' : ''}" data-style="${k}">${v.label}</button>`).join('')}</div>
      </div>
      <div class="field"><span>Facing while moving</span>
        <div class="seg small-seg">${Object.entries(M.FACINGS).map(([k, v]) => `<button class="${k === facing ? 'on' : ''}" data-facing="${k}">${v.label}</button>`).join('')}</div>
      </div>
      <div class="path-row">
        <span>${icon('route', 14)} Path: <b>${bends ? `${bends} bend${bends > 1 ? 's' : ''}` : 'Straight'}</b></span>
        ${bends ? '<button class="btn small ghost" data-action="straighten">Straighten</button>' : ''}
      </div>
      ${everyone ? '' : '<p class="muted path-help">On the stage: drag a hollow ○ dot on the path to add a bend, drag a solid ● dot to move it, double-click ● to remove it.</p>'}
      ${ids.length > 1 ? '<div class="btn-row" style="margin-top:8px"><button class="btn small" data-action="stagger" title="Each dancer leaves a count after the one to their left"><i data-icon="ripple"></i>Ripple left → right</button></div>' : ''}
    </section>`;
}

function countSheet(f, ids) {
  const sel = new Set(ids);
  const names = (who) => (who?.length ? who.map((id) => dance.dancers.find((d) => d.id === id)?.name).filter(Boolean).join(' & ') : 'Everyone');
  const rows = (f.notes || []).map((n) => {
    const mine = !sel.size || !n.who?.length || n.who.some((id) => sel.has(id));
    return `<li class="note${mine ? '' : ' dim'}" data-nid="${n.id}">
      <input class="ncounts${M.parseCounts(n.counts) ? '' : ' bad'}" data-note="counts" value="${esc(n.counts)}" placeholder="1-4" aria-label="Counts" spellcheck="false">
      <input class="ntext" data-note="text" value="${esc(n.text)}" placeholder="What happens on these counts" aria-label="Movement">
      <button class="who" data-action="note-who" title="${sel.size ? 'Click to assign to the selected dancers (click again for everyone)' : 'Select dancers, then click to assign this line to them'}">${esc(names(n.who))}</button>
      <button class="icon-btn" data-action="note-del" title="Delete line"><i data-icon="x"></i></button>
    </li>`;
  }).join('');
  return `
    <section class="section">
      <h3>Count sheet · ${esc(f.name)}</h3>
      ${rows ? `<ol class="notes">${rows}</ol>` : '<p class="muted" style="margin-bottom:8px">Write what happens on each count — “1-4 arm sweep”, “5-8 drop to floor”. Lines show as captions during playback.</p>'}
      <button class="btn small" data-action="note-add"><i data-icon="plus"></i>Add line${sel.size ? ` for ${sel.size === 1 ? esc(dance.dancers.find((d) => d.id === ids[0]).name) : `${sel.size} selected`}` : ''}</button>
    </section>`;
}

/* ---------- Collisions ---------- */
const dname = (id) => dance.dancers.find((d) => d.id === id)?.name || '?';
function collisionLabel(c) {
  const f = dance.formations[c.fi];
  if (c.kind === 'spot') return { where: `In “${f.name}”`, what: `${dname(c.a)} & ${dname(c.b)} are standing on top of each other` };
  const segs = M.timing(dance).segs;
  const ct = Math.floor((c.t - segs[c.fi - 1].holdEnd) / M.beatLen(dance)) + 1;
  return { where: `Moving into “${f.name}” · count ${ct} of the move`, what: `${dname(c.a)} & ${dname(c.b)} run into each other` };
}
function renderCollisions() {
  const list = ui.collisions;
  const chip = $('#coll-chip');
  chip.classList.toggle('bad', list.length > 0);
  chip.innerHTML = list.length ? `<span class="cdot"></span>${list.length} collision${list.length > 1 ? 's' : ''}` : `${icon('check', 12)}No collisions`;
  // Stage markers for the formation you're on (and the move into it)
  if (!ui.playing) stage.setWarnings(list.filter((c) => c.fi === ui.fi).map((c) => ({ x: c.x, z: c.z })));
  // Timeline marks
  const pps = ui.pps;
  $('#coll-marks').innerHTML = list.map((c) => `<span class="cmark" style="left:${16 + c.t * pps}px" title="${esc(collisionLabel(c).what)}"></span>`).join('');
  // Storyboard badges
  document.querySelectorAll('.fcard').forEach((el) => {
    const n = list.filter((c) => c.fi === +el.dataset.fi).length;
    let b = el.querySelector('.cbadge');
    if (!n) { b?.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'cbadge'; el.querySelector('.fdur').before(b); }
    b.textContent = n;
  });
  if (!$('#coll-pop').hidden) renderCollisionList();
}
function renderCollisionList() {
  const list = ui.collisions;
  $('#coll-pop').innerHTML = list.length ? `
    <div class="coll-head"><h4>${list.length} collision${list.length > 1 ? 's' : ''}</h4><button class="btn small primary" data-action="coll-fix-all">Fix all</button></div>
    <p class="muted">Dancers closer than ${M.MIN_GAP} m. Partners in a pair or group are allowed to touch.</p>
    <ol class="coll-list">${list.map((c, i) => { const l = collisionLabel(c); return `<li><div><b>${esc(l.what)}</b><span>${esc(l.where)}</span></div><div class="btn-row"><button class="btn small ghost" data-action="coll-show" data-ci="${i}">Show</button><button class="btn small" data-action="coll-fix" data-ci="${i}">Fix</button></div></li>`; }).join('')}</ol>`
    : `<div class="coll-head"><h4>No collisions</h4></div><p class="muted">Nobody runs into anyone. Dancers closer than ${M.MIN_GAP} m count as a collision; partners in a pair or group are allowed to touch.</p>`;
}

/* ---------- Minimap ---------- */
let mmDots = new Map();
function renderMinimap() {
  const box = $('#minimap-svg');
  const { w, d } = dance.stage;
  const W = 200, H = Math.round((200 * (d + 1.4)) / (w + 1.4));
  const sx = W / (w + 1.4);
  box.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const rect = `<rect x="${0.7 * sx}" y="${0.7 * sx}" width="${w * sx}" height="${d * sx}" rx="4" fill="#EAD2AE"/><path d="M${W / 2} ${0.7 * sx}V${H - 0.7 * sx}" stroke="#7a5a38" stroke-opacity=".3" stroke-dasharray="3 3"/>`;
  box.innerHTML = `${rect}<g id="mm-paths"></g>${dance.dancers.map((dn) => `<circle data-id="${dn.id}" r="${ui.sel.has(dn.id) ? 5 : 4.2}" fill="${dn.color}" ${ui.sel.has(dn.id) ? 'stroke="#1D1A17" stroke-width="1.6"' : 'stroke="#fff" stroke-width="1"'}/>`).join('')}`;
  box.dataset.sx = sx;
  box.dataset.ox = W / 2;
  box.dataset.oz = H / 2;
  mmDots = new Map([...box.querySelectorAll('circle[data-id]')].map((c) => [c.dataset.id, c]));
  renderMinimapPaths();
}
function mm(x, z) {
  const box = $('#minimap-svg');
  return [+box.dataset.ox + x * box.dataset.sx, +box.dataset.oz + z * box.dataset.sx];
}
function renderMinimapPaths() {
  const g = $('#mm-paths');
  if (!g) return;
  if (!ui.paths || ui.playing || ui.fi === 0) { g.innerHTML = ''; return; }
  const prev = dance.formations[ui.fi - 1], f = cur();
  g.innerHTML = dance.dancers.map((dn) => {
    const p0 = prev.pos[dn.id], p1 = f.pos[dn.id];
    if (!p0 || !p1 || (Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05 && !p1.wp)) return '';
    const pts = M.pathPolyline(p0, p1, p1, 8).map((p) => mm(p.x, p.z).map((v) => v.toFixed(1)).join(','));
    const [gx, gz] = mm(p0.x, p0.z);
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${dn.color}" stroke-width="1.4" stroke-dasharray="3 2.5" opacity=".8"/><circle cx="${gx.toFixed(1)}" cy="${gz.toFixed(1)}" r="3" fill="none" stroke="${dn.color}" stroke-width="1" opacity=".7"/>`;
  }).join('');
}
function updateMinimapDots(frame) {
  if (ui.view !== '3d') return;
  for (const [id, c] of mmDots) {
    const f = frame.get(id);
    if (!f) continue;
    const [x, z] = mm(f.x, f.z);
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', z.toFixed(1));
    c.setAttribute('opacity', ui.playing ? f.alpha : Math.max(f.alpha, 0.35));
  }
}

/* ---------- Timeline (bottom) ---------- */
function renderTimeline() {
  const { segs, total } = M.timing(dance);
  const end = endTime();
  const pps = ui.pps;
  const width = 32 + (end + 6) * pps;
  $('#tl-inner').style.width = `${width}px`;
  $('#time-total').textContent = fmtT(end);
  $('#tempo-btn').innerHTML = `${icon('clock', 14)}${dance.music.bpm} BPM`;

  // Ruler: 8-counts (bold), beats (ticks), seconds (small, underneath)
  const beat = M.beatLen(dance), off = dance.music.offset || 0;
  let ticks = '';
  const bStart = Math.ceil(-off / beat), bEnd = Math.floor((end + 6 - off) / beat);
  const beatPx = beat * pps;
  for (let b = bStart; b <= bEnd; b++) {
    const x = 16 + (off + b * beat) * pps;
    if (b % 8 === 0) ticks += `<span class="tick major" style="left:${x}px">${b / 8 + 1}</span>`;
    else if (beatPx >= 7) ticks += `<span class="tick beat${b % 2 ? '' : ' even'}" style="left:${x}px">${beatPx >= 22 ? (((b % 8) + 8) % 8) + 1 : ''}</span>`;
  }
  const step = pps >= 48 ? 2 : pps >= 24 ? 5 : pps >= 12 ? 10 : 20;
  for (let t = 0; t <= end + 6; t += step) ticks += `<span class="sec" style="left:${16 + t * pps}px">${t}s</span>`;
  $('#ruler').innerHTML = ticks;

  // Formation bands
  $('#formations-track').innerHTML = dance.formations.map((f, i) => {
    const s = segs[i];
    const w = f.hold * pps;
    const tr = i < dance.formations.length - 1 ? `<div class="trans" style="left:${16 + s.holdEnd * pps}px;width:${f.transition * pps}px" title="Move: ${fmtC(f.transition)}"><span>${f.transition * pps > 40 ? fmtC(f.transition) : ''}</span><span class="handle" data-resize="transition" data-fi="${i}"></span></div>` : '';
    return `<div class="fband${i === ui.fi ? ' cur' : ''}" data-fi="${i}" style="left:${16 + s.start * pps}px;width:${w}px" title="${esc(f.name)} · ${fmtC(f.hold)}"><span class="fband-n">${i + 1}</span><span class="fband-name">${w > 60 ? esc(f.name) : ''}</span><span class="handle" data-resize="hold" data-fi="${i}"></span></div>${tr}`;
  }).join('');

  drawWave(width);
  renderMusic();
}

function drawWave(width) {
  const cv = $('#wave');
  const h = 34;
  const dpr = Math.min(devicePixelRatio, 2);
  cv.width = Math.round(width * dpr);
  cv.height = h * dpr;
  cv.style.width = `${width}px`;
  cv.style.height = `${h}px`;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  $('#music-empty').hidden = !!audio.peaks;
  if (!audio.peaks) return;
  g.fillStyle = '#C9BFB2';
  const per = audio.peaks.rate;
  const bar = 3;
  for (let x = 0; x < audio.duration * ui.pps; x += bar) {
    const t0 = x / ui.pps, t1 = (x + bar) / ui.pps;
    let m = 0;
    for (let k = Math.floor(t0 * per); k < Math.ceil(t1 * per) && k < audio.peaks.data.length; k++) m = Math.max(m, audio.peaks.data[k]);
    const bh = Math.max(1.5, m * (h - 6));
    g.fillRect(16 + x, (h - bh) / 2, bar - 1, bh);
  }
}

function renderMusic() {
  $('#music').innerHTML = audio.url
    ? `<span class="song" title="${esc(audio.name)}">${icon('music', 14)}<span>${esc(audio.name)}</span><button class="icon-btn" data-action="remove-music" title="Remove music">${icon('x', 14)}</button></span>`
    : `<button class="btn small ghost" data-action="add-music">${icon('music', 14)}Add music</button>`;
}

function renderPlayButton() {
  $('[data-action=play]').innerHTML = icon(ui.playing ? 'pause' : 'play');
}

/* ================= Audio ================= */
function clearAudio() {
  audio.el.pause();
  if (audio.url) URL.revokeObjectURL(audio.url);
  Object.assign(audio, { url: null, name: null, duration: 0, peaks: null });
  audio.el.removeAttribute('src');
}
async function setAudio(blob, name, persist) {
  clearAudio();
  audio.url = URL.createObjectURL(blob);
  audio.name = name;
  audio.el.src = audio.url;
  if (persist) M.putAudio(dance.id, { blob, name });
  renderMusic();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    audio.duration = buf.duration;
    const ch = buf.getChannelData(0), rate = 50, step = Math.floor(buf.sampleRate / rate);
    const data = new Float32Array(Math.ceil(ch.length / step));
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      let m = 0;
      for (let k = i * step, e = Math.min(ch.length, k + step); k < e; k += 8) m = Math.max(m, Math.abs(ch[k]));
      data[i] = m;
      max = Math.max(max, m);
    }
    for (let i = 0; i < data.length; i++) data[i] /= max || 1;
    audio.peaks = { rate, data };
  } catch {
    audio.duration = await new Promise((r) => { audio.el.onloadedmetadata = () => r(audio.el.duration || 0); setTimeout(() => r(0), 3000); });
    toast('Loaded the music, but couldn’t draw its waveform.');
  }
  renderTimeline();
}
async function loadAudioFor(d) {
  clearAudio();
  const rec = await M.getAudio(d.id);
  if (rec && dance.id === d.id) await setAudio(rec.blob, rec.name, false);
  else renderTimeline();
}

/* ================= Open / library ================= */
function open(d) {
  if (ui.playing) pause();
  dance = M.validate(d);
  ui.sel.clear();
  ui.fi = 0;
  ui.t = 0;
  hist.past = [];
  hist.future = [];
  M.saveDance(dance);
  stage.setStageSize(dance.stage.w, dance.stage.d);
  stage.recenter();
  renderAll();
  loadAudioFor(dance);
}

function renderLibrary() {
  const ids = M.libraryIds();
  const cards = ids.map((id) => M.loadDance(id)).filter(Boolean).map((d) => {
    const mid = Math.floor((d.formations.length - 1) / 2);
    const when = new Date(d.updated || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="card${d.id === dance.id ? ' cur' : ''}" data-id="${d.id}">
      <button class="card-open" data-action="open-dance" aria-label="Open ${esc(d.title)}">
        <span class="card-thumb">${M.thumbSVG(d, mid, { w: 200, h: 125, r: 4 })}</span>
        <span class="card-body"><span class="card-title">${esc(d.title)}</span><span class="card-meta">${d.dancers.length} dancers · ${d.formations.length} formations · ${when}</span></span>
      </button>
      <span class="card-actions">
        <button class="icon-btn" data-action="dup-dance" title="Duplicate">${icon('copy')}</button>
        <button class="icon-btn" data-action="delete-dance" title="Delete">${icon('trash')}</button>
      </span>
    </div>`;
  }).join('');
  $('#lib-grid').innerHTML = `<button class="card new" data-action="new">${icon('plus', 26)}New dance</button>${cards}`;
}

/* ================= Actions ================= */
function selIds() { return ui.sel.size ? [...ui.sel] : dance.dancers.filter((d) => cur().pos[d.id]?.on !== false).map((d) => d.id); }

const actions = {
  undo, redo,
  play: togglePlay,
  'prev-formation': () => { if (ui.playing) pause(); goTo(ui.fi - 1); },
  'next-formation': () => { if (ui.playing) pause(); goTo(ui.fi + 1); },
  'add-formation': () => { if (ui.playing) pause(); mutate(() => { ui.fi = M.duplicateFormation(dance, ui.fi); }); goTo(ui.fi); toast('New formation — move dancers to set it'); },
  'dup-formation': () => actions['add-formation'](),
  'del-formation': () => {
    if (dance.formations.length < 2) return;
    mutate(() => { dance.formations.splice(ui.fi, 1); ui.fi = Math.max(0, ui.fi - 1); });
    goTo(ui.fi);
    toast('Formation deleted', true);
  },
  'move-formation': (el) => {
    const dir = +el.dataset.dir, j = ui.fi + dir;
    if (j < 0 || j >= dance.formations.length) return;
    mutate(() => { const [f] = dance.formations.splice(ui.fi, 1); dance.formations.splice(j, 0, f); ui.fi = j; });
    goTo(j);
  },
  'add-dancer': () => {
    let added;
    mutate(() => { added = M.addDancer(dance); });
    ui.sel = new Set([added.id]);
    selectionChanged();
    setTimeout(() => $(`.dancer[data-id="${added.id}"] .name`)?.select(), 30);
  },
  'add-dancers-4': () => {
    const ids = [];
    mutate(() => { for (let i = 0; i < 4; i++) ids.push(M.addDancer(dance).id); });
    ui.sel = new Set(ids);
    selectionChanged();
  },
  'pair-up': (el) => {
    let g;
    mutate(() => { g = M.makeGroup(dance, [...ui.sel], { mode: el.dataset.mode }); });
    if (g) toast(`${g.name}: ${M.members(dance, g.id).map((m) => m.name).join(' & ')}`);
  },
  ungroup: (el) => { mutate(() => M.ungroup(dance, el.dataset.gid)); toast('Split up — they keep their colors', true); },
  'select-group': (el) => {
    const gid = el.closest('[data-gid]').dataset.gid;
    ui.sel = new Set(M.members(dance, gid).map((m) => m.id));
    selectionChanged();
  },
  'select-group-of': () => {
    const g = M.groupOf(dance, [...ui.sel][0]);
    if (g) { ui.sel = new Set(M.members(dance, g.id).map((m) => m.id)); selectionChanged(); }
  },
  'select-all': () => { ui.sel = new Set(dance.dancers.map((d) => d.id)); selectionChanged(); },
  'clear-sel': () => { ui.sel.clear(); selectionChanged(); },
  'remove-dancer': (el) => {
    const id = el.closest('[data-id]').dataset.id;
    const name = dance.dancers.find((d) => d.id === id)?.name;
    mutate(() => M.removeDancers(dance, [id]));
    toast(`Removed ${name}`, true);
  },
  'toggle-on': (el) => {
    const id = el.closest('[data-id]').dataset.id;
    mutate(() => { const p = cur().pos[id]; p.on = p.on === false; });
  },
  onstage: (el) => mutate(() => { for (const id of ui.sel) cur().pos[id].on = el.checked; }),
  color: (el) => openColorPop(el, el.closest('[data-id]').dataset.id),
  mirror: () => mutate(() => {
    const ids = selIds();
    if (ids.length === dance.dancers.filter((d) => cur().pos[d.id]?.on !== false).length && !ui.sel.size) {
      for (const id of ids) cur().pos[id].x = -cur().pos[id].x;
    } else M.transform(dance, ui.fi, ids, (p) => ({ x: -p.x, z: p.z }));
  }),
  tighter: () => mutate(() => M.transform(dance, ui.fi, selIds(), (p) => ({ x: p.x * 0.85, z: p.z * 0.85 }))),
  wider: () => mutate(() => M.transform(dance, ui.fi, selIds(), (p) => ({ x: p.x * 1.15, z: p.z * 1.15 }))),
  'copy-prev': () => mutate(() => {
    const prev = dance.formations[ui.fi - 1];
    for (const id of selIds()) Object.assign(cur().pos[id], { x: prev.pos[id].x, z: prev.pos[id].z });
  }),
  stagger: () => { mutate(() => M.stagger(dance, ui.fi, [...ui.sel], { spread: 0.6 })); toast('Rippled — press Preview to watch it'); },
  'reset-timing': () => mutate(() => { for (const id of selIds()) delete cur().pos[id].tm; }),
  straighten: () => mutate(() => { for (const id of selIds()) { delete cur().pos[id].h; delete cur().pos[id].wp; } }),
  'note-add': () => {
    const f = cur();
    const last = f.notes?.[f.notes.length - 1];
    const r = last && M.parseCounts(last.counts);
    const span = r ? r[1] - r[0] + 1 : 4;
    const counts = r ? `${r[1] + 1}-${r[1] + span}` : '1-4';
    const id = M.uid();
    mutate(() => { (f.notes ||= []).push({ id, counts, text: '', who: [...ui.sel] }); });
    setTimeout(() => $(`.note[data-nid="${id}"] .ntext`)?.focus(), 30);
  },
  'note-del': (el) => mutate(() => { const id = el.closest('[data-nid]').dataset.nid; cur().notes = cur().notes.filter((n) => n.id !== id); }),
  'note-who': (el) => mutate(() => {
    const n = cur().notes.find((x) => x.id === el.closest('[data-nid]').dataset.nid);
    const sel = [...ui.sel];
    const same = sel.length && n.who?.length === sel.length && sel.every((id) => n.who.includes(id));
    n.who = sel.length && !same ? sel : [];
  }),
  'coll-pop': () => { const p = $('#coll-pop'); p.hidden = !p.hidden; if (!p.hidden) renderCollisionList(); },
  'coll-show': (el) => {
    const c = ui.collisions[+el.dataset.ci];
    if (!c) return;
    if (ui.playing) pause();
    goTo(c.fi);
    if (c.kind === 'move') ui.t = c.t;
    ui.sel = new Set([c.a, c.b]);
    selectionChanged();
    $('#coll-pop').hidden = true;
  },
  'coll-fix': (el) => {
    const c = ui.collisions[+el.dataset.ci];
    if (!c) return;
    let res;
    mutate(() => { res = M.fixCollision(dance, c); if (res) Object.assign(dance, res.copy); });
    if (res) toast(`Fixed ${dname(c.a)} & ${dname(c.b)} — one of them ${res.label}`, true);
    else toast('No simple fix found — try moving one of them by hand, or changing the formation.');
  },
  'coll-fix-all': () => {
    let r;
    mutate(() => { r = M.fixAll(dance); });
    toast(r.left ? `Fixed ${r.fixed}; ${r.left} need a manual tweak` : `Fixed ${r.fixed} collision${r.fixed === 1 ? '' : 's'}`, true);
    renderCollisionList();
  },
  'tempo-pop': () => { const p = $('#tempo-pop'); p.hidden = !p.hidden; if (!p.hidden) renderTempo(); },
  tap: () => {
    const now = performance.now();
    ui.taps = ui.taps.filter((t) => now - t < 2500);
    ui.taps.push(now);
    if (ui.taps.length >= 3) {
      const gaps = ui.taps.slice(1).map((t, i) => t - ui.taps[i]);
      const bpm = 60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
      mutate(() => M.setTempo(dance, bpm));
      renderTempo();
    }
    $('#tap-count').textContent = ui.taps.length < 3 ? `Tap ${3 - ui.taps.length} more…` : 'Keep tapping to refine';
  },
  'count-one': () => { mutate(() => { dance.music.offset = M.round(ui.t); }); renderTempo(); toast(`Count 1 now starts at ${fmtT(ui.t)}`); },
  metronome: (el) => { ui.metronome = el.checked; if (ui.metronome) click(true); },
  'preview-move': () => {
    const { segs } = M.timing(dance);
    const s = segs[ui.fi];
    play({ from: Math.max(0, segs[ui.fi - 1].holdEnd - 0.4), stopAt: s.start + 0.5 });
  },
  recenter: () => stage.recenter(),
  'add-music': () => $('#file-audio').click(),
  'remove-music': () => { M.deleteAudio(dance.id); clearAudio(); renderTimeline(); },
  'zoom-in': () => { ui.pps = Math.min(120, ui.pps * 1.4); renderTimeline(); },
  'zoom-out': () => { ui.pps = Math.max(6, ui.pps / 1.4); renderTimeline(); },
  library: () => { renderLibrary(); $('#library').showModal(); },
  'open-dance': (el) => { const d = M.loadDance(el.closest('[data-id]').dataset.id); if (d) open(d); $('#library').close(); },
  'dup-dance': (el) => {
    const d = M.loadDance(el.closest('[data-id]').dataset.id);
    if (!d) return;
    d.id = M.uid();
    d.title = `${d.title} (copy)`;
    d.updated = Date.now();
    M.saveDance(d);
    renderLibrary();
  },
  'delete-dance': (el) => {
    const id = el.closest('[data-id]').dataset.id;
    const d = M.loadDance(id);
    if (!confirm(`Delete “${d?.title}”? This can’t be undone.`)) return;
    M.deleteDance(id);
    if (id === dance.id) {
      const next = M.libraryIds().map(M.loadDance).find(Boolean);
      open(next || M.newDance());
    }
    renderLibrary();
  },
  new: () => { open(M.newDance('Untitled dance', 4)); $('#library').close(); closeMenus(); toast('New dance with 4 dancers — add or remove as many as you like'); setTimeout(() => $('#title').select(), 50); },
  'duplicate-dance': () => {
    const d = JSON.parse(snap());
    d.id = M.uid();
    d.title = `${d.title} (copy)`;
    open(d);
    closeMenus();
    toast('Duplicated');
  },
  export: () => {
    const blob = new Blob([JSON.stringify(dance, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${dance.title.replace(/[^\w\- ]+/g, '').trim() || 'dance'}.dance.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    closeMenus();
  },
  import: () => { $('#file-json').click(); closeMenus(); },
  share: async () => {
    try {
      const code = await M.encodeShare(dance);
      const url = `${location.origin}${location.pathname}#d=${code}`;
      try { await navigator.clipboard.writeText(url); toast('Share link copied. Music isn’t included in links.'); }
      catch { prompt('Copy this link:', url); }
    } catch { toast('This browser can’t make share links — use Export instead.'); }
  },
  help: () => { $('#help').showModal(); closeMenus(); },
  'menu-file': (el) => { const m = $('#menu-file'); m.hidden = !m.hidden; },
  'toggle-roster': () => { $('#storyboard').classList.toggle('open'); $('#inspector').classList.remove('open'); },
  'toggle-inspector': () => openCast(true),
};
function openCast(toggle) {
  const el = $('#inspector');
  if (toggle) el.classList.toggle('open'); else el.classList.add('open');
  $('#storyboard').classList.remove('open');
}
// Recoloring someone in a pair/group recolors the whole group so partners stay matched.
function setDancerColor(id, c) {
  const g = M.groupOf(dance, id);
  if (g) { g.color = c; M.recolorGroup(dance, g); } else dance.dancers.find((d) => d.id === id).color = c;
}
function closeMenus() { $('#menu-file').hidden = true; }

function renderTempo() {
  $('#tempo-pop').innerHTML = `
    <h4>Tempo & counts</h4>
    <div class="field-row">
      <label class="field"><span>Beats per minute</span><input class="input" type="number" min="30" max="300" step="1" data-bpm value="${dance.music.bpm}"></label>
      <div class="field"><span>&nbsp;</span><button class="btn" data-action="tap">Tap tempo</button></div>
    </div>
    <p class="muted" id="tap-count">Tap along with the beat, or type the BPM.</p>
    <div class="field" style="margin-top:10px"><span>Count 1 starts at <b>${fmtT(dance.music.offset || 0)}</b></span>
      <button class="btn small" data-action="count-one">Set to playhead (${fmtT(ui.t)})</button>
    </div>
    <p class="muted">Play the music, pause on the first downbeat, then set count 1 there.</p>
    <label class="switch" style="margin-top:10px">Metronome click while playing<input type="checkbox" data-action="metronome" ${ui.metronome ? 'checked' : ''}></label>
    <p class="muted" style="margin-top:8px">Changing the tempo keeps every hold and move the same number of counts.</p>`;
}

// Metronome: short click on every beat, accented on count 1.
let actx;
function click(accent) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(accent ? 0.35 : 0.2, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.06);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + 0.07);
  } catch { /* audio unavailable */ }
}

// Count-sheet captions on the stage.
let lastCaption = '';
function updateCaption() {
  const el = $('#caption');
  const { i, count, lines } = M.activeNotes(dance, ui.t);
  const html = lines.length
    ? `<span class="cap-count">${esc(dance.formations[i].name)} · ct ${count}</span>${lines.map((n) => `<span class="cap-line"><b>${esc(n.counts)}</b> ${esc(n.text)}${n.who?.length ? ` <em>${esc(n.who.map((id) => dance.dancers.find((d) => d.id === id)?.name).filter(Boolean).join(' & '))}</em>` : ''}</span>`).join('')}`
    : '';
  if (html === lastCaption) return;
  lastCaption = html;
  el.innerHTML = html;
  el.hidden = !html;
}

// Tells you how to edit paths, right where you'd look for it.
function updatePathHint() {
  const el = $('#path-hint');
  if (!ui.paths || ui.playing || ui.fi === 0 || !dance) { el.hidden = true; return; }
  el.hidden = false;
  const names = [...ui.sel].map((id) => dance.dancers.find((d) => d.id === id)?.name).filter(Boolean);
  el.innerHTML = names.length
    ? `${icon('route', 14)}<span>Editing ${esc(names.length > 2 ? `${names.length} paths` : `${names.join(' & ')}’s path`)}: drag <b>○</b> to add a bend · drag <b>●</b> to move it · double-click <b>●</b> to remove</span>`
    : `${icon('route', 14)}<span>Click a dancer to edit their path and rhythm into “${esc(cur().name)}”</span>`;
}

/* ================= Events ================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!e.target.closest('.menu-wrap')) closeMenus();
  if (!e.target.closest('#tempo-pop') && !e.target.closest('[data-action=tempo-pop]')) $('#tempo-pop').hidden = true;
  if (!e.target.closest('#coll-pop') && !e.target.closest('[data-action=coll-pop]')) $('#coll-pop').hidden = true;
  if (!e.target.closest('.color-pop') && !e.target.closest('[data-action=color]')) $('.color-pop')?.remove();
  if (el && actions[el.dataset.action] && el.type !== 'checkbox') { actions[el.dataset.action](el); return; }

  const shape = e.target.closest('[data-shape]');
  if (shape) { mutate(() => M.applyShape(dance, ui.fi, selIds(), shape.dataset.shape)); return; }
  const gc = e.target.closest('[data-group-color]');
  if (gc) {
    const g = dance.groups.find((x) => x.id === M.groupOf(dance, [...ui.sel][0])?.id);
    if (g) mutate(() => { g.color = gc.dataset.groupColor; M.recolorGroup(dance, g); });
    return;
  }
  const gm = e.target.closest('[data-group-mode]');
  if (gm) {
    const g = M.groupOf(dance, [...ui.sel][0]);
    if (g) mutate(() => { g.mode = gm.dataset.groupMode; M.recolorGroup(dance, g); });
    return;
  }
  const color = e.target.closest('#insp [data-color]');
  if (color) { mutate(() => { for (const id of ui.sel) setDancerColor(id, color.dataset.color); }); return; }
  const preset = e.target.closest('[data-rpreset]');
  if (preset) { setRhythm((w, n) => M.RHYTHM_PRESETS[preset.dataset.rpreset].fn(n)); return; }
  const st = e.target.closest('[data-style]');
  if (st) {
    mutate(() => { for (const id of selIds()) { const p = cur().pos[id]; p.tr = { ...(p.tr || {}), style: st.dataset.style }; if (st.dataset.style !== 'chasse' && p.tr.facing === 'front' && !p.tr.facingSet) delete p.tr.facing; } });
    return;
  }
  const fc = e.target.closest('[data-facing]');
  if (fc) { mutate(() => { for (const id of selIds()) { const p = cur().pos[id]; p.tr = { ...(p.tr || {}), facing: fc.dataset.facing, facingSet: true }; } }); return; }
  const pace = e.target.closest('[data-pace]');
  if (pace) { mutate(() => { for (const id of ui.sel) cur().pos[id].tm = { ...(cur().pos[id].tm || {}), pace: pace.dataset.pace }; }); return; }

  const card = e.target.closest('.fcard');
  if (card && !e.target.closest('.fedit')) { if (ui.playing) pause(); if (+card.dataset.fi !== ui.fi) goTo(+card.dataset.fi); else { ui.t = M.timing(dance).segs[ui.fi].start; } return; }
  const band = e.target.closest('.fband');
  if (band && !e.target.closest('.handle')) { if (ui.playing) pause(); goTo(+band.dataset.fi); return; }
  const row = e.target.closest('.dancer');
  if (row && !e.target.closest('button')) {
    const id = row.dataset.id;
    const isInput = e.target.tagName === 'INPUT';
    if (isInput && ui.sel.size === 1 && ui.sel.has(id)) return; // already selected: just edit the name
    if (e.shiftKey || e.metaKey) ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id);
    else ui.sel = new Set([id]);
    renderInspector(); refreshGuides(); renderMinimap();
    document.querySelectorAll('.dancer').forEach((r) => r.classList.toggle('sel', ui.sel.has(r.dataset.id)));
    document.querySelectorAll('.group').forEach((g) => g.classList.toggle('sel', [...g.querySelectorAll('.dancer')].every((r) => ui.sel.has(r.dataset.id))));
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.action && actions[t.dataset.action]) { actions[t.dataset.action](t); return; }
  if (t.id === 'title') { mutate(() => { dance.title = t.value.trim() || 'Untitled dance'; }, { render: false }); document.title = `${dance.title} · Dance Studio`; return; }
  if (t.classList.contains('name') && t.closest('.dancer')) {
    const id = t.closest('.dancer').dataset.id;
    mutate(() => { dance.dancers.find((d) => d.id === id).name = t.value.trim() || 'Dancer'; });
    return;
  }
  if (t.dataset.note) {
    const n = cur().notes.find((x) => x.id === t.closest('[data-nid]').dataset.nid);
    if (n) mutate(() => { n[t.dataset.note] = t.value.trim(); });
    return;
  }
  if (t.dataset.bpm !== undefined) { mutate(() => M.setTempo(dance, +t.value || 120)); renderTempo(); return; }
  if (t.dataset.groupName) {
    const g = dance.groups.find((x) => x.id === t.dataset.groupName);
    if (g) mutate(() => { g.name = t.value.trim() || g.name; });
    return;
  }
  if (t.dataset.fedit) {
    const k = t.dataset.fedit;
    mutate(() => {
      if (k === 'name') cur().name = t.value.trim() || `Formation ${ui.fi + 1}`;
      else cur()[k] = clamp(Math.round((+t.value || 0) * 2) / 2, k === 'transition' ? 1 : 0, 512) * M.beatLen(dance);
    });
    return;
  }
  if (t.dataset.stage) { mutate(() => { dance.stage[t.dataset.stage] = clamp(Math.round(+t.value || 0), t.dataset.stage === 'w' ? 4 : 3, 40); }); stage.recenter(); return; }
  if (t.dataset.pos) {
    const id = [...ui.sel][0];
    const b = M.bounds(dance);
    mutate(() => { cur().pos[id][t.dataset.pos] = clamp(+t.value || 0, -b[t.dataset.pos], b[t.dataset.pos]); });
    return;
  }
  if (t.dataset.tm) { if (live) { commit(live); live = null; renderStoryboard(); } }
});
// Rhythm strip: click a count to cycle its speed; drag across counts to paint that speed.
function setRhythm(fn) {
  const prev = dance.formations[ui.fi - 1];
  if (!prev) return;
  const n = Math.max(1, Math.round(cts(prev.transition)));
  mutate(() => {
    for (const id of selIds()) {
      const p = cur().pos[id];
      p.tm = { w: fn(M.toRhythm(p.tm, n), n) };
      if (p.tm.w.every((v) => v === 2)) delete p.tm;
    }
  });
}
let paint = null;
document.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.rcell');
  if (!c) return;
  e.preventDefault();
  const i = +c.dataset.ri;
  const v = (+c.dataset.v + 1) % 4;
  paint = { before: snap(), v, done: new Set() };
  paintCell(i);
});
document.addEventListener('pointermove', (e) => {
  if (!paint) return;
  const c = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rcell');
  if (c) paintCell(+c.dataset.ri);
});
document.addEventListener('pointerup', () => {
  if (!paint) return;
  const before = paint.before;
  paint = null;
  for (const id of selIds()) { const p = cur().pos[id]; if (p.tm?.w?.every((v) => v === 2)) delete p.tm; }
  commit(before);
});
function paintCell(i) {
  if (paint.done.has(i)) return;
  paint.done.add(i);
  const n = Math.max(1, Math.round(cts(dance.formations[ui.fi - 1].transition)));
  for (const id of selIds()) {
    const p = cur().pos[id];
    const w = M.toRhythm(p.tm, n);
    w[i] = paint.v;
    p.tm = { w };
  }
  const cell = $(`.rcell[data-ri="${i}"]`);
  if (cell) { cell.dataset.v = paint.v; cell.querySelector('.rbar').style.height = `${(paint.v / 3) * 100}%`; }
}

// Live range edits for timing: update while dragging, commit on release.
let live = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset.tm) return;
  if (!live) live = snap();
  const v = +t.value / 100;
  const T = dance.formations[ui.fi - 1].transition;
  for (const id of ui.sel) {
    const p = cur().pos[id];
    const tm = { s: 0, e: 1, ...(p.tm || {}) };
    tm[t.dataset.tm] = v;
    if (t.dataset.tm === 's' && tm.e < v + 0.05) tm.e = Math.min(1, v + 0.05);
    if (t.dataset.tm === 'e' && tm.s > v - 0.05) tm.s = Math.max(0, v - 0.05);
    p.tm = { ...tm, s: M.round(tm.s), e: M.round(tm.e) };
  }
  const tm = cur().pos[[...ui.sel][0]].tm;
  $('#tm-s-val').textContent = fmtS(tm.s * T);
  $('#tm-e-val').textContent = fmtS(tm.e * T);
  const win = $('.twin');
  win.style.left = `${tm.s * 100}%`;
  win.style.width = `${(tm.e - tm.s) * 100}%`;
  const other = $(`[data-tm="${t.dataset.tm === 's' ? 'e' : 's'}"]`);
  other.value = Math.round(tm[t.dataset.tm === 's' ? 'e' : 's'] * 100);
});
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type=text], input:not([type]), input[type=number], textarea')) {
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if ($('dialog[open]')) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'a') { e.preventDefault(); actions['select-all'](); return; }
  if (mod) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'n') actions['add-dancer']();
  else if (k === 'f') actions['add-formation']();
  else if (k === 't') setView(ui.view === '3d' ? 'top' : '3d');
  else if (e.key === '[') actions['prev-formation']();
  else if (e.key === ']') actions['next-formation']();
  else if (e.key === 'Escape') actions['clear-sel']();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel.size) {
    const n = ui.sel.size;
    mutate(() => M.removeDancers(dance, [...ui.sel]));
    toast(`Removed ${n} dancer${n > 1 ? 's' : ''}`, true);
  } else if (e.key.startsWith('Arrow') && ui.sel.size) {
    e.preventDefault();
    if (ui.playing) pause();
    parkAtFormation();
    const step = e.shiftKey ? 1 : 0.25;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dz = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    const b = M.bounds(dance);
    mutate(() => { for (const id of ui.sel) { const p = cur().pos[id]; p.x = clamp(M.round(p.x + dx), -b.x, b.x); p.z = clamp(M.round(p.z + dz), -b.z, b.z); } });
  }
});

// Toolbar toggles
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
function setView(v) {
  ui.view = v;
  stage.setView(v);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#minimap').hidden = v !== '3d';
  $('#stage-wrap').classList.toggle('top', v === 'top');
  renderMinimap();
}
$('#minimap').addEventListener('click', () => setView('top'));
document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.toggle;
  ui[k] = !ui[k];
  b.classList.toggle('on', ui[k]);
  b.setAttribute('aria-pressed', ui[k]);
  if (k === 'grid') stage.setGrid(ui.grid);
  if (k === 'labels') stage.showLabels = ui.labels;
  if (k === 'paths') refreshGuides();
}));

// Timeline: scrub on the ruler, resize holds/moves by dragging edges
$('#ruler').addEventListener('pointerdown', (e) => {
  if (ui.playing) pause();
  const r = $('#tl-inner').getBoundingClientRect();
  const seek = (ev) => {
    ui.t = clamp((ev.clientX - r.left - 16) / ui.pps, 0, endTime());
    const fi = fiAt(ui.t);
    if (fi !== ui.fi) { ui.fi = fi; renderStoryboard(); renderInspector(); renderMinimap(); }
    refreshGuides();
  };
  seek(e);
  stage.setGuides([]);
  const up = () => { removeEventListener('pointermove', seek); removeEventListener('pointerup', up); goTo(fiAt(ui.t), { keepTime: true }); };
  addEventListener('pointermove', seek);
  addEventListener('pointerup', up);
});
$('#formations-track').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.handle');
  if (!h) return;
  e.preventDefault();
  if (ui.playing) pause();
  const fi = +h.dataset.fi, key = h.dataset.resize;
  const before = snap(), x0 = e.clientX, v0 = dance.formations[fi][key];
  const move = (ev) => {
    const beat = M.beatLen(dance);
    const v = clamp(Math.round((v0 + (ev.clientX - x0) / ui.pps) / beat) * beat, key === 'hold' ? 0 : beat, 600);
    if (v === dance.formations[fi][key]) return;
    dance.formations[fi][key] = v;
    renderTimeline();
  };
  const up = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    commit(before);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});
$('#tl-body').addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  ui.pps = clamp(ui.pps * (e.deltaY < 0 ? 1.12 : 0.89), 6, 120);
  renderTimeline();
}, { passive: false });

// Storyboard drag-to-reorder
let dragFi = null;
$('#fb-list').addEventListener('dragstart', (e) => {
  const c = e.target.closest('.fcard');
  if (!c || e.target.closest('input')) { e.preventDefault(); return; }
  dragFi = +c.dataset.fi;
  e.dataTransfer.effectAllowed = 'move';
  c.classList.add('dragging');
});
$('#fb-list').addEventListener('dragover', (e) => {
  const c = e.target.closest('.fcard');
  if (dragFi == null || !c) return;
  e.preventDefault();
  document.querySelectorAll('.fcard.drop-before,.fcard.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  const r = c.getBoundingClientRect();
  c.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
});
$('#fb-list').addEventListener('drop', (e) => {
  const c = e.target.closest('.fcard');
  if (dragFi == null || !c) return;
  e.preventDefault();
  const r = c.getBoundingClientRect();
  let to = +c.dataset.fi + (e.clientY < r.top + r.height / 2 ? 0 : 1);
  const from = dragFi;
  if (to > from) to--;
  dragFi = null;
  if (to === from) { renderStoryboard(); return; }
  mutate(() => { const [f] = dance.formations.splice(from, 1); dance.formations.splice(to, 0, f); ui.fi = to; });
  goTo(to);
});
$('#fb-list').addEventListener('dragend', () => { dragFi = null; renderStoryboard(); });

// Files
$('#file-audio').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  await setAudio(file, file.name, true);
  toast(`Added ${file.name}`);
});
$('#file-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = M.validate(JSON.parse(await file.text()));
    d.id = M.uid();
    open(d);
    toast(`Imported “${d.title}”`);
  } catch (err) { toast(`Couldn’t import: ${err.message}`); }
});
document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// Color popover
function openColorPop(anchor, id) {
  $('.color-pop')?.remove();
  const dn = dance.dancers.find((d) => d.id === id);
  const pop = document.createElement('div');
  pop.className = 'color-pop';
  pop.innerHTML = M.PALETTE.map((c) => `<button style="background:${c}" data-c="${c}" class="${c.toLowerCase() === dn.color.toLowerCase() ? 'on' : ''}" aria-label="${c}"></button>`).join('') +
    `<label>Custom <input type="color" value="${dn.color}"></label>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(innerWidth - pop.offsetWidth - 8, r.left)}px`;
  pop.style.top = `${Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6)}px`;
  const set = (c) => mutate(() => setDancerColor(id, c));
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { set(b.dataset.c); pop.remove(); } });
  pop.querySelector('input').addEventListener('change', (e) => { set(e.target.value); pop.remove(); });
}

// Toast
let toastTimer;
function toast(msg, withUndo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-action="undo">Undo</button>' : ''}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), withUndo ? 5000 : 2800);
}

/* ================= Boot ================= */
(async function boot() {
  hydrateIcons();
  renderPlayButton();
  if (location.hash.startsWith('#d=')) {
    try {
      const d = await M.decodeShare(location.hash.slice(3));
      d.id = M.uid();
      history.replaceState(null, '', location.pathname);
      open(d);
      toast(`Opened “${d.title}” — saved to your dances`);
      return;
    } catch { toast('That share link looks broken.'); }
  }
  const last = M.lastId();
  const d = (last && M.loadDance(last)) || M.libraryIds().map(M.loadDance).find(Boolean);
  if (d) open(d);
  else {
    open(M.demoDance());
    toast('This is a demo dance. Press play, or open My dances to start your own.');
  }
})();

// Debug/testing hook
window.__ds = { get dance() { return dance; }, ui, stage, goTo, play, pause, mutate };
