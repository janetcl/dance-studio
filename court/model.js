// Court Mode data model. Positions are in court units: tenths of a foot on a
// 50 × 47 ft half court. u runs across (0–500, left to right facing the basket),
// v runs out from the baseline (0) to half court (470).
//
// play = { v, id, name, size, theme, defense: 'man'|'hand'|'none', ball: holder id,
//   players: [{ id, side: 'O'|'D', num, pos, guard?, look }],
//   start: { id: [u, v] },
//   beats: [{ id, name, dur, text, dribble?,
//     moves: { id: { to?: [u, v], wp?: [[u, v]], pace?, act? } },
//     ball: null | { kind: 'pass', to, t0, t1 } | { kind: 'shot', t0, t1 } }] }

export const RIM = [250, 52.5];
export const uid = () => Math.random().toString(36).slice(2, 10);
export const clampUV = ([u, v]) => [Math.round(Math.max(-40, Math.min(540, u))), Math.round(Math.max(-35, Math.min(465, v)))];

export const THEMES = {
  bw: { name: 'Black vs white', O: { jersey: '#1D1A17', shorts: '#1D1A17', num: '#FFFFFF' }, D: { jersey: '#F4F2EE', shorts: '#F4F2EE', num: '#1D1A17' }, paint: '#5A544C' },
  rb: { name: 'Red vs blue', O: { jersey: '#D62839', shorts: '#A81C2C', num: '#FFFFFF' }, D: { jersey: '#1F4FD1', shorts: '#173C9E', num: '#FFFFFF' }, paint: '#2D4E9C' },
  tp: { name: 'Teal vs purple', O: { jersey: '#0E8C7F', shorts: '#0A6B61', num: '#FFFFFF' }, D: { jersey: '#6A3FC1', shorts: '#51309A', num: '#FFFFFF' }, paint: '#4B3A8C' },
  gg: { name: 'Green vs gold', O: { jersey: '#1E7B3C', shorts: '#165C2D', num: '#F7D046' }, D: { jersey: '#F2B705', shorts: '#C99700', num: '#1D1A17' }, paint: '#1E6B39' },
  nysa: { name: 'NY vs SA jerseys', O: { jersey: '#F7F7F5', shorts: '#F7F7F5', num: '#006BB6', trim: '#F58426' }, D: { jersey: '#1A1A1A', shorts: '#1A1A1A', num: '#C4CED4', trim: '#1A1A1A' }, paint: '#0A5FA8' },
};

// Court looks. A play's court = { floor, paint, lines, border, label, scene };
// paint/border null means "use the team colors".
export const FLOORS = {
  maple: { name: 'Maple', h: 33, s: 52, l: 72, thumb: '#E8C99D' },
  honey: { name: 'Honey', h: 30, s: 58, l: 57, thumb: '#D39A5E' },
  walnut: { name: 'Walnut', h: 22, s: 38, l: 33, thumb: '#7A5236' },
  gray: { name: 'Gray wood', h: 30, s: 6, l: 70, thumb: '#BDB8B1' },
  blacktop: { name: 'Blacktop', solid: '#3B3E42', thumb: '#45484C' },
};
export const PAINTS = ['#2D4E9C', '#B3202E', '#0F6B5E', '#5B3A9E', '#1D1A17', '#E07A1F', '#3F7D3A', '#8E8A84'];
export const LINE_COLORS = { '#FFFFFF': 'White', '#1D1A17': 'Black', '#F2B705': 'Gold', '#E0552E': 'Orange' };
export const BORDERS = ['#2B2A28', '#1D1A17', '#5A544C', '#B3202E', '#0F6B5E', '#F2B705'];
export function courtLook(play) {
  const c = play.court || {};
  const th = THEMES[play.theme] || THEMES.bw;
  const paint = c.paint === undefined || c.paint === null ? th.paint : c.paint;
  return {
    floor: FLOORS[c.floor] ? c.floor : 'maple',
    paint, // '' = no paint
    lines: c.lines || (c.floor === 'blacktop' ? '#FFFFFF' : '#FFFFFF'),
    border: c.border || paint || '#2B2A28',
    label: c.label || '',
    scene: ['arena', 'park', 'garden'].includes(c.scene) ? c.scene : 'studio',
  };
}

export const SKINS = ['#F1C9A5', '#E0AC80', '#C68B5E', '#8D5A3B', '#5B3A29'];
export const HAIRS = ['#1D1A17', '#2B1D14', '#6B3E1F', '#C9A15A', '#A8452A', '#B9B4AC'];
export const STYLES = { short: 'Short', buzz: 'Buzz', curly: 'Curly', bun: 'Bun', pony: 'Ponytail', long: 'Long' };
export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const LOOKS = {
  O: [
    { skin: '#E0AC80', hair: '#2B1D14', style: 'pony', height: 0.95 },
    { skin: '#8D5A3B', hair: '#1D1A17', style: 'buzz', height: 1.0 },
    { skin: '#F1C9A5', hair: '#C9A15A', style: 'bun', height: 1.0 },
    { skin: '#5B3A29', hair: '#1D1A17', style: 'curly', height: 1.05 },
    { skin: '#C68B5E', hair: '#2B1D14', style: 'short', height: 1.1 },
  ],
  D: [
    { skin: '#5B3A29', hair: '#1D1A17', style: 'bun', height: 0.97 },
    { skin: '#F1C9A5', hair: '#6B3E1F', style: 'short', height: 1.0 },
    { skin: '#C68B5E', hair: '#1D1A17', style: 'long', height: 1.0 },
    { skin: '#E0AC80', hair: '#1D1A17', style: 'buzz', height: 1.04 },
    { skin: '#8D5A3B', hair: '#2B1D14', style: 'curly', height: 1.08 },
  ],
};

const DEFAULT_SPOTS = {
  1: [[250, 300]],
  2: [[250, 300], [330, 120]],
  3: [[250, 310], [80, 190], [420, 190]],
  4: [[250, 320], [70, 200], [430, 200], [250, 120]],
  5: [[250, 320], [60, 200], [440, 200], [170, 90], [330, 90]],
};

export function manSpot(man, ball) {
  const dx = RIM[0] - man[0], dy = RIM[1] - man[1];
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(34, d * 0.45) / d;
  const u = man[0] + dx * k, v = man[1] + dy * k;
  return ball ? [u + (ball[0] - u) * 0.08, v + (ball[1] - v) * 0.08] : [u, v];
}

// Zone shapes. Spots are listed by priority, so smaller teams use the first few.
export const ZONES = {
  '2-3': { name: '2-3 zone', spots: [[250, 85], [185, 245], [315, 245], [110, 100], [390, 100]] },
  '3-2': { name: '3-2 zone', spots: [[250, 290], [110, 205], [390, 205], [185, 95], [315, 95]] },
  '1-3-1': { name: '1-3-1 zone', spots: [[250, 300], [250, 165], [110, 195], [390, 195], [250, 70]] },
};

// Zone defense: everyone slides with the ball, the closest defender steps out on it,
// and the rest pick up anyone cutting into their area.
export function zoneSpots(type, n, offense, ball) {
  const homes = (ZONES[type] || ZONES['2-3']).spots.slice(0, n);
  const B = ball || [250, 300];
  const shifted = homes.map(([u, v]) => [
    u + Math.max(-70, Math.min(70, (B[0] - 250) * 0.38)),
    v + Math.max(-40, Math.min(40, (B[1] - 220) * 0.18)),
  ]);
  const out = shifted.map((q) => q.slice());
  if (ball) {
    let best = 0, bd = Infinity;
    shifted.forEach((q, k) => { const d = Math.hypot(q[0] - B[0], q[1] - B[1]); if (d < bd) { bd = d; best = k; } });
    out[best] = manSpot(B);
    shifted.forEach((q, k) => {
      if (k === best) return;
      let near = null, nd = 75;
      for (const o of offense) {
        if (o === B) continue;
        const d = Math.hypot(o[0] - q[0], o[1] - q[1]);
        if (d < nd) { nd = d; near = o; }
      }
      if (near) {
        const g = manSpot(near);
        out[k] = [q[0] + (g[0] - q[0]) * 0.55, q[1] + (g[1] - q[1]) * 0.55];
      }
    });
  }
  return out;
}

export function makePlayers(size) {
  const ps = [];
  for (let i = 1; i <= size; i++) ps.push({ id: 'o' + i, side: 'O', num: String(i), pos: POSITIONS[i - 1], look: { ...LOOKS.O[i - 1] } });
  for (let i = 1; i <= size; i++) ps.push({ id: 'd' + i, side: 'D', num: String(i), pos: 'X' + i, guard: 'o' + i, look: { ...LOOKS.D[i - 1] } });
  return ps;
}

export function newPlay({ name = 'New play', size = 5, defense = 'man', theme = 'bw' } = {}) {
  const players = makePlayers(size);
  const start = {};
  DEFAULT_SPOTS[size].forEach((p, i) => { start['o' + (i + 1)] = p; });
  for (let i = 1; i <= size; i++) start['d' + i] = manSpot(start['o' + i]).map(Math.round);
  return { v: 1, id: uid(), name, size, theme, defense, ball: 'o1', players, start, beats: [{ id: uid(), name: 'Set', dur: 1.5, text: '', moves: {}, ball: null }] };
}

// ---------- Positions and paths ----------
const same = (a, b) => a && b && Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;

export function posAt(play, id, i) {
  for (let k = i; k >= 0; k--) { const m = play.beats[k].moves[id]; if (m && m.to) return m.to; }
  return play.start[id];
}

export function moveOf(play, i, id) {
  const b = play.beats[i];
  const m = b && b.moves[id];
  const from = posAt(play, id, i - 1);
  const to = posAt(play, id, i);
  const wp = (m && m.wp) || [];
  const moving = !same(from, to) || wp.length > 0;
  return { from, to, wp, pts: [from, ...wp, to], moving, pace: (m && m.pace) || 'even', act: (m && m.act) || 'auto' };
}

export function holderAt(play, i) {
  let h = play.ball;
  for (let k = 0; k < i; k++) {
    const e = play.beats[k].ball;
    if (e && e.kind === 'pass') h = e.to;
    if (e && e.kind === 'shot') h = null;
  }
  return h;
}

export function actionOf(play, i, id) {
  const m = moveOf(play, i, id);
  if (m.act === 'screen') return 'screen';
  if (!m.moving) return 'hold';
  return holderAt(play, i) === id ? 'dribble' : 'cut';
}

export function timing(play) {
  const starts = [];
  let t = 0;
  for (const b of play.beats) { starts.push(t); t += b.dur; }
  return { starts, total: t };
}

export function beatAt(play, T) {
  const { starts, total } = timing(play);
  for (let i = starts.length - 1; i >= 0; i--) if (T >= starts[i] - 1e-6) return { i, t: Math.min(1, (T - starts[i]) / play.beats[i].dur), start: starts[i], total };
  return { i: 0, t: 0, start: 0, total };
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
export const PACES = {
  even: { label: 'Even', f: easeInOut },
  explode: { label: 'Slow, then explode', f: (t) => { const p = t < 0.5 ? t * 0.5 : 0.25 + (t - 0.5) * 1.5; return p * 0.85 + easeInOut(t) * 0.15; } },
  early: { label: 'Go right away', f: (t) => easeInOut(Math.min(1, t * 1.8)) },
  late: { label: 'Wait, then go', f: (t) => easeInOut(Math.max(0, (t - 0.45) / 0.55)) },
};

// Centripetal Catmull-Rom through the points, as a dense polyline with lengths.
const pathCache = new Map();
export function smooth(pts, per = 16) {
  const key = JSON.stringify(pts) + per;
  if (pathCache.has(key)) return pathCache.get(key);
  let out;
  if (pts.length < 3) out = pts.length === 2 ? Array.from({ length: per + 1 }, (_, k) => lerp2(pts[0], pts[1], k / per)) : pts.slice();
  else {
    out = [];
    const P = [ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])];
    for (let s = 1; s < P.length - 2; s++) {
      for (let k = 0; k < per; k++) out.push(cr(P[s - 1], P[s], P[s + 1], P[s + 2], k / per));
    }
    out.push(pts[pts.length - 1]);
  }
  const len = [0];
  for (let k = 1; k < out.length; k++) len.push(len[k - 1] + Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]));
  const res = { pts: out, len, total: len[len.length - 1] };
  if (pathCache.size > 800) pathCache.clear();
  pathCache.set(key, res);
  return res;
}
function ext(a, b) { return [2 * a[0] - b[0], 2 * a[1] - b[1]]; }
function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function cr(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => lerp2(a, b, (tt - ta) / (tb - ta));
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
export function pointAlong(path, f) {
  const target = path.total * Math.max(0, Math.min(1, f));
  const { pts, len } = path;
  let lo = 0, hi = len.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (len[mid] < target) lo = mid; else hi = mid; }
  const seg = len[hi] - len[lo] || 1;
  return lerp2(pts[lo], pts[hi], (target - len[lo]) / seg);
}

// Where everyone is at time T. Returns court positions and the ball state.
export function sample(play, T) {
  const { i, t } = beatAt(play, T);
  const pos = {};
  const movers = {};
  const off = play.players.filter((p) => p.side === 'O');
  const def = play.players.filter((p) => p.side === 'D');
  const handD = play.defense === 'hand';
  for (const p of [...off, ...(handD ? def : [])]) {
    const m = moveOf(play, i, p.id);
    if (m.moving) {
      const f = PACES[m.pace] ? PACES[m.pace].f(t) : easeInOut(t);
      pos[p.id] = pointAlong(smooth(m.pts), f);
      movers[p.id] = true;
    } else pos[p.id] = m.to;
  }
  const holder = holderAt(play, i);
  const ev = play.beats[i] && play.beats[i].ball;
  const ballOwner = ev && ev.kind === 'pass' && t >= ev.t1 ? ev.to : holder;
  const ballPos = ballOwner ? pos[ballOwner] : RIM;
  if (play.defense === 'zone') {
    const spots = zoneSpots(play.zone, def.length, off.map((p) => pos[p.id]).filter(Boolean), ballOwner ? pos[ballOwner] : null);
    def.forEach((d, k) => { pos[d.id] = spots[k]; });
  }
  if (play.defense === 'man') {
    const screeners = off.filter((p) => moveOf(play, i, p.id).act === 'screen').map((p) => pos[p.id]);
    for (const d of def) {
      if (!pos[d.guard]) continue;
      let spot;
      const gm = movers[d.guard] && moveOf(play, i, d.guard);
      const goal = manSpot(pos[d.guard], ballPos);
      if (gm && d.guard !== holder && screeners.length) {
        // A cutter running off screens: the defender chases a step behind, gets caught
        // on the screens, then recovers to the goal side by the end of the beat.
        const f = PACES[gm.pace] ? PACES[gm.pace].f : easeInOut;
        const path = smooth(gm.pts);
        const lag = 32 / Math.max(32, path.total);
        const fv = f(t);
        let trail = pointAlong(path, Math.max(0, fv - lag));
        if (fv < lag) trail = lerp2(manSpot(gm.from, ballPos), trail, fv / lag);
        const k = Math.max(0, Math.min(1, (fv - 0.6) / 0.4));
        spot = lerp2(trail, goal, k * k * (3 - 2 * k));
      } else spot = goal; // Goal side: between their player and the basket.
      // Defenders can't run through screeners: they get pushed around them.
      for (const s of screeners) {
        const dx = spot[0] - s[0], dy = spot[1] - s[1], dist = Math.hypot(dx, dy);
        if (dist < 24) spot = dist < 0.01 ? [s[0] + 24, s[1]] : [s[0] + (dx / dist) * 24, s[1] + (dy / dist) * 24];
      }
      pos[d.id] = spot;
    }
  }
  return { i, t, pos, movers, holder, ev, dribble: holder && (movers[holder] || play.beats[i].dribble) };
}

// Arrows for one beat, for the 3D overlay and the thumbnails.
export function marksFor(play, i) {
  const marks = [];
  if (i < 0 || !play.beats[i]) return marks;
  const ids = play.players.filter((p) => p.side === 'O' || play.defense === 'hand').map((p) => p.id);
  const holder = holderAt(play, i);
  const paths = {};
  for (const id of ids) {
    const m = moveOf(play, i, id);
    if (!m.moving) continue;
    paths[id] = smooth(m.pts);
    marks.push({ k: id === holder ? 'dribble' : 'cut', id, pts: paths[id].pts });
  }
  for (const id of ids) {
    const m = moveOf(play, i, id);
    if (m.act !== 'screen') continue;
    let ang;
    if (m.moving) {
      const p = paths[id].pts, a = p[p.length - 2], b = p[p.length - 1];
      ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    } else {
      let best = Infinity;
      for (const [oid, path] of Object.entries(paths)) {
        if (oid === id) continue;
        path.pts.forEach((q, k) => {
          const d = Math.hypot(q[0] - m.to[0], q[1] - m.to[1]);
          if (d < best && k > 0) { best = d; const r = path.pts[k - 1]; ang = Math.atan2(q[1] - r[1], q[0] - r[0]); }
        });
      }
      if (ang === undefined) ang = Math.PI / 2;
    }
    marks.push({ k: 'screen', id, at: m.to, ang });
  }
  const ev = play.beats[i].ball;
  if (ev && holder) {
    const at = (T) => sample(play, timing(play).starts[i] + T * play.beats[i].dur).pos;
    const a = at(ev.t0)[holder];
    const b = ev.kind === 'pass' ? at(ev.t1)[ev.to] : RIM;
    if (a && b) {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const s0 = Math.min(16, d * 0.2) / d, s1 = Math.min(ev.kind === 'shot' ? 10 : 18, d * 0.2) / d;
      marks.push({ k: ev.kind, id: holder, a: lerp2(a, b, s0), b: lerp2(a, b, 1 - s1) });
    }
  }
  return marks;
}

// Mirror the play left ↔ right (in place).
export function flipPlay(p) {
  const f = (q) => [500 - q[0], q[1]];
  for (const id of Object.keys(p.start)) p.start[id] = f(p.start[id]);
  for (const b of p.beats) for (const m of Object.values(b.moves)) {
    if (m.to) m.to = f(m.to);
    if (m.wp) m.wp = m.wp.map(f);
  }
  return p;
}

// ---------- Validation, storage, sharing ----------
export function validate(p) {
  if (!p || !Array.isArray(p.beats) || !Array.isArray(p.players)) throw new Error('Not a Court Mode play');
  p.v = 1;
  p.id = p.id || uid();
  p.size = p.size || p.players.filter((x) => x.side === 'O').length;
  p.theme = THEMES[p.theme] ? p.theme : 'bw';
  p.defense = ['man', 'zone', 'hand', 'none'].includes(p.defense) ? p.defense : 'man';
  p.zone = ZONES[p.zone] ? p.zone : '2-3';
  p.court = p.court && typeof p.court === 'object' ? p.court : {};
  p.start = p.start || {};
  for (const pl of p.players) {
    pl.look = { ...(LOOKS[pl.side][(Number(pl.num) - 1) % 5] || LOOKS.O[0]), ...(pl.look || {}) };
    if (!p.start[pl.id]) p.start[pl.id] = pl.side === 'D' && p.start[pl.guard] ? manSpot(p.start[pl.guard]).map(Math.round) : [250, 300];
  }
  for (const b of p.beats) { b.id = b.id || uid(); b.moves = b.moves || {}; b.ball = b.ball || null; b.dur = b.dur || 1.5; b.text = b.text || ''; }
  if (!p.beats.length) p.beats.push({ id: uid(), name: 'Set', dur: 1.5, text: '', moves: {}, ball: null });
  return p;
}

const LIB = 'court.library', KEY = (id) => 'court.play.' + id, LAST = 'court.last';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export function libraryIds() { try { return JSON.parse(store.get(LIB) || '[]'); } catch { return []; } }
export function loadPlay(id) { try { return validate(JSON.parse(store.get(KEY(id)))); } catch { return null; } }
export function savePlay(p) {
  const ids = libraryIds().filter((x) => x !== p.id);
  ids.unshift(p.id);
  store.set(LIB, JSON.stringify(ids));
  store.set(LAST, p.id);
  return store.set(KEY(p.id), JSON.stringify({ ...p, savedAt: Date.now() }));
}
export function deletePlay(id) { store.set(LIB, JSON.stringify(libraryIds().filter((x) => x !== id))); store.del(KEY(id)); }
export function lastId() { return store.get(LAST); }
export function savedAt(id) { try { return JSON.parse(store.get(KEY(id))).savedAt || 0; } catch { return 0; } }

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function encodeShare(p) {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  try { return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { return 'j' + b64u(raw); }
}
export async function decodeShare(s) {
  const bytes = unb64u(s.slice(1));
  const raw = s[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return validate(JSON.parse(new TextDecoder().decode(raw)));
}

// ---------- Top-down thumbnail ----------
export function thumbSVG(play, i, { w = 120, marks = true } = {}) {
  const th = THEMES[play.theme] || THEMES.bw;
  const cl = courtLook(play);
  const h = Math.round(w * 0.86);
  const ends = {};
  for (const p of play.players) ends[p.id] = i < 0 ? play.start[p.id] : posAt(play, p.id, i);
  const holder = i < 0 ? play.ball : holderAt(play, i + 1);
  if (play.defense === 'man') for (const d of play.players.filter((x) => x.side === 'D')) ends[d.id] = manSpot(ends[d.guard], holder && ends[holder]);
  if (play.defense === 'zone') {
    const ds = play.players.filter((x) => x.side === 'D');
    const zs = zoneSpots(play.zone, ds.length, play.players.filter((x) => x.side === 'O').map((x) => ends[x.id]), holder && ends[holder]);
    ds.forEach((d, k) => { ends[d.id] = zs[k]; });
  }
  const pathD = (pts) => pts.map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(0) + ' ' + q[1].toFixed(0)).join('');
  let arrows = '';
  if (marks && i >= 0) {
    for (const m of marksFor(play, i)) {
      if (m.k === 'cut' || m.k === 'dribble') arrows += `<path d="${pathD(m.pts)}" fill="none" stroke="#E0552E" stroke-width="7" stroke-linecap="round"${m.k === 'dribble' ? ' stroke-dasharray="2 9"' : ''}/>`;
      else if (m.k === 'pass' || m.k === 'shot') arrows += `<path d="M${m.a[0]} ${m.a[1]}L${m.b[0]} ${m.b[1]}" fill="none" stroke="#1D1A17" stroke-width="5" stroke-dasharray="12 9"/>`;
      else if (m.k === 'screen') arrows += `<path d="M${m.at[0] - Math.cos(m.ang) * 20} ${m.at[1] - Math.sin(m.ang) * 20}L${m.at[0] + Math.cos(m.ang) * 20} ${m.at[1] + Math.sin(m.ang) * 20}" stroke="#1D1A17" stroke-width="10" stroke-linecap="round"/>`;
    }
  }
  const dots = play.players.filter((p) => p.side === 'O' || play.defense !== 'none').map((p) => {
    const [u, v] = ends[p.id];
    const k = th[p.side];
    const ring = p.id === holder ? ' stroke="#E0552E" stroke-width="7"' : ' stroke="#fff" stroke-width="3"';
    return `<circle cx="${u}" cy="${v}" r="${p.side === 'O' ? 17 : 13}" fill="${k.jersey}"${ring}/>` +
      (p.side === 'O' ? `<text x="${u}" y="${v + 7}" text-anchor="middle" font-family="Geist,sans-serif" font-weight="700" font-size="20" fill="${k.num}">${p.num}</text>` : '');
  }).join('');
  return `<svg viewBox="-10 -40 520 390" width="${w}" height="${h}" aria-hidden="true">` +
    `<rect x="-10" y="-40" width="520" height="390" fill="${FLOORS[cl.floor].thumb}"/><rect x="-10" y="-40" width="520" height="40" fill="${cl.border}" fill-opacity=".55"/>` +
    `<rect x="170" y="0" width="160" height="190" fill="${cl.paint || 'none'}" fill-opacity=".45" stroke="${cl.lines}" stroke-width="4"/>` +
    `<circle cx="250" cy="190" r="60" fill="none" stroke="${cl.lines}" stroke-width="4"/>` +
    `<path d="M30 0V142A237.5 237.5 0 0 0 470 142V0" fill="none" stroke="${cl.lines}" stroke-width="4"/>` +
    `<circle cx="250" cy="52.5" r="9" fill="none" stroke="#E0552E" stroke-width="5"/>` +
    arrows + dots + `</svg>`;
}
