// Data model, timing, shapes, and persistence for Dance Studio.

export const uid = () => Math.random().toString(36).slice(2, 10);

export const PALETTE = [
  '#E0552E', '#2F6FEB', '#8E44AD', '#1E9E6A', '#F2A93B', '#E35D9A',
  '#14A3B8', '#5B6B7A', '#B5651D', '#C0392B', '#6C5CE7', '#00A86B',
  '#D4A017', '#FF7F50', '#2C3E50', '#9B5DE5',
];

export const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

// Per-dancer pacing within a transition. Stored on the destination formation's
// pos entry as tm: { s, e, pace } — s/e are fractions (0–1) of the transition.
export const PACES = {
  smooth: { label: 'Smooth', fn: ease },
  linear: { label: 'Steady', fn: (u) => u },
  out: { label: 'Burst', fn: (u) => 1 - (1 - u) ** 3 },
  in: { label: 'Build', fn: (u) => u ** 3 },
};
export function localProgress(tm, u) {
  const s = tm?.s ?? 0, e = tm?.e ?? 1;
  return e - s < 1e-3 ? (u >= e ? 1 : 0) : Math.max(0, Math.min(1, (u - s) / (e - s)));
}
// Rhythm: tm.w = one speed per count (0 hold, 1 slow, 2 medium, 3 fast).
// Progress along the path is the running share of "effort" spent so far.
export const SPEEDS = ['Hold', 'Slow', 'Medium', 'Fast'];
export function rhythmProgress(w, u) {
  const n = w.length, total = w.reduce((a, b) => a + b, 0);
  if (!n || !total) return u >= 1 ? 1 : 0;
  const x = Math.max(0, Math.min(1, u)) * n;
  const k = Math.min(n - 1, Math.floor(x));
  let before = 0;
  for (let i = 0; i < k; i++) before += w[i];
  return Math.min(1, (before + w[k] * (x - k)) / total);
}
export function speedAt(tm, u) {
  if (!tm?.w) { const l = localProgress(tm, u); return l > 0 && l < 1 ? 2 : 0; }
  const n = tm.w.length;
  return tm.w[Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.9999, u)) * n))];
}
export function dancerProgress(tm, u) {
  if (tm?.w) return rhythmProgress(tm.w, u);
  return (PACES[tm?.pace] || PACES.smooth).fn(localProgress(tm, u));
}
export function resample(w, n) {
  if (!w || !w.length) return Array(n).fill(2);
  return Array.from({ length: n }, (_, i) => w[Math.min(w.length - 1, Math.floor((i / n) * w.length))]);
}
// Old-style timing (leave/arrive window) → per-count rhythm
export function toRhythm(tm, n) {
  if (tm?.w) return resample(tm.w, n);
  const s = tm?.s ?? 0, e = tm?.e ?? 1;
  return Array.from({ length: n }, (_, i) => ((i + 0.5) / n >= s && (i + 0.5) / n <= e ? 2 : 0));
}
export const RHYTHM_PRESETS = {
  even: { label: 'Even', fn: (n) => Array(n).fill(2) },
  sfs: { label: 'Slow–fast–slow', fn: (n) => Array.from({ length: n }, (_, i) => (i < n / 4 || i >= n - n / 4 ? 1 : 3)) },
  wait: { label: 'Wait, then go', fn: (n) => Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 3)) },
  early: { label: 'Go, then wait', fn: (n) => Array.from({ length: n }, (_, i) => (i < n / 2 ? 3 : 0)) },
  accel: { label: 'Speed up', fn: (n) => Array.from({ length: n }, (_, i) => 1 + Math.floor((i / n) * 3)) },
  decel: { label: 'Slow down', fn: (n) => Array.from({ length: n }, (_, i) => 3 - Math.floor((i / n) * 3)) },
};

// How a dancer travels during a move. Stored on the destination pos entry as tr: { style, facing }.
export const STYLES = {
  walk: { label: 'Walk' },
  run: { label: 'Run' },
  chasse: { label: 'Chassé' },
  turn: { label: 'Turn' },
  leap: { label: 'Leap' },
  floor: { label: 'Floor' },
};
export const FACINGS = {
  travel: { label: 'Ahead' },
  front: { label: 'Audience' },
  back: { label: 'Upstage' },
};
export const styleOf = (tr) => (STYLES[tr?.style] ? tr.style : 'walk');
export const facingOf = (tr) => tr?.facing || (styleOf(tr) === 'chasse' ? 'front' : 'travel');

/* ---------------- Counts ---------------- */
export const beatLen = (d) => 60 / (d.music?.bpm || 120);
export function beatAt(d, t) { return (t - (d.music?.offset || 0)) / beatLen(d); }
// Musical position at time t: which 8-count and which count (1–8).
export function countAt(d, t) {
  const bi = Math.floor(beatAt(d, t) + 1e-6);
  return { eight: Math.floor(bi / 8) + 1, count: (((bi % 8) + 8) % 8) + 1, beat: bi };
}
// Change tempo but keep every hold and move the same number of counts.
export function setTempo(d, bpm) {
  bpm = clamp(Math.round(bpm), 30, 300);
  const k = (60 / bpm) / beatLen(d);
  for (const f of d.formations) {
    f.hold = Math.round(f.hold * k * 1000) / 1000;
    f.transition = Math.round(f.transition * k * 1000) / 1000;
  }
  d.music.bpm = bpm;
}
// "1-4", "5–8", "9" → [a, b]
export function parseCounts(str) {
  const m = String(str || '').trim().match(/^(\d+)\s*(?:[-–—to]+\s*(\d+))?$/i);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return a > 0 && b >= a ? [a, b] : null;
}
// Count-sheet lines active at time t (counts are relative to the formation's first beat).
export function activeNotes(d, t) {
  const { segs } = timing(d);
  const { i } = locate(d, t);
  const f = d.formations[i];
  const c = Math.floor((t - segs[i].start) / beatLen(d) + 1e-6) + 1;
  return { i, count: c, lines: (f.notes || []).filter((n) => { const r = parseCounts(n.counts); return r && c >= r[0] && c <= r[1] && n.text; }) };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- Dance construction ---------------- */

export function newDance(title = 'Untitled dance', n = 4) {
  const d = {
    v: 1, id: uid(), title,
    stage: { w: 12, d: 8 },
    music: { bpm: 120, offset: 0, units: 'counts' },
    dancers: [],
    groups: [],
    formations: [{ id: uid(), name: 'Opening', hold: 4, transition: 2, pos: {}, notes: [] }],
    created: Date.now(), updated: Date.now(),
  };
  for (let i = 0; i < n; i++) addDancer(d);
  applyShape(d, 0, d.dancers.map((x) => x.id), 'line');
  return d;
}

export function bounds(d) {
  return { x: d.stage.w / 2 + 2.5, z: d.stage.d / 2 + 1 };
}

function freeSpot(d, f, ignoreId) {
  const taken = Object.entries(f.pos).filter(([id]) => id !== ignoreId).map(([, p]) => p);
  const ok = (x, z) => taken.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > 0.95 ** 2);
  const z0 = Math.min(1.5, d.stage.d / 2 - 0.8);
  for (let ring = 0; ring < 12; ring++) {
    for (let k = -ring; k <= ring; k++) {
      for (const zz of [z0 - ring * 0.9, z0 + 0.0]) {
        const x = k * 1.0;
        if (Math.abs(x) < d.stage.w / 2 && Math.abs(zz) < d.stage.d / 2 && ok(x, zz)) return { x, z: zz };
      }
    }
  }
  return { x: 0, z: 0 };
}

export function addDancer(d, name) {
  const used = new Set(d.dancers.map((x) => x.color));
  const color = PALETTE.find((c) => !used.has(c)) || PALETTE[d.dancers.length % PALETTE.length];
  const names = new Set(d.dancers.map((x) => x.name));
  let n = d.dancers.length + 1;
  while (!name && names.has(`Dancer ${n}`)) n++;
  const dancer = { id: uid(), name: name || `Dancer ${n}`, color };
  d.dancers.push(dancer);
  for (const f of d.formations) {
    const s = freeSpot(d, f, dancer.id);
    f.pos[dancer.id] = { x: s.x, z: s.z, on: true };
  }
  return dancer;
}

export function removeDancers(d, ids) {
  const set = new Set(ids);
  d.dancers = d.dancers.filter((x) => !set.has(x.id));
  for (const f of d.formations) for (const id of set) delete f.pos[id];
  pruneGroups(d);
}

/* ---------------- Pairs & groups ---------------- */
// A group shares one color: identical ("same") or light/dark shades of it ("shades").

export function shade(hex, k) {
  if (!k) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const dd = max - min;
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    h = max === r ? (g - b) / dd + (g < b ? 6 : 0) : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    h /= 6;
  }
  const steps = [0, 0.14, -0.12, 0.24, -0.2, 0.32, -0.26];
  l = clamp(l + steps[k % steps.length], 0.18, 0.86);
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p2 = 2 * l - q;
  const hx = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hx(f(p2, q, h + 1 / 3))}${hx(f(p2, q, h))}${hx(f(p2, q, h - 1 / 3))}`;
}

export function groupOf(d, dancerId) {
  const dn = d.dancers.find((x) => x.id === dancerId);
  return dn?.group ? d.groups.find((g) => g.id === dn.group) : null;
}
export function members(d, gid) { return d.dancers.filter((x) => x.group === gid); }

export function recolorGroup(d, g) {
  members(d, g.id).forEach((dn, k) => { dn.color = g.mode === 'same' ? g.color : shade(g.color, k); });
}

export function makeGroup(d, ids, { mode = 'shades' } = {}) {
  ids = ids.filter((id) => d.dancers.some((x) => x.id === id));
  if (ids.length < 2) return null;
  for (const id of ids) { const dn = d.dancers.find((x) => x.id === id); dn.group = null; }
  pruneGroups(d);
  const first = d.dancers.find((x) => x.id === ids[0]);
  const used = new Set(d.groups.map((g) => g.color));
  const color = used.has(first.color) ? (PALETTE.find((c) => !used.has(c)) || first.color) : first.color;
  const n = d.groups.length + 1;
  const g = { id: uid(), name: ids.length === 2 ? `Pair ${n}` : `Group ${n}`, color, mode };
  d.groups.push(g);
  // Keep members next to each other in the cast order.
  const set = new Set(ids);
  const at = d.dancers.findIndex((x) => set.has(x.id));
  const mem = ids.map((id) => d.dancers.find((x) => x.id === id));
  d.dancers = d.dancers.filter((x) => !set.has(x.id));
  d.dancers.splice(Math.min(at, d.dancers.length), 0, ...mem);
  mem.forEach((dn) => { dn.group = g.id; });
  recolorGroup(d, g);
  return g;
}

export function ungroup(d, gid) {
  d.dancers.forEach((x) => { if (x.group === gid) x.group = null; });
  d.groups = d.groups.filter((g) => g.id !== gid);
}

function pruneGroups(d) {
  d.groups ||= [];
  for (const g of [...d.groups]) {
    const m = members(d, g.id);
    if (m.length < 2) ungroup(d, g.id);
  }
}

export function duplicateFormation(d, i) {
  const src = d.formations[i];
  const f = {
    id: uid(), name: nextName(d, src.name), hold: src.hold, transition: src.transition,
    pos: JSON.parse(JSON.stringify(src.pos)), notes: [],
  };
  for (const id in f.pos) { delete f.pos[id].h; delete f.pos[id].wp; delete f.pos[id].tm; delete f.pos[id].tr; } // plain walk into the new one
  d.formations.splice(i + 1, 0, f);
  return i + 1;
}

function nextName(d, base) {
  const stem = base.replace(/\s+\d+$/, '');
  const names = new Set(d.formations.map((f) => f.name));
  let k = 2;
  while (names.has(`${stem} ${k}`)) k++;
  return `${stem} ${k}`;
}

/* ---------------- Timing ---------------- */

export function timing(d) {
  let t = 0;
  const n = d.formations.length;
  const segs = d.formations.map((f, i) => {
    const s = { start: t, holdEnd: t + f.hold };
    t += f.hold;
    if (i < n - 1) t += f.transition;
    s.end = t;
    return s;
  });
  return { segs, total: t };
}

// Where is time t? Returns formation index, phase, and progress through the move.
export function locate(d, t) {
  const { segs } = timing(d);
  let i = 0;
  for (let k = 0; k < segs.length; k++) if (segs[k].start <= t + 1e-6) i = k;
  const s = segs[i];
  if (t <= s.holdEnd || i === segs.length - 1) return { i, phase: 'hold', u: 0 };
  const f = d.formations[i];
  return { i, phase: 'move', u: clamp((t - s.holdEnd) / Math.max(f.transition, 1e-3), 0, 1) };
}

// Paths: a dancer travels from a → b through optional waypoints (b.wp), on a smooth curve.
export function controlPts(a, b, p) {
  if (p?.wp?.length) return [a, ...p.wp, b];
  if (p?.h && (p.h.x || p.h.z)) return [a, { x: (a.x + b.x) / 2 + p.h.x, z: (a.z + b.z) / 2 + p.h.z }, b];
  return [a, b];
}
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) };
}
export function curveBetween(c, i, t) {
  return catmull(c[i - 1] || c[i], c[i], c[i + 1], c[i + 2] || c[i + 1], t);
}
export function pathPolyline(a, b, p, per = 14) {
  const c = controlPts(a, b, p);
  if (c.length === 2) return [{ x: a.x, z: a.z }, { x: b.x, z: b.z }];
  const out = [];
  for (let i = 0; i < c.length - 1; i++) for (let k = 0; k < per; k++) out.push(curveBetween(c, i, k / per));
  out.push({ x: b.x, z: b.z });
  return out;
}
// Point at fraction u of the path's length, plus travel direction.
export function pathAt(a, b, p, u) {
  const pts = pathPolyline(a, b, p);
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); seg.push(l); L += l; }
  if (L < 1e-6) return { x: b.x, z: b.z, dir: 0, len: 0 };
  let target = Math.max(0, Math.min(1, u)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const q = seg[i] ? Math.min(1, target / seg[i]) : 0;
      const A = pts[i], B = pts[i + 1];
      return { x: A.x + (B.x - A.x) * q, z: A.z + (B.z - A.z) * q, dir: Math.atan2(B.x - A.x, B.z - A.z), len: L };
    }
    target -= seg[i];
  }
  return { x: b.x, z: b.z, dir: 0, len: L };
}
export const pathPoint = (a, b, p, u) => pathAt(a, b, p, u);

export function sample(d, t) {
  const { i, phase, u } = locate(d, t);
  const out = new Map();
  const f = d.formations[i];
  if (phase === 'hold') {
    for (const dn of d.dancers) {
      const p = f.pos[dn.id] || { x: 0, z: 0, on: true };
      out.set(dn.id, { x: p.x, z: p.z, alpha: p.on ? 1 : 0, moving: false });
    }
    return out;
  }
  const g = d.formations[i + 1];
  for (const dn of d.dancers) {
    const a = f.pos[dn.id] || { x: 0, z: 0, on: true };
    const b = g.pos[dn.id] || a;
    const e = dancerProgress(b.tm, u);
    const p = pathAt(a, b, b, e);
    const alpha = (a.on ? 1 : 0) + ((b.on ? 1 : 0) - (a.on ? 1 : 0)) * e;
    const speed = speedAt(b.tm, u);
    const style = styleOf(b.tr);
    out.set(dn.id, {
      x: p.x, z: p.z, alpha,
      moving: speed > 0 && e < 1 && (p.len > 0.05 || style === 'turn'),
      lp: e, dist: p.len, dur: f.transition,
      dir: p.dir,
      style, facing: facingOf(b.tr),
    });
  }
  return out;
}

/* ---------------- Shapes ---------------- */

export const SHAPES = {
  line: { label: 'Line', pts: (n, s) => range(n).map((i) => ({ x: (i - (n - 1) / 2) * s, z: 0 })) },
  rows: {
    label: 'Two rows',
    pts: (n, s) => {
      const front = Math.ceil(n / 2), back = n - front;
      return [
        ...range(front).map((i) => ({ x: (i - (front - 1) / 2) * s, z: s * 0.5 })),
        ...range(back).map((i) => ({ x: (i - (back - 1) / 2) * s, z: -s * 0.5 })),
      ];
    },
  },
  v: {
    label: 'V',
    pts: (n, s) => {
      const k = Math.ceil((n - 1) / 2), depth = s * 0.65;
      return range(n).map((i) => {
        const step = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
        return { x: side * step * s * 0.75, z: (k * depth) / 2 - step * depth };
      });
    },
  },
  circle: {
    label: 'Circle',
    pts: (n, s) => {
      const r = Math.max(1.4, (n * s) / (2 * Math.PI));
      return range(n).map((i) => ({ x: r * Math.sin((i / n) * Math.PI * 2), z: r * Math.cos((i / n) * Math.PI * 2) }));
    },
  },
  diagonal: { label: 'Diagonal', pts: (n, s) => range(n).map((i) => ({ x: (i - (n - 1) / 2) * s * 0.8, z: -(i - (n - 1) / 2) * s * 0.55 })) },
  grid: {
    label: 'Grid',
    pts: (n, s) => {
      const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
      return range(n).map((i) => {
        const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols;
        const c = i % cols;
        return { x: (c - (inRow - 1) / 2) * s, z: ((rows - 1) / 2 - r) * s };
      });
    },
  },
  diamond: {
    label: 'Diamond',
    pts: (n, s) => {
      const pts = [];
      for (let ring = 0; pts.length < n; ring++) {
        if (ring === 0) { pts.push({ x: 0, z: 0 }); continue; }
        for (let k = 0; k < ring * 4 && pts.length < n; k++) {
          const side = Math.floor(k / ring), t = k % ring;
          const dirs = [[1, -1], [-1, -1], [-1, 1], [1, 1]];
          const start = [[0, ring], [ring, 0], [0, -ring], [-ring, 0]][side];
          pts.push({ x: (start[0] + dirs[side][0] * t) * s, z: (start[1] + dirs[side][1] * t) * s });
        }
      }
      return pts;
    },
  },
  arc: {
    label: 'Arc',
    pts: (n, s) => {
      const r = Math.max(2, (n * s) / Math.PI);
      return range(n).map((i) => {
        const a = n === 1 ? 0 : -1.15 + (2.3 * i) / (n - 1);
        return { x: r * Math.sin(a), z: -r * Math.cos(a) + r * 0.55 };
      });
    },
  },
  spiral: {
    label: 'Spiral',
    pts: (n, s) => range(n).map((i) => {
      const a = i * 0.9, r = 0.5 + i * s * 0.3;
      return { x: r * Math.sin(a), z: r * Math.cos(a) };
    }),
  },
};

function range(n) { return Array.from({ length: n }, (_, i) => i); }

// Assign dancers to shape points, keeping travel short and paths uncrossed where possible.
function assign(cur, pts) {
  const A = [...cur].sort((a, b) => a.x - b.x || a.z - b.z);
  const P = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  for (let pass = 0; pass < 30; pass++) {
    let improved = false;
    for (let i = 0; i < A.length; i++) {
      for (let j = i + 1; j < A.length; j++) {
        if (d2(A[i], P[j]) + d2(A[j], P[i]) < d2(A[i], P[i]) + d2(A[j], P[j]) - 1e-9) {
          [P[i], P[j]] = [P[j], P[i]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return new Map(A.map((a, i) => [a.id, P[i]]));
}

function centroid(list) {
  const n = list.length || 1;
  return { x: list.reduce((s, p) => s + p.x, 0) / n, z: list.reduce((s, p) => s + p.z, 0) / n };
}

export function applyShape(d, fi, ids, shape, spacing = 1.25) {
  const f = d.formations[fi];
  const cur = ids.map((id) => ({ id, ...f.pos[id] }));
  if (!cur.length) return;
  const whole = ids.length === d.dancers.filter((x) => f.pos[x.id]?.on).length || ids.length === d.dancers.length;
  const c = whole ? { x: 0, z: 0 } : centroid(cur);
  let pts = SHAPES[shape].pts(cur.length, spacing);
  const pc = centroid(pts);
  // Fit inside the stage.
  const maxX = Math.max(...pts.map((p) => Math.abs(p.x - pc.x))), maxZ = Math.max(...pts.map((p) => Math.abs(p.z - pc.z)));
  const k = Math.min(1, (d.stage.w / 2 - 0.5) / (maxX || 1), (d.stage.d / 2 - 0.5) / (maxZ || 1));
  pts = pts.map((p) => ({ x: c.x + (p.x - pc.x) * k, z: c.z + (p.z - pc.z) * k }));
  const map = assign(cur, pts);
  const b = bounds(d);
  for (const [id, p] of map) {
    const q = f.pos[id];
    q.x = round(clamp(p.x, -b.x, b.x));
    q.z = round(clamp(p.z, -b.z, b.z));
  }
}

export function transform(d, fi, ids, fn) {
  const f = d.formations[fi];
  const c = centroid(ids.map((id) => f.pos[id]));
  const b = bounds(d);
  for (const id of ids) {
    const p = f.pos[id];
    const q = fn({ x: p.x - c.x, z: p.z - c.z });
    p.x = round(clamp(c.x + q.x, -b.x, b.x));
    p.z = round(clamp(c.z + q.z, -b.z, b.z));
  }
}

export const round = (v) => Math.round(v * 100) / 100;

// Ripple: each selected dancer (ordered left → right, or by current order) leaves a beat after the last.
export function stagger(d, fi, ids, { spread = 0.6, order = 'x' } = {}) {
  const f = d.formations[fi];
  const prev = d.formations[fi - 1];
  if (!prev) return;
  const sorted = [...ids].sort((a, b) => (order === 'x' ? prev.pos[a].x - prev.pos[b].x : 0));
  const n = sorted.length;
  const len = Math.max(0.25, 1 - spread);
  sorted.forEach((id, k) => {
    const s = n === 1 ? 0 : (spread * k) / (n - 1);
    f.pos[id].tm = { ...(f.pos[id].tm || {}), s: round(s), e: round(Math.min(1, s + len)) };
  });
}

/* ---------------- Collisions ---------------- */
// Two dancers closer than this (center to center, meters) are touching.
export const MIN_GAP = 0.55;

function sameGroup(d, a, b) {
  const A = d.dancers.find((x) => x.id === a), B = d.dancers.find((x) => x.id === b);
  return !!(A?.group && A.group === B?.group);
}

// Returns [{ kind: 'spot'|'move', fi, a, b, t, x, z }] — fi is the formation (for moves: the one being moved into).
export function findCollisions(d, { only = null, steps = 60 } = {}) {
  const out = [];
  const { segs } = timing(d);
  const ids = d.dancers.map((x) => x.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (!sameGroup(d, ids[i], ids[j])) pairs.push([ids[i], ids[j]]);
  d.formations.forEach((f, i) => {
    if (only !== null && only !== i) return;
    for (const [a, b] of pairs) {
      const p = f.pos[a], q = f.pos[b];
      if (!p || !q || p.on === false || q.on === false) continue;
      if (Math.hypot(p.x - q.x, p.z - q.z) < MIN_GAP) out.push({ kind: 'spot', fi: i, a, b, t: segs[i].start, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    }
  });
  for (let i = 0; i < d.formations.length - 1; i++) {
    if (only !== null && only !== i + 1) continue;
    const f = d.formations[i], g = d.formations[i + 1];
    const t0 = segs[i].holdEnd, T = f.transition;
    const seen = new Set();
    for (let k = 1; k < steps; k++) {
      const t = t0 + (T * k) / steps;
      const fr = sample(d, t);
      for (const [a, b] of pairs) {
        const key = a + b;
        if (seen.has(key)) continue;
        const p = fr.get(a), q = fr.get(b);
        if (!p || !q || p.alpha < 0.5 || q.alpha < 0.5) continue;
        // Already overlapping at both ends is a 'spot' problem, not a path problem.
        const sa = f.pos[a], sb = f.pos[b], ea = g.pos[a], eb = g.pos[b];
        if (Math.hypot(sa.x - sb.x, sa.z - sb.z) < MIN_GAP || Math.hypot(ea.x - eb.x, ea.z - eb.z) < MIN_GAP) continue;
        if (Math.hypot(p.x - q.x, p.z - q.z) < MIN_GAP) {
          seen.add(key);
          out.push({ kind: 'move', fi: i + 1, a, b, t, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
        }
      }
    }
  }
  return out;
}

// Try small changes to one of the two dancers and keep the one that clears the most collisions in that move.
export function fixCollision(d, c) {
  const list = (dd) => findCollisions(dd, { only: c.fi });
  const base = list(d).length;
  let best = null;
  // Accept a change if it clears this pair and doesn't make the move worse overall.
  const consider = (mutateFn, cost, label) => {
    const copy = JSON.parse(JSON.stringify(d));
    mutateFn(copy);
    const after = list(copy);
    const pairStill = after.some((x) => x.kind === c.kind && ((x.a === c.a && x.b === c.b) || (x.a === c.b && x.b === c.a)));
    if (pairStill || after.length > base) return;
    const score = after.length * 100 + cost;
    if (!best || score < best.score) best = { score, copy, label };
  };
  if (c.kind === 'spot') {
    // Nudge one dancer to the nearest free spot.
    for (const id of [c.b, c.a]) {
      for (const r of [0.6, 0.9, 1.2]) {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          consider((dd) => { const p = dd.formations[c.fi].pos[id]; p.x = round(p.x + r * Math.sin(ang)); p.z = round(p.z + r * Math.cos(ang)); }, r, 'moved apart');
        }
      }
    }
  } else {
    const prev = d.formations[c.fi - 1];
    const n = Math.max(1, Math.round(prev.transition / beatLen(d)));
    const fr = sample(d, c.t);
    for (const id of [c.b, c.a]) {
      const me = fr.get(id);
      // Reroute: a bend beside the collision point, either side.
      const perp = me.dir + Math.PI / 2;
      for (const off of [0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.8, -1.8]) {
        const pt = { x: round(me.x + off * Math.sin(perp)), z: round(me.z + off * Math.cos(perp)) };
        consider((dd) => {
          const e = dd.formations[c.fi].pos[id], a = dd.formations[c.fi - 1].pos[id];
          const wp = controlPts(a, e, e).slice(1, -1);
          // Insert where it adds the least distance.
          const all = [a, ...wp, e];
          let bi = 0, bc = Infinity;
          for (let k = 0; k < all.length - 1; k++) {
            const add = Math.hypot(all[k].x - pt.x, all[k].z - pt.z) + Math.hypot(all[k + 1].x - pt.x, all[k + 1].z - pt.z) - Math.hypot(all[k].x - all[k + 1].x, all[k].z - all[k + 1].z);
            if (add < bc) { bc = add; bi = k; }
          }
          wp.splice(bi, 0, pt);
          e.wp = wp;
          delete e.h;
        }, Math.abs(off) * 1.2, 'rerouted');
      }
      // Retime: wait for the other dancer to pass, or get there first.
      const wait = (k) => Array.from({ length: n }, (_, i) => (i < k ? 0 : 3));
      const early = (k) => Array.from({ length: n }, (_, i) => (i < n - k ? 3 : 0));
      for (const k of [Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4)]) {
        if (k >= n) continue;
        consider((dd) => { dd.formations[c.fi].pos[id].tm = { w: wait(k) }; }, 1 + k * 0.4, 'waits');
        consider((dd) => { dd.formations[c.fi].pos[id].tm = { w: early(k) }; }, 1.2 + k * 0.4, 'goes early');
      }
    }
  }
  if (!best) return null;
  return best;
}

// Fix collisions one at a time until none are left (or nothing more helps).
export function fixAll(d, maxRounds = 60) {
  let fixed = 0;
  const stuck = new Set();
  for (let r = 0; r < maxRounds; r++) {
    const cs = findCollisions(d).filter((c) => !stuck.has(c.kind + c.fi + c.a + c.b));
    if (!cs.length) break;
    const res = fixCollision(d, cs[0]);
    if (!res) { stuck.add(cs[0].kind + cs[0].fi + cs[0].a + cs[0].b); continue; }
    Object.assign(d, res.copy);
    fixed++;
  }
  return { fixed, left: findCollisions(d).length };
}

/* ---------------- Demo ---------------- */

export function demoDance() {
  const d = newDance('Spring Showcase — Opener', 0);
  ['Maya', 'Jordan', 'Priya', 'Leo', 'Sam', 'Ava', 'Kai', 'Noor'].forEach((n) => addDancer(d, n));
  const all = () => d.dancers.map((x) => x.id);
  d.formations[0].name = 'Line';
  d.formations[0].hold = 4;
  applyShape(d, 0, all(), 'line');
  const steps = [['Opening V', 'v', 4, 2], ['Circle', 'circle', 4, 2], ['Diamond', 'diamond', 4, 4], ['Spiral', 'spiral', 4, 2]];
  for (const [name, shape, hold, tr] of steps) {
    const i = duplicateFormation(d, d.formations.length - 1);
    d.formations[i].name = name;
    d.formations[i].hold = hold;
    d.formations[i - 1].transition = tr;
    applyShape(d, i, all(), shape);
  }
  // A late entrance: Eli joins offstage and walks on for the circle.
  const eli = addDancer(d, 'Eli');
  d.formations.forEach((f, i) => {
    if (i < 2) Object.assign(f.pos[eli.id], { x: -d.stage.w / 2 - 1.2, z: 1.5, on: false });
  });
  applyShape(d, 2, all(), 'circle');
  applyShape(d, 3, all(), 'diamond');
  applyShape(d, 4, all(), 'spiral');
  // A couple of curved paths to show the idea.
  const circ = d.formations[2];
  for (const id of all().slice(0, 3)) circ.pos[id].h = { x: 0.9, z: 0.4 };
  // Noor weaves around the group on the way into the diamond, slow–fast–slow.
  const noor = d.dancers.find((x) => x.name === 'Noor').id;
  d.formations[3].pos[noor].wp = [{ x: 3.5, z: 2.5 }, { x: 0.5, z: 3.2 }];
  d.formations[3].pos[noor].tm = { w: [1, 1, 3, 3, 3, 3, 1, 1] };
  stagger(d, 1, all(), { spread: 0.55 }); // ripple into the V
  makeGroup(d, [d.dancers[3].id, d.dancers[4].id]); // Leo & Sam are partners
  makeGroup(d, [d.dancers[5].id, d.dancers[6].id], { mode: 'same' }); // Ava & Kai, matching
  d.formations[4].pos[d.dancers[0].id].tm = { w: [0, 0, 3, 3] }; // Maya waits 2 counts, then goes fast
  // Travel styles and count sheets
  for (const id of all()) d.formations[2].pos[id].tr = { style: 'run' };
  d.formations[2].pos[eli.id].tr = { style: 'leap' };
  for (const id of all()) if (id !== noor) d.formations[3].pos[id].tr = { style: 'chasse', facing: 'front' };
  for (const id of all()) d.formations[4].pos[id].tr = { style: 'turn' };
  d.formations[4].pos[d.dancers[0].id].tr = { style: 'floor' };
  const L = (counts, text, who = []) => ({ id: uid(), counts, text, who });
  d.formations[0].notes = [L('1-4', 'Heads down, still'), L('5-8', 'Heads up on 5, arms open on 7')];
  d.formations[1].notes = [L('1-4', 'Port de bras, right arm leads'), L('5-8', 'Body roll down and up')];
  d.formations[2].notes = [L('1-4', 'Hold hands, circle walks clockwise'), L('5-8', 'Release, arms overhead'), L('5-8', 'Lift', [d.dancers[3].id, d.dancers[4].id])];
  d.formations[3].notes = [L('1-8', 'Unison phrase A (from rehearsal video, 0:45)')];
  d.formations[4].notes = [L('1-4', 'Ripple from center out'), L('5-8', 'Final pose — reach up and freeze')];
  fixAll(d);
  return d;
}

/* ---------------- Persistence ---------------- */

const LIB = 'ds.library';
const KEY = (id) => `ds.dance.${id}`;
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export function libraryIds() { return safe(() => JSON.parse(localStorage.getItem(LIB)) || [], []); }
export function loadDance(id) { return safe(() => JSON.parse(localStorage.getItem(KEY(id))), null); }
export function saveDance(d) {
  return safe(() => {
    localStorage.setItem(KEY(d.id), JSON.stringify(d));
    const ids = libraryIds().filter((x) => x !== d.id);
    ids.unshift(d.id);
    localStorage.setItem(LIB, JSON.stringify(ids));
    localStorage.setItem('ds.last', d.id);
    return true;
  }, false);
}
export function deleteDance(id) {
  safe(() => {
    localStorage.removeItem(KEY(id));
    localStorage.setItem(LIB, JSON.stringify(libraryIds().filter((x) => x !== id)));
  });
  deleteAudio(id);
}
export function lastId() { return safe(() => localStorage.getItem('ds.last'), null); }

export function validate(obj) {
  if (!obj || !Array.isArray(obj.dancers) || !Array.isArray(obj.formations) || !obj.formations.length) throw new Error('Not a Dance Studio file');
  obj.stage ||= { w: 12, d: 8 };
  obj.title ||= 'Imported dance';
  obj.groups ||= [];
  obj.music = { bpm: 120, offset: 0, units: 'counts', ...(obj.music || {}) };
  for (const f of obj.formations) {
    f.id ||= uid(); f.pos ||= {}; f.notes ||= []; f.hold ??= 4; f.transition ??= 2; f.name ||= 'Formation';
    for (const dn of obj.dancers) f.pos[dn.id] ||= { x: 0, z: 0, on: true };
  }
  return obj;
}

/* Audio lives in IndexedDB, keyed by dance id. */
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('dance-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const conn = await db();
  return new Promise((res, rej) => {
    const t = conn.transaction('audio', mode);
    const req = fn(t.objectStore('audio'));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
export const putAudio = (id, rec) => tx('readwrite', (s) => s.put(rec, id)).catch(() => {});
export const getAudio = (id) => tx('readonly', (s) => s.get(id)).catch(() => null);
export const deleteAudio = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});

/* Share links: deflate + base64url in the hash. */
export async function encodeShare(d) {
  const json = JSON.stringify({ ...d, id: undefined });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function decodeShare(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return validate(JSON.parse(await new Response(stream).text()));
}

/* Thumbnail: a little top-down SVG of one formation. */
export function thumbSVG(d, fi, { w = 160, h = 100, bg = '#EAD2AE', r = 3.2 } = {}) {
  const f = d.formations[fi];
  const sx = w / (d.stage.w + 1), sz = h / (d.stage.d + 1);
  const dots = d.dancers.map((dn) => {
    const p = f.pos[dn.id];
    if (!p) return '';
    const cx = (w / 2 + p.x * sx).toFixed(1), cy = (h / 2 + p.z * sz).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dn.color}"${p.on ? '' : ' opacity=".3"'}/>`;
  }).join('');
  const sw = d.stage.w * sx, sd = d.stage.d * sz;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="${w}" height="${h}" fill="${bg}" opacity=".35"/><rect x="${(w - sw) / 2}" y="${(h - sd) / 2}" width="${sw}" height="${sd}" rx="3" fill="${bg}"/><path d="M${w / 2} ${(h - sd) / 2}V${(h + sd) / 2}" stroke="#7a5a38" stroke-opacity=".25" stroke-dasharray="3 3"/>${dots}</svg>`;
}
