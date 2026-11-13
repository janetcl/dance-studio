// The 3D court: floor, hoop, players, ball, arrows for the current beat, path handles,
// and picking/dragging. Positions come in as court units (see model.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Player } from './players.js?v=20261114s';
import { THEMES, TEAMS, FLOORS, RIM as RIM_UV } from './model.js?v=20261114s';

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
  g.fillStyle = look.scene === 'arena' ? '#121316' : look.scene === 'garden' ? '#1A1B20' : look.scene === 'park' ? '#8E8C86' : look.scene === 'beach' ? '#D9BE94' : look.scene === 'gym' ? '#B98F5E' : '#2B2A28';
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
  // A real eight-panel basketball, drawn per pixel on the sphere. Two seams run all the way
  // round in perpendicular planes (x = 0 and z = 0), crossing at the poles (±y). The two curved
  // seams sit either side of the x = 0 seam: they pinch in close to it around the middle of
  // the ball and swing wide near the poles (|x| = c + k·y²), so face-on they read as ")|(".
  const Wd = 768, Ht = 384;
  const c = document.createElement('canvas'); c.width = Wd; c.height = Ht;
  const g = c.getContext('2d');
  const img = g.createImageData(Wd, Ht);
  const bump = document.createElement('canvas'); bump.width = Wd; bump.height = Ht;
  const bg = bump.getContext('2d');
  const bimg = bg.createImageData(Wd, Ht);
  const seamW = 0.014, cc = 0.32, ck = 0.83;
  const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
  for (let r = 0; r < Ht; r++) {
    const th = (r + 0.5) / Ht * Math.PI, st = Math.sin(th), y = Math.cos(th);
    for (let q = 0; q < Wd; q++) {
      const ph = (q + 0.5) / Wd * Math.PI * 2;
      const x = -Math.cos(ph) * st, z = Math.sin(ph) * st;
      // Distance to the nearest seam on the unit sphere.
      const d = Math.min(Math.abs(x), Math.abs(z), Math.abs(Math.abs(x) - cc - ck * y * y) / Math.sqrt(1 + 4 * ck * ck * y * y));
      const seam = Math.max(0, Math.min(1, 1 - (d - seamW) / 0.006));
      const groove = Math.max(0, Math.min(1, 1 - (d - seamW) / 0.03));
      // Pebbles: small bumps on a fine grid in angle space, sized to the sphere.
      const px = q * st * 1.2, py = r * 1.2;
      const cx = Math.floor(px / 3), cy = Math.floor(py / 3);
      const fx = px / 3 - cx - 0.5, fy = py / 3 - cy - 0.5;
      const pebble = Math.max(0, 1 - (fx * fx + fy * fy) * 3.2) * (0.7 + 0.3 * hash(cx, cy));
      const tone = 0.95 + 0.05 * Math.sin(x * 3.1 + 1.3) * Math.cos(z * 2.7 - y * 1.9);
      const k = 4 * (r * Wd + q);
      const R = (205 + pebble * 18) * tone, G = (92 + pebble * 10) * tone, B = (38 + pebble * 4) * tone;
      const shade = 1 - groove * 0.25;
      img.data[k] = (R * shade) * (1 - seam) + 26 * seam;
      img.data[k + 1] = (G * shade) * (1 - seam) + 18 * seam;
      img.data[k + 2] = (B * shade) * (1 - seam) + 14 * seam;
      img.data[k + 3] = 255;
      const bv = Math.max(0, 140 + pebble * 90 - groove * 120);
      bimg.data[k] = bimg.data[k + 1] = bimg.data[k + 2] = bv; bimg.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const b = new THREE.CanvasTexture(bump);
  b.anisotropy = 8;
  return { map: t, bump: b };
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
  // Up behind the backboard, high enough to see over it, with room above the rim.
  baseline: { pos: [0, 12.6, -24.5], target: [0, 0.2, 2.0] },
  // Straight down over the half court, pulled back so the basket and the half-court line both fit.
  top: { pos: [0, 27, -2.0], target: [0, 0, -2.2] },
};

export class CourtScene {
  constructor(host, labels, hooks = {}) {
    this.host = host;
    this.labels = labels;
    this.hooks = hooks;
    this.people = new Map();
    this.theme = 'bw';
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
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700);
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

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 48, 32), (() => { const bt = ballTexture(); return new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: 0.6, roughness: 0.78, metalness: 0 }); })());
    this.ball.castShadow = true;
    scene.add(this.ball);

    this.handleGroup = new THREE.Group();
    scene.add(this.handleGroup);
    this.handleGeo = new THREE.SphereGeometry(0.11, 16, 12);
    this.addGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 20);

    this.setKits({ O: TEAMS.black, D: TEAMS.white });
    this.setCourt({ floor: 'maple', paint: THEMES.bw.paint, lines: '#FFFFFF', border: THEMES.bw.paint, label: '', scene: 'studio' });
    this.setView('broadcast');
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  buildHoop() {
    const scene = this.scene;
    // Soft studio reflections so the glass and metal read as glass and metal.
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const cols = [];
    const posAttr = sky.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i) / 20;
      const c = new THREE.Color().setHSL(0.08, 0.15, 0.55 + y * 0.4);
      cols.push(c.r, c.g, c.b);
    }
    sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(sky);
    for (const [x, y, z] of [[-6, 8, 4], [6, 8, -4], [0, 10, 8]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
      panel.position.set(x, y, z); panel.lookAt(0, 0, 0);
      env.add(panel);
    }
    scene.environment = pm.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.55;

    const boardZ = W(250, 40).z;
    const g = (this.hoop = new THREE.Group());
    const glass = new THREE.MeshPhysicalMaterial({ color: '#E8F4FF', metalness: 0, roughness: 0.03, transmission: 0.94, thickness: 0.025, ior: 1.5, transparent: true, opacity: 1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.025), glass);
    board.position.set(0, 3.33, boardZ);
    g.add(board);
    // Painted white border and shooter's square, slightly proud of the glass on both faces.
    const paint = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5 });
    const bar = (w, h, x, y) => { for (const dz of [0.014, -0.014]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.003), paint); m.position.set(x, y, boardZ + dz); g.add(m); } };
    const bw = 0.05;
    bar(1.83, bw, 0, 3.33 + 0.535 - bw / 2); bar(1.83, bw, 0, 3.33 - 0.535 + bw / 2);
    bar(bw, 1.07, -0.915 + bw / 2, 3.33); bar(bw, 1.07, 0.915 - bw / 2, 3.33);
    const sqY = RIM_Y + 0.15 + 0.23;
    bar(0.61, 0.05, 0, sqY + 0.205); bar(0.61, 0.05, 0, RIM_Y + 0.175);
    bar(0.05, 0.46, -0.28, sqY - 0.005); bar(0.05, 0.46, 0.28, sqY - 0.005);
    // Metal frame and the padded bottom edge.
    const metal = new THREE.MeshStandardMaterial({ color: '#B9BDC2', metalness: 0.9, roughness: 0.28 });
    const pad = new THREE.MeshStandardMaterial({ color: '#1D1A17', roughness: 0.8 });
    const frame = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), metal); m.position.set(x, y, boardZ - 0.01); g.add(m); };
    frame(1.86, 0.025, 0, 3.33 + 0.545); frame(0.025, 1.09, -0.93, 3.33); frame(0.025, 1.09, 0.93, 3.33);
    const bottomPad = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.09), pad);
    bottomPad.position.set(0, 3.33 - 0.57, boardZ);
    bottomPad.castShadow = true;
    g.add(bottomPad);
    // Rim, bracket and net hooks.
    const orange = new THREE.MeshStandardMaterial({ color: '#E2531B', metalness: 0.55, roughness: 0.32 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.0095, 12, 48), orange);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(RIM);
    rim.castShadow = true;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.16), orange);
    bracket.position.set(0, RIM_Y, boardZ + 0.08);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.012), orange);
    plate.position.set(0, RIM_Y - 0.05, boardZ + 0.018);
    g.add(rim, bracket, plate);
    // Net: knotted diamond mesh, 12 loops round, tapering down.
    const N = 12, ROWS = 7;
    const node = (r, j) => {
      const a = ((j + (r % 2) * 0.5) / N) * Math.PI * 2;
      const q = r / ROWS;
      const rad = 0.2286 - 0.085 * Math.sin(q * Math.PI * 0.5) + (r === 0 ? 0 : -0.004);
      return new THREE.Vector3(RIM.x + Math.cos(a) * rad, -q * 0.44, RIM.z + Math.sin(a) * rad);
    };
    const segs = [];
    for (let r = 0; r < ROWS; r++) for (let j = 0; j < N; j++) {
      const a = node(r, j);
      segs.push([a, node(r + 1, j)], [a, node(r + 1, r % 2 ? j + 1 : j - 1)]);
    }
    const cord = new THREE.CylinderGeometry(0.0042, 0.0042, 1, 5, 1, true);
    cord.translate(0, 0.5, 0);
    this.netMat = new THREE.MeshStandardMaterial({ color: '#F6F3EC', roughness: 0.95 });
    const net = new THREE.InstancedMesh(cord, this.netMat, segs.length);
    const m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), qn = new THREE.Quaternion(), sc = new THREE.Vector3();
    segs.forEach(([a, b], k) => {
      const d = new THREE.Vector3().subVectors(b, a);
      qn.setFromUnitVectors(up, d.clone().normalize());
      sc.set(1, d.length(), 1);
      m4.compose(a.clone().sub(new THREE.Vector3(RIM.x, 0, RIM.z)), qn, sc);
      net.setMatrixAt(k, m4);
    });
    net.castShadow = true;
    this.net = new THREE.Group();
    this.net.position.set(RIM.x, RIM_Y, RIM.z);
    this.net.add(net);
    this.netKick = 0;
    g.add(this.net);
    // Support arm, pole and base pad.
    const dark = new THREE.MeshStandardMaterial({ color: '#2A2724', roughness: 0.5, metalness: 0.2 });
    const padBase = pad.clone();
    this.stanchionMats = [dark, padBase];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), dark);
    arm.position.set(0, 3.3, boardZ - 0.72);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), dark);
    pole.position.set(0, 1.7, boardZ - 1.4);
    pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.6), padBase);
    base.position.set(0, 0.25, boardZ - 1.7);
    g.add(arm, pole, base);
    scene.add(g);
  }

  // What's around the court: nothing (studio / arena) or a New York City park.
  setSurroundings(type, team) {
    const key = type + (type === 'gym' && team ? team.paint : '');
    if (this.surroundType === key) return;
    this.surroundType = key;
    if (this.surround) { this.scene.remove(this.surround); this.surround.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.surround = null; }
    this.netMat.color.set(type === 'park' ? '#A9AEB3' : '#F6F3EC');
    this.netMat.metalness = type === 'park' ? 0.85 : 0;
    this.netMat.roughness = type === 'park' ? 0.35 : 0.95;
    const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    if (type === 'garden') { this.buildGarden(rnd); return; }
    if (type === 'beach') { this.buildBeach(rnd); return; }
    if (type === 'gym') { this.buildGym(rnd, team); return; }
    if (type === 'arena') { this.buildGarden(rnd, true); return; }
    if (type === 'studio') { this.buildStudio(); return; }
    if (type !== 'park') return;
    const g = (this.surround = new THREE.Group());
    // Sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    const cols = [], pa = sky.geometry.attributes.position;
    const top = new THREE.Color('#5E9BD6'), hor = new THREE.Color('#DCE8F1');
    for (let i = 0; i < pa.count; i++) { const y = Math.max(0, pa.getY(i) / 160); const c = hor.clone().lerp(top, Math.pow(y, 0.6)); cols.push(c.r, c.g, c.b); }
    sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.add(sky);
    // Concrete plaza and grass
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshStandardMaterial({ color: '#9C9A93', roughness: 0.95 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -0.012, -1); plaza.receiveShadow = true;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: '#6F8A4C', roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; grass.receiveShadow = true;
    g.add(plaza, grass);
    // Chain-link fence on three sides (the camera side stays open).
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fx = fc.getContext('2d'); fx.strokeStyle = 'rgba(190,196,200,1)'; fx.lineWidth = 3;
    fx.beginPath(); fx.moveTo(0, 0); fx.lineTo(64, 64); fx.moveTo(64, 0); fx.lineTo(0, 64); fx.stroke();
    const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.anisotropy = 4;
    const H = 3.6, X = 10.2, Z0 = -11.3, Z1 = 10;
    const fenceSide = (len, pos, rotY) => {
      const t = ft.clone(); t.needsUpdate = true; t.repeat.set(len / 0.35, H / 0.35);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }));
      m.position.set(pos[0], H / 2, pos[2]); m.rotation.y = rotY;
      g.add(m);
    };
    fenceSide(2 * X, [0, 0, Z0], 0);
    fenceSide(Z1 - Z0, [-X, 0, (Z0 + Z1) / 2], Math.PI / 2);
    fenceSide(Z1 - Z0, [X, 0, (Z0 + Z1) / 2], Math.PI / 2);
    const postMat = new THREE.MeshStandardMaterial({ color: '#8E959B', metalness: 0.8, roughness: 0.4 });
    const post = new THREE.CylinderGeometry(0.04, 0.04, H, 8);
    const addPost = (x, z) => { const m = new THREE.Mesh(post, postMat); m.position.set(x, H / 2, z); m.castShadow = true; g.add(m); };
    for (let x = -X; x <= X + 0.01; x += X / 3) addPost(x, Z0);
    for (let z = Z0 + 3.1; z <= Z1 + 0.01; z += (Z1 - Z0) / 6) { addPost(-X, z); addPost(X, z); }
    // London plane trees outside the fence
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7A6A58', roughness: 0.9 });
    const leafMats = ['#4E7A3A', '#5B8A42', '#46703A'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    const tree = (x, z, s) => {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 3.4 * s, 8), trunkMat);
      tr.position.set(x, 1.7 * s, z); tr.castShadow = true; g.add(tr);
      for (let k = 0; k < 5; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 + rnd() * 0.7) * s, 1), leafMats[k % 3]);
        b.position.set(x + (rnd() - 0.5) * 2 * s, (3.9 + rnd() * 1.4) * s, z + (rnd() - 0.5) * 2 * s);
        b.castShadow = true; g.add(b);
      }
    };
    for (const [x, z] of [[-14, -14], [-6, -16], [5, -15.5], [14, -13], [-15, -3], [-15.5, 6], [15, -2], [15.5, 7], [-19, 14], [19, 13]]) tree(x, z, 0.9 + rnd() * 0.35);
    // Skyline: brick and limestone buildings with lit windows, a few water towers.
    const winTex = (base) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 64, 128);
      for (let r = 0; r < 16; r++) for (let q = 0; q < 6; q++) {
        x.fillStyle = rnd() < 0.18 ? '#F4DFA6' : rnd() < 0.5 ? '#2B3440' : '#3D4855';
        x.fillRect(4 + q * 10, 4 + r * 8, 6, 5);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const bases = ['#8C4A36', '#A35D44', '#C9B79A', '#7B6A5C', '#B07A55', '#9AA0A6', '#6E4637'];
    const towerMat = new THREE.MeshStandardMaterial({ color: '#7A5A3E', roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#4A3F36', roughness: 0.9 });
    const building = (x, z, w, d, h) => {
      const t = winTex(bases[Math.floor(rnd() * bases.length)]);
      t.repeat.set(Math.max(1, w / 6), Math.max(1, h / 12));
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
      m.position.set(x, h / 2, z); g.add(m);
      if (rnd() < 0.45) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 14), towerMat);
        tank.position.set(x + (rnd() - 0.5) * w * 0.5, h + 2.6, z); g.add(tank);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.1, 14), roofMat);
        cap.position.set(tank.position.x, h + 4.25, z); g.add(cap);
        for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), roofMat);
          leg.position.set(tank.position.x + dx, h + 0.75, z + dz); g.add(leg);
        }
      }
    };
    for (let x = -70; x < 70; x += 9 + rnd() * 6) building(x, -42 - rnd() * 12, 8 + rnd() * 6, 10, 14 + rnd() * 30);
    for (let z = -36; z < 30; z += 10 + rnd() * 6) { building(-46 - rnd() * 8, z, 10, 9 + rnd() * 5, 12 + rnd() * 24); building(46 + rnd() * 8, z, 10, 9 + rnd() * 5, 12 + rnd() * 24); }
    for (let x = -50; x < 50; x += 12 + rnd() * 8) building(x, -75 - rnd() * 15, 10 + rnd() * 6, 12, 40 + rnd() * 50);
    this.scene.add(g);
  }

  // Light studio: a soft wrap-around backdrop and a floor that runs to the horizon.
  buildStudio() {
    const g = (this.surround = new THREE.Group());
    const dome = new THREE.Mesh(new THREE.SphereGeometry(140, 40, 20), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    const pa = dome.geometry.attributes.position, cols = [];
    const lo = new THREE.Color('#E6DFD3'), hi = new THREE.Color('#F7F4EE');
    for (let i = 0; i < pa.count; i++) { const y = Math.max(0, pa.getY(i) / 140); const c = lo.clone().lerp(hi, Math.min(1, y * 2.2)); cols.push(c.r, c.g, c.b); }
    dome.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.add(dome);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(138, 64), new THREE.MeshStandardMaterial({ color: '#DDD5C7', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.03; floor.receiveShadow = true; g.add(floor);
    this.scene.add(g);
  }

  // A school gym: block walls with a padded band, wooden bleachers with a few fans,
  // banners in the home team's color, a scoreboard and ceiling lights. Walls and ceiling
  // face inward only, so cameras outside them (top, baseline) still see in.
  buildGym(rnd, team) {
    const g = (this.surround = new THREE.Group());
    const accent = (team && team.paint) || '#2D4E9C';
    const X = 17, ZB = -14.5, ZF = 21, H = 9;
    const blockTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#E4DED2'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = 'rgba(120,105,85,.18)'; x.lineWidth = 2;
      for (let r = 0; r < 8; r++) { const y = r * 32; x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); for (let q = 0; q < 4; q++) { const xx = q * 64 + (r % 2) * 32; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 32); x.stroke(); } }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const wall = (w, pos, rotY) => {
      const t = blockTex.clone(); t.needsUpdate = true; t.repeat.set(w / 3, H / 3);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
      m.position.set(pos[0], H / 2, pos[2]); m.rotation.y = rotY; g.add(m);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.9), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 }));
      pad.position.set(pos[0], 0.95, pos[2]); pad.rotation.y = rotY; pad.translateZ(0.02); g.add(pad);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), new THREE.MeshStandardMaterial({ color: '#F2EEE6', roughness: 0.6 }));
      stripe.position.set(pos[0], 1.96, pos[2]); stripe.rotation.y = rotY; stripe.translateZ(0.025); g.add(stripe);
    };
    wall(2 * X, [0, 0, ZB], 0);
    wall(ZF - ZB, [-X, 0, (ZB + ZF) / 2], Math.PI / 2);
    wall(ZF - ZB, [X, 0, (ZB + ZF) / 2], -Math.PI / 2);
    wall(2 * X, [0, 0, ZF], Math.PI);
    // Wood floor beyond the court lines
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, ZF - ZB), new THREE.MeshStandardMaterial({ color: '#B88F5E', roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.015, (ZB + ZF) / 2); floor.receiveShadow = true; g.add(floor);
    // Ceiling, seen only from below, with rows of lights
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, ZF - ZB), new THREE.MeshStandardMaterial({ color: '#CFC8BC', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, (ZB + ZF) / 2); g.add(ceil);
    const lightMat = new THREE.MeshBasicMaterial({ color: '#FFF7E6' });
    for (let x = -10; x <= 10; x += 5) for (let z = -10; z <= 18; z += 7) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), lightMat);
      l.rotation.x = Math.PI / 2; l.position.set(x, H - 0.02, z); g.add(l);
    }
    // Bleachers along both sidelines
    const woodMat = new THREE.MeshStandardMaterial({ color: '#C79A62', roughness: 0.7 });
    const riserMat = new THREE.MeshStandardMaterial({ color: '#8C6A45', roughness: 0.8 });
    const crowd = (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 32;
      const x = c.getContext('2d');
      // About 1 px per cm: people are ~45 cm wide on a 22 m bench.
      const shirts = [accent, '#1D1A17', '#F4F2EE', '#C9A15A', '#6E675D', '#B3202E', accent];
      const skins = ['#F1C9A5', '#E0AC80', '#C68B5E', '#8D5A3B', '#5B3A29'];
      for (let q = 0; q < 26; q++) {
        if (rnd() < 0.55) continue;
        const px = q * 20 + 2 + rnd() * 4;
        x.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
        x.beginPath(); x.moveTo(px + 1, 32); x.lineTo(px + 2, 15); x.quadraticCurveTo(px + 8, 11, px + 14, 15); x.lineTo(px + 15, 32); x.closePath(); x.fill();
        x.fillStyle = skins[Math.floor(rnd() * skins.length)]; x.beginPath(); x.arc(px + 8, 8, 4.6, 0, Math.PI * 2); x.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
    })();
    for (const side of [-1, 1]) {
      for (let r = 0; r < 6; r++) {
        const x0 = side * (11.2 + r * 0.75), y0 = 0.42 + r * 0.42;
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 22), woodMat);
        seat.position.set(x0, y0, 1.5); seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.06, y0, 22), riserMat);
        riser.position.set(x0 + side * 0.33, y0 / 2, 1.5); g.add(riser);
        const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(1.6 + r * 0.15, 1); t.offset.x = rnd();
        const fans = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.75), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
        fans.position.set(x0, y0 + 0.4, 1.5); fans.rotation.y = side * Math.PI / 2; g.add(fans);
      }
    }
    // Banners and a scoreboard on the far wall
    const bannerMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7, side: THREE.DoubleSide });
    for (const x of [-12, -7.5, 7.5, 12]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), bannerMat);
      b.position.set(x, 6.2, ZB + 0.05); g.add(b);
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.7, 3), bannerMat);
      tri.rotation.z = -Math.PI / 2; tri.position.set(x, 4.55, ZB + 0.05); tri.scale.set(1, 1.4, 1); g.add(tri);
    }
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#121316'; sx.fillRect(0, 0, 256, 96);
    sx.font = '800 44px Geist, Arial Black, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.fillStyle = '#FF5A3C'; sx.fillText('42', 60, 52); sx.fillText('38', 196, 52);
    sx.fillStyle = '#FFD25A'; sx.font = '700 22px Geist, Arial, sans-serif'; sx.fillText('4TH', 128, 52);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshBasicMaterial({ map: st }));
    board.position.set(0, 7.3, ZB + 0.06); g.add(board);
    this.scene.add(g);
  }

  // A beach court on Oahu at sunset: sand, ocean behind the basket, palms, a mountain on the horizon.
  buildBeach(rnd) {
    const g = (this.surround = new THREE.Group());
    // Sunset sky
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 40, 20), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
    const pa = sky.geometry.attributes.position, cols = [];
    const stops = [[0, '#FFD27A'], [0.03, '#FFA25E'], [0.09, '#FF7A5C'], [0.18, '#D9507A'], [0.3, '#8E3F8C'], [0.5, '#4A2F78'], [0.75, '#24245A'], [1, '#141836']].map(([t, c]) => [t, new THREE.Color(c)]);
    for (let i = 0; i < pa.count; i++) {
      const y = Math.max(0, pa.getY(i) / 300);
      let c = stops[stops.length - 1][1].clone();
      for (let k = 0; k < stops.length - 1; k++) if (y <= stops[k + 1][0]) { c = stops[k][1].clone().lerp(stops[k + 1][1], (y - stops[k][0]) / (stops[k + 1][0] - stops[k][0])); break; }
      // Warmer toward the sun (behind the basket, -z).
      const toward = Math.max(0, -pa.getZ(i) / 300);
      const side = 1 - Math.min(1, Math.abs(pa.getX(i) / 300 + 0.12) * 1.6);
      c.lerp(new THREE.Color('#FFC266'), toward * side * Math.max(0, 0.4 - y) * 1.6);
      cols.push(c.r, c.g, c.b);
    }
    sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.add(sky);
    // Sun low on the horizon, with layered glow (additive, so it blooms over the sky).
    const add = (geo, color, opacity, pos, scale = [1, 1, 1]) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(...pos); m.scale.set(...scale); g.add(m); return m;
    };
    const SX = -30, SY = 6.5, SZ = -255;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ color: '#FFF1C8', fog: false }));
    sun.position.set(SX, SY, SZ); g.add(sun);
    add(new THREE.CircleGeometry(15, 64), '#FFC870', 0.5, [SX, SY, SZ - 1]);
    add(new THREE.CircleGeometry(32, 64), '#FF9A55', 0.24, [SX, SY, SZ - 2]);
    add(new THREE.CircleGeometry(110, 64), '#FF7A50', 0.14, [SX, SY - 4, SZ - 3], [1.6, 0.7, 1]);
    // Streaky clouds, lit from below
    const cloudTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(120,70,140,0)'); gr.addColorStop(0.45, 'rgba(255,170,150,.9)'); gr.addColorStop(0.75, 'rgba(255,205,140,1)'); gr.addColorStop(1, 'rgba(255,205,140,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 256, 64);
      const fade = x.createLinearGradient(0, 0, 256, 0);
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = fade; x.fillRect(0, 0, 256, 64);
      return new THREE.CanvasTexture(c);
    })();
    for (const [x, y, w, h, o] of [[-90, 30, 130, 7, 0.75], [10, 38, 160, 6, 0.6], [-20, 22, 90, 4, 0.8], [70, 27, 120, 5, 0.65], [-140, 44, 150, 8, 0.5], [120, 48, 180, 9, 0.45], [-50, 15, 70, 3, 0.85], [40, 17, 60, 2.5, 0.8]]) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: o, depthWrite: false, fog: false }));
      cl.position.set(x, y, -240); g.add(cl);
    }
    // Ocean
    const oc = document.createElement('canvas'); oc.width = 512; oc.height = 512;
    const ox = oc.getContext('2d');
    const og = ox.createLinearGradient(0, 0, 0, 512);
    og.addColorStop(0, '#7A4A78'); og.addColorStop(0.25, '#3E4D82'); og.addColorStop(0.7, '#1E5A7A'); og.addColorStop(1, '#16666F');
    ox.fillStyle = og; ox.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) { ox.fillStyle = `rgba(255,${170 + Math.random() * 60},${150 + Math.random() * 60},${Math.random() * 0.14})`; ox.fillRect(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 16, 1); }
    const ot = new THREE.CanvasTexture(oc); ot.colorSpace = THREE.SRGBColorSpace;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), new THREE.MeshStandardMaterial({ map: ot, roughness: 0.2, metalness: 0.15 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.06, -156); g.add(ocean);
    // The sun's reflection: a shimmering path from the horizon to the shore.
    const rc = document.createElement('canvas'); rc.width = 128; rc.height = 512;
    const rx = rc.getContext('2d');
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * 512, t = y / 512;
      const spread = 10 + t * 60, xx = 64 + (Math.random() - 0.5) * spread * (Math.random() < 0.7 ? 0.6 : 1.4);
      rx.fillStyle = `rgba(255,${200 + Math.random() * 55},${150 + Math.random() * 70},${(1 - t * 0.6) * (0.25 + Math.random() * 0.6)})`;
      rx.fillRect(xx, y, 3 + Math.random() * 12 * (1 - t * 0.5), 1.3);
    }
    const rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(46, 228), new THREE.MeshBasicMaterial({ map: rt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(SX * 0.55, -0.02, -140);
    refl.rotation.z = Math.atan2(SX * 0.45, 230);
    g.add(refl);
    // Shoreline foam and wet sand
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(700, 1.2), new THREE.MeshBasicMaterial({ color: '#FFF4E6', transparent: true, opacity: 0.8 }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.03, -26.4); g.add(foam);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(700, 3), new THREE.MeshStandardMaterial({ color: '#B8946A', roughness: 0.6 }));
    wet.rotation.x = -Math.PI / 2; wet.position.set(0, -0.04, -24.6); g.add(wet);
    // Sand
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(700, 200), new THREE.MeshStandardMaterial({ color: '#E2C79C', roughness: 1 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.05, 76.9); sand.receiveShadow = true; g.add(sand);
    // A mountain on the horizon, Diamond Head style
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(48, 26, 7, 1), new THREE.MeshBasicMaterial({ color: '#4A3358', fog: false }));
    mtn.scale.set(1.5, 0.55, 0.8); mtn.position.set(-165, 5, -240); g.add(mtn);
    const mtn2 = new THREE.Mesh(new THREE.ConeGeometry(30, 16, 6, 1), new THREE.MeshBasicMaterial({ color: '#5E3F66', fog: false }));
    mtn2.position.set(-112, 3, -228); mtn2.scale.set(1.6, 0.5, 0.8); g.add(mtn2);
    // Palm trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5E4636', roughness: 0.9 });
    const frondMat = new THREE.MeshStandardMaterial({ color: '#2F4F33', roughness: 0.8, side: THREE.DoubleSide });
    const palm = (x, z, h, lean) => {
      const tree = new THREE.Group();
      const segs = 9;
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i < segs; i++) {
        const t = i / segs;
        const nx = Math.sin(t * 1.4) * lean, ny = (h / segs) * (i + 1), nz = 0;
        const a = new THREE.Vector3(px, py, pz), b = new THREE.Vector3(nx, ny, nz);
        const len = a.distanceTo(b);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - t * 0.05, 0.19 - t * 0.05, len, 7), trunkMat);
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        seg.castShadow = true; tree.add(seg);
        px = nx; py = ny; pz = nz;
      }
      for (let k = 0; k < 8; k++) {
        const fr = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), frondMat);
        fr.scale.set(2.3, 0.08, 0.5);
        const ang = (k / 8) * Math.PI * 2 + rnd() * 0.3;
        fr.position.set(px + Math.cos(ang) * 1.9, py - 0.5, pz + Math.sin(ang) * 1.9);
        fr.rotation.set(0, -ang, -0.45);
        fr.castShadow = true; tree.add(fr);
      }
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), trunkMat);
      nut.position.set(px, py - 0.2, pz); tree.add(nut);
      tree.position.set(x, 0, z);
      tree.rotation.y = rnd() * Math.PI * 2;
      g.add(tree);
    };
    for (const [x, z, h, l] of [[-13, -12, 7.5, 1.6], [-16, -4, 8.5, 2.2], [14, -13, 8, -1.8], [17, 0, 7, -1.2], [-22, 8, 9, 2.4], [22, 9, 8.5, -2], [-30, -18, 10, 1.4], [32, -20, 9.5, -1.6]]) palm(x, z, h, l);
    // The land side, behind the half-court line: a lifeguard tower, umbrellas, more palms,
    // green hills and hotels, so the beach wraps all the way around.
    const tower = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#F2EEE6', roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: '#C8433A', roughness: 0.7 });
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), white); leg.position.set(dx, 1.2, dz); tower.add(leg); }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), white); hut.position.y = 3.1; tower.add(hut);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 4), red); roof.position.y = 4.2; roof.rotation.y = Math.PI / 4; tower.add(roof);
    tower.position.set(15, 0, 20); tower.rotation.y = -0.4; tower.traverse((o) => { o.castShadow = true; }); g.add(tower);
    const umbrella = (x, z, color) => {
      const u = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), white); pole.position.y = 1.1; u.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.7 })); top.position.y = 2.3; u.add(top);
      const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshStandardMaterial({ color, roughness: 0.9 })); towel.rotation.x = -Math.PI / 2; towel.position.set(0.9, 0.02, 0.4); u.add(towel);
      u.position.set(x, 0, z); u.traverse((o) => { o.castShadow = true; }); g.add(u);
    };
    for (const [x, z, c] of [[-14, 14, '#E0552E'], [-18, 22, '#2B8A9E'], [-9, 26, '#F2B705'], [8, 28, '#D9507A'], [20, 12, '#2B8A9E'], [-22, 6, '#F2B705']]) umbrella(x, z, c);
    for (const [x, z, h, l] of [[-6, 34, 8, 1.2], [5, 36, 9, -1.4], [-26, 30, 10, 2], [26, 32, 9.5, -2.2], [0, 46, 11, 1.1]]) palm(x, z, h, l);
    const hillMat = new THREE.MeshStandardMaterial({ color: '#4F7A46', roughness: 1, flatShading: true });
    for (const [x, z, r, h] of [[-60, 140, 40, 28], [10, 160, 55, 38], [80, 150, 45, 30], [-120, 170, 50, 34], [140, 175, 50, 26]]) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8, 1), hillMat); hill.position.set(x, h / 2 - 2, z); hill.scale.z = 0.7; g.add(hill);
    }
    const hotelMat = new THREE.MeshStandardMaterial({ color: '#E8D9C4', roughness: 0.8 });
    for (const [x, w, h] of [[-70, 18, 26], [-45, 14, 18], [45, 16, 30], [70, 20, 22], [100, 14, 16]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), hotelMat); b.position.set(x, h / 2, 95); g.add(b);
      for (let r = 2; r < h - 1; r += 3) { const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.8), new THREE.MeshBasicMaterial({ color: '#FFD59A' })); strip.position.set(x, r, 89.9); strip.rotation.y = Math.PI; g.add(strip); }
    }
    // Low wooden fence posts along the sand
    const postMat = new THREE.MeshStandardMaterial({ color: '#8C6A48', roughness: 0.9 });
    for (let x = -10; x <= 10; x += 2.5) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), postMat); p.position.set(x, 0.55, -12.2); p.castShadow = true; g.add(p); }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 20, 5), postMat);
    rope.rotation.z = Math.PI / 2; rope.position.set(0, 0.95, -12.2); g.add(rope);
    this.scene.add(g);
  }

  // A big New York arena in the style of the Garden: a two-tier bowl of fans, the round
  // spoked ceiling, and a center-hung scoreboard over center court. No names or logos.
  buildGarden(rnd, plain = false) {
    const g = (this.surround = new THREE.Group());
    const cz = W(250, 470).z; // center court
    const crowdTex = () => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#121318'; x.fillRect(0, 0, 1024, 256);
      const shirts = ['#B8642A', '#1F5590', '#CFC9BE', '#26262B', '#6E675D', '#35577F', '#A39C91', '#6E2B2B', '#2F2F36'];
      const skins = ['#D9B48F', '#B98257', '#80543A', '#53372A', '#C99A70'];
      for (let r = 0; r < 16; r++) {
        x.fillStyle = '#1B1C22'; x.fillRect(0, r * 16 + 12, 1024, 4);
        for (let q = 0; q < 170; q++) {
          if (rnd() < 0.22) continue;
          const px = q * 6 + rnd() * 1.5, py = r * 16 + 3 + rnd() * 1.5;
          x.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
          x.fillRect(px, py + 3, 4, 6);
          x.fillStyle = skins[Math.floor(rnd() * skins.length)];
          x.beginPath(); x.arc(px + 2, py + 1.5, 1.6, 0, Math.PI * 2); x.fill();
        }
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      return t;
    };
    // Seating bowls: stepped lathe profiles, stretched into an oval around the full court.
    const bowl = (r0, y0, rows, rise, run, repeatX) => {
      const pts = [];
      for (let i = 0; i <= rows; i++) { pts.push(new THREE.Vector2(r0 + i * run, y0 + i * rise)); pts.push(new THREE.Vector2(r0 + (i + 1) * run - 0.01, y0 + i * rise)); }
      const geo = new THREE.LatheGeometry(pts, 96);
      const t = crowdTex(); t.repeat.set(repeatX, rows / 16);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, color: '#A9A9AE', roughness: 0.95, side: THREE.DoubleSide }));
      m.scale.set(1, 1, 1.55);
      m.position.set(0, 0, cz);
      g.add(m);
    };
    bowl(12.5, 0.4, 22, 0.42, 0.78, 16);
    bowl(31.5, 15.5, 20, 0.62, 0.8, 22);
    // Fascia ring between the bowls
    const fascia = new THREE.Mesh(new THREE.CylinderGeometry(31.3, 31.3, 1.4, 96, 1, true), new THREE.MeshStandardMaterial({ color: plain ? '#2A2C33' : '#0B3F7A', emissive: plain ? '#E0552E' : '#0A3A72', emissiveIntensity: plain ? 0.25 : 0.6, side: THREE.DoubleSide }));
    fascia.scale.set(1, 1, 1.55); fascia.position.set(0, 14.6, cz); g.add(fascia);
    // Courtside floor and the dark arena surround
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshStandardMaterial({ color: '#15161B', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.02, cz); floor.receiveShadow = true; g.add(floor);
    // The round ceiling: concentric rings and radial spokes.
    const cc = document.createElement('canvas'); cc.width = cc.height = 1024;
    const cx = cc.getContext('2d');
    const grd = cx.createRadialGradient(512, 512, 40, 512, 512, 512);
    grd.addColorStop(0, '#3A4458'); grd.addColorStop(1, '#151820');
    cx.fillStyle = grd; cx.fillRect(0, 0, 1024, 1024);
    cx.strokeStyle = 'rgba(205,215,235,.55)'; cx.lineWidth = 3;
    if (plain) {
      // A plain arena roof: a truss grid instead of the Garden's spokes.
      cx.strokeStyle = 'rgba(160,165,180,.35)'; cx.lineWidth = 4;
      for (let k = 0; k <= 1024; k += 85) { cx.beginPath(); cx.moveTo(k, 0); cx.lineTo(k, 1024); cx.stroke(); cx.beginPath(); cx.moveTo(0, k); cx.lineTo(1024, k); cx.stroke(); }
    } else {
      for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; cx.beginPath(); cx.moveTo(512 + Math.cos(a) * 70, 512 + Math.sin(a) * 70); cx.lineTo(512 + Math.cos(a) * 510, 512 + Math.sin(a) * 510); cx.stroke(); }
      for (const r of [70, 180, 300, 420, 505]) { cx.beginPath(); cx.arc(512, 512, r, 0, Math.PI * 2); cx.stroke(); }
    }
    for (let k = 0; k < 140; k++) { const a = rnd() * Math.PI * 2, r = 120 + rnd() * 380; cx.fillStyle = 'rgba(255,244,214,.9)'; cx.beginPath(); cx.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 3, 0, Math.PI * 2); cx.fill(); }
    const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace;
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(50, 96), new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide, fog: false }));
    ceil.rotation.x = Math.PI / 2; ceil.scale.set(1, 1.3, 1); ceil.position.set(0, 34, cz); g.add(ceil);
    // Center-hung scoreboard
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 256;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#05070B'; sx.fillRect(0, 0, 512, 256);
    sx.fillStyle = plain ? '#E0552E' : '#F58426'; sx.fillRect(0, 0, 512, 10); sx.fillRect(0, 246, 512, 10);
    sx.font = '800 96px Geist, Arial Black, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.fillStyle = '#FFFFFF'; sx.fillText('HOME', 128, 70); sx.fillText('AWAY', 384, 70);
    sx.fillStyle = '#FFD25A'; sx.font = '800 110px Geist, Arial Black, sans-serif'; sx.fillText('88', 128, 170); sx.fillText('86', 384, 170);
    const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.MeshBasicMaterial({ map: stx, fog: false });
    const shell = new THREE.MeshStandardMaterial({ color: '#111216', metalness: 0.6, roughness: 0.4 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 5), [screen, screen, shell, shell, screen, screen]);
    board.position.set(0, 17, cz); g.add(board);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.9, 48, 1, true), new THREE.MeshBasicMaterial({ color: plain ? '#2A2C33' : '#0B5CAD', side: THREE.DoubleSide, fog: false }));
    ring.position.set(0, 14.6, cz); g.add(ring);
    for (const x of [-2.5, 2.5]) { const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 15, 6), shell); wire.position.set(x, 26.5, cz); g.add(wire); }
    this.scene.add(g);
  }

  // Net swish: stretches and sways when the ball drops through, then settles.
  animateNet(dt) {
    const b = this.ball.position;
    const inNet = Math.hypot(b.x - RIM.x, b.z - RIM.z) < 0.2 && b.y < RIM_Y && b.y > RIM_Y - 0.5;
    if (inNet) this.netKick = 1;
    this.netKick = Math.max(0, this.netKick - dt * 1.6);
    this.netTime = (this.netTime || 0) + dt;
    const w = this.netKick;
    const wob = Math.sin(this.netTime * 18) * w;
    this.net.scale.set(1 - 0.12 * w, 1 + 0.22 * w, 1 - 0.12 * w);
    this.net.rotation.x = wob * 0.08;
    this.net.rotation.z = Math.cos(this.netTime * 15) * w * 0.06;
  }

  setKits(kits) {
    const key = JSON.stringify([kits.O, kits.D]);
    if (key === this.kitsKey) return;
    this.kitsKey = key;
    this.kits = kits;
    for (const p of this.people.values()) p.setKit({ ...kits[p.side] });
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
    const park = look.scene === 'park', garden = look.scene === 'garden', beach = look.scene === 'beach';
    const bg = look.scene === 'arena' || garden ? '#0D0E12' : park ? '#BFD6EA' : beach ? '#E58A6E' : look.scene === 'gym' ? '#D6CFC2' : '#E9E3D9';
    this.scene.background.set(bg);
    this.scene.fog.color.set(park ? '#C9D8E4' : beach ? '#F0A07E' : bg);
    this.scene.fog.near = park ? 45 : garden ? 60 : beach ? 70 : 30;
    this.scene.fog.far = park ? 170 : garden ? 140 : beach ? 260 : 60;
    this.hemi.intensity = look.scene === 'arena' ? 0.8 : garden ? 0.7 : park ? 1.1 : beach ? 1.0 : 1.25;
    this.hemi.color.set(park ? '#DCEBFF' : beach ? '#FFB6A6' : '#FFF8EE');
    this.hemi.groundColor.set(park ? '#6F7A5E' : beach ? '#B08A62' : '#8C7A66');
    this.key.intensity = look.scene === 'arena' ? 2.6 : garden ? 3.0 : park ? 2.6 : beach ? 2.5 : 2.1;
    this.key.color.set(park ? '#FFF1DC' : beach ? '#FF9F5A' : '#FFFFFF');
    this.renderer.toneMappingExposure = beach ? 1.12 : 1.0;
    // Beach: a low sun out over the water, behind the basket, so shadows stretch toward the camera.
    if (beach) this.key.position.set(-6, 4.2, -17); else this.key.position.set(park ? -8 : 6, 16, park ? 6 : 8);
    this.host.parentElement.classList.toggle('arena', look.scene === 'arena' || garden);
    this.setSurroundings(look.scene, look.gymTeam);
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
    const t = this.kits || { O: TEAMS.black, D: TEAMS.white };
    for (const p of players) {
      const x = new Player(p.id, { ...p.look, label: p.num, ...t[p.side] });
      x.side = p.side;
      x.pos = new THREE.Vector3();
      x.prev = new THREE.Vector3();
      x.first = true;
      const tag = document.createElement('span');
      tag.className = 'tag ' + p.side;
      tag.dataset.pos = p.side === 'O' ? p.pos : '';
      tag.textContent = p.side === 'O' ? p.num : 'X' + p.num;
      this.labels.appendChild(tag);
      x.tag = tag;
      this.scene.add(x.root);
      this.people.set(p.id, x);
    }
  }

  ghostStanchion(ghost) {
    for (const m of this.stanchionMats || []) { m.transparent = ghost; m.opacity = ghost ? 0.18 : 1; m.depthWrite = !ghost; m.needsUpdate = true; }
  }

  setView(name) {
    const v = VIEWS[name] || VIEWS.broadcast;
    // From the baseline the stanchion would block the play, so make it see-through.
    this.ghostStanchion(name === 'baseline');
    this.camera.position.set(...v.pos);
    this.controls.target.set(...v.target);
    this.controls.update();
    this.view = name;
  }

  // While exporting, render at the video's exact size instead of the on-screen size.
  setRecordSize(size) {
    this.recordSize = size;
    if (size) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size.w, size.h, false);
      const a = size.w / size.h, hfov = 2 * Math.atan(Math.tan((18 * Math.PI) / 180) * (a >= 1.6 ? 1.6 : 1.25));
      this.camera.aspect = a;
      this.camera.fov = a >= 1.6 ? 36 : Math.min(80, (2 * Math.atan(Math.tan(hfov / 2) / a) * 180) / Math.PI);
      this.camera.updateProjectionMatrix();
    } else {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.resize();
    }
  }

  resize() {
    if (this.recordSize) return;
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
    this.animateNet(dt);

    const ballFlat = new THREE.Vector3(ballOut.x, 0, ballOut.z);
    for (const [id, x] of people) {
      if (!x.root.visible) continue;
      const v = x.first ? 0 : x.pos.distanceTo(x.prev) / Math.max(dt, 1e-4);
      const moving = v > 0.25 && !snap;
      let dir;
      if (moving) dir = Math.atan2(x.pos.x - x.prev.x, x.pos.z - x.prev.z);
      else if (x.side === 'D' && x.guard && P(x.guard)) dir = Math.atan2(P(x.guard).pos.x - x.pos.x, P(x.guard).pos.z - x.pos.z);
      else dir = Math.atan2(ballFlat.x - x.pos.x, ballFlat.z - x.pos.z);
      // Whoever has the ball faces the basket; facing the ball in their own hand made them spin.
      if (!moving && (id === f.holder || id === shooter || x.pos.distanceTo(ballFlat) < 0.6)) dir = Math.atan2(RIM.x - x.pos.x, RIM.z - x.pos.z);
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
      const atFeet = document.body.dataset.tags === 'floor';
      proj.set(x.root.position.x, atFeet ? 0.02 : 2.05 * (x.look.height || 1) + x.root.position.y, x.root.position.z).project(this.camera);
      // Behind the camera, off screen or faded out: no tag, so none float in the air.
      const off = proj.z > 1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1 || x.alpha < 0.55;
      x.tag.style.visibility = off ? 'hidden' : '';
      x.tag.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, ${atFeet ? '-20%' : '-100%'})${atFeet ? ' scaleY(.6)' : ''}`;
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
