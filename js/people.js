// Stylized 3D dancers: a mannequin with a lathe torso, swinging limbs and a hair cap
// on the back of the head so you can always tell which way someone faces.
import * as THREE from 'three';

const SKIN = 0xE8D5BF, HAIR = 0x2B2420, SHOE = 0x2A2420;

const geo = {
  pelvis: new THREE.SphereGeometry(0.135, 20, 14),
  thigh: new THREE.CapsuleGeometry(0.072, 0.34, 6, 14),
  shin: new THREE.CapsuleGeometry(0.06, 0.36, 6, 14),
  knee: new THREE.SphereGeometry(0.064, 12, 10),
  foot: new THREE.SphereGeometry(0.07, 14, 10),
  torso: new THREE.LatheGeometry(
    [[0, 0], [0.13, 0], [0.146, 0.06], [0.126, 0.2], [0.14, 0.33], [0.178, 0.45], [0.172, 0.5], [0.12, 0.55], [0.05, 0.575], [0, 0.575]]
      .map(([x, y]) => new THREE.Vector2(x, y)), 28),
  shoulder: new THREE.SphereGeometry(0.068, 16, 12),
  arm: new THREE.CapsuleGeometry(0.047, 0.5, 6, 12),
  hand: new THREE.SphereGeometry(0.048, 12, 10),
  neck: new THREE.CylinderGeometry(0.045, 0.052, 0.1, 14),
  head: new THREE.SphereGeometry(0.112, 28, 20),
  hair: new THREE.SphereGeometry(0.121, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
  bun: new THREE.SphereGeometry(0.052, 14, 10),
  nose: new THREE.SphereGeometry(0.019, 10, 8),
  ring: new THREE.RingGeometry(0.4, 0.47, 48),
  disc: new THREE.CircleGeometry(0.38, 40),
  contact: new THREE.CircleGeometry(0.46, 32),
  hit: new THREE.CylinderGeometry(0.36, 0.36, 1.8, 12),
};

let contactTex;
function contactTexture() {
  if (contactTex) return contactTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(40,25,10,.42)');
  grd.addColorStop(0.55, 'rgba(40,25,10,.16)');
  grd.addColorStop(1, 'rgba(40,25,10,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  contactTex = new THREE.CanvasTexture(c);
  return contactTex;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

export class Person {
  constructor(id, color) {
    this.id = id;
    this.phase = Math.random() * 6;
    this.seed = Math.random() * 10;
    this.amp = 0;
    this.alpha = 1;
    this.heading = 0;

    const std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
    this.mats = {
      outfit: std(color, 0.55),
      pants: std(new THREE.Color(color).multiplyScalar(0.45), 0.7),
      skin: std(SKIN, 0.62),
      hair: std(HAIR, 0.85),
      shoe: std(SHOE, 0.6),
    };
    const { outfit, pants, skin, hair, shoe } = this.mats;
    const M = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = true; return x; };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.rotation.order = 'YXZ'; // lean forward in the body frame, then turn
    this.root.add(this.body);

    const pelvis = M(geo.pelvis, pants);
    pelvis.scale.set(1.05, 0.7, 0.8);
    pelvis.position.y = 0.93;
    this.body.add(pelvis);

    // Hip → thigh → knee → shin → foot, so dancers can run, leap and get low.
    this.knees = [];
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.085, 0.93, 0);
      const thigh = M(geo.thigh, pants);
      thigh.position.y = -0.21;
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      const kneecap = M(geo.knee, pants);
      const shin = M(geo.shin, pants);
      shin.position.y = -0.2;
      const foot = M(geo.foot, shoe);
      foot.scale.set(0.85, 0.55, 1.6);
      foot.position.set(0, -0.44, 0.05);
      knee.add(kneecap, shin, foot);
      pivot.add(thigh, knee);
      this.body.add(pivot);
      this.knees.push(knee);
      return pivot;
    });

    // Upper body pivots at the hips so dancers can bend forward without tipping their legs.
    this.upper = new THREE.Group();
    this.upper.position.y = 0.93;
    this.body.add(this.upper);
    const torso = M(geo.torso, outfit);
    torso.position.y = -0.05;
    torso.scale.z = 0.68;
    this.upper.add(torso);

    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.2, 0.46, 0);
      pivot.rotation.z = s * 0.1;
      const sh = M(geo.shoulder, outfit);
      const arm = M(geo.arm, outfit);
      arm.position.y = -0.27;
      const hand = M(geo.hand, skin);
      hand.position.y = -0.57;
      pivot.add(sh, arm, hand);
      this.upper.add(pivot);
      return pivot;
    });

    const neck = M(geo.neck, skin);
    neck.position.y = 0.545;
    const head = M(geo.head, skin);
    head.position.y = 0.67;
    head.scale.set(0.92, 1.06, 0.98);
    const cap = M(geo.hair, hair);
    cap.position.y = 0.682;
    cap.rotation.x = -0.5;
    const bun = M(geo.bun, hair);
    bun.position.set(0, 0.71, -0.12);
    const nose = M(geo.nose, skin);
    nose.position.set(0, 0.655, 0.106);
    this.upper.add(neck, head, cap, bun, nose);

    // Floor decorations
    const contact = new THREE.Mesh(geo.contact, new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.006;
    this.contact = contact;

    this.disc = new THREE.Mesh(geo.disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.008;
    this.disc.visible = false;

    this.ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xE0552E, transparent: true, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.ring.visible = false;

    this.hit = new THREE.Mesh(geo.hit, hitMat);
    this.hit.position.y = 0.9;
    this.hit.userData.id = id;

    this.root.add(contact, this.disc, this.ring, this.hit);
    // Floor bits shouldn't turn with the body; they're symmetric so it doesn't matter.
  }

  setColor(color) {
    this.mats.outfit.color.set(color);
    this.mats.pants.color.set(color).multiplyScalar(0.45);
    this.disc.material.color.set(color);
  }

  setSelected(on) { this.ring.visible = on; }
  setTopView(on) { this.disc.visible = on; }

  setOpacity(a) {
    if (Math.abs(a - this.alpha) < 0.005) return;
    this.alpha = a;
    const transparent = a < 0.999;
    for (const m of Object.values(this.mats)) {
      if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
      m.opacity = a;
      m.depthWrite = !transparent;
    }
    this.disc.material.opacity = 0.45 * a;
    this.contact.material.opacity = a;
    this.root.visible = a > 0.01;
    this.body.traverse((o) => { if (o.isMesh) o.castShadow = a > 0.5; });
  }

  // speed in m/s; heading in radians (0 = facing the audience, +z).
  // m: the frame entry from model.sample — style, lp (progress 0–1), dist, moving.
  tick(dt, speed, heading, time, m = {}, snapHeading = false) {
    const style = m.moving ? m.style || 'walk' : 'idle';
    const stride = { run: 2.0, chasse: 1.1, floor: 0.8 }[style] || 1.35;
    const target = style === 'idle' ? 0 : Math.max(Math.min(speed / 1.3, 1), m.moving ? 0.35 : 0);
    this.amp += (target - this.amp) * Math.min(1, dt * 8);
    this.phase += speed * dt * (Math.PI * 2 / stride);
    const a = this.amp, ph = this.phase;
    const s = Math.sin(ph) * a;
    const breathe = Math.sin(time * 1.8 + this.seed) * 0.004;

    // Walk defaults
    let hip = [s * 0.55, -s * 0.55];
    let knee = [Math.max(0, -Math.cos(ph)) * 0.75 * a, Math.max(0, Math.cos(ph)) * 0.75 * a];
    let hipSide = [0, 0];
    let arm = [-s * 0.5, s * 0.5];
    let armSide = [-0.1, 0.1];
    let y = Math.abs(Math.cos(ph)) * 0.035 * a + breathe;
    let lean = a * 0.06;

    if (style === 'run') {
      hip = [s * 0.85, -s * 0.85];
      knee = [Math.max(0, -Math.cos(ph)) * 1.5 * a + 0.2 * a, Math.max(0, Math.cos(ph)) * 1.5 * a + 0.2 * a];
      arm = [-s * 0.9, s * 0.9];
      y = Math.abs(Math.cos(ph)) * 0.08 * a + breathe;
      lean = a * 0.18;
    } else if (style === 'chasse') {
      const k = (1 - Math.cos(ph)) / 2;
      hip = [0, 0];
      hipSide = [-0.32 * k * a, 0.32 * k * a];
      knee = [0.15 * a, 0.15 * a];
      arm = [0, 0];
      armSide = [-(0.1 + 1.1 * a), 0.1 + 1.1 * a];
      y = Math.sin(ph) ** 2 * 0.09 * a + breathe;
      lean = 0;
    } else if (style === 'turn') {
      arm = [-0.35 * a, -0.35 * a];
      armSide = [-(0.1 + 0.7 * a), 0.1 + 0.7 * a];
      lean = 0;
    } else if (style === 'leap') {
      const n = Math.max(1, Math.round((m.dist || 1.6) / 1.6));
      const q = ((m.lp || 0) * n) % 1;
      const h = Math.sin(Math.PI * q);
      hip = [-1.0 * h, 0.75 * h];
      knee = [0.1 * (1 - h), 0.3 * h];
      arm = [-2.5 * h, -2.2 * h];
      armSide = [-0.3 * h - 0.1, 0.3 * h + 0.1];
      y = 0.42 * h + breathe;
      lean = -0.05 * h;
    } else if (style === 'floor') {
      const lp = m.lp || 0;
      const c = Math.min(1, lp / 0.15, (1 - lp) / 0.15);
      const sc = c * c * (3 - 2 * c);
      hip = [-1.45 * sc + s * 0.25, -1.45 * sc - s * 0.25];
      knee = [2.3 * sc, 2.3 * sc];
      arm = [-1.1 * sc - s * 0.3, -1.1 * sc + s * 0.3];
      y = -0.55 * sc + breathe;
      lean = 0.95 * sc;
    }

    const blend = Math.min(1, dt * 14);
    const mix = (o, k, v) => { o[k] += (v - o[k]) * blend; };
    for (let i = 0; i < 2; i++) {
      mix(this.legs[i].rotation, 'x', hip[i]);
      mix(this.legs[i].rotation, 'z', hipSide[i]);
      mix(this.knees[i].rotation, 'x', knee[i]);
      mix(this.arms[i].rotation, 'x', arm[i]);
      mix(this.arms[i].rotation, 'z', armSide[i]);
    }
    mix(this.body.position, 'y', y);
    mix(this.upper.rotation, 'x', lean);

    if (snapHeading) this.heading = heading;
    else {
      let diff = heading - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 9);
    }
    this.body.rotation.y = this.heading;
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
    this.disc.material.dispose();
    this.ring.material.dispose();
    this.contact.material.dispose();
  }
}
