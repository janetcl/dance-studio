// Court Mode preview: plays a basketball play beat by beat on a 3D half court.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Player } from './players.js';
import { PLAYS } from './plays.js';

// Court units are tenths of a foot on a 50 ft × 47 ft half court: u across (0–500),
// v from the baseline (0) to half court (470). World units are meters.
const F = 0.03048;
const W = (u, v) => new THREE.Vector3((u - 250) * F, 0, (v - 235) * F);
const RIM_Y = 3.05;
const RIM = W(250, 52.5).setY(RIM_Y);

export const THEMES = {
  rb: { name: 'Red vs blue', O: { jersey: '#D62839', shorts: '#A81C2C', num: '#FFFFFF' }, D: { jersey: '#1F4FD1', shorts: '#173C9E', num: '#FFFFFF' }, paint: '#2D4E9C' },
  tp: { name: 'Teal vs purple', O: { jersey: '#0E8C7F', shorts: '#0A6B61', num: '#FFFFFF' }, D: { jersey: '#6A3FC1', shorts: '#51309A', num: '#FFFFFF' }, paint: '#4B3A8C' },
  gg: { name: 'Green vs gold', O: { jersey: '#1E7B3C', shorts: '#165C2D', num: '#F7D046' }, D: { jersey: '#F2B705', shorts: '#C99700', num: '#1D1A17' }, paint: '#1E6B39' },
  bw: { name: 'Black vs white', O: { jersey: '#1D1A17', shorts: '#1D1A17', num: '#FFFFFF' }, D: { jersey: '#F4F2EE', shorts: '#F4F2EE', num: '#1D1A17' }, paint: '#5A544C' },
  nysa: { name: 'NY vs SA jerseys', O: { jersey: '#F7F7F5', shorts: '#F7F7F5', num: '#006BB6', trim: '#F58426' }, D: { jersey: '#1A1A1A', shorts: '#1A1A1A', num: '#C4CED4', trim: '#1A1A1A' }, paint: '#0A5FA8' },
};

const LOOKS = {
  O: [
    { num: '1', pos: 'PG', skin: '#E0AC80', hair: '#2B1D14', style: 'pony', height: 0.95 },
    { num: '2', pos: 'SG', skin: '#8D5A3B', hair: '#1D1A17', style: 'buzz', height: 1.0 },
    { num: '3', pos: 'SF', skin: '#F1C9A5', hair: '#C9A15A', style: 'bun', height: 1.0 },
    { num: '4', pos: 'PF', skin: '#5B3A29', hair: '#1D1A17', style: 'curly', height: 1.05 },
    { num: '5', pos: 'C', skin: '#C68B5E', hair: '#2B1D14', style: 'short', height: 1.1 },
  ],
  D: [
    { num: '1', pos: 'X1', skin: '#5B3A29', hair: '#1D1A17', style: 'bun', height: 0.97 },
    { num: '2', pos: 'X2', skin: '#F1C9A5', hair: '#6B3E1F', style: 'short', height: 1.0 },
    { num: '3', pos: 'X3', skin: '#C68B5E', hair: '#1D1A17', style: 'long', height: 1.0 },
    { num: '4', pos: 'X4', skin: '#E0AC80', hair: '#1D1A17', style: 'buzz', height: 1.04 },
    { num: '5', pos: 'X5', skin: '#8D5A3B', hair: '#2B1D14', style: 'curly', height: 1.08 },
  ],
};

// ---------- Play timeline ----------
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
const PACES = {
  even: easeInOut,
  // "slow, slow, explode": the first half covers a quarter of the path.
  explode: (t) => { const p = t < 0.5 ? t * 0.5 : 0.25 + (t - 0.5) * 1.5; return p * 0.85 + easeInOut(t) * 0.15; },
};

function compile(play) {
  const starts = [];
  const pos = Object.fromEntries(Object.entries(play.start).map(([k, [u, v]]) => [k, [u, v]]));
  let holder = play.ball;
  let t0 = 0;
  const beats = play.beats.map((b) => {
    const moves = {};
    for (const [who, m] of Object.entries(b.moves || {})) {
      const pts = m.path.map(([u, v]) => W(u, v));
      moves[who] = { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pace: PACES[m.pace || 'even'] };
    }
    const beat = { ...b, start: t0, moves, from: Object.fromEntries(Object.entries(pos).map(([k, p]) => [k, W(p[0], p[1])])), holder };
    for (const [who, m] of Object.entries(b.moves || {})) pos[who] = m.path[m.path.length - 1];
    if (b.ball && (b.ball.type === 'pass')) holder = b.ball.to;
    if (b.ball && b.ball.type === 'shot') holder = null;
    t0 += b.dur;
    starts.push(beat.start);
    return beat;
  });
  return { ...play, beats, total: t0 };
}

// ---------- Floor ----------
function courtTexture(paint) {
  const S = 3; // px per court unit
  const U0 = -70, V0 = -110, UW = 640, VH = 640;
  const c = document.createElement('canvas');
  c.width = UW * S; c.height = VH * S;
  const g = c.getContext('2d');
  const X = (u) => (u - U0) * S, Y = (v) => (v - V0) * S;
  g.fillStyle = '#2B2A28';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = paint;
  g.fillRect(X(-30), Y(-60), (560) * S, (560) * S);
  // Maple planks
  const plank = 7.5;
  for (let u = 0, i = 0; u < 500; u += plank, i++) {
    for (let v = -2, j = 0; v < 470; j++) {
      const len = 60 + ((i * 37 + j * 53) % 90);
      const h = 33 + ((i * 13 + j * 7) % 5);
      const l = 72 + ((i * 29 + j * 11) % 9) * 0.9;
      g.fillStyle = `hsl(${h} 52% ${l}%)`;
      g.fillRect(X(u), Y(Math.max(0, v)), plank * S - 1, Math.min(len, 470 - Math.max(0, v)) * S - 1);
      v += len;
    }
  }
  // Paint
  g.fillStyle = paint;
  g.globalAlpha = 0.85;
  g.fillRect(X(170), Y(0), 160 * S, 190 * S);
  g.globalAlpha = 1;
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 2 * S;
  const line = (f) => { g.beginPath(); f(); g.stroke(); };
  line(() => g.rect(X(0), Y(0), 500 * S, 470 * S));
  line(() => g.rect(X(170), Y(0), 160 * S, 190 * S));
  line(() => g.arc(X(250), Y(190), 60 * S, 0, Math.PI));
  g.setLineDash([10 * S, 8 * S]);
  line(() => g.arc(X(250), Y(190), 60 * S, Math.PI, 2 * Math.PI));
  g.setLineDash([]);
  const a = Math.asin(89.5 / 237.5);
  line(() => { g.moveTo(X(30), Y(0)); g.lineTo(X(30), Y(142)); g.arc(X(250), Y(52.5), 237.5 * S, Math.PI - a, a, true); g.lineTo(X(470), Y(0)); });
  line(() => g.arc(X(250), Y(52.5), 40 * S, 0, Math.PI));
  line(() => g.arc(X(250), Y(470), 60 * S, Math.PI, 2 * Math.PI));
  // Lane hash marks
  for (const v of [70, 110, 140, 170]) for (const [u0, u1] of [[160, 170], [330, 340]]) line(() => { g.moveTo(X(u0), Y(v)); g.lineTo(X(u1), Y(v)); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: UW * F, h: VH * F, cx: (U0 + UW / 2 - 250) * F, cz: (V0 + VH / 2 - 235) * F };
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#D9631E';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.strokeStyle = '#1C120C';
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (const x0 of [0, 256]) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) { const y = 128 + Math.sin((x / 256) * Math.PI * 2) * 70; x ? g.lineTo(x0 + x, y) : g.moveTo(x0 + x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Diagram overlay (arrows for the current beat) ----------
const OV = { U0: -10, V0: -50, UW: 520, VH: 530, S: 2 };
function drawMarks(g, beat, accent) {
  const { U0, V0, S } = OV;
  const X = (u) => (u - U0) * S, Y = (v) => (v - V0) * S;
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  if (!beat) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const arrowHead = (pts) => {
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    const ang = Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0]));
    g.beginPath();
    g.moveTo(X(b[0]) + Math.cos(ang) * 6 * S, Y(b[1]) + Math.sin(ang) * 6 * S);
    g.lineTo(X(b[0]) + Math.cos(ang + 2.5) * 12 * S, Y(b[1]) + Math.sin(ang + 2.5) * 12 * S);
    g.lineTo(X(b[0]) + Math.cos(ang - 2.5) * 12 * S, Y(b[1]) + Math.sin(ang - 2.5) * 12 * S);
    g.closePath(); g.fill();
  };
  const smooth = (pts) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([u, v]) => new THREE.Vector3(u, v, 0)), false, 'centripetal');
    return c.getPoints(60).map((p) => [p.x, p.y]);
  };
  const stroke = (pts, dash, width, color) => {
    g.setLineDash(dash.map((d) => d * S));
    g.lineWidth = width * S;
    g.strokeStyle = color;
    g.beginPath();
    pts.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
    g.stroke();
    g.setLineDash([]);
  };
  for (const m of beat.marks || []) {
    let pts = m.k === 'pass' ? [m.a, m.b] : m.k === 'screen' ? null : smooth(m.pts);
    if (m.k === 'dribble') {
      const base = smooth(m.pts), z = [];
      base.forEach(([u, v], i) => {
        if (i === 0 || i === base.length - 1 || i % 3) return z.push([u, v]);
        const [pu, pv] = base[i - 1];
        const dx = u - pu, dy = v - pv, l = Math.hypot(dx, dy) || 1;
        const s = (i / 3) % 2 ? 7 : -7;
        z.push([u - (dy / l) * s, v + (dx / l) * s]);
      });
      pts = z;
    }
    g.fillStyle = accent;
    if (pts) {
      stroke(pts, m.k === 'pass' ? [9, 7] : [], 7, 'rgba(255,255,255,.75)');
      stroke(pts, m.k === 'pass' ? [9, 7] : [], 4, accent);
      g.fillStyle = 'rgba(255,255,255,.9)';
      arrowHead(pts.map(([u, v]) => [u, v]));
      g.fillStyle = accent;
      arrowHead(pts);
    } else {
      const [u, v] = m.at, a = (m.ang * Math.PI) / 180;
      const p = [[u - Math.cos(a) * 16, v - Math.sin(a) * 16], [u + Math.cos(a) * 16, v + Math.sin(a) * 16]];
      stroke(p, [], 11, 'rgba(255,255,255,.8)');
      stroke(p, [], 7, '#1D1A17');
    }
  }
}

// ---------- App ----------
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  play: compile(PLAYS[0]),
  theme: THEMES[params.get('theme')] ? params.get('theme') : 'rb',
  T: 0, playing: params.get('autoplay') !== '0', speed: 1, endHold: 0, lastBeat: -1, snap: true,
};

const host = $('court');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#E9E3D9');
scene.fog = new THREE.Fog('#E9E3D9', 30, 60);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 6;
controls.maxDistance = 40;
const VIEWS = {
  broadcast: { pos: [0, 9.8, 13.2], target: [0, 0.6, -1.6] },
  baseline: { pos: [0, 4.6, -15.5], target: [0, 1, 0.5] },
  top: { pos: [0, 21, 0.4], target: [0, 0, 0] },
};
function setView(name) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}

scene.add(new THREE.HemisphereLight('#FFF8EE', '#8C7A66', 1.25));
const key = new THREE.DirectionalLight('#FFFFFF', 2.1);
key.position.set(6, 16, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);

let floor;
function buildFloor() {
  const t = THEMES[state.theme];
  const { tex, w, h, cx, cz } = courtTexture(t.paint);
  if (floor) { floor.material.map.dispose(); floor.material.map = tex; floor.material.needsUpdate = true; return; }
  floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);
}
buildFloor();

// Hoop
{
  const white = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.3, transparent: true, opacity: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2A2724', roughness: 0.5 });
  const orange = new THREE.MeshStandardMaterial({ color: '#E2531B', roughness: 0.4, metalness: 0.2 });
  const boardZ = W(250, 40).z;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.04), white);
  board.position.set(0, 3.3, boardZ);
  board.castShadow = true;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.46, 0.045), new THREE.MeshBasicMaterial({ color: '#E2531B', wireframe: true }));
  box.position.set(0, 3.25, boardZ + 0.001);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.012, 10, 40), orange);
  rim.rotation.x = Math.PI / 2;
  rim.position.copy(RIM);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.2286, 0.15, 0.42, 16, 4, true), new THREE.MeshBasicMaterial({ color: '#FFFFFF', wireframe: true, transparent: true, opacity: 0.8 }));
  net.position.set(RIM.x, RIM_Y - 0.21, RIM.z);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), dark);
  arm.position.set(0, 3.3, boardZ - 0.72);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), dark);
  pole.position.set(0, 1.7, boardZ - 1.4);
  pole.castShadow = true;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.6), dark);
  pad.position.set(0, 0.25, boardZ - 1.7);
  scene.add(board, box, rim, net, arm, pole, pad);
}

// Diagram overlay
const ovCanvas = document.createElement('canvas');
ovCanvas.width = OV.UW * OV.S; ovCanvas.height = OV.VH * OV.S;
const ovCtx = ovCanvas.getContext('2d');
const ovTex = new THREE.CanvasTexture(ovCanvas);
ovTex.colorSpace = THREE.SRGBColorSpace;
const overlay = new THREE.Mesh(new THREE.PlaneGeometry(OV.UW * F, OV.VH * F), new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false, opacity: 0 }));
overlay.rotation.x = -Math.PI / 2;
overlay.position.set((OV.U0 + OV.UW / 2 - 250) * F, 0.015, (OV.V0 + OV.VH / 2 - 235) * F);
overlay.renderOrder = 1;
scene.add(overlay);

// Players
const labels = $('labels');
const team = { O: [], D: [] };
for (const side of ['O', 'D']) {
  LOOKS[side].forEach((look, i) => {
    const p = new Player(side + (i + 1), { ...look, ...THEMES[state.theme][side] });
    p.side = side;
    p.idx = String(i + 1);
    p.pos = new THREE.Vector3();
    p.prev = new THREE.Vector3();
    const tag = document.createElement('span');
    tag.className = 'tag ' + side;
    tag.textContent = side === 'O' ? look.num : 'X' + look.num;
    labels.appendChild(tag);
    p.tag = tag;
    scene.add(p.root);
    team[side].push(p);
  });
}

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.7 }));
ball.castShadow = true;
scene.add(ball);

function applyTheme(name) {
  state.theme = name;
  const t = THEMES[name];
  for (const side of ['O', 'D']) for (const p of team[side]) p.setKit({ ...t[side] });
  document.documentElement.style.setProperty('--o', t.O.jersey);
  document.documentElement.style.setProperty('--o-ink', t.O.num);
  document.documentElement.style.setProperty('--d', t.D.jersey);
  document.documentElement.style.setProperty('--d-ink', t.D.num);
  buildFloor();
  document.querySelectorAll('[data-theme-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === name)));
  const u = new URL(location.href); u.searchParams.set('theme', name); history.replaceState(null, '', u);
}

// ---------- Sampling ----------
function beatAt(T) {
  const bs = state.play.beats;
  for (let i = bs.length - 1; i >= 0; i--) if (T >= bs[i].start - 1e-9) return { i, b: bs[i], t: Math.min(1, (T - bs[i].start) / bs[i].dur) };
  return { i: 0, b: bs[0], t: 0 };
}
function offensePos(b, t, who, out) {
  const m = b.moves[who];
  if (m) return m.curve.getPointAt(m.pace(Math.max(0, Math.min(1, t))), out);
  return out.copy(b.from[who]);
}
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function handPos(p, out, side = 1) {
  const h = p.heading, s = p.look.height || 1;
  return out.set(p.pos.x + Math.cos(h) * 0.24 * side + Math.sin(h) * 0.2, 1.05 * s, p.pos.z - Math.sin(h) * 0.24 * side + Math.cos(h) * 0.2);
}
function ballPos(b, t, out) {
  const P = (n) => team.O[Number(n) - 1];
  const ev = b.ball || {};
  const hold = (who) => handPos(P(who), out);
  const dribble = (who, k) => {
    const p = P(who);
    handPos(p, out, 1.2);
    out.y = 0.12 + Math.abs(Math.cos(k * Math.PI * 2.4)) * 0.85 * (p.look.height || 1);
    return out;
  };
  if (ev.type === 'dribble') return dribble(ev.who, state.T);
  if (ev.type === 'pass' || ev.type === 'shot') {
    const from = ev.type === 'pass' ? ev.from : ev.who;
    if (t < ev.t0) return ev.dribble ? dribble(from, state.T) : hold(from);
    const k = Math.min(1, (t - ev.t0) / (ev.t1 - ev.t0));
    handPos(P(from), tmpA);
    if (ev.type === 'pass') {
      if (k >= 1) return hold(ev.to);
      handPos(P(ev.to), tmpB);
      out.lerpVectors(tmpA, tmpB, k);
      out.y += Math.sin(Math.PI * k) * 0.35;
      return out;
    }
    // Jump shot: release above the head, arc into the rim, drop through the net.
    tmpA.y = 2.35 * (P(from).look.height || 1);
    if (k < 1) { out.lerpVectors(tmpA, RIM, k); out.y += Math.sin(Math.PI * k) * 1.7 + 0.05; return out; }
    const drop = Math.min(1, (t - ev.t1) / (1 - ev.t1 + 1e-6));
    return out.set(RIM.x, RIM_Y - drop * 2.2, RIM.z + 0.02);
  }
  return b.holder ? hold(b.holder) : out.copy(RIM);
}

// ---------- UI ----------
const tl = $('beats');
function renderTimeline() {
  const { beats, total } = state.play;
  tl.innerHTML = '';
  beats.forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'beat';
    el.style.flexGrow = String(b.dur);
    el.innerHTML = `<b>${i + 1} · ${b.name}</b><span>${b.who || ''}</span>`;
    el.addEventListener('click', () => { state.T = b.start + 0.001; state.snap = true; state.endHold = 0; });
    tl.appendChild(el);
  });
  $('play-name').textContent = state.play.name;
  $('total').textContent = fmt(total);
}
const fmt = (s) => `0:${String(Math.floor(s)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
function setPlaying(on) {
  state.playing = on;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  $('play').innerHTML = on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';
}
$('play').addEventListener('click', () => { if (!state.playing && state.T >= state.play.total) state.T = 0; setPlaying(!state.playing); });
$('restart').addEventListener('click', () => { state.T = 0; state.snap = true; state.endHold = 0; setPlaying(true); });
$('speed').addEventListener('click', () => { state.speed = state.speed === 1 ? 0.5 : state.speed === 0.5 ? 0.25 : 1; $('speed').textContent = state.speed + '×'; });
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-theme-pick]').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.themePick)));
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) { e.preventDefault(); $('play').click(); }
});

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the same horizontal field of view on narrow screens so the whole court stays in frame.
  const a = w / h, hfov = 2 * Math.atan(Math.tan((18 * Math.PI) / 180) * (a >= 1.6 ? 1.6 : 1.2));
  camera.fov = a >= 1.6 ? 36 : Math.min(82, (2 * Math.atan(Math.tan(hfov / 2) / a) * 180) / Math.PI);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

// ---------- Loop ----------
const clock = new THREE.Clock();
const basketFlat = new THREE.Vector3(RIM.x, 0, RIM.z);
const proj = new THREE.Vector3();
function frame() {
  const real = clock.getDelta();
  const dt = state.fixedDt || Math.min(real, 0.05);
  const now = state.fixedDt ? (state.fixedNow = (state.fixedNow || 0) + dt) : clock.elapsedTime;
  const { play } = state;
  if (state.playing) {
    if (state.T < play.total) state.T = Math.min(play.total, state.T + dt * state.speed);
    else if ((state.endHold += dt) > 1.8) { state.T = 0; state.endHold = 0; state.snap = true; }
  }
  const { i, b, t } = beatAt(state.T);

  // Offense
  for (const p of team.O) {
    p.prev.copy(p.pos);
    offensePos(b, t, p.idx, p.pos);
  }
  // Ball first so players can face it
  ballPos(b, t, ball.position);
  ball.rotation.x += dt * 6;
  const ballFlat = tmpB.set(ball.position.x, 0, ball.position.z);
  for (const p of team.O) {
    const v = p.pos.distanceTo(p.prev) / Math.max(dt, 1e-4);
    const moving = v > 0.25 && !state.snap;
    const dir = moving ? Math.atan2(p.pos.x - p.prev.x, p.pos.z - p.prev.z)
      : Math.atan2(ballFlat.x - p.pos.x, ballFlat.z - p.pos.z);
    const shooting = b.ball && b.ball.type === 'shot' && b.ball.who === p.idx && t > b.ball.t0 - 0.15 && t < b.ball.t1;
    p.root.position.set(p.pos.x, shooting ? Math.sin(Math.PI * Math.min(1, (t - b.ball.t0 + 0.15) / (b.ball.t1 - b.ball.t0 + 0.15))) * 0.35 : 0, p.pos.z);
    p.tick(dt, moving ? v : 0, dir, now, { moving, style: v > 3.2 ? 'run' : 'walk' }, state.snap);
  }
  // Defense: man to man, a step toward the basket and a touch toward the ball, with a little lag.
  for (const d of team.D) {
    const man = team.O[Number(d.idx) - 1].pos;
    const toRim = tmpA.subVectors(basketFlat, man);
    const dist = toRim.length();
    toRim.multiplyScalar(Math.min(1.05, dist * 0.45) / (dist || 1));
    const target = toRim.add(man);
    target.x += (ballFlat.x - target.x) * 0.08;
    target.z += (ballFlat.z - target.z) * 0.08;
    d.prev.copy(d.pos);
    if (state.snap) d.pos.copy(target);
    else d.pos.lerp(target, Math.min(1, dt * 3.4));
    const v = d.pos.distanceTo(d.prev) / Math.max(dt, 1e-4);
    d.root.position.set(d.pos.x, 0, d.pos.z);
    d.tick(dt, v > 0.25 && !state.snap ? v : 0, Math.atan2(man.x - d.pos.x, man.z - d.pos.z), now, { moving: v > 0.25 && !state.snap, style: v > 3.2 ? 'run' : 'chasse' }, state.snap);
  }
  state.snap = false;

  // Beat change: redraw arrows, caption, timeline
  if (i !== state.lastBeat) {
    state.lastBeat = i;
    drawMarks(ovCtx, b, '#E0552E');
    ovTex.needsUpdate = true;
    $('cap-title').textContent = `Beat ${i + 1} · ${b.name}`;
    $('cap-text').textContent = b.text;
    [...tl.children].forEach((el, k) => el.classList.toggle('on', k === i));
    $('beat-now').textContent = `Beat ${i + 1}`;
  }
  overlay.material.opacity = Math.min(1, t * 6) * (state.T >= play.total ? Math.max(0, 1 - state.endHold * 2) : 1) * 0.95;
  const pct = state.T / play.total;
  $('playhead').style.left = `calc(${pct * 100}% - 1px)`;
  $('time').textContent = fmt(state.T);
  $('clock').textContent = (24 - state.T).toFixed(1);

  controls.update();
  renderer.render(scene, camera);

  // Number tags over heads
  const w = host.clientWidth, h = host.clientHeight;
  for (const p of [...team.O, ...team.D]) {
    proj.set(p.root.position.x, 2.05 * (p.look.height || 1) + p.root.position.y, p.root.position.z).project(camera);
    p.tag.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -100%)`;
  }
  if (!state.manual) requestAnimationFrame(frame);
}

renderTimeline();
applyTheme(state.theme);
setView(params.get('view') || 'broadcast');
setPlaying(state.playing);
resize();
frame();
// Hook for recording: step the animation by a fixed amount instead of real time.
window.__court = { state, setView, applyTheme, setPlaying, step(dt) { state.manual = true; state.fixedDt = dt; frame(); } };
