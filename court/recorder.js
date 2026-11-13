// Records the court to a video file in the browser: the 3D view is copied each frame
// onto a 1280×720 canvas with the number tags and beat captions drawn on top, and
// MediaRecorder turns that canvas into an MP4 (or WebM where MP4 isn't supported).
import * as THREE from 'three';
import { fitCamera, fitBox } from './scene.js?v=20261115q';

// Overlays are laid out on a 1280×720 grid and scaled to the chosen size.
const W = 1280, H = 720;
export const QUALITIES = {
  '720': { w: 1280, h: 720, bps: 10_000_000, label: '720p', avc: ['avc1.4D401F', 'avc1.42E01F'], hevc: 'L93' },
  '1080': { w: 1920, h: 1080, bps: 20_000_000, label: '1080p', avc: ['avc1.640028', 'avc1.4D4028'], hevc: 'L120' },
  '1440': { w: 2560, h: 1440, bps: 32_000_000, label: '1440p', avc: ['avc1.640032', 'avc1.4D4032'], hevc: 'L150' },
  '2160': { w: 3840, h: 2160, bps: 50_000_000, label: '4K', avc: ['avc1.640033', 'avc1.4D4033'], hevc: 'L153' },
};

// Video size for a quality and format. Quality is the short side, like phones label it.
export function videoSize(qKey, format) {
  const q = QUALITIES[qKey] || QUALITIES['1080'];
  const s = q.h;
  const even = (n) => Math.round(n / 2) * 2;
  if (format === 'vertical') return { ...q, w: s, h: even((s * 16) / 9), grid: [720, 1280] };
  if (format === 'square') return { ...q, w: s, h: s, grid: [1080, 1080] };
  return { ...q, w: even((s * 16) / 9), h: s, grid: [1280, 720] };
}

export const hevcMime = (q = QUALITIES['1080']) => {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of [`video/mp4;codecs=hvc1.1.6.${q.hevc}.90`, `video/mp4;codecs=hev1.1.6.${q.hevc}.90`]) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
};

export function pickMime(q = QUALITIES['1080'], codec = 'h264') {
  if (typeof MediaRecorder === 'undefined') return null;
  if (codec === 'hevc') { const h = hevcMime(q); if (h) return h; }
  for (const m of [...q.avc.map((c) => `video/mp4;codecs=${c}`), 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function wrap(g, text, maxW, max = 2) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

export class Recorder {
  constructor(scene, q = videoSize('1080', 'landscape')) {
    this.scene = scene;
    this.q = q;
    [this.W, this.H] = q.grid || [W, H];
    this.canvas = document.createElement('canvas');
    this.canvas.width = q.w; this.canvas.height = q.h;
    this.g = this.canvas.getContext('2d');
    this.g.imageSmoothingQuality = 'high';
  }

  start({ mime, title, captions = true, numbers = true }) {
    this.opts = { captions, numbers, title };
    this.chunks = [];
    this.mime = mime;
    const stream = this.canvas.captureStream(30);
    // H.265 needs roughly 60% of H.264's bitrate for the same picture.
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(this.q.bps * (/hvc1|hev1/.test(mime) ? 0.6 : 1)) });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.done = new Promise((res) => { this.rec.onstop = () => res(new Blob(this.chunks, { type: mime.split(';')[0] })); });
    this.rec.start(250);
  }

  stop() { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); return this.done; }
  cancel() { if (this.rec && this.rec.state !== 'inactive') { this.rec.onstop = null; this.rec.stop(); } this.rec = null; }

  // Quiet brand mark: a small ball, the name and the address, no box. Top right on landscape and
  // square; centered at yAt on vertical quiz Shorts.
  badge(g, W, H, vertical, yAt) {
    g.save();
    const name = 'Court Mode', url = 'janetlee.me/dance-studio/court';
    g.font = '700 15px Geist, Inter, system-ui, sans-serif'; const nw = g.measureText(name).width;
    g.font = '500 11.5px Geist, Inter, system-ui, sans-serif'; const uw = g.measureText(url).width;
    const r = 10, bw = r * 2 + 8 + Math.max(nw, uw);
    const x = vertical ? (W - bw) / 2 : W - bw - 22, y = yAt !== undefined ? yAt : 20;
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8; g.shadowOffsetY = 1;
    g.globalAlpha = 0.9;
    ballMark(g, x + r, y + 16, r);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '700 15px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#FFFFFF'; g.fillText(name, x + r * 2 + 8, y + 16);
    g.font = '500 11.5px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#F4D2B5'; g.fillText(url, x + r * 2 + 8, y + 31);
    g.restore();
  }

  // Player number tags, projected from the 3D scene into the frame.
  drawNumbers(g, kits, toX, toY) {
    const v = new THREE.Vector3();
    g.font = '700 20px Geist, Inter, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const x of this.scene.people.values()) {
      if (!x.root.visible) continue;
      v.set(x.root.position.x, 2.05 * (x.look.height || 1) + x.root.position.y, x.root.position.z).project(this.scene.camera);
      if (v.z > 1) continue;
      const px = toX(v.x), py = toY(v.y) - 14;
      const text = x.tag.textContent;
      const tw = g.measureText(text).width + 18;
      const kit = kits[x.side];
      roundRect(g, px - tw / 2, py - 14, tw, 28, 14);
      g.fillStyle = kit.jersey; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
      g.fillStyle = kit.num; g.fillText(text, px, py + 1);
    }
  }

  // 9:16 plays: a square court shot in the middle, the title in the band above, the beat caption
  // in the band below, so nothing sits on top of the play.
  frameLetterbox({ caption, beatLabel, kits }) {
    const W = this.W, H = this.H, g = this.g, src = this.scene.renderer.domElement;
    g.setTransform(this.q.w / W, 0, 0, this.q.h / H, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1C1A17'); bg.addColorStop(1, '#0F0E0C');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const top = Math.round(H * 0.215), size = W;
    g.drawImage(src, 0, 0, src.width, src.height, 0, top, size, size);
    if (this.opts.numbers) { g.save(); g.beginPath(); g.rect(0, top, W, size); g.clip(); this.drawNumbers(g, kits, (n) => ((n + 1) / 2) * W, (n) => top + ((1 - n) / 2) * size); g.restore(); }
    // Top band: a quiet brand line under the Reels top bar, then the title.
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '600 13px Geist, Inter, system-ui, sans-serif';
    const brand = 'COURT MODE  ·  janetlee.me/dance-studio/court';
    const bw = g.measureText(brand).width;
    ballMark(g, (W - bw) / 2 - 14, 118 - 4.5, 8);
    g.fillStyle = 'rgba(244,236,226,.62)'; g.fillText(brand, W / 2 + 4, 118);
    if (this.opts.title) {
      g.font = '400 50px "Instrument Serif", Georgia, serif';
      const lines = wrap(g, this.opts.title, W - 72, 2);
      const lh = 50, y0 = top - 28 - (lines.length - 1) * lh;
      g.fillStyle = '#FFFFFF'; lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
    }
    // Bottom band: the beat, right under the court and clear of where Reels puts its caption.
    if (this.opts.captions && caption) {
      const y = top + size + 44;
      g.textAlign = 'left';
      g.font = '700 23px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#FFB37A'; g.fillText(beatLabel, 36, y);
      g.font = '500 20px Geist, Inter, system-ui, sans-serif'; g.fillStyle = '#E9E1D6';
      wrap(g, caption, W - 72, 3).forEach((l, i) => g.fillText(l, 36, y + 32 + i * 27));
    }
    g.restore();
  }

  // Quiz Short overlays: hook, the frozen question with a countdown, the reveal, the read, the rule.
  quizOverlay(g, W, H, vertical, q) {
    const font = (w, px) => `${w} ${px}px Geist, Inter, system-ui, sans-serif`;
    const fade = (t, a = 0.3) => Math.max(0, Math.min(1, t / a));
    const safeTop = vertical ? H * 0.13 + 40 : 26, safeBottom = vertical ? H * 0.78 : H - 30;
    const center = (text, y, f, color) => { g.font = f; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(text, W / 2, y); };
    g.save();
    if (q.phase === 'hook' || q.phase === 'play') {
      const a = q.phase === 'hook' ? fade(q.t) : Math.max(0, 1 - q.t / 0.6);
      if (q.phase === 'hook' || a > 0) {
        g.globalAlpha = Math.max(a, q.phase === 'play' ? 0 : a);
        const boxW = Math.min(W - 48, 620), boxH = 150, x = (W - boxW) / 2, y = vertical ? safeTop + 70 : 40;
        roundRect(g, x, y, boxW, boxH, 20); g.fillStyle = 'rgba(15,14,13,.82)'; g.fill();
        center(`YOU’RE #${q.you}`, y + 64, font(800, 46), '#FFB37A');
        center('What would you do?', y + 112, font(600, 28), '#FFFFFF');
        g.globalAlpha = 1;
      }
      if (q.phase === 'play' && q.t > 0.5) {
        const label = `#${q.you} · watch the play`;
        g.font = font(600, 20); const tw = g.measureText(label).width + 30;
        roundRect(g, (W - tw) / 2, vertical ? safeTop + 70 : 26, tw, 38, 19); g.fillStyle = 'rgba(15,14,13,.7)'; g.fill();
        center(label, (vertical ? safeTop + 70 : 26) + 26, font(600, 20), '#FFFFFF');
      }
    }
    if (q.phase === 'freeze' || q.phase === 'reveal') {
      g.fillStyle = 'rgba(10,10,12,.38)'; g.fillRect(0, 0, W, H);
      const boxW = Math.min(W - 40, 820), x = (W - boxW) / 2;
      g.font = font(700, vertical ? 26 : 24);
      const lines = wrap(g, q.prompt, boxW - 48, 5);
      const lineH = vertical ? 34 : 31, pillH = vertical ? 58 : 50, gap = 10;
      const cols = vertical ? 1 : 2;
      const rows = Math.ceil(q.choices.length / cols);
      const boxH = 34 + lines.length * lineH + 18 + rows * (pillH + gap) + (q.phase === 'freeze' ? 70 : 64);
      const y = vertical ? Math.max(safeTop + 40, (safeBottom - boxH) * 0.62) : Math.max(20, (H - boxH) / 2);
      roundRect(g, x, y, boxW, boxH, 22); g.fillStyle = 'rgba(255,255,255,.97)'; g.fill();
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = font(700, 14); g.fillStyle = '#8F3215'; g.fillText(`YOU’RE #${q.you} · ${q.title.toUpperCase()}`, x + 24, y + 30);
      g.font = font(700, vertical ? 26 : 24); g.fillStyle = '#1D1A17';
      lines.forEach((l, i) => g.fillText(l, x + 24, y + 30 + 14 + (i + 1) * lineH - 6));
      const py0 = y + 30 + 14 + lines.length * lineH + 12;
      const pw = (boxW - 48 - (cols - 1) * gap) / cols;
      q.choices.forEach((c, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const px = x + 24 + col * (pw + gap), py = py0 + row * (pillH + gap);
        const isRight = i === q.correct, revealed = q.phase === 'reveal';
        const k = revealed ? fade(q.t, 0.25) : 0;
        g.globalAlpha = revealed && !isRight ? 1 - 0.6 * k : 1;
        roundRect(g, px, py, pw, pillH, 14);
        g.fillStyle = revealed && isRight ? `rgba(227,241,230,${0.3 + 0.7 * k})` : '#F4F1EB'; g.fill();
        g.lineWidth = revealed && isRight ? 3 : 1.5; g.strokeStyle = revealed && isRight ? '#2E8B57' : '#E3DDD3'; g.stroke();
        g.beginPath(); g.arc(px + 28, py + pillH / 2, 15, 0, Math.PI * 2);
        g.fillStyle = revealed && isRight ? '#2E8B57' : '#1D1A17'; g.fill();
        g.font = font(800, 15); g.fillStyle = '#FFFFFF'; g.textAlign = 'center';
        g.fillText(revealed && isRight ? '✓' : 'ABCD'[i], px + 28, py + pillH / 2 + 5);
        g.textAlign = 'left'; g.font = font(600, vertical ? 21 : 19); g.fillStyle = '#1D1A17';
        g.fillText(c.length > 40 ? c.slice(0, 38) + '…' : c, px + 54, py + pillH / 2 + 7, pw - 64);
        g.globalAlpha = 1;
      });
      const by = py0 + rows * (pillH + gap) + 10;
      if (q.phase === 'freeze') {
        const left = Math.max(0, q.count - q.t);
        const cx = x + 44, cy = by + 26;
        g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#EFEBE4'; g.stroke();
        g.beginPath(); g.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / q.count)); g.strokeStyle = '#E0552E'; g.stroke();
        g.font = font(800, 18); g.fillStyle = '#1D1A17'; g.textAlign = 'center'; g.fillText(String(Math.ceil(left)), cx, cy + 6);
        g.textAlign = 'left'; g.font = font(700, 20); g.fillStyle = '#1D1A17'; g.fillText('Pause and pick your answer', x + 78, cy + 7);
      } else {
        g.font = font(800, 22); g.fillStyle = '#1F6B35'; g.textAlign = 'left';
        g.fillText(`Answer: ${'ABCD'[q.correct]}. ${q.choices[q.correct]}`, x + 24, by + 34, boxW - 48);
      }
    }
    if (q.phase === 'replay') {
      const label = 'THE READ';
      g.font = font(800, 18); const tw = g.measureText(label).width + 30;
      const ly = vertical ? safeTop + 70 : 26;
      roundRect(g, (W - tw) / 2, ly, tw, 36, 18); g.fillStyle = '#2E8B57'; g.fill();
      center(label, ly + 25, font(800, 18), '#FFFFFF');
      const boxW = Math.min(W - 40, 900);
      g.font = font(600, vertical ? 23 : 21);
      const lines = wrap(g, q.why, boxW - 48, 4);
      const boxH = 30 + lines.length * 30;
      const y = vertical ? safeBottom - boxH - 10 : H - boxH - 36;
      roundRect(g, (W - boxW) / 2, y, boxW, boxH, 16); g.fillStyle = 'rgba(15,14,13,.84)'; g.fill();
      g.textAlign = 'left'; g.fillStyle = '#FFFFFF';
      lines.forEach((l, i) => g.fillText(l, (W - boxW) / 2 + 24, y + 38 + i * 30));
    }
    if (q.phase === 'outro') {
      g.globalAlpha = fade(q.t, 0.35);
      g.fillStyle = 'rgba(10,10,12,.62)'; g.fillRect(0, 0, W, H);
      const boxW = Math.min(W - 48, 760);
      g.font = font(800, vertical ? 34 : 32);
      const lines = wrap(g, q.rule, boxW - 60, 3);
      const boxH = 120 + lines.length * 44;
      const y = vertical ? H * 0.36 : (H - boxH) / 2;
      roundRect(g, (W - boxW) / 2, y, boxW, boxH, 22); g.fillStyle = '#FFFFFF'; g.fill();
      center('REMEMBER', y + 46, font(800, 16), '#8F3215');
      lines.forEach((l, i) => center(l, y + 96 + i * 44, font(800, vertical ? 34 : 32), '#1D1A17'));
      center('Take the quiz · janetlee.me/dance-studio/court', y + boxH + 44, font(600, 20), '#FFFFFF');
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // Called right after the scene renders.
  frame({ caption, beatLabel, kits, elapsed, quiz }) {
    const W = this.W, H = this.H, vertical = H > W;
    if (this.letterbox && vertical && !quiz) { this.frameLetterbox({ caption, beatLabel, kits }); return; }
    const g = this.g, src = this.scene.renderer.domElement;
    const sw0 = src.width, sh0 = src.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Center-crop the stage to 16:9.
    let sw = sw0, sh = sw0 * (H / W), sx = 0, sy = (sh0 - sh) / 2;
    if (sh > sh0) { sh = sh0; sw = sh0 * (W / H); sx = (sw0 - sw) / 2; sy = 0; }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, this.q.w, this.q.h);
    // Everything after this is drawn on the 1280×720 grid, scaled up crisply.
    g.setTransform(this.q.w / W, 0, 0, this.q.h / H, 0, 0);
    const k = W / sw;
    const toX = (ndc) => (((ndc + 1) / 2) * sw0 - sx) * k;
    const toY = (ndc) => (((1 - ndc) / 2) * sh0 - sy) * k;

    if (this.opts.numbers) this.drawNumbers(g, kits, toX, toY);

    // Title in the first seconds, a small credit at the end corner.
    // Quiz Shorts: badge first, just inside the safe area, and the quiz cards start below it.
    if (quiz) { this.badge(g, W, H, vertical, vertical ? H * 0.13 : 22); this.quizOverlay(g, W, H, vertical, quiz); return; }
    if (this.opts.title && elapsed < 3.2) {
      const a = Math.min(1, elapsed / 0.4, (3.2 - elapsed) / 0.5);
      g.globalAlpha = Math.max(0, a);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '400 54px "Instrument Serif", Georgia, serif';
      const tw = g.measureText(this.opts.title).width;
      // Vertical video: keep clear of the app's top bar (about the top 12%).
      const tx = vertical ? (W - Math.min(tw + 48, W - 48)) / 2 : 32, ty = vertical ? H * 0.12 : 30;
      roundRect(g, tx, ty, Math.min(tw + 48, W - 48), 80, 16);
      g.fillStyle = 'rgba(15,14,13,.72)'; g.fill();
      g.fillStyle = '#FFFFFF'; g.fillText(this.opts.title, tx + 24, ty + 58, W - 96);
      g.globalAlpha = 1;
    }
    this.badge(g, W, H, vertical);

    if (this.opts.captions && caption) {
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      // One compact strip along the bottom edge: the beat name, then what happens.
      g.font = '500 18px Geist, Inter, system-ui, sans-serif';
      const boxW = Math.min(980, W - 40);
      g.font = '700 18px Geist, Inter, system-ui, sans-serif'; const lw = g.measureText(beatLabel).width + 18;
      g.font = '500 18px Geist, Inter, system-ui, sans-serif';
      const lines = wrap(g, caption, boxW - 40 - lw, 2);
      const boxH = 22 + lines.length * 24;
      const x0 = (W - boxW) / 2, y0 = vertical ? H * 0.74 - boxH : H - boxH - 14;
      roundRect(g, x0, y0, boxW, boxH, 12);
      g.fillStyle = 'rgba(15,14,13,.74)'; g.fill();
      g.font = '700 18px Geist, Inter, system-ui, sans-serif';
      g.fillStyle = '#FFB37A'; g.fillText(beatLabel, x0 + 20, y0 + 28);
      g.font = '500 18px Geist, Inter, system-ui, sans-serif';
      g.fillStyle = '#EDE6DB';
      lines.forEach((l, i) => g.fillText(l, x0 + 20 + lw, y0 + 28 + i * 24));
    }
  }
}

// The cinematic camera: straight down from above, sweep into a low broadcast angle, then a slow orbit.
function ballMark(g, cx, cy, r) {
  const grd = g.createRadialGradient(cx - r / 3, cy - r / 3, 1, cx, cy, r);
  grd.addColorStop(0, '#F7A15C'); grd.addColorStop(1, '#D6561C');
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
  g.save(); g.shadowBlur = 0; g.strokeStyle = 'rgba(40,20,10,.85)'; g.lineWidth = Math.max(1, r / 9);
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  g.beginPath(); g.arc(cx - r * 1.05, cy, r * 0.75, -0.95, 0.95); g.stroke();
  g.beginPath(); g.arc(cx + r * 1.05, cy, r * 0.75, Math.PI - 0.95, Math.PI + 0.95); g.stroke();
  g.restore();
}

export function cinematicCamera(camera, target, t, aspect = 16 / 9, clean = false) {
  const tall = aspect < 1;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const k = ease((t - 0.5) / 2.9);
  const orbit = ease((t - 3.2) / 10.5);
  const az = -0.55 + 0.55 * k + orbit * 0.42;
  const radius = 0.3 + k * (tall ? 8.5 : 12.0);
  const height = 22 - k * (tall ? 8.5 : 14.2) - orbit * 1.8;
  const tz = -0.2 - k * 1.5;
  target.set(0, k * 0.7, tz);
  camera.position.set(Math.sin(az) * radius, height, tz + Math.cos(az) * radius);
  camera.lookAt(target);
  // As the swoop lands, ease into a framing that never cuts off the three-point line.
  const designed = camera.position.clone();
  fitCamera(camera, target, fitBox(aspect, !clean));
  camera.position.lerpVectors(designed, camera.position, k);
  camera.lookAt(target);
}
