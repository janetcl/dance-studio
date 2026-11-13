// The 3D court: floor, hoop, players, ball, arrows for the current beat, path handles,
// and picking/dragging. Positions come in as court units (see model.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Player } from './players.js';
import { THEMES, FLOORS, RIM as RIM_UV } from './model.js';

const F = 0.03048;
export const W = (u, v, y = 0) => new THREE.Vector3((u - 250) * F, y, (v - 235) * F);
const toUV = (p) => [p.x / F + 250, p.z / F + 235];
const RIM_Y = 3.05;
const RIM = W(RIM_UV[0], RIM_UV[1], RIM_Y);

function courtTexture(look) {
  const S = 3, U0 = -70, V0 = -110, UW = 640, VH = 640;
  const c = document.createElement('canvas');
  c.width = UW * S; c.height = VH * S;
  const g = c.getContext('2d');
  const X = (u) => (u - U0) * S, Y = (v) => (v - V0) * S;
  const fl = FLOORS[look.floor] || FLOORS.maple;
  g.fillStyle = look.scene === 'arena' ? '#121316' : '#2B2A28';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = look.border;
  g.fillRect(X(-30), Y(-60), 560 * S, 560 * S);
  if (fl.solid) {
    g.fillStyle = fl.solid;
    g.fillRect(X(0), Y(0), 500 * S, 470 * S);
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
      g.fillRect(X(Math.random() * 500), Y(Math.random() * 470), 2, 2);
    }
  } else {
    const plank = 7.5;
    for (let u = 0, i = 0; u < 500; u += plank, i++) {
      for (let v = -2, j = 0; v < 470; j++) {
        const len = 60 + ((i * 37 + j * 53) % 90);
        g.fillStyle = `hsl(${fl.h + ((i * 13 + j * 7) % 5)} ${fl.s}% ${fl.l + ((i * 29 + j * 11) % 9) * 0.9}%)`;
        g.fillRect(X(u), Y(Math.max(0, v)), plank * S - 1, Math.min(len, 470 - Math.max(0, v)) * S - 1);
        v += len;
      }
    }
  }
  if (look.paint) {
    g.fillStyle = look.paint;
    g.globalAlpha = 0.85;
    g.fillRect(X(170), Y(0), 160 * S, 190 * S);
    g.beginPath(); g.arc(X(250), Y(470), 60 * S, Math.PI, 2 * Math.PI); g.fill();
    g.globalAlpha = 1;
  }
  g.strokeStyle = look.lines;
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
  for (const v of [70, 110, 140, 170]) for (const [u0, u1] of [[160, 170], [330, 340]]) line(() => { g.moveTo(X(u0), Y(v)); g.lineTo(X(u1), Y(v)); });
  if (look.label) {
    // Baseline wordmark, painted on the apron behind the basket, readable from the broadcast camera.
    g.save();
    g.fillStyle = look.lines;
    g.globalAlpha = 0.92;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 34 * S;
    g.font = `800 ${size}px Geist, "Arial Black", Impact, sans-serif`;
    const text = look.label.toUpperCase().slice(0, 28);
    while (g.measureText(text).width > 480 * S && size > 10) { size -= 2; g.font = `800 ${size}px Geist, "Arial Black", Impact, sans-serif`; }
    g.translate(X(250), Y(-30));
    g.scale(1, -1);
    g.rotate(Math.PI);
    g.scale(-1, 1);
    g.fillText(text, 0, 0);
    g.restore();
  }
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

const OV = { U0: -40, V0: -60, UW: 580, VH: 540, S: 2 };
function drawMarks(g, marks, selected, accent) {
  const { U0, V0, S } = OV;
  const X = (u) => (u - U0) * S, Y = (v) => (v - V0) * S;
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const head = (a, b, color, size) => {
    const ang = Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0]));
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(X(b[0]) + Math.cos(ang) * 6 * S, Y(b[1]) + Math.sin(ang) * 6 * S);
    g.lineTo(X(b[0]) + Math.cos(ang + 2.5) * size * S, Y(b[1]) + Math.sin(ang + 2.5) * size * S);
    g.lineTo(X(b[0]) + Math.cos(ang - 2.5) * size * S, Y(b[1]) + Math.sin(ang - 2.5) * size * S);
    g.closePath(); g.fill();
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
  const zig = (base) => base.map(([u, v], i) => {
    if (i === 0 || i === base.length - 1 || i % 3) return [u, v];
    const [pu, pv] = base[i - 1];
    const dx = u - pu, dy = v - pv, l = Math.hypot(dx, dy) || 1, s = (i / 3) % 2 ? 6 : -6;
    return [u - (dy / l) * s, v + (dx / l) * s];
  });
  // Screens under arrows, the selected player's marks on top.
  const order = [...marks].sort((a, b) => (a.k === 'screen' ? -1 : 0) - (b.k === 'screen' ? -1 : 0) || (a.id === selected) - (b.id === selected));
  for (const m of order) {
    const hot = !selected || m.id === selected;
    const color = hot ? accent : 'rgba(224,85,46,.45)';
    const w = m.id === selected ? 5 : 4;
    if (m.k === 'screen') {
      const [u, v] = m.at;
      const p = [[u - Math.cos(m.ang) * 17, v - Math.sin(m.ang) * 17], [u + Math.cos(m.ang) * 17, v + Math.sin(m.ang) * 17]];
      stroke(p, [], 12, 'rgba(255,255,255,.85)');
      stroke(p, [], 7, hot ? '#1D1A17' : 'rgba(29,26,23,.5)');
      continue;
    }
    const pts = m.k === 'pass' || m.k === 'shot' ? [m.a, m.b] : m.k === 'dribble' ? zig(m.pts) : m.pts;
    const dash = m.k === 'pass' || m.k === 'shot' ? [9, 7] : [];
    stroke(pts, dash, w + 3, 'rgba(255,255,255,.75)');
    stroke(pts, dash, w, color);
    head(pts[pts.length - 2], pts[pts.length - 1], 'rgba(255,255,255,.9)', 13);
    head(pts[pts.length - 2], pts[pts.length - 1], color, 11);
  }
}

export const VIEWS = {
  broadcast: { pos: [0, 9.8, 13.2], target: [0, 0.6, -1.6] },
  baseline: { pos: [0, 4.6, -15.5], target: [0, 1, 0.5] },
  top: { pos: [0, 21, 0.4], target: [0, 0, 0] },
};

export class CourtScene {
  constructor(host, labels, hooks = {}) {
    this.host = host;
    this.labels = labels;
    this.hooks = hooks;
    this.people = new Map();
    this.theme = 'rb';
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#E9E3D9');
    scene.fog = new THREE.Fog('#E9E3D9', 30, 60);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.maxPolarAngle = Math.PI * 0.47;
    c.minDistance = 5;
    c.maxDistance = 40;

    this.hemi = new THREE.HemisphereLight('#FFF8EE', '#8C7A66', 1.25);
    scene.add(this.hemi);
    const key = (this.key = new THREE.DirectionalLight('#FFFFFF', 2.1));
    key.position.set(6, 16, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    this.buildHoop();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const ov = (this.ovCanvas = document.createElement('canvas'));
    ov.width = OV.UW * OV.S; ov.height = OV.VH * OV.S;
    this.ovCtx = ov.getContext('2d');
    this.ovTex = new THREE.CanvasTexture(ov);
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(OV.UW * F, OV.VH * F), new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthWrite: false }));
    this.overlay.rotation.x = -Math.PI / 2;
    this.overlay.position.set((OV.U0 + OV.UW / 2 - 250) * F, 0.015, (OV.V0 + OV.VH / 2 - 235) * F);
    this.overlay.renderOrder = 1;
    scene.add(this.overlay);

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.7 }));
    this.ball.castShadow = true;
    scene.add(this.ball);

    this.handleGroup = new THREE.Group();
    scene.add(this.handleGroup);
    this.handleGeo = new THREE.SphereGeometry(0.11, 16, 12);
    this.addGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 20);

    this.setTheme('rb');
    this.setCourt({ floor: 'maple', paint: THEMES.rb.paint, lines: '#FFFFFF', border: THEMES.rb.paint, label: '', scene: 'studio' });
    this.setView('broadcast');
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  buildHoop() {
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
    this.scene.add(board, box, rim, net, arm, pole, pad);
  }

  setTheme(name) {
    this.theme = THEMES[name] ? name : 'rb';
    const t = THEMES[this.theme];
    for (const p of this.people.values()) p.setKit({ ...t[p.side] });
  }

  setCourt(look) {
    const key = JSON.stringify(look);
    if (key === this.courtKey) return;
    this.courtKey = key;
    const { tex, w, h, cx, cz } = courtTexture(look);
    if (this.floor) { this.floor.material.map.dispose(); this.floor.material.map = tex; this.floor.material.needsUpdate = true; } else {
      this.floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.position.set(cx, 0, cz);
      this.floor.receiveShadow = true;
      this.scene.add(this.floor);
    }
    this.floor.material.roughness = look.floor === 'blacktop' ? 0.95 : 0.55;
    const bg = look.scene === 'arena' ? '#16171B' : '#E9E3D9';
    this.scene.background.set(bg);
    this.scene.fog.color.set(bg);
    this.hemi.intensity = look.scene === 'arena' ? 0.8 : 1.25;
    this.key.intensity = look.scene === 'arena' ? 2.6 : 2.1;
    this.host.parentElement.classList.toggle('arena', look.scene === 'arena');
  }

  // Rebuild players when the roster or a look changes.
  setPlayers(players) {
    const key = JSON.stringify(players.map((p) => [p.id, p.num, p.look]));
    if (key === this.rosterKey) {
      for (const p of players) { const x = this.people.get(p.id); if (x) x.tag.textContent = p.side === 'O' ? p.num : 'X' + p.num; }
      return;
    }
    this.rosterKey = key;
    for (const x of this.people.values()) { this.scene.remove(x.root); x.dispose(); x.tag.remove(); }
    this.people.clear();
    const t = THEMES[this.theme];
    for (const p of players) {
      const x = new Player(p.id, { ...p.look, label: p.num, ...t[p.side] });
      x.side = p.side;
      x.pos = new THREE.Vector3();
      x.prev = new THREE.Vector3();
      x.first = true;
      const tag = document.createElement('span');
      tag.className = 'tag ' + p.side;
      tag.textContent = p.side === 'O' ? p.num : 'X' + p.num;
      this.labels.appendChild(tag);
      x.tag = tag;
      this.scene.add(x.root);
      this.people.set(p.id, x);
    }
  }

  setView(name) {
    const v = VIEWS[name] || VIEWS.broadcast;
    this.camera.position.set(...v.pos);
    this.controls.target.set(...v.target);
    this.controls.update();
    this.view = name;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const a = w / h, hfov = 2 * Math.atan(Math.tan((18 * Math.PI) / 180) * (a >= 1.6 ? 1.6 : 1.2));
    this.camera.aspect = a;
    this.camera.fov = a >= 1.6 ? 36 : Math.min(82, (2 * Math.atan(Math.tan(hfov / 2) / a) * 180) / Math.PI);
    this.camera.updateProjectionMatrix();
  }

  setMarks(marks, selected) {
    drawMarks(this.ovCtx, marks, selected, '#E0552E');
    this.ovTex.needsUpdate = true;
  }

  setHandles(list) {
    for (const c of [...this.handleGroup.children]) { this.handleGroup.remove(c); c.material.dispose(); }
    for (const h of list) {
      const solid = h.kind === 'wp';
      const m = new THREE.Mesh(solid ? this.handleGeo : this.addGeo, new THREE.MeshBasicMaterial({ color: solid ? '#E0552E' : '#FFFFFF', depthTest: false, transparent: true, opacity: solid ? 1 : 0.95 }));
      m.position.copy(W(h.uv[0], h.uv[1], solid ? 0.12 : 0.06));
      if (!solid) m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.userData = h;
      m.scale.setScalar(solid ? 1 : 1.25);
      this.handleGroup.add(m);
    }
  }

  // ---------- Per-frame update ----------
  // f: model.sample() result; opts: { dt, now, snap, selected, showDefense, holderHand }
  update(f, opts) {
    const { dt, now, snap, selected, showDefense } = opts;
    const people = this.people;
    const P = (id) => people.get(id);
    for (const [id, x] of people) {
      const uv = f.pos[id];
      const hidden = !uv || (x.side === 'D' && !showDefense);
      x.root.visible = !hidden;
      x.tag.style.display = hidden ? 'none' : '';
      if (hidden) continue;
      const target = W(uv[0], uv[1]);
      x.prev.copy(x.pos);
      if (snap || x.first) x.pos.copy(target);
      else if (x.side === 'D') x.pos.lerp(target, Math.min(1, dt * 4));
      else x.pos.copy(target);
      x.setSelected(id === selected);
    }
    // Ball
    const ballOut = this.ball.position;
    const hand = (x, out, side = 1) => {
      const h = x.heading, s = x.look.height || 1;
      return out.set(x.pos.x + Math.cos(h) * 0.24 * side + Math.sin(h) * 0.2, 1.05 * s, x.pos.z - Math.sin(h) * 0.24 * side + Math.cos(h) * 0.2);
    };
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    const ev = f.ev;
    let shooter = null, jump = 0;
    const dribble = (x) => { hand(x, ballOut, 1.2); ballOut.y = 0.12 + Math.abs(Math.cos(now * Math.PI * 2.4)) * 0.85 * (x.look.height || 1); };
    if (!f.holder || !P(f.holder)) {
      if (ev && ev.kind === 'shot') ballOut.set(RIM.x, 0.12, RIM.z);
      else ballOut.set(RIM.x, 0.12, RIM.z + 1.2);
    } else if (ev && f.t >= ev.t0) {
      const from = P(f.holder);
      const k = Math.min(1, (f.t - ev.t0) / Math.max(0.01, ev.t1 - ev.t0));
      hand(from, tmpA);
      if (ev.kind === 'pass' && P(ev.to)) {
        if (k >= 1) hand(P(ev.to), ballOut);
        else { hand(P(ev.to), tmpB); ballOut.lerpVectors(tmpA, tmpB, k); ballOut.y += Math.sin(Math.PI * k) * 0.35; }
      } else if (ev.kind === 'shot') {
        shooter = f.holder;
        tmpA.y = 2.35 * (from.look.height || 1);
        if (k < 1) { ballOut.lerpVectors(tmpA, RIM, k); ballOut.y += Math.sin(Math.PI * k) * 1.7 + 0.05; } else {
          const drop = Math.min(1, (f.t - ev.t1) / Math.max(0.01, 1 - ev.t1));
          ballOut.set(RIM.x, RIM_Y - drop * 2.9, RIM.z + 0.02);
          ballOut.y = Math.max(0.12, ballOut.y);
        }
      } else hand(from, ballOut);
    } else if (f.dribble) dribble(P(f.holder));
    else hand(P(f.holder), ballOut);
    if (ev && ev.kind === 'shot' && f.holder) {
      shooter = f.holder;
      const span = ev.t1 - ev.t0 + 0.15;
      const q = (f.t - ev.t0 + 0.15) / span;
      jump = q > 0 && q < 1 ? Math.sin(Math.PI * q) * 0.35 : 0;
    }
    this.ball.rotation.x += dt * 6;

    const ballFlat = new THREE.Vector3(ballOut.x, 0, ballOut.z);
    for (const [id, x] of people) {
      if (!x.root.visible) continue;
      const v = x.first ? 0 : x.pos.distanceTo(x.prev) / Math.max(dt, 1e-4);
      const moving = v > 0.25 && !snap;
      let dir;
      if (moving) dir = Math.atan2(x.pos.x - x.prev.x, x.pos.z - x.prev.z);
      else if (x.side === 'D' && x.guard && P(x.guard)) dir = Math.atan2(P(x.guard).pos.x - x.pos.x, P(x.guard).pos.z - x.pos.z);
      else dir = Math.atan2(ballFlat.x - x.pos.x, ballFlat.z - x.pos.z);
      if (x.pos.distanceTo(ballFlat) < 0.05) dir = Math.atan2(RIM.x - x.pos.x, RIM.z - x.pos.z);
      x.root.position.set(x.pos.x, id === shooter ? jump : 0, x.pos.z);
      x.tick(dt, moving ? v : 0, dir, now, { moving, style: v > 3.2 ? 'run' : x.side === 'D' ? 'chasse' : 'walk' }, snap || x.first);
      x.first = false;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const proj = new THREE.Vector3();
    for (const x of people.values()) {
      if (!x.root.visible) continue;
      proj.set(x.root.position.x, 2.05 * (x.look.height || 1) + x.root.position.y, x.root.position.z).project(this.camera);
      x.tag.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  setGuards(players) { for (const p of players) { const x = this.people.get(p.id); if (x) x.guard = p.guard; } }

  // ---------- Pointer ----------
  bindPointer() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitAt = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
    };
    const floorUV = () => { const p = new THREE.Vector3(); return ray.ray.intersectPlane(this.floorPlane, p) ? toUV(p) : null; };
    let drag = null, down = null;
    this.host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.altKey) return;
      hitAt(e);
      const hh = ray.intersectObjects(this.handleGroup.children, false)[0];
      if (hh) {
        drag = { kind: 'handle', h: hh.object.userData, moved: false };
      } else {
        const hits = [];
        for (const [id, x] of this.people) if (x.root.visible) hits.push(x.hit);
        const ph = ray.intersectObjects(hits, false)[0];
        if (ph) {
          const id = ph.object.userData.id;
          drag = { kind: 'player', id, moved: false };
          if (this.hooks.onPick) this.hooks.onPick(id, e);
        }
      }
      if (drag) {
        e.stopPropagation();
        e.preventDefault();
        this.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
      } else down = { x: e.clientX, y: e.clientY };
    }, true);
    el.addEventListener('pointermove', (e) => {
      if (!drag) {
        hitAt(e);
        const over = ray.intersectObjects(this.handleGroup.children, false).length || [...this.people.values()].some((x) => x.root.visible && ray.intersectObject(x.hit, false).length);
        el.style.cursor = over ? 'grab' : '';
        return;
      }
      hitAt(e);
      const uv = floorUV();
      if (!uv) return;
      if (!drag.moved && this.hooks.onDragStart) this.hooks.onDragStart(drag);
      drag.moved = true;
      el.style.cursor = 'grabbing';
      if (drag.kind === 'player' && this.hooks.onDragPlayer) this.hooks.onDragPlayer(drag.id, uv);
      if (drag.kind === 'handle' && this.hooks.onDragHandle) this.hooks.onDragHandle(drag.h, uv);
    });
    const end = (e) => {
      if (drag) {
        if (this.hooks.onDragEnd) this.hooks.onDragEnd(drag);
        this.controls.enabled = true;
        drag = null;
        el.style.cursor = '';
      } else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && this.hooks.onEmpty) this.hooks.onEmpty();
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', (e) => {
      hitAt(e);
      const hh = ray.intersectObjects(this.handleGroup.children, false)[0];
      if (hh && this.hooks.onHandleDouble) this.hooks.onHandleDouble(hh.object.userData);
    });
  }
}
