// Stylized 3D dancers: a mannequin with a lathe torso, swinging limbs and a hair cap
// on the back of the head so you can always tell which way someone faces.
import * as THREE from 'three';

const SKIN = 0xE8D5BF, HAIR = 0x2B2420, SHOE = 0x2A2420;

const geo = {
  pelvis: new THREE.SphereGeometry(0.135, 20, 14),
  leg: new THREE.CapsuleGeometry(0.068, 0.74, 6, 14),
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

    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.085, 0.93, 0);
      const leg = M(geo.leg, pants);
      leg.position.y = -0.37;
      const foot = M(geo.foot, shoe);
      foot.scale.set(0.85, 0.55, 1.6);
      foot.position.set(0, -0.885, 0.05);
      pivot.add(leg, foot);
      this.body.add(pivot);
      return pivot;
    });

    const torso = M(geo.torso, outfit);
    torso.position.y = 0.88;
    torso.scale.z = 0.68;
    this.body.add(torso);

    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.2, 1.39, 0);
      pivot.rotation.z = s * 0.1;
      const sh = M(geo.shoulder, outfit);
      const arm = M(geo.arm, outfit);
      arm.position.y = -0.27;
      const hand = M(geo.hand, skin);
      hand.position.y = -0.57;
      pivot.add(sh, arm, hand);
      this.body.add(pivot);
      return pivot;
    });

    const neck = M(geo.neck, skin);
    neck.position.y = 1.475;
    const head = M(geo.head, skin);
    head.position.y = 1.6;
    head.scale.set(0.92, 1.06, 0.98);
    const cap = M(geo.hair, hair);
    cap.position.y = 1.612;
    cap.rotation.x = -0.5;
    const bun = M(geo.bun, hair);
    bun.position.set(0, 1.64, -0.12);
    const nose = M(geo.nose, skin);
    nose.position.set(0, 1.585, 0.106);
    this.body.add(neck, head, cap, bun, nose);

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

  // speed in m/s; heading in radians (0 = facing the audience, +z)
  tick(dt, speed, heading, time) {
    const target = Math.min(speed / 1.3, 1);
    this.amp += (target - this.amp) * Math.min(1, dt * 8);
    this.phase += speed * dt * (Math.PI * 2 / 1.35);
    const s = Math.sin(this.phase) * this.amp;
    this.legs[0].rotation.x = s * 0.6;
    this.legs[1].rotation.x = -s * 0.6;
    this.arms[0].rotation.x = -s * 0.5;
    this.arms[1].rotation.x = s * 0.5;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.035 * this.amp + Math.sin(time * 1.8 + this.seed) * 0.004;
    this.body.rotation.x = this.amp * 0.06;

    let diff = heading - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, dt * 9);
    this.body.rotation.y = this.heading;
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
    this.disc.material.dispose();
    this.ring.material.dispose();
    this.contact.material.dispose();
  }
}
