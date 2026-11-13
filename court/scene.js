// The 3D court: floor, hoop, players, ball, arrows for the current beat, path handles,
// and picking/dragging. Positions come in as court units (see model.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Player } from './players.js?v=20261113b';
import { THEMES, FLOORS, RIM as RIM_UV } from './model.js?v=20261113b';

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
  g.fillStyle = look.scene === 'arena' ? '#121316' : look.scene === 'park' ? '#8E8C86' : '#2B2A28';
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

    this.setTheme('bw');
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
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), dark);
    arm.position.set(0, 3.3, boardZ - 0.72);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), dark);
    pole.position.set(0, 1.7, boardZ - 1.4);
    pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.6), pad);
    base.position.set(0, 0.25, boardZ - 1.7);
    g.add(arm, pole, base);
    scene.add(g);
  }

  // What's around the court: nothing (studio / arena) or a New York City park.
  setSurroundings(type) {
    if (this.surroundType === type) return;
    this.surroundType = type;
    if (this.surround) { this.scene.remove(this.surround); this.surround.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.surround = null; }
    this.netMat.color.set(type === 'park' ? '#A9AEB3' : '#F6F3EC');
    this.netMat.metalness = type === 'park' ? 0.85 : 0;
    this.netMat.roughness = type === 'park' ? 0.35 : 0.95;
    if (type !== 'park') return;
    const g = (this.surround = new THREE.Group());
    const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
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

  setTheme(name) {
    this.theme = THEMES[name] ? name : 'bw';
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
    const park = look.scene === 'park';
    const bg = look.scene === 'arena' ? '#16171B' : park ? '#BFD6EA' : '#E9E3D9';
    this.scene.background.set(bg);
    this.scene.fog.color.set(park ? '#C9D8E4' : bg);
    this.scene.fog.near = park ? 45 : 30;
    this.scene.fog.far = park ? 170 : 60;
    this.hemi.intensity = look.scene === 'arena' ? 0.8 : park ? 1.1 : 1.25;
    this.hemi.color.set(park ? '#DCEBFF' : '#FFF8EE');
    this.hemi.groundColor.set(park ? '#6F7A5E' : '#8C7A66');
    this.key.intensity = look.scene === 'arena' ? 2.6 : park ? 2.6 : 2.1;
    this.key.color.set(park ? '#FFF1DC' : '#FFFFFF');
    this.key.position.set(park ? -8 : 6, 16, park ? 6 : 8);
    this.host.parentElement.classList.toggle('arena', look.scene === 'arena');
    this.setSurroundings(look.scene);
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
