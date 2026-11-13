// Basketball players: the Dance Studio mannequin in a sleeveless jersey and shorts,
// with its own skin tone, hair, height and jersey number.
import * as THREE from 'three';
import { Person } from '../js/people.js?v=20261115n';

const tailGeo = new THREE.CapsuleGeometry(0.032, 0.17, 6, 10);
const longGeo = new THREE.CapsuleGeometry(0.1, 0.16, 6, 14);
const numGeo = new THREE.PlaneGeometry(0.17, 0.17);
const bigNumGeo = new THREE.PlaneGeometry(0.26, 0.26);
export const JERSEY = { style: new URLSearchParams(location.search).get('jersey') || 'classic' };

function numberTexture(num, color, trim, big) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = big ? '900 104px "Arial Black", Impact, "Geist", sans-serif' : '800 92px "Geist", "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const edge = trim || (big ? (/^#(?:F|E|D)/i.test(color) ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.9)') : null);
  if (edge) { g.lineWidth = big ? 14 : 12; g.strokeStyle = edge; g.strokeText(num, 64, 70); }
  g.fillStyle = color;
  g.fillText(num, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Player extends Person {
  constructor(id, look) {
    super(id, look.jersey);
    const { skin, hair } = this.mats;
    skin.color.set(look.skin);
    hair.color.set(look.hair);

    // Upper body children: torso, armL, armR, neck, head, cap, bun, nose.
    const [, armL, armR, , , cap, bun] = this.upper.children;
    // Sleeveless: arms are skin, the shoulder ball stays jersey-colored as the strap.
    for (const arm of [armL, armR]) arm.children[1].material = skin;
    // Shorts end at the knee.
    for (const knee of this.knees) { knee.children[0].material = skin; knee.children[1].material = skin; }
    this.mats.shoe.color.set(look.shoe || '#F4F2EE');

    const style = look.style || 'short';
    bun.visible = style === 'bun' || style === 'pony';
    if (style === 'pony') {
      bun.position.set(0, 0.69, -0.125);
      bun.scale.setScalar(0.75);
      const tail = new THREE.Mesh(tailGeo, hair);
      tail.position.set(0, 0.6, -0.15);
      tail.rotation.x = 0.35;
      tail.castShadow = true;
      this.upper.add(tail);
    }
    if (style === 'curly') { cap.scale.setScalar(1.2); cap.rotation.x = -0.15; }
    if (style === 'buzz') { cap.scale.setScalar(0.97); cap.rotation.x = -0.15; }
    if (style === 'short') { cap.rotation.x = -0.3; }
    if (style === 'long') {
      const back = new THREE.Mesh(longGeo, hair);
      back.position.set(0, 0.6, -0.07);
      back.scale.set(1, 1, 0.55);
      back.castShadow = true;
      this.upper.add(back);
    }

    this.numMats = [];
    for (const side of [1, -1]) {
      const m = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6, depthWrite: false });
      const big = JERSEY.style === 'big';
      const p = new THREE.Mesh(big ? bigNumGeo : numGeo, m);
      p.position.set(0, big ? 0.28 : 0.26, side * (big ? 0.104 : 0.1));
      if (side < 0) p.rotation.y = Math.PI;
      this.upper.add(p);
      this.numMats.push(m);
    }
    this.root.scale.setScalar(look.height || 1);
    this.look = look;
    this.setKit(look);
  }

  setKit(kit) {
    this.mats.outfit.color.set(kit.jersey);
    this.mats.pants.color.set(kit.shorts || kit.jersey);
    this.disc.material.color.set(kit.jersey);
    const tex = numberTexture(String(this.look.label ?? ''), kit.num, kit.trim, JERSEY.style === 'big');
    for (const m of this.numMats) { if (m.map) m.map.dispose(); m.map = tex; m.needsUpdate = true; }
  }
}
