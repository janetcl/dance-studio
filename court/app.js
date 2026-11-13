// Court Mode editor: beats on the left, the 3D court in the middle, the inspector on
// the right and the beat timeline at the bottom.
import { CourtScene, W } from './scene.js?v=20261115f';
import { QUIZ } from './quiz.js?v=20261115f';
import * as THREE from 'three';
import { PRESETS } from './plays.js?v=20261115f';
import {
  THEMES, TEAMS, MATCHUPS, teamsOf, SKINS, HAIRS, STYLES, POSITIONS, PACES, ZONES, FLOORS, PAINTS, LINE_COLORS, BORDERS, courtLook, uid, clampUV, newPlay, validate, flipPlay,
  posAt, moveOf, holderAt, actionOf, timing, beatAt, sample, marksFor, thumbSVG,
  libraryIds, loadPlay, savePlay, deletePlay, lastId, savedAt, encodeShare, decodeShare,
} from './model.js?v=20261115f';
import { Recorder, pickMime, hevcMime, cinematicCamera, QUALITIES, videoSize } from './recorder.js?v=20261115f';
import { icon, hydrateIcons } from '../js/icons.js?v=20261115f';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));

let play;
const ui = {
  beat: -1, T: 0, playing: false, speed: 1, sel: null, endHold: 0, loop: true,
  arrows: true, defense: true, tags: true, tl: 'beats', filter: 'Easy', snap: true,
  mode: 'edit', autoplay: true, queue: [], qi: 0, editPlay: null, upNext: 0,
};
const hist = { undo: [], redo: [] };

// ---------- History and saving ----------
function snapshot() { return JSON.stringify(play); }
function pushUndo(s) { hist.undo.push(s); if (hist.undo.length > 100) hist.undo.shift(); hist.redo = []; }
// Colors and court looks also work while watching: they restyle what's on screen
// (and the plays that follow) without saving anything.
function lookChange(fn) {
  if (ui.mode === 'edit') { mutate(fn); return; }
  fn(play);
  ui.watchLook = { theme: play.theme, teams: play.teams && { ...play.teams }, court: clone(play.court || {}) };
  changed({ save: false });
}
function mutate(fn) { if (ui.mode !== 'edit') return; pushUndo(snapshot()); fn(play); changed(); }
let saveTimer;
function changed({ save = ui.mode === 'edit' } = {}) {
  ui.beat = Math.min(ui.beat, play.beats.length - 1);
  if (ui.sel && !play.players.some((p) => p.id === ui.sel)) ui.sel = null;
  renderAll();
  if (save && ui.mode === 'edit') {
    $('saved').textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { $('saved').textContent = savePlay(play) ? 'Saved' : 'Not saved'; }, 350);
  }
}
function undo() { if (!hist.undo.length) return; hist.redo.push(snapshot()); play = validate(JSON.parse(hist.undo.pop())); changed(); }
function redo() { if (!hist.redo.length) return; hist.undo.push(snapshot()); play = validate(JSON.parse(hist.redo.pop())); changed(); }

function toast(msg, action) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
}

// ---------- Time helpers ----------
const endOf = (k) => (k < 0 ? 0 : timing(play).starts[k] + play.beats[k].dur);
function selectBeat(k, { keepPlaying = false } = {}) {
  ui.beat = Math.max(-1, Math.min(play.beats.length - 1, k));
  if (!keepPlaying) setPlaying(false);
  ui.T = endOf(ui.beat);
  ui.snap = true;
  renderAll();
}
function setPlaying(on) {
  if (on && ui.T >= timing(play).total - 1e-6) { ui.T = 0; ui.snap = true; }
  const was = ui.playing;
  ui.playing = on;
  ui.endHold = 0;
  const b = $('play-btn');
  b.innerHTML = icon(on ? 'pause' : 'play');
  b.title = on ? 'Pause (Space)' : 'Play (Space)';
  if (!on && was) {
    // Pausing lands on the beat you were watching so edits apply to it.
    const { i, t } = beatAt(play, ui.T);
    ui.beat = t < 0.02 && ui.T < 0.02 ? -1 : i;
  }
  renderAll();
}

// ---------- Scene ----------
performance.mark('court:modules');
const scene = new CourtScene($('stage'), $('labels'), {
  onPick(id) { if (ui.mode === 'watch') return; ui.sel = id; if (ui.playing) setPlaying(false); renderSide(); },
  onDragStart(d) {
    if (ui.playing) setPlaying(false);
    if (ui.T !== endOf(ui.beat)) { ui.T = endOf(ui.beat); }
    d.before = snapshot();
    if (d.kind === 'player' && !canDrag(d.id)) d.blocked = true;
  },
  onDragPlayer(id, uv) {
    if (!canDrag(id)) return;
    setSpot(id, clampUV(uv));
    ui.snap = true;
    renderAll({ light: true });
  },
  onDragHandle(h, uv) {
    const m = ensureMove(h.id);
    uv = clampUV(uv);
    if (h.kind === 'add') { m.wp = m.wp || []; m.wp.splice(h.index, 0, uv); h.kind = 'wp'; }
    else m.wp[h.index] = uv;
    ui.snap = true;
    renderAll({ light: true });
  },
  onDragEnd(d) {
    if (d.moved && d.before && d.before !== snapshot()) { pushUndo(d.before); tidy(); changed(); }
    else if (d.kind === 'player' && !d.moved) renderSide();
    if (d.blocked && d.moved) toast(play.defense === 'man' ? 'Defenders follow their player. Switch Defense to “Placed by hand” on the Start card to drag them.' : play.defense === 'zone' ? 'Zone defenders move on their own. Switch Defense to “Placed by hand” on the Start card to drag them.' : 'This player is hidden.');
  },
  onHandleDouble(h) {
    if (h.kind !== 'wp') return;
    mutate(() => { const m = play.beats[ui.beat].moves[h.id]; m.wp.splice(h.index, 1); });
  },
  onEmpty() { if (ui.sel) { ui.sel = null; renderAll(); } },
});

function canDrag(id) {
  if (ui.mode !== 'edit') return false;
  const p = play.players.find((x) => x.id === id);
  return p && (p.side === 'O' || play.defense === 'hand');
}
function ensureMove(id) {
  const b = play.beats[ui.beat];
  return (b.moves[id] = b.moves[id] || {});
}
function setSpot(id, uv) {
  if (ui.beat < 0) { play.start[id] = uv; return; }
  ensureMove(id).to = uv;
}
// Drop moves that no longer change anything.
function tidy() {
  play.beats.forEach((b, k) => {
    for (const [id, m] of Object.entries(b.moves)) {
      const from = posAt(play, id, k - 1);
      if (m.to && Math.abs(m.to[0] - from[0]) < 0.5 && Math.abs(m.to[1] - from[1]) < 0.5 && !(m.wp && m.wp.length)) delete m.to;
      if (m.wp && !m.wp.length) delete m.wp;
      if (m.pace === 'even') delete m.pace;
      if (m.act === 'auto') delete m.act;
      if (!Object.keys(m).length) delete b.moves[id];
    }
  });
}

// ---------- Rendering ----------
const playerOf = (id) => play.players.find((p) => p.id === id);
const nameOf = (id) => { const p = playerOf(id); return p ? (p.side === 'O' ? p.num : 'X' + p.num) : '?'; };
const SPEEDS = [['quick', 'Quick', 1.0], ['normal', 'Normal', 1.6], ['slow', 'Slow', 2.3]];
const speedOf = (d) => (d <= 1.2 ? 'quick' : d <= 1.95 ? 'normal' : 'slow');
const ACT_LABEL = { hold: 'Hold', cut: 'Cut', dribble: 'Dribble', screen: 'Screen' };

function beatSummary(k) {
  const bits = [];
  const ids = play.players.filter((p) => p.side === 'O' || play.defense === 'hand').map((p) => p.id);
  const by = { cut: [], dribble: [], screen: [] };
  for (const id of ids) { const a = actionOf(play, k, id); if (by[a]) by[a].push(nameOf(id)); }
  if (by.dribble.length) bits.push(by.dribble.join(', ') + ' dribble');
  if (by.cut.length) bits.push(by.cut.join(', ') + ' cut');
  if (by.screen.length) bits.push(by.screen.join(', ') + ' screen');
  const ev = play.beats[k].ball, h = holderAt(play, k);
  if (ev && h) bits.push(ev.kind === 'pass' ? `${nameOf(h)} → ${nameOf(ev.to)}` : `${nameOf(h)} shoots`);
  return bits.join(' · ') || 'everyone holds';
}

function renderCards() {
  const list = $('cards');
  $('beat-count').textContent = play.beats.length;
  const items = [`<li><button class="card${ui.beat === -1 && !ui.playing ? ' on' : ''}" data-beat="-1">${thumbSVG(play, -1, { w: 84, marks: false })}<span class="meta"><span class="k">START</span><span class="n">Starting spots</span><span class="s">${play.size} v ${play.size} · ${esc(teamsOf(play).O.name)} vs ${esc(teamsOf(play).D.name.toLowerCase())}</span></span></button></li>`];
  const cur = ui.playing ? beatAt(play, ui.T).i : -2;
  play.beats.forEach((b, k) => {
    items.push(`<li><button class="card${ui.beat === k && !ui.playing ? ' on' : ''}${cur === k ? ' playing' : ''}" data-beat="${k}">${thumbSVG(play, k, { w: 84 })}<span class="meta"><span class="k">BEAT ${k + 1}</span><span class="n">${esc(b.name || 'Beat ' + (k + 1))}</span><span class="s">${esc(beatSummary(k))}</span></span></button></li>`);
  });
  list.innerHTML = items.join('');
}

function renderRoster() {
  const t = teamsOf(play);
  $('size-label').textContent = `${play.size} v ${play.size}`;
  $('roster').innerHTML = play.players.filter((p) => p.side === 'O' || play.defense !== 'none').map((p) => {
    const k = t[p.side];
    const light = k.jersey.toUpperCase() > '#E0E0E0';
    return `<button class="pchip ${p.side}${ui.sel === p.id ? ' on' : ''}${light ? ' light' : ''}" data-sel="${p.id}" style="background:${k.jersey};color:${k.num}" aria-pressed="${ui.sel === p.id}"><b>${p.side === 'O' ? esc(p.num) : 'X' + esc(p.num)}</b><span>${p.side === 'O' ? esc(p.pos) : play.defense === 'zone' ? 'zone' : play.defense === 'hand' ? 'D' : 'on ' + esc(nameOf(p.guard))}</span></button>`;
  }).join('');
}

function opt(label, attrs, on, disabled) {
  return `<button class="opt" ${attrs} aria-pressed="${!!on}"${disabled ? ' disabled' : ''}>${label}</button>`;
}

// One click: new teams, floor, paint, lines and surroundings that go together.
function shuffleLook() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ids = Object.keys(TEAMS), cities = ids.filter((id) => TEAMS[id].city);
  const O = Math.random() < 0.7 ? pick(cities) : pick(ids);
  let D = pick(ids);
  while (D === O || (TEAMS[D].city && TEAMS[D].city === TEAMS[O].city)) D = pick(ids);
  const scene = pick(['gym', 'gym', 'studio', 'arena', 'park', 'garden', 'beach', 'pier']);
  const court = { scene };
  const homeSide = TEAMS[O].city && Math.random() < 0.7 ? 'O' : TEAMS[D].city ? 'D' : null;
  if (homeSide) court.home = homeSide;
  if (scene === 'park' || scene === 'beach') { court.floor = 'blacktop'; court.lines = '#FFFFFF'; }
  else if (scene === 'pier') { court.floor = 'blacktop'; court.lines = '#E2C04E'; court.paint = '#E8D696'; court.border = '#3A3D41'; }
  else if (scene === 'garden') court.floor = 'maple';
  else court.floor = pick(['maple', 'maple', 'honey', 'walnut', 'gray']);
  if (!homeSide && scene !== 'park' && scene !== 'pier') court.paint = pick(PAINTS);
  if (scene !== 'park' && scene !== 'pier' && Math.random() < 0.15) court.lines = '#F2B705';
  lookChange(() => { play.teams = { O, D }; play.court = court; });
  refreshPop();
  toast(`${TEAMS[O].name} vs ${TEAMS[D].name.toLowerCase()} · ${{ gym: 'gym', studio: 'studio', arena: 'dark arena', park: 'NYC park', garden: 'NYC arena', beach: 'Hawaii beach', pier: 'Brooklyn pier' }[scene]}`, { label: 'Undo', run: undo });
}

function teamControls() {
  const tm = teamsOf(play);
  const c = play.court || {};
  const sw = (side, id, t) => `<button class="team-sw" data-team="${side}" data-v="${id}" aria-pressed="${tm.ids[side] === id}" title="${esc(t.name)}" aria-label="${side === 'O' ? 'Offense' : 'Defense'}: ${esc(t.name)}"><span style="background:${t.jersey};color:${t.num}">${t.city ? esc(t.city.split(' ').map((w) => w[0]).join('').slice(0, 2)) : ''}</span></button>`;
  const row = (side) => `<div class="team-row">${Object.entries(TEAMS).map(([id, t]) => sw(side, id, t)).join('')}</div>`;
  return `<div class="court-ctl">
    <div class="row"><span class="sub grow">Offense: <b>${esc(tm.O.name)}</b></span></div>${row('O')}
    <div class="row"><span class="sub grow">Defense: <b>${esc(tm.D.name)}</b></span></div>${row('D')}
    <div class="opts"><button class="opt" data-act="swap-teams">⇄ Swap offense and defense</button></div>
    <span class="sub">Home court</span><div class="opts">${opt(esc(tm.O.name), 'data-act="home" data-v="O"', c.home === 'O')}${opt(esc(tm.D.name), 'data-act="home" data-v="D"', c.home === 'D')}${opt('Neutral', 'data-act="home" data-v=""', !c.home)}</div>
    <p class="help">The home team's colors and city go on the court.</p>
  </div>`;
}

function courtControls() {
  const c = play.court || {};
  const L = courtLook(play);
  const sw = (attr, v, color, label, on) => `<button class="swatch" ${attr} data-v="${v}" style="background:${color}" aria-label="${esc(label)}" aria-pressed="${on}"></button>`;
  return `<div class="court-ctl">
    <span class="sub">Floor</span><div class="opts">${Object.entries(FLOORS).map(([k, f]) => opt(`<span class="sw" style="background:${f.thumb}"></span> ${f.name}`, `data-court="floor" data-v="${k}"`, L.floor === k)).join('')}</div>
    <span class="sub">Paint</span><div class="swatches">${opt('Team', 'data-court="paint" data-v="__team"', c.paint === undefined || c.paint === null)}${PAINTS.map((x) => sw('data-court="paint"', x, x, 'Paint ' + x, c.paint === x)).join('')}${opt('None', 'data-court="paint" data-v=""', c.paint === '')}</div>
    <span class="sub">Lines</span><div class="swatches">${Object.entries(LINE_COLORS).map(([x, n]) => sw('data-court="lines"', x, x, n + ' lines', L.lines === x)).join('')}</div>
    <span class="sub">Border</span><div class="swatches">${opt('Match paint', 'data-court="border" data-v=""', !c.border)}${BORDERS.map((x) => sw('data-court="border"', x, x, 'Border ' + x, c.border === x)).join('')}</div>
    <label class="sub" for="court-label">Baseline text</label><input id="court-label" type="text" maxlength="28" placeholder="e.g. Tigers" value="${esc(c.label || '')}" data-court-label />
    <span class="sub">Around the court</span><div class="opts">${opt('Gym', 'data-court="scene" data-v="gym"', L.scene === 'gym')}${opt('Light studio', 'data-court="scene" data-v="studio"', L.scene === 'studio')}${opt('Dark arena', 'data-court="scene" data-v="arena"', L.scene === 'arena')}${opt('NYC park', 'data-court="scene" data-v="park"', L.scene === 'park')}${opt('NYC arena', 'data-court="scene" data-v="garden"', L.scene === 'garden')}${opt('Hawaii beach', 'data-court="scene" data-v="beach"', L.scene === 'beach')}${opt('Brooklyn pier', 'data-court="scene" data-v="pier"', L.scene === 'pier')}</div>
  </div>`;
}

function renderInspector() {
  const el = $('insp');
  const p = ui.sel && playerOf(ui.sel);
  const k = ui.beat;
  const t = teamsOf(play);
  let h = '';
  if (p) {
    const kit = t[p.side];
    h += `<div class="who"><span class="dot" style="background:${kit.jersey};color:${kit.num}">${p.side === 'O' ? esc(p.num) : 'X' + esc(p.num)}</span><div><h3>${p.side === 'O' ? 'Offense ' + esc(p.num) + ' · ' + esc(p.pos) : 'Defense X' + esc(p.num)}</h3><div class="sub">${k < 0 ? 'Starting spot' : `Beat ${k + 1}: ${esc(play.beats[k].name)}`}</div></div></div>`;
    const draggable = canDrag(p.id);
    if (p.side === 'D' && play.defense === 'zone') {
      h += `<p class="note">X${esc(p.num)} plays the ${esc(ZONES[play.zone].name)}. Zone defenders slide with the ball, the closest one steps out on it, and the others pick up anyone cutting into their area. Change the zone on the Start card.</p>`;
    } else if (p.side === 'D' && play.defense === 'man') {
      h += `<div class="group"><label class="label" for="guard">Guards</label><select id="guard" data-field="guard">${play.players.filter((x) => x.side === 'O').map((o) => `<option value="${o.id}"${o.id === p.guard ? ' selected' : ''}>${esc(o.num)} · ${esc(o.pos)}</option>`).join('')}</select><p class="help">Defenders follow their player automatically, chase cutters and get caught on screens. To drag them yourself, set Defense to “Placed by hand” on the Start card.</p></div>`;
    } else if (k < 0) {
      h += `<p class="note">Drag ${esc(nameOf(p.id))} on the court to set where they start.</p>`;
      if (p.side === 'O') h += `<div class="group"><span class="label">Ball</span><div class="opts">${opt(play.ball === p.id ? 'Starts with the ball' : 'Give them the ball', `data-act="start-ball" data-id="${p.id}"`, play.ball === p.id)}</div></div>`;
    } else if (draggable) {
      const m = moveOf(play, k, p.id);
      const act = actionOf(play, k, p.id);
      h += `<div class="group"><span class="label">This beat</span><div class="opts">${opt(m.moving ? (act === 'dribble' ? 'Dribble' : 'Cut') : 'Hold', `data-act="act" data-v="auto"`, m.act !== 'screen')}${opt('Screen', `data-act="act" data-v="screen"`, m.act === 'screen')}</div><p class="help">${m.moving ? (m.act === 'screen' ? 'Moves to the spot, then sets a screen.' : 'Drag the white rings on the path to bend it. Double-click a bend to remove it.') : 'Drag them on the court to make them move this beat.'}</p></div>`;
      if (m.moving) {
        h += `<div class="group"><span class="label">Pace</span><div class="opts">${Object.entries(PACES).map(([key, v]) => opt(v.label, `data-act="pace" data-v="${key}"`, m.pace === key)).join('')}</div></div>`;
        h += `<div class="group"><span class="label">Path</span><div class="row"><span class="grow">${m.wp.length ? m.wp.length + (m.wp.length > 1 ? ' bends' : ' bend') : 'Straight'}</span>${m.wp.length ? '<button class="btn small" data-act="straighten">Straighten</button>' : ''}<button class="btn small" data-act="stay">Stay put</button></div></div>`;
      }
      if (holderAt(play, k) === p.id) {
        const ev = play.beats[k].ball;
        const mates = play.players.filter((x) => x.side === 'O' && x.id !== p.id);
        h += `<div class="group"><span class="label">Ball</span><div class="opts">${opt('Keep it', 'data-act="ball" data-v="keep"', !ev)}${mates.map((x) => opt('Pass to ' + esc(x.num), `data-act="ball" data-v="pass" data-to="${x.id}"`, ev && ev.kind === 'pass' && ev.to === x.id)).join('')}${opt('Shoot', 'data-act="ball" data-v="shot"', ev && ev.kind === 'shot')}</div>`;
        if (ev) {
          const when = ev.t0 < 0.25 ? 'early' : ev.t0 < 0.5 ? 'mid' : 'late';
          h += `<div class="opts">${[['early', 'Right away'], ['mid', 'Midway'], ['late', 'Late']].map(([v, l]) => opt(l, `data-act="when" data-v="${v}"`, when === v)).join('')}</div>`;
        } else if (!m.moving) h += `<label class="row"><input type="checkbox" data-act="dribble"${play.beats[k].dribble ? ' checked' : ''} /> Dribble in place</label>`;
        h += '</div>';
      }
    }
    if (p.side === 'O' && k >= 0) h += `<div class="group"><span class="label">Quiz</span><button class="btn small" data-act="make-question">Make a quiz question as #${esc(p.num)} here</button><p class="help">The question freezes this play on beat ${k + 1}. To set up the read, place defenders by hand first (Start card → Defense).</p></div>`;
    if (p.side === 'O') h += `<div class="group"><label class="label" for="ppos">Position</label><select id="ppos" data-field="pos">${POSITIONS.map((x) => `<option${x === p.pos ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`;
    h += `<div class="group"><span class="label">Look</span>
      <div class="swatches" role="group" aria-label="Skin tone">${SKINS.map((c) => `<button class="swatch" data-look="skin" data-v="${c}" style="background:${c}" aria-label="Skin tone ${c}" aria-pressed="${p.look.skin === c}"></button>`).join('')}</div>
      <div class="swatches" role="group" aria-label="Hair color">${HAIRS.map((c) => `<button class="swatch" data-look="hair" data-v="${c}" style="background:${c}" aria-label="Hair color ${c}" aria-pressed="${p.look.hair === c}"></button>`).join('')}</div>
      <div class="row"><label for="hstyle" class="grow">Hair</label><select id="hstyle" data-look-select="style" style="width:auto">${Object.entries(STYLES).map(([v, l]) => `<option value="${v}"${p.look.style === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="row"><label for="hgt" class="grow">Height</label><input id="hgt" type="range" min="0.9" max="1.14" step="0.01" value="${p.look.height || 1}" data-look-range="height" /></div></div>`;
  } else if (k < 0) {
    h += `<div><h3>Start</h3><p class="help" style="font-size:12px;color:var(--ink-2);margin:4px 0 0">Where everyone lines up before the first beat. Drag players to move them.</p></div>`;
    h += `<div class="group"><label class="label" for="defmode">Defense</label><select id="defmode" data-field="defense"><option value="man"${play.defense === 'man' ? ' selected' : ''}>Man to man (follows automatically)</option><option value="zone"${play.defense === 'zone' ? ' selected' : ''}>Zone (moves automatically)</option><option value="hand"${play.defense === 'hand' ? ' selected' : ''}>Placed by hand</option><option value="none"${play.defense === 'none' ? ' selected' : ''}>No defense</option></select></div>`;
    if (play.defense === 'zone') h += `<div class="group"><span class="label">Zone</span><div class="opts">${Object.entries(ZONES).map(([key, z]) => opt(esc(z.name) + (key === '2-3' ? ' · most common' : ''), `data-act="zone" data-v="${key}"`, play.zone === key)).join('')}</div><p class="help">2-3 protects the paint and the corners. 3-2 pressures shooters up top and on the wings. 1-3-1 traps the wings and takes away the middle.</p></div>`;
    h += `<div class="group"><span class="label">Ball starts with</span><div class="opts">${play.players.filter((x) => x.side === 'O').map((x) => opt(esc(x.num), `data-act="start-ball" data-id="${x.id}"`, play.ball === x.id)).join('')}</div></div>`;
    h += `<div class="group"><span class="label">Teams</span>${teamControls()}</div>`;
    h += `<div class="group"><span class="label">Court</span>${courtControls()}</div>`;
    h += `<div class="group"><span class="label">Whole play</span><div class="opts"><button class="opt" data-action="flip">Flip left ↔ right</button></div></div>`;
  } else {
    const b = play.beats[k];
    const hld = holderAt(play, k);
    h += `<div class="group"><label class="label" for="bname">Beat ${k + 1}</label><input id="bname" type="text" data-beat-field="name" value="${esc(b.name)}" /></div>`;
    const sp = speedOf(b.dur);
    h += `<div class="group"><span class="label">Speed</span><div class="opts">${SPEEDS.map(([k2, l, d]) => opt(l, `data-act="speed-beat" data-v="${d}"`, sp === k2)).join('')}</div><p class="help">How long this beat takes when the play runs. Use Quick for a pass, Slow when a lot happens at once.</p></div>`;
    h += `<div class="group"><label class="label" for="btext">What happens</label><textarea id="btext" data-beat-field="text" placeholder="e.g. 5 sets a ball screen for 1">${esc(b.text)}</textarea></div>`;
    h += `<div class="group"><span class="label">Ball</span><p class="help">${hld ? `${esc(nameOf(hld))} has it${b.ball ? (b.ball.kind === 'pass' ? ` and passes to ${esc(nameOf(b.ball.to))}` : ' and shoots') : ''}. Select ${esc(nameOf(hld))} to change that.` : 'The shot is up.'}</p></div>`;
    h += `<p class="note">Drag players to where they end up on this beat. Select a player to set screens, pace, passes and shots.</p>`;
    h += `<div class="row"><button class="btn small" data-act="dup-beat">Duplicate</button><button class="btn small danger" data-act="del-beat"${play.beats.length < 2 ? ' disabled' : ''}>Delete beat</button></div>`;
  }
  el.innerHTML = h;
}

function renderTimeline() {
  const { starts, total } = timing(play);
  $('time-total').textContent = fmt(total);
  const cur = beatAt(play, ui.T).i;
  const onIdx = ui.playing ? cur : ui.beat;
  $('blocks').innerHTML = play.beats.map((b, k) => `<button class="block${onIdx === k ? ' on' : ''}" data-beat="${k}" style="flex:${b.dur} 1 0"><b>${k + 1} · ${esc(b.name)}</b><span>${esc(beatSummary(k))}</span></button>`).join('');
  const ticks = [];
  for (let s = 0; s <= Math.floor(total); s++) ticks.push(`<span style="left:${(s / total) * 100}%">${s}s</span>`);
  $('ruler').innerHTML = ticks.join('');
  // Lanes
  const lanes = $('lanes');
  lanes.hidden = ui.tl !== 'lanes';
  $('blocks').hidden = ui.tl === 'lanes';
  document.querySelectorAll('[data-tl]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tl === ui.tl)));
  if (ui.tl === 'lanes') {
    const rows = play.players.filter((p) => p.side === 'O' || play.defense === 'hand').map((p) => {
      const cells = play.beats.map((b, k) => {
        const a = actionOf(play, k, p.id);
        let label = ACT_LABEL[a];
        const ev = b.ball;
        if (holderAt(play, k) === p.id && ev) label += ev.kind === 'pass' ? ` → pass to ${nameOf(ev.to)}` : ' → shoot';
        return `<button class="cell ${a}${onIdx === k ? ' cur' : ''}" data-beat="${k}" data-sel="${p.id}" style="flex:${b.dur} 1 0" title="${esc(nameOf(p.id))}: ${esc(label)}">${esc(nameOf(p.id))} · ${esc(label)}</button>`;
      }).join('');
      return `<div class="lane"><div class="lane-cells">${cells}</div></div>`;
    });
    const ball = play.beats.map((b, k) => {
      const h = holderAt(play, k);
      const ev = b.ball;
      const label = !h ? 'in the air' : ev ? (ev.kind === 'pass' ? `${nameOf(h)} → ${nameOf(ev.to)}` : `${nameOf(h)} shoots`) : `with ${nameOf(h)}`;
      return `<button class="cell ball${ev ? ' ev' : ''}${onIdx === k ? ' cur' : ''}" data-beat="${k}" style="flex:${b.dur} 1 0">Ball · ${esc(label)}</button>`;
    }).join('');
    lanes.innerHTML = rows.join('') + `<div class="lane"><div class="lane-cells">${ball}</div></div>`;
  }
}

// Drag to look around in Your eyes. A double-click (without dragging) or Reset view looks back at the play.
{
  let drag = null, lastMoved = 0;
  addEventListener('pointerdown', (e) => {
    if (ui.mode !== 'quiz' || !ui.quiz || ui.quiz.cam !== 'pov' || ui.rec || e.button !== 0) return;
    if (!e.target.closest || !e.target.closest('#stage')) return;
    drag = { x: e.clientX, y: e.clientY, yaw: ui.quiz.yaw || 0, pitch: ui.quiz.pitch || 0, moved: 0 };
    e.stopPropagation();
  }, true);
  addEventListener('pointermove', (e) => {
    if (!drag || !ui.quiz) return;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
    ui.quiz.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
    ui.quiz.pitch = Math.max(-0.7, Math.min(0.7, drag.pitch + (e.clientY - drag.y) * 0.004));
    $('look-reset').hidden = false;
  }, true);
  const end = () => { if (drag) lastMoved = drag.moved; drag = null; };
  addEventListener('pointerup', end, true);
  addEventListener('pointercancel', end, true);
  addEventListener('dblclick', (e) => {
    if (ui.mode !== 'quiz' || !ui.quiz || ui.quiz.cam !== 'pov' || !e.target.closest || !e.target.closest('#stage')) return;
    if (lastMoved > 6) return; // two quick drags are not a double-click
    resetLook();
  }, true);
}
function resetLook() { if (!ui.quiz) return; ui.quiz.yaw = 0; ui.quiz.pitch = 0; $('look-reset').hidden = true; }

// The overhead map in Your eyes: everyone's spot, the ball, you, and where you're looking.
function updateRadar(f) {
  const svg = $('radar-dots');
  if (!svg) return;
  const t = teamsOf(play), you = ui.quiz.scene.you;
  const ballUV = [scene.ball.position.x / 0.03048 + 250, scene.ball.position.z / 0.03048 + 235];
  let h = '';
  for (const p of play.players) {
    const uv = f.pos[p.id];
    if (!uv || (p.side === 'D' && (!ui.defense || play.defense === 'none'))) continue;
    const k = t[p.side], me = p.id === you;
    h += `<circle cx="${uv[0].toFixed(0)}" cy="${uv[1].toFixed(0)}" r="${me ? 22 : p.side === 'O' ? 17 : 14}" fill="${k.jersey}" stroke="${me ? '#E0552E' : '#fff'}" stroke-width="${me ? 7 : 3}"/>`;
    if (p.side === 'O') h += `<text x="${uv[0].toFixed(0)}" y="${(uv[1] + 7).toFixed(0)}" text-anchor="middle" font-family="Geist,sans-serif" font-weight="700" font-size="20" fill="${k.num}">${p.num}</text>`;
  }
  h += `<circle cx="${ballUV[0].toFixed(0)}" cy="${ballUV[1].toFixed(0)}" r="9" fill="#D9631E" stroke="#1D1A17" stroke-width="2"/>`;
  svg.innerHTML = h;
  // View cone from your spot toward where the camera looks.
  const me = f.pos[you];
  const dir = new THREE.Vector3(); scene.camera.getWorldDirection(dir);
  const a = Math.atan2(dir.z, dir.x), spread = 0.55, L = 150;
  const p1 = [me[0] + Math.cos(a - spread) * L, me[1] + Math.sin(a - spread) * L], p2 = [me[0] + Math.cos(a + spread) * L, me[1] + Math.sin(a + spread) * L];
  $('radar-cone').setAttribute('d', `M${me[0]} ${me[1]}L${p1[0]} ${p1[1]}A${L} ${L} 0 0 1 ${p2[0]} ${p2[1]}Z`);
}

// ---------- Question maker ----------
function openMaker() {
  const id = ui.sel, k = ui.beat;
  const p = playerOf(id);
  if (!p || k < 0) return;
  const f = $('maker-form');
  f.reset();
  f.elements.title.value = `${play.name}: #${p.num}`;
  f.elements.prompt.value = `You’re #${p.num}. `;
  f.elements.rule.value = '';
  $('maker-who').textContent = `You’re #${p.num} · ${play.name} · beat ${k + 1}: ${play.beats[k].name}`;
  $('qmaker').showModal();
  f.elements.prompt.focus();
  f.elements.prompt.setSelectionRange(f.elements.prompt.value.length, f.elements.prompt.value.length);
}
function saveMaker() {
  const f = $('maker-form'), fd = new FormData(f);
  const choices = [0, 1, 2, 3].map((k) => ({ label: String(fd.get('c' + k) || '').trim(), why: String(fd.get('w' + k) || '').trim(), correct: fd.get('correct') === String(k) })).filter((c) => c.label);
  const prompt = String(fd.get('prompt') || '').trim();
  const err = !prompt ? 'Write the question first.' : choices.length < 2 ? 'Add at least two choices.' : !choices.some((c) => c.correct) ? 'Mark which choice is right.' : '';
  $('maker-err').textContent = err;
  if (err) return;
  const at = { start: 0.12, middle: 0.5, end: 0.92 }[fd.get('freeze')] || 0.92;
  const data = clone(play);
  delete data.savedAt;
  const q = {
    id: 'my-' + uid(), mine: true, title: String(fd.get('title') || '').trim() || play.name, you: ui.sel,
    freeze: [ui.beat, at], prompt, choices: choices.map((c) => ({ label: c.label, why: c.why || (c.correct ? 'This is the right read.' : 'Not the best read here.'), ...(c.correct ? { correct: true } : {}) })),
    rule: String(fd.get('rule') || '').trim() || 'Read the defense, then decide.', playData: data,
  };
  saveMyQuestions([...myQuestions(), q]);
  $('qmaker').close();
  toast(`Saved “${q.title}” to My questions`, { label: 'Try it', run: () => { enterQuiz(allQ().length - 1); } });
}
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function squeeze(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  try { return 'z' + b64u(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())); } catch { return 'j' + b64u(raw); }
}
async function unsqueeze(code) {
  const bytes = unb64u(code.slice(1));
  const raw = code[0] === 'z' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
async function shareQuestion(q) {
  const code = await squeeze(q);
  const url = `${location.origin}${location.pathname}?mode=quiz#qz=${code}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied. It opens straight into this question.'); } catch { prompt('Copy this link', url); }
}
async function openSharedQuestion(code) {
  const q = await unsqueeze(code);
  if (!q || !q.playData || !Array.isArray(q.choices) || !q.you) throw new Error('bad question');
  q.playData = validate(q.playData);
  q.mine = true;
  const list = myQuestions();
  if (!list.some((x) => x.id === q.id)) saveMyQuestions([...list, q]);
  history.replaceState(null, '', location.pathname + location.search);
  return allQ().findIndex((x) => x.id === q.id);
}

// ---------- Quiz: one decision, seen through one player's eyes ----------
const QUIZ_KEY = 'court.quiz', MYQ_KEY = 'court.myQuestions';
const myQuestions = () => { try { return JSON.parse(localStorage.getItem(MYQ_KEY) || '[]'); } catch { return []; } };
const saveMyQuestions = (list) => { try { localStorage.setItem(MYQ_KEY, JSON.stringify(list)); return true; } catch { return false; } };
const allQ = () => [...QUIZ, ...myQuestions()];
const quizScores = () => { try { return JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}'); } catch { return {}; } };
function enterQuiz(start) {
  if (ui.mode === 'watch') exitWatch();
  savePlay(play);
  ui.editPlay = clone(play);
  ui.mode = 'quiz';
  ui.saved = { loop: ui.loop, arrows: ui.arrows };
  ui.loop = false;
  if (start === undefined) { ui.upNext = pickUpNext(); startQuiz(ui.upNext, { hold: true }); openQuizHome(); return; }
  startQuiz(start);
}
function exitQuiz() {
  if (ui.mode !== 'quiz') return;
  ui.mode = 'edit';
  ui.loop = ui.saved ? ui.saved.loop : true;
  ui.arrows = ui.saved ? ui.saved.arrows : true;
  ui.quiz = null;
  ui.speed = 1; $('speed').textContent = '1×';
  $('quiz-card').hidden = true; $('quiz-banner').hidden = true; $('qhome').hidden = true;
  povOff();
  scene.setView('broadcast'); markView();
  play = validate(ui.editPlay);
  ui.sel = null; ui.beat = -1; ui.T = 0; ui.snap = true;
  setPlaying(false);
  changed({ save: false });
}
function startQuiz(i, { hold = false } = {}) {
  const Q = allQ();
  i = ((i % Q.length) + Q.length) % Q.length;
  const sc = Q[i];
  const preset = sc.playData || PRESETS.find((p) => p.id === sc.play);
  play = validate(clone(preset));
  const look = ui.watchLook || ui.editPlay;
  if (look) { play.theme = look.theme; if (look.teams) play.teams = { ...look.teams }; else delete play.teams; play.court = clone(look.court || {}); }
  const { starts } = timing(play);
  const freezeT = starts[sc.freeze[0]] + play.beats[sc.freeze[0]].dur * sc.freeze[1];
  ui.quiz = { i, scene: sc, freezeT, phase: 'play', cam: 'pov', look: null, yaw: 0, pitch: 0, aimYaw: undefined };
  $('look-reset').hidden = true;
  ui.sel = sc.you; ui.arrows = false; ui.T = 0; ui.snap = true; ui.endHold = 0;
  ui.speed = 1; $('speed').textContent = '1×';
  const me = play.players.find((p) => p.id === sc.you);
  // The pill already says who you are; the banner is just a short hint that fades away.
  $('quiz-banner').textContent = 'Drag to look around';
  $('quiz-banner').hidden = false;
  clearTimeout(ui.bannerT); ui.bannerT = setTimeout(() => { $('quiz-banner').hidden = true; }, 3500);
  $('quiz-card').hidden = true;
  renderAll();
  quizCam('pov', { silent: true });
  updateQPill();
  if (hold) { $('quiz-banner').hidden = true; setPlaying(false); return; }
  setPlaying(true);
}
// The pill at the top of the court: where you are, and the way back to every question.
function updateQPill() {
  const q = ui.quiz;
  if (!q) return;
  const list = quizFiltered(), k = list.findIndex(({ i }) => i === q.i);
  const me = play.players.find((p) => p.id === q.scene.you);
  $('qpill-label').innerHTML = `<b>${k >= 0 ? k + 1 : '·'} / ${list.length}</b><span class="qp-t">${esc(q.scene.title || '')}</span><span class="qp-me">You’re #${esc(me ? me.num : '')}</span><span class="qp-caret">▾</span>`;
}
function stepQuiz(dir) {
  const list = quizFiltered();
  if (!list.length) return;
  const k = list.findIndex(({ i }) => i === (ui.quiz ? ui.quiz.i : -1));
  const t = list[((k < 0 ? 0 : k + dir) + list.length) % list.length];
  closeQuizHome({ resume: false });
  startQuiz(t.i);
}
// Up next: something you haven't tried, else something you missed, else anything. Random,
// so opening the quiz doesn't always land on the same question.
function pickUpNext() {
  const list = quizFiltered();
  if (!list.length) return 0;
  const sc = quizScores(), cur = ui.quiz ? ui.quiz.i : -1;
  const fresh = list.filter(({ x }) => !(x.id in sc)), missed = list.filter(({ x }) => sc[x.id] === false);
  let pool = fresh.length ? fresh : missed.length ? missed : list;
  if (pool.length > 1) pool = pool.filter(({ i }) => i !== cur);
  return pool[Math.floor(Math.random() * pool.length)].i;
}
const firstSentence = (t) => { const m = String(t || '').match(/^.*?[.?!](\s|$)/); return (m ? m[0] : t).trim(); };
function renderQuizHome() {
  const Q = allQ(), sc = quizScores();
  const f = ui.quizFilter || (ui.quizFilter = { group: 'All', level: 'All' });
  const list = quizFiltered();
  if (ui.upNext == null || !list.some(({ i }) => i === ui.upNext)) ui.upNext = pickUpNext();
  const x = Q[ui.upNext];
  const missed = list.filter(({ x: y }) => sc[y.id] === false);
  if (x) {
    const m = quizMeta(x);
    const st = !(x.id in sc) ? 'New to you' : sc[x.id] ? 'You got this one before' : 'You missed this one';
    $('qh-next').innerHTML = `<div class="qh-thumb">${thumbSVG({ ...m.pre, theme: play.theme, teams: play.teams, court: play.court }, x.freeze[0], { w: 190 })}</div>
      <div class="qh-copy"><span class="qh-k">Up next · ${st}</span><h2 id="qh-title">${esc(x.title || m.pre.name)}</h2><p>You’re #${esc(m.num)} · ${esc(m.level)}. ${esc(firstSentence(x.prompt))}</p>
      <div class="qh-acts"><button class="btn primary qh-go" id="qh-start" data-action="qh-start">Start <kbd>Space</kbd></button><button class="btn qh-btn" data-action="qh-shuffle">Surprise me</button>${missed.length ? `<button class="btn qh-btn" data-action="qh-missed">Retry missed (${missed.length})</button>` : ''}</div></div>`;
  } else $('qh-next').innerHTML = '<p class="qh-empty">No questions match. Try another filter.</p>';
  const done = Q.filter((y) => y.id in sc).length, right = Q.filter((y) => sc[y.id]).length;
  $('qh-stats').innerHTML = `<span class="qh-k">Your reads</span><div class="qh-big"><b>${right}</b><span>${done ? `right of ${done} tried` : 'none tried yet'}</span></div><div class="qh-bar" aria-hidden="true">${Q.map((y) => `<i class="${y.id in sc ? (sc[y.id] ? 'ok' : 'no') : ''}"></i>`).join('')}</div><span class="qh-sub">${Q.length - done} still new · ${Q.length} questions</span>`;
  const all = allQ().map((y) => quizMeta(y));
  const cnt = (g) => all.filter((m) => g === 'All' || m.group === g).length;
  const chip = (k, v, label) => `<button data-qhf="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${label}</button>`;
  $('qh-pos').innerHTML = [['All', 'Any spot'], ['Guards', 'Guard'], ['Wings', 'Wing'], ['Bigs', 'Big']].map(([v, l]) => chip('group', v, `${l} <span>${cnt(v)}</span>`)).join('');
  $('qh-level').innerHTML = ['All', 'Beginner', 'Intermediate', 'Advanced', ...(myQuestions().length ? ['Mine'] : [])].map((v) => chip('level', v, v)).join('');
  $('qh-grid').innerHTML = list.length ? list.map(({ x: y, i, m }) => {
    const s = y.id in sc ? (sc[y.id] ? '<span class="qs ok">Right</span>' : '<span class="qs no">Missed</span>') : '<span class="qs">New</span>';
    return `<li><button class="qh-tile${i === ui.upNext ? ' next' : ''}" data-qh="${i}">${thumbSVG({ ...m.pre, theme: play.theme, teams: play.teams, court: play.court }, y.freeze[0], { w: 64 })}<span class="t"><b>${esc(y.title || m.pre.name)}</b><span>You’re #${esc(m.num)} · ${esc(m.level)}</span>${s}</span></button></li>`;
  }).join('') : '<li class="qh-empty">No questions match. Try another filter.</li>';
}
function openQuizHome() {
  if (ui.mode !== 'quiz') return;
  store('court.quizIntro', '1');
  ui.homeResume = ui.playing;
  setPlaying(false);
  // Don't offer the question you just answered as up next.
  if (ui.quiz && ui.upNext === ui.quiz.i && allQ()[ui.quiz.i] && allQ()[ui.quiz.i].id in quizScores()) ui.upNext = pickUpNext();
  renderQuizHome();
  const el = $('qhome');
  el.hidden = false;
  if (!calm()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); el.firstElementChild.animate([{ opacity: 0, transform: 'translateY(18px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
  const go = $('qh-start'); if (go) go.focus({ preventScroll: true });
}
function closeQuizHome({ resume = true } = {}) {
  const el = $('qhome');
  if (el.hidden) return;
  el.hidden = true;
  if (resume && ui.homeResume) setPlaying(true);
  else if (resume && ui.quiz && ui.quiz.phase === 'play' && ui.T === 0) setPlaying(true);
}
function homeStart(i) {
  closeQuizHome({ resume: false });
  startQuiz(i);
}
function showQuizIntro() {
  $('quiz-k').textContent = 'How the quiz works';
  $('quiz-q').textContent = 'You play one position. The play runs from that player’s eyes, then freezes at a decision. Pick what they should do, then watch the right version from above with the reason why.';
  $('quiz-choices').innerHTML = '<button class="btn primary" data-action="quiz-start">Start question 1</button>';
  $('quiz-choices').hidden = false;
  $('quiz-result').hidden = true;
  $('quiz-skip').hidden = false;
  $('quiz-card').classList.remove('answered');
  $('quiz-card').hidden = false;
  $('quiz-banner').hidden = true;
}
function quizLink() {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('mode', 'quiz');
  if (ui.quiz && ui.quiz.i > 0) u.searchParams.set('q', String(ui.quiz.i + 1));
  return u.toString();
}
function quizCam(mode, { silent = false } = {}) {
  if (!ui.quiz) return;
  ui.quiz.cam = mode;
  if (mode === 'pov') povOn(); else { povOff(); scene.setView(mode); }
  $('look-reset').hidden = mode !== 'pov' || !(ui.quiz.yaw || ui.quiz.pitch);
  markView();
  document.querySelectorAll('[data-qcam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.qcam === mode)));
  if (!silent) ui.snap = false;
}
function povOn() {
  scene.povActive = true;
  const c = scene.controls;
  ui.povSaved = ui.povSaved || { min: c.minDistance, maxPolar: c.maxPolarAngle };
  c.enabled = false; c.enableDamping = false; c.minDistance = 0.05; c.maxPolarAngle = Math.PI;
  scene.ghostStanchion(true);
  $('app').classList.add('pov');
  // About 60° across on any screen shape, so a tall Reel isn't zoomed in.
  const a = scene.camera.aspect || 1.6;
  scene.camera.fov = a >= 1.2 ? 66 : Math.min(95, (2 * Math.atan(Math.tan((30 * Math.PI) / 180) / a) * 180) / Math.PI);
  scene.camera.updateProjectionMatrix();
}
function povOff() {
  scene.povActive = false;
  const c = scene.controls;
  if (ui.povSaved) { c.minDistance = ui.povSaved.min; c.maxPolarAngle = ui.povSaved.maxPolar; ui.povSaved = null; }
  c.enabled = true; c.enableDamping = true;
  scene.ghostStanchion(scene.view === 'baseline');
  $('app').classList.remove('pov');
  scene.resize();
  for (const x of scene.people.values()) { x.tag.style.display = ''; x.setOpacity(1); }
}
// Eye-level camera: just in front of your player's face, looking toward the ball and the rim.
function quizTick(f, dt) {
  const q = ui.quiz;
  if (!q) return;
  if (q.phase === 'play' && ui.T >= q.freezeT) {
    ui.T = q.freezeT; setPlaying(false); q.phase = 'freeze'; showQuestion();
  }
  // Defenders that set up the read ease to their spot, and stay there.
  const { starts } = timing(play);
  for (const [id, d] of Object.entries(q.scene.defense || {})) {
    if (!f.pos[id]) continue;
    const t0 = starts[d.beat] + play.beats[d.beat].dur * d.from, t1 = q.freezeT;
    const k = Math.max(0, Math.min(1, (ui.T - t0) / Math.max(0.1, t1 - t0)));
    if (k <= 0) continue;
    const e = k * k * (3 - 2 * k);
    f.pos[id] = [f.pos[id][0] + (d.to[0] - f.pos[id][0]) * e, f.pos[id][1] + (d.to[1] - f.pos[id][1]) * e];
  }
  if (q.cam !== 'pov') { for (const x of scene.people.values()) x.setOpacity(1); return; }
  const uv = f.pos[q.scene.you], me = scene.people.get(q.scene.you);
  if (!uv || !me) return;
  const p = W(uv[0], uv[1]), h = me.look.height || 1, a = me.heading;
  // Steady camera: fixed eye height, a level aim (it follows where the ball is, not its bounce),
  // and smoothed movement so walking and turning don't bob the view.
  const ball = scene.ball.position, rim = W(250, 52.5, 0);
  const want = new THREE.Vector3(ball.x + (rim.x - ball.x) * 0.3, 1.15, ball.z + (rim.z - ball.z) * 0.3);
  // Turn toward the action smoothly by angle (an aim point can lag behind the camera and flip
  // the view around), then sit just behind and above your head on the side away from it.
  const yawWant = Math.atan2(want.x - p.x, want.z - p.z);
  if (q.aimYaw === undefined || ui.snap) q.aimYaw = yawWant;
  else { let d = yawWant - q.aimYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); q.aimYaw += d * Math.min(1, dt * 4); }
  const fx = Math.sin(q.aimYaw), fz = Math.cos(q.aimYaw);
  const eyeWant = new THREE.Vector3(p.x - fx * 0.5, 1.85 * h, p.z - fz * 0.5);
  if (!q.eye || ui.snap) q.eye = eyeWant.clone(); else q.eye.lerp(eyeWant, Math.min(1, dt * 5));
  q.eye.y = 1.85 * h;
  const flatDist = Math.max(2.5, Math.hypot(want.x - p.x, want.z - p.z));
  q.look = new THREE.Vector3(q.eye.x + fx * flatDist, 1.15, q.eye.z + fz * flatDist);
  const eye = q.eye;
  if (q.yaw || q.pitch) {
    // Your own look-around (drag in Your eyes), applied on top of the aim at the ball.
    const dir = new THREE.Vector3().subVectors(q.look, eye);
    const dist = Math.max(2, dir.length());
    const sph = new THREE.Spherical().setFromVector3(dir);
    sph.theta += q.yaw || 0;
    sph.phi = Math.max(0.35, Math.min(Math.PI - 0.35, sph.phi - (q.pitch || 0)));
    sph.radius = dist;
    const aim = new THREE.Vector3().setFromSpherical(sph).add(eye);
    scene.camera.position.copy(eye);
    scene.controls.target.copy(aim);
    scene.camera.lookAt(aim);
  } else {
  scene.camera.position.copy(eye);
  scene.controls.target.copy(q.look);
  scene.camera.lookAt(q.look);
  }
  // Anyone right in front of your eyes fades so they don't block the view.
  for (const [id, x] of scene.people) {
    if (id === q.scene.you) { x.setOpacity(0); continue; }
    const d = Math.hypot(x.root.position.x - eye.x, x.root.position.z - eye.z);
    x.setOpacity(d < 1.8 ? 0 : d < 3.2 ? (d - 1.8) / 1.4 : 1);
  }
}
function showQuestion() {
  $('play-btn').title = 'Not sure? Show me the answer (Space)';
  const q = ui.quiz, sc = q.scene;
  const me = play.players.find((p) => p.id === sc.you);
  $('quiz-k').textContent = `${sc.title || ''}${sc.title ? ' · ' : ''}You’re #${me.num}`;
  $('quiz-q').textContent = sc.prompt;
  $('quiz-choices').innerHTML = sc.choices.map((c, k) => `<button class="quiz-choice" data-choice="${k}" style="--i:${k}"><span class="quiz-letter">${'ABCD'[k]}</span>${esc(c.label)}</button>`).join('');
  $('quiz-choices').hidden = false;
  $('quiz-result').hidden = true;
  $('quiz-skip').hidden = false;
  $('quiz-card').classList.remove('answered', 'min', 'why');
  document.querySelector('.quiz-why').textContent = 'Why?';
  $('quiz-card').hidden = false;
  $('quiz-banner').hidden = true;
}
// k = the choice picked, or -1 for "Not sure, show me" (shows the read without scoring it).
// Three steps so the moment reads: your pick presses in, the right (and wrong) answer is
// revealed in place, then the card glides to the corner while the right version replays.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function answerQuiz(k) {
  const q = ui.quiz;
  if (!q || q.phase !== 'freeze') return;
  q.phase = 'answer';
  const sc = q.scene, skipped = k < 0, right = sc.choices.find((c) => c.correct);
  const pick = skipped ? right : sc.choices[k];
  const card = $('quiz-card'), slow = !calm();
  if (!skipped) { const scores = quizScores(); scores[sc.id] = !!pick.correct; try { localStorage.setItem(QUIZ_KEY, JSON.stringify(scores)); } catch { /* ignore */ } }
  const btns = [...document.querySelectorAll('.quiz-choice')];
  btns.forEach((b) => { b.disabled = true; });
  if (!skipped && btns[k]) btns[k].classList.add('picked');
  $('quiz-skip').classList.add('gone');
  const reveal = () => {
    btns.forEach((b, i) => {
      b.classList.remove('picked');
      b.classList.toggle('right', !!sc.choices[i].correct);
      b.classList.toggle('wrong', !skipped && i === k && !pick.correct);
      b.classList.toggle('fade', !sc.choices[i].correct && i !== k);
    });
  };
  const settle = async () => {
    if (ui.quiz !== q) return;
    if (slow) await card.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 10px' }], { duration: 170, easing: 'cubic-bezier(.4,0,1,1)' }).finished;
    if (ui.quiz !== q) return;
    $('quiz-skip').hidden = true; $('quiz-skip').classList.remove('gone');
    $('quiz-verdict').textContent = skipped ? `Here’s the read: ${right.label.toLowerCase()}.` : pick.correct ? 'Right read.' : `Not quite. The read is: ${right.label.toLowerCase()}.`;
    $('quiz-verdict').className = 'quiz-verdict ' + (skipped ? '' : pick.correct ? 'ok' : 'no');
    $('quiz-explain').textContent = pick.correct ? right.why : `${pick.why} ${right.why}`;
    $('quiz-rule').textContent = sc.rule;
    $('quiz-result').hidden = false;
    card.classList.remove('min', 'why'); document.querySelector('.quiz-why').textContent = 'Why?';
    card.classList.add('answered');
    if (slow) card.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    // Show the right version from above: your movement added if the play needs it, slowed down, arrows on.
    if (sc.answerMoves) { const m = play.beats[sc.freeze[0]].moves; m[sc.you] = { ...(m[sc.you] || {}), ...clone(sc.answerMoves) }; }
    ui.arrows = true;
    quizCam('broadcast');
    ui.speed = 0.75; $('speed').textContent = '0.75×';
    ui.T = Math.max(0, q.freezeT - 1.2); ui.snap = true;
    renderQuizList();
    setPlaying(true);
  };
  if (!slow) { reveal(); settle(); return; }
  setTimeout(reveal, skipped ? 0 : 170);
  setTimeout(settle, skipped ? 750 : 1050);
}
// Move on: the card drops away, then the next question starts.
function nextQuiz(random = false) {
  const q = ui.quiz;
  if (q && q.phase === 'leaving') return;
  const go = () => startQuiz(nextQuizIndex(ui.quiz ? ui.quiz.i : -1, random));
  const card = $('quiz-card');
  if (!q || card.hidden || calm()) { go(); return; }
  q.phase = 'leaving';
  card.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 14px' }], { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then((a) => { go(); card.getAnimations().forEach((x) => x.cancel()); });
}
const POS_GROUP = { PG: 'Guards', SG: 'Guards', SF: 'Wings', PF: 'Bigs', C: 'Bigs' };
function quizMeta(x) {
  const pre = x.playData || PRESETS.find((p) => p.id === x.play);
  const me = pre.players.find((p) => p.id === x.you) || {};
  return { pre, num: me.num, group: x.group || POS_GROUP[me.pos] || 'Wings', level: x.mine ? 'Mine' : x.level || pre.level || 'Intermediate' };
}
function quizFiltered() {
  const f = ui.quizFilter || { group: 'All', level: 'All' };
  return allQ().map((x, i) => ({ x, i, m: quizMeta(x) })).filter(({ m }) => (f.group === 'All' || m.group === f.group) && (f.level === 'All' || m.level === f.level));
}
function nextQuizIndex(from, random = false) {
  const list = quizFiltered();
  if (!list.length) return from;
  const scores = quizScores();
  if (random) { const pool = list.filter(({ i }) => i !== from); return (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))].i; }
  const after = list.filter(({ i }) => i > from).concat(list.filter(({ i }) => i <= from));
  const fresh = after.find(({ x, i }) => !(x.id in scores) && i !== from);
  return (fresh || after[0]).i;
}
function renderQuizList() {
  const f = ui.quizFilter || (ui.quizFilter = { group: 'All', level: 'All' });
  const chip = (k, v) => `<button data-qfilter="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${v}</button>`;
  $('quiz-filters').innerHTML = `<div class="qf">${['All', 'Guards', 'Wings', 'Bigs'].map((v) => chip('group', v)).join('')}</div><div class="qf">${['All', 'Beginner', 'Intermediate', 'Advanced', ...(myQuestions().length ? ['Mine'] : [])].map((v) => chip('level', v)).join('')}</div>`;
  const scores = quizScores();
  const Q = allQ();
  const done = Q.filter((x) => x.id in scores).length, right = Q.filter((x) => scores[x.id]).length;
  $('quiz-score').textContent = done ? `${right} of ${done} right` : `${Q.length} questions`;
  const list = quizFiltered();
  if (!list.length) { $('quizlist').innerHTML = '<li class="empty" style="padding:8px 14px">No questions match. Try another filter.</li>'; return; }
  $('quizlist').innerHTML = list.map(({ x, i, m }) => {
    const pre = m.pre, num = m.num;
    const st = x.id in scores ? (scores[x.id] ? '<span class="qs ok">Right</span>' : '<span class="qs no">Missed</span>') : '';
    return `<li><button class="pl-item${ui.quiz && ui.quiz.i === i ? ' on' : ''}" data-quiz="${i}">${thumbSVG({ ...pre, theme: play.theme, teams: play.teams, court: play.court }, x.freeze[0], { w: 76 })}<span class="t"><b>${esc(x.title || pre.name)}</b><span>You’re #${esc(num)} · ${esc(m.level)}</span>${st}</span></button>${x.mine ? `<span class="myq-acts"><button class="icon-btn" data-act="share-q" data-id="${x.id}" title="Copy a link to this question" aria-label="Share ${esc(x.title)}">${icon('share', 15)}</button><button class="icon-btn danger" data-act="del-q" data-id="${x.id}" title="Delete" aria-label="Delete ${esc(x.title)}">${icon('trash', 15)}</button></span>` : ''}</li>`;
  }).join('');
}

// ---------- Watch mode: run through the playbook ----------
function buildQueue() {
  const mine = libraryIds().map((id) => loadPlay(id)).filter(Boolean);
  return [
    ...PRESETS.map((p) => ({ kind: 'preset', id: p.id, cat: p.cat, name: p.name, play: p })),
    ...mine.map((p) => ({ kind: 'mine', id: p.id, cat: 'My plays', name: p.name, play: p })),
  ];
}
function showQueueItem(i, { autoplay = true } = {}) {
  const q = ui.queue;
  if (!q.length) return;
  ui.qi = (i + q.length) % q.length;
  const item = q[ui.qi];
  play = validate(clone(item.play));
  const look = ui.watchLook || (item.kind === 'preset' && ui.editPlay ? { theme: ui.editPlay.theme || 'bw', teams: ui.editPlay.teams, court: ui.editPlay.court || {} } : null);
  if (look) { play.theme = look.theme; if (look.teams) play.teams = { ...look.teams }; else delete play.teams; play.court = clone(look.court); }
  ui.sel = null; ui.beat = -1; ui.T = 0; ui.snap = true; ui.endHold = 0; ui.upNext = 0;
  $('upnext').hidden = true;
  renderAll();
  setPlaying(autoplay);
  const el = document.querySelector(`.pl-item[data-qi="${ui.qi}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}
function enterWatch() {
  if (ui.mode === 'watch') return;
  savePlay(play);
  ui.editPlay = clone(play);
  ui.mode = 'watch';
  ui.queue = buildQueue();
  const at = ui.queue.findIndex((x) => x.id === play.id);
  showQueueItem(at >= 0 ? at : 0);
}
function exitWatch({ editThis = false } = {}) {
  if (ui.mode !== 'watch') return;
  const item = ui.queue[ui.qi];
  ui.mode = 'edit';
  $('upnext').hidden = true;
  if (editThis && item) {
    const p = item.kind === 'preset' ? clonePreset(item.id) : loadPlay(item.id);
    play = null;
    loadInto(p);
    toast(item.kind === 'preset' ? `Editing your own copy of “${item.name}”` : `Editing “${item.name}”`);
  } else {
    play = validate(ui.editPlay);
    ui.sel = null; ui.beat = -1; ui.T = 0; ui.snap = true;
    setPlaying(false);
    changed({ save: false });
  }
}
function renderPlaylist() {
  const list = $('playlist');
  let lastCat = '';
  const pct = timing(play).total ? Math.min(1, ui.T / timing(play).total) : 0;
  list.innerHTML = ui.queue.map((q, i) => {
    const head = q.cat !== lastCat ? `<li class="pl-cat">${esc(q.cat)}</li>` : '';
    lastCat = q.cat;
    const on = i === ui.qi;
    const next = ui.autoplay && i === (ui.qi + 1) % ui.queue.length;
    return head + `<li><button class="pl-item${on ? ' on' : ''}" data-qi="${i}">${thumbSVG(i === ui.qi ? play : { ...q.play, theme: play.theme, court: play.court }, busiest(q.play), { w: 76 })}<span class="t"><b>${esc(q.name)}</b><span>${q.play.level ? q.play.level + ' · ' : ''}${q.play.size}v${q.play.size} · ${q.play.beats.length} beats${q.play.defense === 'zone' ? ' · vs zone' : ''}</span>${on ? '<span class="pl-now">Now playing</span>' : next ? '<span class="pl-next">Up next</span>' : ''}</span>${on ? `<span class="pl-bar"><span id="pl-fill" style="width:${pct * 100}%"></span></span>` : ''}</button></li>`;
  }).join('');
  $('pl-count').textContent = ui.queue.length;
  $('autoplay').setAttribute('aria-checked', String(ui.autoplay));
  $('play-of').textContent = `Play ${ui.qi + 1} of ${ui.queue.length}`;
}

function renderSide() { renderRoster(); renderInspector(); renderCards(); }
let lastMarksKey = '';
function renderAll({ light = false } = {}) {
  $('title').value = play.name;
  document.title = `${play.name} · Court Mode`;
  scene.setPlayers(play.players);
  scene.setGuards(play.players.map((p) => ({ id: p.id, guard: play.defense === 'man' ? p.guard : null })));
  const t = teamsOf(play);
  scene.setKits(t);
  scene.setCourt(courtLook(play));
  const r = document.documentElement.style;
  r.setProperty('--o', t.O.jersey); r.setProperty('--o-ink', t.O.num); r.setProperty('--d', t.D.jersey); r.setProperty('--d-ink', t.D.num);
  lastMarksKey = '';
  const watching = ui.mode === 'watch';
  $('app').classList.toggle('quizzing', ui.mode === 'quiz');
  $('app').classList.toggle('watching', watching);
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)));
  $('title').readOnly = watching;
  $('saved').hidden = watching;
  if (ui.mode === 'quiz') { renderQuizList(); renderTimeline(); }
  else if (watching) { renderPlaylist(); renderTimeline(); }
  else if (!light) { renderSide(); renderTimeline(); }
  else renderCards();
  updateHandles();
  updateHint();
  document.querySelectorAll('[data-toggle]').forEach((b) => b.classList.toggle('on', !!ui[b.dataset.toggle]));
  $('labels').classList.toggle('off', !ui.tags);
}

function updateHandles() {
  const list = [];
  if (!ui.playing && ui.arrows && ui.sel && ui.beat >= 0 && canDrag(ui.sel)) {
    const m = moveOf(play, ui.beat, ui.sel);
    if (m.moving) {
      m.wp.forEach((q, j) => list.push({ kind: 'wp', id: ui.sel, index: j, uv: q }));
      for (let j = 0; j < m.pts.length - 1; j++) {
        const a = m.pts[j], b = m.pts[j + 1];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 40) list.push({ kind: 'add', id: ui.sel, index: j, uv: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
      }
    }
  }
  scene.setHandles(list);
}

function updateHint() {
  let s;
  if (ui.mode === 'watch') s = 'Watching · Space to pause · click a beat to replay it';
  else if (ui.playing) s = 'Playing · press Space to pause and edit';
  else if (ui.beat < 0) s = 'Start · drag players to where they line up';
  else if (ui.sel && canDrag(ui.sel)) s = `Beat ${ui.beat + 1} · drag ${nameOf(ui.sel)} to where they end up · drag the white rings to bend the path`;
  else s = `Beat ${ui.beat + 1} · drag a player to where they end up on this beat · right-drag to rotate the camera`;
  $('hint').textContent = s;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

// ---------- Frame loop ----------
let lastFrame = performance.now(), clockNow = 0;
function frame(nowMs) {
  const real = Math.min(0.05, (nowMs - lastFrame) / 1000 || 0);
  lastFrame = nowMs;
  // While recording, follow the wall clock so the video always has the right length.
  const dt = ui.fixedDt || (ui.rec ? Math.min(0.25, (nowMs - (frame.prev || nowMs)) / 1000 || real) : real);
  frame.prev = nowMs;
  clockNow += dt;
  const { total } = timing(play);
  if (ui.T > total) ui.T = total;
  if (ui.rec && ui.rec.quiz) quizRecTick(ui.rec, dt, total);
  else if (ui.rec) {
    const R = ui.rec;
    R.t += dt;
    if (!R.started && R.t >= R.lead) { R.started = true; ui.T = 0; ui.snap = true; setPlaying(true); }
    if (R.started && ui.T >= total) { R.tail += dt; if (R.tail > 1.4 && !R.finishing) finishExport(); }
    if (R.opts.camera === 'cinematic') cinematicCamera(scene.camera, scene.controls.target, R.t, R.opts.q.w / R.opts.q.h);
    const st = $('rec-time'); if (st) st.textContent = `${Math.min(R.t, R.total).toFixed(1)} / ${R.total.toFixed(1)} s`;
  }
  if (ui.playing) {
    if (ui.T < total) ui.T = Math.min(total, ui.T + dt * ui.speed);
    else if (ui.mode === 'watch' && ui.autoplay && ui.queue.length > 1 && !ui.rec) {
      // Hold the last frame, show "Up next", then move on.
      ui.endHold += dt;
      const up = $('upnext');
      if (ui.endHold > 0.6 && up.hidden) {
        const nx = ui.queue[(ui.qi + 1) % ui.queue.length];
        $('un-name').textContent = nx.name;
        $('un-meta').textContent = `${nx.cat} · ${nx.play.beats.length} beats`;
        $('un-thumb').innerHTML = thumbSVG({ ...nx.play, theme: play.theme, court: play.court }, busiest(nx.play), { w: 96 });
        up.hidden = false;
      }
      $('un-fill').style.width = `${Math.min(1, Math.max(0, (ui.endHold - 0.6) / 3)) * 100}%`;
      if (ui.endHold > 3.6) showQueueItem(ui.qi + 1);
    } else if ((ui.endHold += dt) > 1.6) {
      if (ui.loop) { ui.T = 0; ui.endHold = 0; ui.snap = true; } else setPlaying(false);
    }
  }
  const f = sample(play, ui.T);
  const showBeat = ui.playing ? f.i : ui.beat;
  const key = showBeat + '|' + ui.sel + '|' + ui.arrows + '|' + JSON.stringify(play.beats[showBeat] || null) + JSON.stringify(play.start);
  if (key !== lastMarksKey) {
    lastMarksKey = key;
    scene.setMarks(ui.arrows && showBeat >= 0 ? marksFor(play, showBeat) : [], ui.sel);
    if (ui.playing) { renderCards(); renderTimeline(); }
    const b = play.beats[showBeat];
    const cap = $('caption');
    cap.hidden = !b;
    if (b) { $('cap-title').textContent = `Beat ${showBeat + 1} · ${b.name}`; $('cap-text').textContent = b.text || beatSummary(showBeat); }
    $('beat-now').textContent = showBeat < 0 ? 'Start' : `Beat ${showBeat + 1}`;
  }
  scene.overlay.material.opacity = ui.playing ? Math.min(1, f.t * 6) * (ui.T >= total ? Math.max(0, 1 - ui.endHold * 2) : 1) : 1;
  if (ui.mode === 'quiz') quizTick(f, dt);
  scene.update(f, { dt, now: clockNow, snap: ui.snap, selected: ui.rec ? null : ui.sel, showDefense: ui.defense && play.defense !== 'none' });
  if (ui.mode === 'quiz' && ui.quiz && ui.quiz.cam === 'pov') { const me = scene.people.get(ui.quiz.scene.you); if (me) me.tag.style.display = 'none'; updateRadar(f); }
  if (ui.rec && ui.rec.recorder) {
    const b = ui.rec.started ? play.beats[f.i] : null;
    ui.rec.recorder.frame({ caption: b ? (b.text || beatSummary(f.i)) : '', beatLabel: b ? `Beat ${f.i + 1} · ${b.name}` : '', kits: teamsOf(play), elapsed: ui.rec.t, quiz: ui.rec.quiz ? quizRecState(ui.rec) : null });
  }
  ui.snap = false;
  $('playhead').style.left = `calc(${(ui.T / total) * 100}% - 1px)`;
  $('time-now').textContent = fmt(ui.T);
  $('clock').textContent = Math.max(0, 24 - ui.T).toFixed(1);
  if (ui.mode === 'watch') { const pf = $('pl-fill'); if (pf) pf.style.width = `${Math.min(100, (ui.T / total) * 100)}%`; }
  if (!window.__ff) { window.__ff = performance.now(); performance.mark('court:first-frame'); document.body.classList.add('ready'); }
  if (!ui.manual) requestAnimationFrame(frame);
}

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  if (!$('more-menu').hidden && !e.target.closest('[data-action="more"]')) { $('more-menu').hidden = true; document.querySelector('.more-btn').setAttribute('aria-expanded', 'false'); }
  const t = e.target.closest('button, [data-beat]');
  if (!t) return;
  const a = t.dataset.action || t.dataset.act;
  if (t.dataset.beat !== undefined && !a && ui.mode === 'quiz') return;
  if (t.dataset.beat !== undefined && !a && ui.mode === 'watch') { ui.T = timing(play).starts[Number(t.dataset.beat)] + 0.001; ui.snap = true; ui.endHold = 0; $('upnext').hidden = true; setPlaying(true); return; }
  if (t.dataset.beat !== undefined && !a) {
    selectBeat(Number(t.dataset.beat));
    if (t.dataset.sel) { ui.sel = t.dataset.sel; renderAll(); }
    if (innerWidth <= 900) $('left').classList.remove('open');
    return;
  }
  if (t.dataset.sel && !a) { ui.sel = ui.sel === t.dataset.sel ? null : t.dataset.sel; renderAll(); return; }
  if (t.dataset.mode) { const m = t.dataset.mode; if (m === ui.mode) return; if (ui.mode === 'quiz') exitQuiz(); if (m === 'watch') enterWatch(); else if (m === 'quiz') enterQuiz(); else exitWatch(); return; }
  if (t.dataset.qh !== undefined) { homeStart(Number(t.dataset.qh)); return; }
  if (t.dataset.qhf) { ui.quizFilter = { ...(ui.quizFilter || {}), [t.dataset.qhf]: t.dataset.v }; ui.upNext = null; renderQuizHome(); renderQuizList(); updateQPill(); return; }
  if (t.classList && t.classList.contains('qhome-wrap')) { closeQuizHome(); return; }
  if (t.dataset.qfilter) { ui.quizFilter = { ...(ui.quizFilter || {}), [t.dataset.qfilter]: t.dataset.v }; renderQuizList(); return; }
  if (t.dataset.qcam) { quizCam(t.dataset.qcam); return; }
  if (t.dataset.choice !== undefined) { answerQuiz(Number(t.dataset.choice)); return; }
  if (t.dataset.quiz !== undefined) { startQuiz(Number(t.dataset.quiz)); if (innerWidth <= 900) $('left').classList.remove('open'); return; }
  if (t.dataset.qi !== undefined) { showQueueItem(Number(t.dataset.qi)); if (innerWidth <= 900) $('left').classList.remove('open'); return; }
  if (t.dataset.view) { if (ui.mode === 'quiz') quizCam(t.dataset.view); else { scene.setView(t.dataset.view); markView(); } return; }
  if (t.dataset.toggle) { ui[t.dataset.toggle] = !ui[t.dataset.toggle]; renderAll(); return; }
  if (t.dataset.tl) { ui.tl = t.dataset.tl; renderTimeline(); return; }
  if (t.dataset.team) {
    const side = t.dataset.team, id = t.dataset.v;
    lookChange(() => {
      const cur = teamsOf(play).ids;
      play.teams = { ...cur, [side]: id };
      if (play.teams.O === play.teams.D) play.teams[side === 'O' ? 'D' : 'O'] = cur[side];
      play.court = play.court || {};
      if (!play.court.home && TEAMS[id].city) play.court.home = side;
    });
    refreshPop();
    return;
  }
  if (t.dataset.court) {
    const k = t.dataset.court, v = t.dataset.v;
    lookChange(() => { play.court = play.court || {}; if (k === 'paint' && v === '__team') delete play.court.paint; else if (k === 'border' && !v) delete play.court.border; else play.court[k] = v; if (k === 'scene' && v === 'park' && play.court.floor !== 'blacktop') { play.court.floor = 'blacktop'; play.court.lines = play.court.lines || '#FFFFFF'; } if (k === 'scene' && v === 'beach') { play.court.floor = 'blacktop'; play.court.lines = '#FFFFFF'; if (play.court.paint === undefined && !play.court.home) play.court.paint = '#0F6B5E'; } if (k === 'scene' && v === 'pier') { play.court.floor = 'blacktop'; play.court.lines = '#E2C04E'; if (!play.court.home) play.court.paint = '#E8D696'; play.court.border = '#3A3D41'; } if (k === 'scene' && v === 'garden') { play.court.floor = 'maple'; play.court.paint = '#0B5CAD'; play.court.border = '#0B5CAD'; play.court.lines = '#FFFFFF'; } }); if (k === 'scene' && v === 'pier' && ui.mode !== 'quiz') { scene.setView('courtside'); markView(); toast('Courtside view: the Manhattan skyline is behind the basket.'); }
    if (!$('court-pop').hidden) openCourtPop();
    return;
  }
  if (t.dataset.look) { const id = ui.sel; mutate(() => { playerOf(id).look[t.dataset.look] = t.dataset.v; }); return; }
  if (t.dataset.close !== undefined) { t.closest('dialog').close(); return; }
  const k = ui.beat, id = ui.sel;
  switch (a) {
    case 'play': if (ui.mode === 'quiz' && ui.quiz && ui.quiz.phase === 'freeze') answerQuiz(-1); else setPlaying(!ui.playing); break;
    case 'quiz-skip': answerQuiz(-1); break;
    case 'prev': if (ui.mode === 'watch') showQueueItem(ui.qi - 1); else selectBeat(ui.beat - 1); break;
    case 'next': if (ui.mode === 'watch') showQueueItem(ui.qi + 1); else selectBeat(ui.beat + 1); break;
    case 'watch-all': $('playbook').close(); enterWatch(); break;
    case 'edit-this': exitWatch({ editThis: true }); break;
    case 'autoplay': ui.autoplay = !ui.autoplay; if (!ui.autoplay) $('upnext').hidden = true; renderPlaylist(); break;
    case 'upnext-now': showQueueItem(ui.qi + 1); break;
    case 'upnext-stay': ui.autoplay = false; $('upnext').hidden = true; ui.T = 0; ui.endHold = 0; ui.snap = true; renderPlaylist(); break;
    case 'speed': ui.speed = ui.speed === 1 ? 0.5 : ui.speed === 0.5 ? 0.25 : 1; t.textContent = ui.speed + '×'; break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'flip': mutate(flipPlay); toast('Flipped left ↔ right', { label: 'Undo', run: undo }); break;
    case 'add-beat': addBeat(); break;
    case 'dup-beat': mutate(() => { const b = clone(play.beats[k]); b.id = uid(); b.name = b.name + ' (copy)'; for (const m of Object.values(b.moves)) { delete m.to; delete m.wp; } play.beats.splice(k + 1, 0, b); }); selectBeat(k + 1); break;
    case 'del-beat': if (play.beats.length > 1) { const name = play.beats[k].name; mutate(() => play.beats.splice(k, 1)); selectBeat(Math.min(k, play.beats.length - 1)); toast(`Deleted “${name}”`, { label: 'Undo', run: undo }); } break;
    case 'speed-beat': mutate(() => { play.beats[k].dur = Number(t.dataset.v); }); ui.T = endOf(k); break;
    case 'act': mutate(() => { ensureMove(id).act = t.dataset.v; tidy(); }); break;
    case 'pace': mutate(() => { ensureMove(id).pace = t.dataset.v; tidy(); }); break;
    case 'straighten': mutate(() => { delete ensureMove(id).wp; tidy(); }); break;
    case 'stay': mutate(() => { const m = ensureMove(id); delete m.to; delete m.wp; delete m.pace; tidy(); }); break;
    case 'ball': mutate(() => {
      const b = play.beats[k];
      if (t.dataset.v === 'keep') b.ball = null;
      else if (t.dataset.v === 'pass') b.ball = { kind: 'pass', to: t.dataset.to, t0: b.ball ? b.ball.t0 : 0.35, t1: (b.ball ? b.ball.t0 : 0.35) + 0.32 };
      else b.ball = { kind: 'shot', t0: 0.2, t1: 0.65 };
      if (k === play.beats.length - 1 && b.ball && b.ball.kind === 'pass') { /* passes on the last beat are fine */ }
    }); break;
    case 'when': mutate(() => { const b = play.beats[k].ball; const t0 = { early: 0.08, mid: 0.35, late: 0.6 }[t.dataset.v]; b.t0 = t0; b.t1 = Math.min(0.98, t0 + (b.kind === 'shot' ? 0.45 : 0.32)); }); break;
    case 'shuffle': shuffleLook(); break;
    case 'swap-teams': lookChange(() => { const t = teamsOf(play).ids; play.teams = { O: t.D, D: t.O }; if (play.court && play.court.home) play.court.home = play.court.home === 'O' ? 'D' : 'O'; }); refreshPop(); break;
    case 'home': lookChange(() => { play.court = play.court || {}; if (t.dataset.v) play.court.home = t.dataset.v; else delete play.court.home; }); refreshPop(); break;
    case 'zone': mutate(() => { play.zone = t.dataset.v; }); break;
    case 'court-pop': if ($('court-pop').hidden) openCourtPop(); else closePops(); break;
    case 'start-ball': mutate(() => { play.ball = t.dataset.id; }); break;
    case 'theme': lookChange(() => { play.theme = t.dataset.v; delete play.teams; }); closePops(); break;
    case 'colors-pop': togglePop(); break;
    case 'playbook': openPlaybook(); break;
    case 'make-question': openMaker(); break;
    case 'maker-save': saveMaker(); break;
    case 'share-q': { const q = myQuestions().find((x) => x.id === t.dataset.id); if (q) shareQuestion(q); break; }
    case 'del-q': { const list = myQuestions(); const q = list.find((x) => x.id === t.dataset.id); if (!q) break; saveMyQuestions(list.filter((x) => x.id !== q.id)); renderQuizList(); toast(`Deleted “${q.title}”`, { label: 'Undo', run: () => { saveMyQuestions([...myQuestions(), q]); renderQuizList(); } }); break; }
    case 'look-reset': resetLook(); break;
    case 'quiz-start': store('court.quizIntro', '1'); $('quiz-card').hidden = true; $('quiz-banner').hidden = false; setPlaying(true); break;
    case 'quiz-link': { const url = quizLink(); try { await navigator.clipboard.writeText(url); toast('Quiz link copied'); } catch { prompt('Copy this link', url); } break; }
    case 'quiz-next': nextQuiz(); break;
    case 'quiz-step': stepQuiz(Number(t.dataset.dir)); break;
    case 'more': { const m = $('more-menu'); m.hidden = !m.hidden; t.setAttribute('aria-expanded', String(!m.hidden)); break; }
    case 'quiz-min': { const c = $('quiz-card'); const min = c.classList.toggle('min'); t.setAttribute('aria-expanded', String(!min)); t.setAttribute('aria-label', min ? 'Show the question' : 'Hide the question to see the court'); break; }
    case 'quiz-why': { const c = $('quiz-card'); const on = c.classList.toggle('why'); t.textContent = on ? 'Hide why' : 'Why?'; t.setAttribute('aria-expanded', String(on)); break; }
    case 'qhome': openQuizHome(); break;
    case 'qhome-close': closeQuizHome(); break;
    case 'qh-start': homeStart(ui.upNext); break;
    case 'qh-shuffle': homeStart(nextQuizIndex(ui.upNext, true)); break;
    case 'qh-missed': { const sc = quizScores(); const m = quizFiltered().filter(({ x }) => sc[x.id] === false); if (m.length) homeStart(m[Math.floor(Math.random() * m.length)].i); break; }
    case 'quiz-random': closeQuizHome({ resume: false }); nextQuiz(true); break;
    case 'quiz-replay': startQuiz(ui.quiz ? ui.quiz.i : 0); break;
    case 'export': openExport(); break;
    case 'export-go': startExport(); break;
    case 'export-cancel': cancelExport(); break;
    case 'tour': startTour(); break;
    case 'tour-next': tourAt++; showTour(); break;
    case 'tour-skip': endTour(); break;
    case 'new': if ($('playbook').open) $('playbook').close(); openNew(); break;
    case 'share': share(); break;
    case 'toggle-left': $('left').classList.toggle('open'); $('right').classList.remove('open'); break;
    case 'toggle-right': $('right').classList.toggle('open'); $('left').classList.remove('open'); break;
    case 'load-preset': loadInto(clonePreset(t.dataset.id)); $('playbook').close(); break;
    case 'open-mine': { const p = loadPlay(t.dataset.id); if (p) loadInto(p); $('playbook').close(); break; }
    case 'del-mine': { if (t.dataset.id === play.id) { toast('That play is open right now. Open another one first.'); break; } const gone = loadPlay(t.dataset.id); deletePlay(t.dataset.id); renderPlaybook(); toast(`Deleted “${gone ? gone.name : 'play'}”`, { label: 'Undo', run: () => { if (gone) { savePlay(gone); savePlay(play); renderPlaybook(); } } }); break; }
    case 'filter': ui.filter = t.dataset.v; renderPlaybook(); break;
    case 'level': ui.level = t.dataset.v; renderPlaybook(); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'quality') {
    $('quality-help').textContent = { '720': 'Smallest file. Fine for texting or a quick look.', '1080': 'Full HD. Sharp on any screen and a good size to share.', '1440': 'Extra sharp, larger file.', '2160': 'Sharpest, biggest file. Needs a fast computer; on a slow one the video can stutter.' }[t.value];
    return;
  }
  if (t.dataset.courtLabel !== undefined) { const v = t.value.trim(); lookChange(() => { play.court = play.court || {}; if (v) play.court.label = v; else delete play.court.label; }); if (!$('court-pop').hidden) openCourtPop(); return; }
  if (t.dataset.act === 'dribble') { mutate(() => { play.beats[ui.beat].dribble = t.checked; }); return; }
  if (t.dataset.field === 'defense') { mutate(() => { play.defense = t.value; }); return; }
  if (t.dataset.field === 'guard') { const id = ui.sel; mutate(() => { playerOf(id).guard = t.value; }); return; }
  if (t.dataset.field === 'pos') { const id = ui.sel; mutate(() => { playerOf(id).pos = t.value; }); return; }
  if (t.dataset.lookSelect) { const id = ui.sel; mutate(() => { playerOf(id).look[t.dataset.lookSelect] = t.value; }); return; }
  if (t.dataset.lookRange) { const id = ui.sel; mutate(() => { playerOf(id).look[t.dataset.lookRange] = Number(t.value); }); return; }
  if (t.dataset.beatField) { const k = ui.beat; const v = t.value; mutate(() => { play.beats[k][t.dataset.beatField] = v; }); }
});
$('qhome').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeQuizHome(); });
$('maker-form').addEventListener('input', () => { $('maker-err').textContent = ''; });
$('title').addEventListener('change', () => { const v = $('title').value.trim() || 'Untitled play'; mutate(() => { play.name = v; }); });
$('title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

function addBeat() {
  const at = ui.beat + 1;
  mutate(() => play.beats.splice(at, 0, { id: uid(), name: 'Beat ' + (at + 1), dur: 1.5, text: '', moves: {}, ball: null }));
  selectBeat(at);
}

addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (typing) return;
  if (!$('qhome').hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeQuizHome(); }
    else if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); homeStart(ui.upNext); }
    return;
  }
  if (ui.mode === 'quiz' && ui.quiz && ui.quiz.phase === 'freeze' && !typing) {
    // At the question: Space = not sure, show me; 1–4 or A–D picks an answer.
    if (e.key === ' ') { e.preventDefault(); answerQuiz(-1); return; }
    const n = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
    if (n >= 0 && n < ui.quiz.scene.choices.length && e.key.length === 1) { answerQuiz(n); return; }
  }
  // After the answer: Space or Enter moves on to the next question.
  if (ui.mode === 'quiz' && ui.quiz && (ui.quiz.phase === 'answer' || ui.quiz.phase === 'leaving') && (e.key === ' ' || (e.key === 'Enter' && tag !== 'BUTTON')) && !e.target.closest('dialog')) {
    e.preventDefault(); if (tag === 'BUTTON') e.target.blur(); nextQuiz(); return;
  }
  if (e.key === ' ' && !e.target.closest('dialog')) { e.preventDefault(); if (tag === 'BUTTON') e.target.blur(); setPlaying(!ui.playing); }
  else if (e.key === '[') $('app').querySelector('[data-action="prev"]').click();
  else if (e.key === ']') $('app').querySelector('[data-action="next"]').click();
  else if (ui.mode === 'watch') return;
  else if (e.key === 'Escape' && tourAt >= 0) { endTour(); }
  else if (e.key === 'Escape') { ui.sel = null; closePops(); renderAll(); }
  else if (e.key.toLowerCase() === 'b') addBeat();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel && ui.beat >= 0 && canDrag(ui.sel)) {
    const id = ui.sel;
    mutate(() => { const m = ensureMove(id); delete m.to; delete m.wp; tidy(); });
  }
});

// Timeline: scrub on the ruler, resize beats by their grips.
function trackPos(e) { const r = $('blocks').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
$('ruler').addEventListener('pointerdown', (e) => {
  setPlaying(false);
  const move = (ev) => {
    ui.T = trackPos(ev) * timing(play).total;
    const { i, t } = beatAt(play, ui.T);
    ui.beat = ui.T < 0.02 ? -1 : t >= 0.999 || i === play.beats.length - 1 ? i : i;
    renderCards(); renderTimeline(); renderInspector(); updateHandles(); updateHint();
  };
  move(e);
  e.target.setPointerCapture(e.pointerId);
  const up = () => { e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); };
  e.target.addEventListener('pointermove', move);
  e.target.addEventListener('pointerup', up);
});
function markView() { const cur = ui.mode === 'quiz' && ui.quiz ? (ui.quiz.cam === 'pov' ? 'pov' : ui.quiz.cam) : scene.view; document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === cur))); }

function togglePop() {
  const pop = $('colors-pop');
  if (!pop.hidden) return closePops();
  $('court-pop').hidden = true;
  pop.innerHTML = teamControls();
  pop.classList.add('court');
  pop.hidden = false;
}
function refreshPop() { if (!$('colors-pop').hidden) $('colors-pop').innerHTML = teamControls(); if (!$('court-pop').hidden) openCourtPop(); }
function closePops() { $('colors-pop').hidden = true; $('court-pop').hidden = true; }
function openCourtPop() { $('colors-pop').hidden = true; const pop = $('court-pop'); pop.innerHTML = courtControls(); pop.hidden = false; }
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pop-wrap')) closePops(); });

// ---------- Playbook, new play, share ----------
function clonePreset(id) {
  const p = clone(PRESETS.find((x) => x.id === id));
  p.id = uid();
  p.theme = play ? play.theme : p.theme;
  if (play && play.teams) p.teams = { ...play.teams };
  if (play && play.court) p.court = clone(play.court);
  delete p.cat; delete p.blurb;
  return validate(p);
}
function busiest(p) {
  let best = 0, score = -1;
  p.beats.forEach((b, k) => { const s = marksFor(p, k).length; if (s > score) { score = s; best = k; } });
  return best;
}
function renderPlaybook() {
  const cats = [...new Set(PRESETS.map((p) => p.cat))];
  const mine = libraryIds().map((id) => loadPlay(id)).filter(Boolean);
  if (ui.filter !== 'mine' && !cats.includes(ui.filter)) ui.filter = cats[0];
  const nav = cats.map((c) => `<button data-act="filter" data-v="${esc(c)}" aria-pressed="${ui.filter === c}"><span>${esc(c)}</span><span class="n">${PRESETS.filter((p) => p.cat === c).length}</span></button>`).join('') +
    `<hr /><button data-act="filter" data-v="mine" aria-pressed="${ui.filter === 'mine'}"><span>My plays</span><span class="n">${mine.length}</span></button>`;
  $('pb-nav').innerHTML = nav;
  const body = $('pb-body');
  if (ui.filter === 'mine') {
    $('pb-title').textContent = 'My plays';
    $('pb-desc').textContent = 'Plays you make are saved in this browser. Use Share to move one to another device.';
    body.innerHTML = mine.length ? `<ul class="pb-list">${mine.map((p) => `<li>
      <button class="pb-row" data-act="open-mine" data-id="${p.id}">${thumbSVG(p, busiest(p), { w: 96 })}<span class="t"><b>${esc(p.name)}</b><span>${p.size}v${p.size} · ${p.beats.length} beats · saved ${new Date(savedAt(p.id) || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></span>${p.id === play.id ? '<span class="badge">Open now</span>' : ''}</button>
      <button class="icon-btn danger" data-act="del-mine" data-id="${p.id}" aria-label="Delete ${esc(p.name)}" title="Delete">${icon('trash', 16)}</button></li>`).join('')}</ul>` : '<p class="empty">Nothing saved yet. Plays you make show up here.</p>';
    return;
  }
  const levels = ['All levels', 'Beginner', 'Intermediate', 'Advanced'];
  ui.level = ui.level || 'All levels';
  $('pb-title').textContent = ui.filter;
  $('pb-desc').textContent = ui.filter === 'Easy' ? 'One idea each, a few beats. Good for learning a play or walking a team through it.' : 'Common half-court sets, each broken into beats.';
  const inCat = PRESETS.filter((p) => p.cat === ui.filter);
  const shownPlays = inCat.filter((p) => ui.level === 'All levels' || p.level === ui.level);
  body.innerHTML = `<div class="levels" role="group" aria-label="Difficulty">${levels.map((l) => `<button data-act="level" data-v="${l}" aria-pressed="${ui.level === l}">${l}<span>${l === 'All levels' ? inCat.length : inCat.filter((p) => p.level === l).length}</span></button>`).join('')}</div>` + (shownPlays.length ? '' : '<p class="empty">No plays at this level here yet.</p>') + `<div class="pb-grid">${shownPlays.map((p) => {
    const shown = { ...p, theme: play.theme, teams: play.teams, court: play.court };
    return `<button class="pb-card" data-act="load-preset" data-id="${p.id}">${thumbSVG(shown, busiest(p), { w: 240 })}<span class="t"><b>${esc(p.name)}</b><span class="meta"><span class="lvl lvl-${p.level.toLowerCase()}">${p.level}</span> ${p.size}v${p.size} · ${p.beats.length} beats${p.defense === 'zone' ? ' · vs 2-3 zone' : ''}</span><span class="blurb">${esc(p.blurb)}</span></span><span class="load">Load</span></button>`;
  }).join('')}</div>`;
}
function openPlaybook() { renderPlaybook(); $('playbook').showModal(); }
function openNew() {
  $('np-theme').innerHTML = Object.entries(THEMES).map(([k, th]) => `<option value="${k}"${k === play.theme ? ' selected' : ''}>${esc(th.name)}</option>`).join('');
  $('newplay').showModal();
}
$('newplay-form').addEventListener('submit', (e) => {
  const fd = new FormData(e.target);
  if (e.submitter && e.submitter.value !== 'ok') return;
  const p = newPlay({ name: String(fd.get('name') || 'New play').trim() || 'New play', size: Number(fd.get('size')), defense: fd.get('defense'), theme: fd.get('theme') });
  loadInto(p);
});
function loadInto(p) {
  if (play) savePlay(play);
  play = validate(p);
  hist.undo = []; hist.redo = [];
  ui.sel = null;
  ui.beat = -1; ui.T = 0; ui.snap = true;
  history.replaceState(null, '', location.pathname + location.search);
  changed();
  setPlaying(false);
  selectBeat(-1);
}
async function share() {
  const code = await encodeShare(play);
  const url = `${location.origin}${location.pathname}#p=${code}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone with it can open a copy of this play.'); } catch { prompt('Copy this link', url); }
}

// ---------- Export a video ----------
function openExport() {
  const quizMode = ui.mode === 'quiz' && ui.quiz;
  $('export').classList.toggle('quiz-export', !!quizMode);
  if (quizMode) { const v = $('export-form').querySelector('input[name=format][value=vertical]'); if (v) v.checked = true; }
  const q = QUALITIES[(new FormData($('export-form'))).get('quality') || '1080'];
  const mime = pickMime(q);
  $('codec-field').hidden = !hevcMime(q);
  $('export-note').textContent = mime
    ? `Plays the whole play once in real time while it records (about ${Math.round(timing(play).total + 3)} seconds), then downloads ${mime.includes('mp4') ? 'an MP4' : 'a WebM'} file. Keep this tab open until it finishes.`
    : 'This browser can’t record video. Try Chrome, Edge or Safari on a computer.';
  if (mime && quizMode) $('export-note').textContent = `Records this question as a quiz Short, about 18 seconds: a title, the play from #${(playerOf(ui.quiz.scene.you) || {}).num}'s eyes, a 5-second pause with the choices, the answer, the replay from above and the rule. Keep this tab open until it finishes.`;
  $('export-go').disabled = !mime;
  $('export').showModal();
}
function startExport() {
  const fd = new FormData($('export-form'));
  const q = videoSize(fd.get('quality') || '1080', fd.get('format') || 'landscape');
  const opts = { format: fd.get('format') || 'landscape', camera: fd.get('camera'), captions: fd.get('captions') === 'on', numbers: fd.get('numbers') === 'on', q };
  $('export').close();
  closePops();
  const mime = pickMime(q, fd.get('codec') || 'h264');
  if (!mime) return;
  setPlaying(false);
  ui.sel = null;
  ui.T = 0; ui.snap = true; ui.beat = -1; ui.endHold = 0;
  const recorder = new Recorder(scene, q);
  scene.setRecordSize(q);
  if (ui.mode === 'quiz' && ui.quiz) return startQuizExport(opts, mime, q, recorder);
  const lead = opts.camera === 'cinematic' ? 1.4 : 0.8;
  ui.rec = { opts, recorder, t: 0, tail: 0, lead, started: false, total: lead + timing(play).total + 1.4, saved: { loop: ui.loop, damping: scene.controls.enableDamping, cam: scene.camera.position.clone(), target: scene.controls.target.clone() } };
  ui.loop = false;
  scene.controls.enableDamping = false;
  scene.controls.enabled = false;
  if (opts.format === 'vertical' && opts.camera === 'static') {
    // A higher camera so the half court fills a tall frame.
    scene.camera.position.set(0, 13.2, 6.4);
    scene.controls.target.set(0, 0, -2.6);
    scene.camera.lookAt(scene.controls.target);
  }
  $('app').classList.add('recording');
  $('labels').hidden = true;
  $('rec-status').hidden = false;
  renderAll();
  recorder.start({ mime, title: play.name, captions: opts.captions, numbers: opts.numbers });
}
// ---------- Quiz Short: hook, play from their eyes, 5 s pause, reveal, the read, the rule ----------
const QUIZ_SHORT = { hook: 1.8, count: 5, reveal: 1.6, outro: 2.6 };
function startQuizExport(opts, mime, q, recorder) {
  const i = ui.quiz.i;
  store('court.quizIntro', '1');
  startQuiz(i);
  setPlaying(false);
  ui.T = 0; ui.snap = true;
  const sc = ui.quiz.scene;
  const playLen = ui.quiz.freezeT + (timing(play).total - ui.quiz.freezeT + 1.2) / 0.75;
  ui.rec = { opts, recorder, quiz: true, qphase: 'hook', qt: 0, t: 0, tail: 0, total: QUIZ_SHORT.hook + playLen + QUIZ_SHORT.count + QUIZ_SHORT.reveal + QUIZ_SHORT.outro + 1,
    saved: { loop: ui.loop, damping: scene.controls.enableDamping, cam: scene.camera.position.clone(), target: scene.controls.target.clone() } };
  ui.loop = false;
  quizCam('pov', { silent: true });
  $('quiz-card').hidden = true; $('quiz-banner').hidden = true;
  $('app').classList.add('recording');
  $('labels').hidden = true;
  $('rec-status').hidden = false;
  recorder.start({ mime, title: sc.title || play.name, captions: false, numbers: opts.numbers });
}
function quizRecState(R) {
  const sc = ui.quiz.scene, me = playerOf(sc.you) || {};
  const correct = sc.choices.findIndex((c) => c.correct);
  return { phase: R.qphase, t: R.qt, count: QUIZ_SHORT.count, you: me.num, title: sc.title || play.name, prompt: sc.prompt,
    choices: sc.choices.map((c) => c.label), correct, why: sc.choices[correct].why, rule: sc.rule };
}
function quizRecTick(R, dt, total) {
  R.t += dt; R.qt += dt;
  const q = ui.quiz;
  const st = $('rec-time'); if (st) st.textContent = `${Math.min(R.t, R.total).toFixed(1)} / ${R.total.toFixed(1)} s`;
  const go = (ph) => { R.qphase = ph; R.qt = 0; };
  if (R.qphase === 'hook' && R.qt >= QUIZ_SHORT.hook) { go('play'); setPlaying(true); }
  else if (R.qphase === 'play' && q.phase === 'freeze') { go('freeze'); $('quiz-card').hidden = true; }
  else if (R.qphase === 'freeze' && R.qt >= QUIZ_SHORT.count) go('reveal');
  else if (R.qphase === 'reveal' && R.qt >= QUIZ_SHORT.reveal) {
    go('replay');
    const sc = q.scene;
    q.phase = 'answer';
    if (sc.answerMoves) { const m = play.beats[sc.freeze[0]].moves; m[sc.you] = { ...(m[sc.you] || {}), ...clone(sc.answerMoves) }; }
    ui.arrows = true;
    quizCam('broadcast', { silent: true });
    if (R.opts.format === 'vertical') {
      // A higher, tighter camera so the half court fills a tall Reel.
      scene.camera.position.set(0, 13.2, 6.4);
      scene.controls.target.set(0, 0, -2.6);
      scene.camera.lookAt(scene.controls.target);
    }
    ui.speed = 0.75;
    ui.T = Math.max(0, q.freezeT - 1.2); ui.snap = true;
    setPlaying(true);
  } else if (R.qphase === 'replay' && ui.T >= total) { R.tail += dt; if (R.tail > 0.6) { go('outro'); setPlaying(false); } }
  else if (R.qphase === 'outro' && R.qt >= QUIZ_SHORT.outro && !R.finishing) finishExport();
  if (R.qphase !== 'play') $('quiz-card').hidden = true;
}
function restoreAfterExport() {
  const R = ui.rec;
  ui.rec = null;
  if (R.quiz) { ui.speed = 1; $('speed').textContent = '1×'; }
  ui.loop = R.saved.loop;
  scene.setRecordSize(null);
  scene.controls.enableDamping = R.saved.damping;
  scene.controls.enabled = true;
  scene.camera.position.copy(R.saved.cam);
  scene.controls.target.copy(R.saved.target);
  scene.controls.update();
  $('app').classList.remove('recording');
  $('labels').hidden = false;
  $('rec-status').hidden = true;
  setPlaying(false);
}
async function finishExport() {
  const R = ui.rec;
  R.finishing = true;
  const blob = await R.recorder.stop();
  restoreAfterExport();
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = (play.name || 'play').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'play';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}${R.opts.camera === 'cinematic' ? '-cinematic' : ''}${R.opts.format === 'landscape' ? '' : '-' + R.opts.format}-${R.opts.q.label}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Saved ${a.download}`);
  if (ui.mode === 'quiz' && ui.quiz) startQuiz(ui.quiz.i);
}
function cancelExport() { if (!ui.rec) return; ui.rec.recorder.cancel(); restoreAfterExport(); toast('Recording cancelled'); }

// ---------- First-visit tour ----------
const TOUR = [
  { title: 'Welcome to Court Mode', text: 'Basketball plays, one beat at a time. Each beat is one step of the play: a cut, a screen, a pass or a shot. Watch the ready-made plays, or draw your own.', next: 'Show me around' },
  { sel: '#play-btn', title: 'Press play', text: 'Watch this play run. The orange arrows show who moves on each beat, and the bar along the bottom is the timeline.' },
  { sel: '[data-mode="watch"]', title: 'Just want to watch?', text: 'Watch mode runs through the whole playbook, one play after another, with the list of plays on the left.' },
  { sel: '[data-action="playbook"]', title: 'The Playbook', text: 'Over two dozen plays, from Beginner to Advanced. Open one and it becomes your own copy to change.' },
  { sel: '#cards', title: 'Make a change', text: 'In Edit, pick a beat on the left, then drag a player on the court to where they should end up. Select a player to set screens, passes and shots.' },
  { sel: '[data-mode="quiz"]', title: 'Test yourself', text: 'Quiz puts you in one player’s shoes. The play runs from their eyes, freezes, and you pick what they should do.' },
  { sel: '#colors-btn', title: 'Make it yours', text: 'Pick the teams and the court, from a New York park to a big arena. Flip mirrors the whole play left to right.', next: 'Start playing' },
];
let tourAt = -1;
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; }
function startTour() { if (ui.mode === 'watch') exitWatch(); closePops(); tourAt = 0; showTour(); }
function endTour() { tourAt = -1; $('tour').hidden = true; store('court.toured', '1'); }
function showTour() {
  const st = TOUR[tourAt];
  if (!st) return endTour();
  const el = st.sel && document.querySelector(st.sel);
  const visible = el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  if (st.sel && !visible) { tourAt++; return showTour(); }
  $('tour').hidden = false;
  $('tour-step').textContent = `${tourAt + 1} of ${TOUR.length}`;
  $('tour-title').textContent = st.title;
  $('tour-text').textContent = st.text;
  $('tour-next').textContent = st.next || 'Next';
  $('tour-skip').hidden = tourAt === TOUR.length - 1;
  const ring = $('tour-ring'), card = $('tour-card');
  if (!visible) {
    ring.hidden = true;
    card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%, -50%)';
  } else {
    const r = el.getBoundingClientRect();
    ring.hidden = false;
    Object.assign(ring.style, { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: Math.min(r.height, innerHeight * 0.6) + 12 + 'px' });
    const cw = Math.min(340, innerWidth - 24);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12);
    let top = r.bottom + 14;
    if (top + 190 > innerHeight) top = Math.max(12, r.top - 200);
    if (r.height > innerHeight * 0.5) { left = Math.min(r.right + 14, innerWidth - cw - 12); top = Math.max(12, r.top + 40); }
    card.style.transform = 'none'; card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  $('tour-next').focus();
}
addEventListener('resize', () => { if (tourAt >= 0) showTour(); });

// ---------- Recording hook ----------
window.__court = {
  get play() { return play; }, ui, scene, setPlaying, selectBeat, loadInto, PRESETS, enterWatch, exitWatch, showQueueItem, enterQuiz, startQuiz, answerQuiz, quizCam,
  step(dt) { ui.manual = true; ui.fixedDt = dt; frame(performance.now()); },
};

// ---------- Boot ----------
async function boot() {
  performance.mark('court:scene');
  const ts = new URLSearchParams(location.search).get('tags');
  if (ts) document.body.dataset.tags = ts;
  hydrateIcons();
  let p = null;
  const m = location.hash.match(/#p=([\w-]+)/);
  if (m) { try { p = await decodeShare(m[1]); p.id = uid(); toast('Opened a shared play. Your edits are saved as your own copy.'); } catch { toast('That share link could not be opened.'); } }
  if (!p && lastId()) p = loadPlay(lastId());
  if (!p) p = clonePreset('preset-yesterday');
  play = validate(p);
  savePlay(play);
  const theme = new URLSearchParams(location.search).get('theme');
  if (theme && THEMES[theme]) play.theme = theme;
  scene.setView(new URLSearchParams(location.search).get('view') || 'broadcast');
  markView();
  ui.beat = -1; ui.T = 0;
  renderAll();
  setPlaying(new URLSearchParams(location.search).get('autoplay') === '1');
  const qp = new URLSearchParams(location.search);
  const qz = location.hash.match(/#qz=([\w-]+)/);
  if (qz) { try { enterQuiz(await openSharedQuestion(qz[1])); } catch { toast('That question link could not be opened.'); enterQuiz(0); } }
  else if (qp.get('mode') === 'quiz') { enterQuiz(Math.max(0, (Number(qp.get('q')) || 1) - 1)); }
  else if (qp.get('mode') === 'watch') enterWatch();
  else if (!store('court.toured') && !new URLSearchParams(location.search).has('notour')) setTimeout(startTour, 700);
  requestAnimationFrame(frame);
}
boot();
