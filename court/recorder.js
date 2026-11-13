// Records the court to a video file in the browser: the 3D view is copied each frame
// onto a 1280×720 canvas with the number tags and beat captions drawn on top, and
// MediaRecorder turns that canvas into an MP4 (or WebM where MP4 isn't supported).
import * as THREE from 'three';

const W = 1280, H = 720;

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export class Recorder {
  constructor(scene) {
    this.scene = scene;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
  }

  start({ mime, title, captions = true, numbers = true }) {
    this.opts = { captions, numbers, title };
    this.chunks = [];
    this.mime = mime;
    const stream = this.canvas.captureStream(30);
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.done = new Promise((res) => { this.rec.onstop = () => res(new Blob(this.chunks, { type: mime.split(';')[0] })); });
    this.rec.start(250);
  }

  stop() { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); return this.done; }
  cancel() { if (this.rec && this.rec.state !== 'inactive') { this.rec.onstop = null; this.rec.stop(); } this.rec = null; }

  // Called right after the scene renders.
  frame({ caption, beatLabel, kits, elapsed }) {
    const g = this.g, src = this.scene.renderer.domElement;
    const sw0 = src.width, sh0 = src.height;
    // Center-crop the stage to 16:9.
    let sw = sw0, sh = sw0 * (H / W), sx = 0, sy = (sh0 - sh) / 2;
    if (sh > sh0) { sh = sh0; sw = sh0 * (W / H); sx = (sw0 - sw) / 2; sy = 0; }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
    const k = W / sw, dpr = sw0 / this.scene.host.clientWidth;
    const toX = (ndc) => (((ndc + 1) / 2) * sw0 - sx) * k;
    const toY = (ndc) => (((1 - ndc) / 2) * sh0 - sy) * k;

    if (this.opts.numbers) {
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
    void dpr;

    // Title in the first seconds, a small credit at the end corner.
    if (this.opts.title && elapsed < 3.2) {
      const a = Math.min(1, elapsed / 0.4, (3.2 - elapsed) / 0.5);
      g.globalAlpha = Math.max(0, a);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '400 54px "Instrument Serif", Georgia, serif';
      const tw = g.measureText(this.opts.title).width;
      roundRect(g, 32, 30, tw + 48, 104, 16);
      g.fillStyle = 'rgba(15,14,13,.78)'; g.fill();
      g.fillStyle = '#FFFFFF'; g.fillText(this.opts.title, 56, 92);
      g.font = '600 15px Geist, Inter, system-ui, sans-serif';
      g.fillStyle = '#FFB37A'; g.fillText('COURT MODE', 57, 118);
      g.globalAlpha = 1;
    }
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.font = '600 15px Geist, Inter, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText('janetlee.me/dance-studio/court', W - 24, H - 20);

    if (this.opts.captions && caption) {
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '500 20px Geist, Inter, system-ui, sans-serif';
      const lines = wrap(g, caption, 860);
      const boxH = 52 + lines.length * 26;
      const boxW = 920;
      const x0 = (W - boxW) / 2, y0 = H - boxH - 44;
      roundRect(g, x0, y0, boxW, boxH, 14);
      g.fillStyle = 'rgba(15,14,13,.82)'; g.fill();
      g.font = '700 22px Geist, Inter, system-ui, sans-serif';
      g.fillStyle = '#FFFFFF'; g.fillText(beatLabel, x0 + 24, y0 + 36);
      g.font = '500 20px Geist, Inter, system-ui, sans-serif';
      g.fillStyle = '#E4DDD2';
      lines.forEach((l, i) => g.fillText(l, x0 + 24, y0 + 64 + i * 26));
    }
  }
}

// The cinematic camera: straight down from above, sweep into a low broadcast angle, then a slow orbit.
export function cinematicCamera(camera, target, t) {
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const k = ease((t - 0.5) / 2.9);
  const orbit = ease((t - 3.2) / 10.5);
  const az = -0.55 + 0.55 * k + orbit * 0.42;
  const radius = 0.3 + k * 12.0;
  const height = 22 - k * 14.2 - orbit * 1.8;
  const tz = -0.2 - k * 1.5;
  target.set(0, k * 0.7, tz);
  camera.position.set(Math.sin(az) * radius, height, tz + Math.cos(az) * radius);
  camera.lookAt(target);
}
