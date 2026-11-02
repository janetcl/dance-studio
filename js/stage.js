// The 3D stage: renderer, cameras, floor, dancers, paths, and pointer interaction.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Person } from './people.js';
import { pathPoint } from './model.js';

export class Stage {
  constructor(container, labelLayer, marquee, hooks) {
    this.el = container;
    this.labelLayer = labelLayer;
    this.marqueeEl = marquee;
    this.hooks = hooks;
    this.people = new Map();
    this.labels = new Map();
    this.view = '3d';
    this.showLabels = true;
    this.size = { w: 12, d: 8 };

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#E9E4DC');
    scene.fog = new THREE.Fog('#E9E4DC', 28, 60);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdbfae, 1.5));
    const key = (this.key = new THREE.DirectionalLight(0xfff4e6, 2.3));
    key.position.set(-4, 11, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    rim.position.set(5, 6, -8);
    scene.add(rim);

    this.persp = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.ortho.position.set(0, 30, 0);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(0, 0, 0);

    const mk = (cam) => {
      const c = new OrbitControls(cam, r.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      return c;
    };
    this.cPersp = mk(this.persp);
    this.cPersp.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.cPersp.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.cPersp.maxPolarAngle = 1.45;
    this.cPersp.minDistance = 4;
    this.cPersp.maxDistance = 45;
    this.cOrtho = mk(this.ortho);
    this.cOrtho.enableRotate = false;
    this.cOrtho.screenSpacePanning = true;
    this.cOrtho.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.cOrtho.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
    this.cOrtho.minZoom = 0.5;
    this.cOrtho.maxZoom = 4;
    this.cOrtho.enabled = false;

    this.floorGroup = new THREE.Group();
    scene.add(this.floorGroup);
    this.guides = new THREE.Group();
    scene.add(this.guides);
    this.handles = [];

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.buildFloor();
    this.recenter();
    this.bindPointer();

    // Alt/Option + drag orbits too, for trackpads without a right click.
    const setAlt = (on) => {
      this.cPersp.mouseButtons.LEFT = on ? THREE.MOUSE.ROTATE : null;
      this.cOrtho.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : null;
    };
    addEventListener('keydown', (e) => { if (e.key === 'Alt') setAlt(true); });
    addEventListener('keyup', (e) => { if (e.key === 'Alt') setAlt(false); });
    addEventListener('blur', () => setAlt(false));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    this.clock = new THREE.Clock();
    this.time = 0;
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.time += dt;
      this.hooks.onTick?.(dt);
      this.animate(dt);
      (this.view === '3d' ? this.cPersp : this.cOrtho).update();
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get camera() { return this.view === '3d' ? this.persp : this.ortho; }

  /* ---------- floor ---------- */
  setStageSize(w, d) {
    if (w === this.size.w && d === this.size.d) return;
    this.size = { w, d };
    this.buildFloor();
    this.resize();
    this.recenter();
  }

  buildFloor() {
    const g = this.floorGroup;
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
      c.material?.map?.dispose();
      c.material?.dispose();
    }
    const { w, d } = this.size;

    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 60, d + 50),
      new THREE.MeshStandardMaterial({ color: '#D9D2C7', roughness: 1 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.121;
    surround.receiveShadow = true;
    g.add(surround);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.12, d),
      [
        ...Array(2).fill(new THREE.MeshStandardMaterial({ color: '#A57A4D', roughness: 0.8 })),
        new THREE.MeshStandardMaterial({ map: woodTexture(w, d), roughness: 0.62 }),
        new THREE.MeshStandardMaterial({ color: '#A57A4D' }),
        ...Array(2).fill(new THREE.MeshStandardMaterial({ color: '#B4875A', roughness: 0.8 })),
      ],
    );
    deck.position.y = -0.06;
    deck.receiveShadow = true;
    g.add(deck);

    // Grid: 1 m squares, center line stronger
    const pts = [];
    for (let x = -Math.floor(w / 2); x <= w / 2; x++) if (x !== 0) pts.push(x, 0.003, -d / 2, x, 0.003, d / 2);
    for (let z = -Math.floor(d / 2); z <= d / 2; z++) pts.push(-w / 2, 0.003, z, w / 2, 0.003, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#5C3B1A', transparent: true, opacity: 0.13 }));
    g.add(this.grid);
    const cg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.004, -d / 2), new THREE.Vector3(0, 0.004, d / 2)]);
    this.centerLine = new THREE.Line(cg, new THREE.LineDashedMaterial({ color: '#5C3B1A', transparent: true, opacity: 0.35, dashSize: 0.25, gapSize: 0.2 }));
    this.centerLine.computeLineDistances();
    g.add(this.centerLine);

    const shadow = this.key.shadow.camera;
    const ext = Math.max(w, d) / 2 + 4;
    Object.assign(shadow, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 40 });
    shadow.updateProjectionMatrix();
  }

  setGrid(on) { this.grid.visible = on; this.centerLine.visible = on; }

  /* ---------- cameras ---------- */
  setView(v) {
    this.view = v;
    this.cPersp.enabled = v === '3d';
    this.cOrtho.enabled = v === 'top';
    for (const p of this.people.values()) p.setTopView(v === 'top');
    this.resize();
  }

  recenter() {
    const { w, d } = this.size;
    const dist = Math.max(w * 1.05, d * 1.5) + 4;
    this.persp.position.set(0, dist * 0.62, d / 2 + dist * 0.78);
    this.cPersp.target.set(0, 0, 0.4);
    this.cOrtho.target.set(0, 0, 0);
    this.ortho.position.set(0, 30, 0);
    this.ortho.zoom = 1;
    this.ortho.updateProjectionMatrix();
    this.cPersp.update();
    this.cOrtho.update();
  }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    this.persp.aspect = a;
    this.persp.updateProjectionMatrix();
    const half = Math.max((this.size.d + 2.2) / 2, (this.size.w + 2.2) / 2 / a) * 1.04;
    Object.assign(this.ortho, { left: -half * a, right: half * a, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
  }

  /* ---------- dancers ---------- */
  setDancers(dancers) {
    const ids = new Set(dancers.map((d) => d.id));
    for (const [id, p] of this.people) {
      if (!ids.has(id)) {
        this.scene.remove(p.root);
        p.dispose();
        this.people.delete(id);
        this.labels.get(id)?.remove();
        this.labels.delete(id);
      }
    }
    for (const d of dancers) {
      let p = this.people.get(d.id);
      if (!p) {
        p = new Person(d.id, d.color);
        p.setTopView(this.view === 'top');
        this.people.set(d.id, p);
        this.scene.add(p.root);
        const tag = document.createElement('div');
        tag.className = 'tag';
        this.labelLayer.appendChild(tag);
        this.labels.set(d.id, tag);
        p.last = null;
      }
      p.setColor(d.color);
      const tag = this.labels.get(d.id);
      if (tag.textContent !== d.name) tag.textContent = d.name;
      tag.style.setProperty('--c', d.color);
    }
  }

  // frame: Map id -> {x, z, alpha}; opts: {selected:Set, playing:boolean, ghostAlpha}
  setFrame(frame, { selected, playing, facing }) {
    this.frame = frame;
    this.playing = playing;
    this.facing = facing;
    for (const [id, p] of this.people) {
      const f = frame.get(id);
      if (!f) continue;
      p.target = f;
      const a = playing ? f.alpha : Math.max(f.alpha, 0.28);
      p.setOpacity(a);
      p.setSelected(selected.has(id));
      const tag = this.labels.get(id);
      tag.classList.toggle('sel', selected.has(id));
      tag.classList.toggle('off', f.alpha < 0.5);
    }
  }

  animate(dt) {
    if (!this.frame) return;
    for (const p of this.people.values()) {
      const f = p.target;
      if (!f) continue;
      const last = p.last || f;
      const dx = f.x - last.x, dz = f.z - last.z;
      const dist = Math.hypot(dx, dz);
      // Big jumps (clicking a formation, undo) teleport instead of walking.
      const teleport = dist > 0.6 || !p.last;
      const speed = teleport || dt === 0 ? 0 : dist / dt;
      let heading = p.heading;
      if (!teleport && speed > 0.15) heading = Math.atan2(dx, dz);
      else if (speed < 0.05) heading = this.facing?.get(p.id) ?? 0;
      if (teleport) p.heading = heading;
      p.root.position.set(f.x, 0, f.z);
      p.tick(dt, speed, heading, this.time);
      p.last = { x: f.x, z: f.z };
    }
  }

  updateLabels() {
    const cam = this.camera;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    for (const [id, p] of this.people) {
      const tag = this.labels.get(id);
      const show = this.showLabels && p.root.visible;
      tag.style.display = show ? '' : 'none';
      if (!show) continue;
      if (this.view === '3d') v.set(p.root.position.x, 2.0, p.root.position.z);
      else v.set(p.root.position.x, 0, p.root.position.z + 0.95);
      v.project(cam);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  /* ---------- path guides ---------- */
  // items: [{id, color, p0, p1, h, handle:boolean}]
  setGuides(items) {
    const g = this.guides;
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
      c.material?.dispose();
    }
    this.handles = [];
    for (const it of items) {
      const pts = [];
      for (let k = 0; k <= 32; k++) {
        const p = pathPoint(it.p0, it.p1, it.h, k / 32);
        pts.push(new THREE.Vector3(p.x, 0.02, p.z));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: it.color, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: it.handle ? 0.95 : 0.6 }),
      );
      line.computeLineDistances();
      g.add(line);
      const ghost = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.25, 32),
        new THREE.MeshBasicMaterial({ color: it.color, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      ghost.rotation.x = -Math.PI / 2;
      ghost.position.set(it.p0.x, 0.015, it.p0.z);
      g.add(ghost);
      if (it.handle) {
        const mid = pathPoint(it.p0, it.p1, it.h, 0.5);
        const hd = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 20, 14),
          new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: it.color, emissiveIntensity: 0.35, roughness: 0.4 }),
        );
        hd.position.set(mid.x, 0.13, mid.z);
        hd.userData.handleFor = it.id;
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.16, 0.22, 32),
          new THREE.MeshBasicMaterial({ color: it.color, transparent: true, depthWrite: false }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(mid.x, 0.016, mid.z);
        g.add(hd, halo);
        this.handles.push(hd);
      }
    }
  }

  /* ---------- pointer ---------- */
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  floorAt(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const v = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, v) ? { x: v.x, z: v.z } : null;
  }
  pick(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const h = this.raycaster.intersectObjects(this.handles, false)[0];
    if (h) return { handle: h.object.userData.handleFor };
    const hits = this.raycaster.intersectObjects([...this.people.values()].filter((p) => p.root.visible).map((p) => p.hit), false);
    return hits[0] ? { id: hits[0].object.userData.id } : null;
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let mode = null, start = null, moved = false, startScreen = null, pid = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.altKey || mode) return;
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      const hit = this.pick(e);
      const floor = this.floorAt(e);
      pid = e.pointerId;
      moved = false;
      if (hit?.handle) {
        mode = 'handle';
        start = { id: hit.handle };
        this.hooks.onHandleStart?.(hit.handle);
      } else if (hit?.id) {
        const ok = this.hooks.onDancerDown?.(hit.id, e.shiftKey || e.metaKey || e.ctrlKey);
        if (ok === false) return;
        mode = 'drag';
        start = floor;
      } else {
        mode = 'marquee';
        const r = el.getBoundingClientRect();
        startScreen = { x: e.clientX - r.left, y: e.clientY - r.top, add: e.shiftKey || e.metaKey || e.ctrlKey };
      }
      el.setPointerCapture(pid);
    });
    el.addEventListener('pointermove', (e) => {
      if (!mode) {
        if (e.pointerType === 'mouse') {
          const hit = this.pick(e);
          el.style.cursor = hit?.handle ? 'grab' : hit?.id ? 'grab' : 'default';
        }
        return;
      }
      if (e.pointerId !== pid) return;
      if (mode === 'drag' && start) {
        const f = this.floorAt(e);
        if (!f) return;
        const dx = f.x - start.x, dz = f.z - start.z;
        if (!moved && Math.hypot(dx, dz) < 0.04) return;
        moved = true;
        el.style.cursor = 'grabbing';
        this.hooks.onDrag?.(dx, dz);
      } else if (mode === 'handle') {
        const f = this.floorAt(e);
        if (!f) return;
        moved = true;
        this.hooks.onHandleDrag?.(start.id, f.x, f.z);
      } else if (mode === 'marquee') {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (!moved && Math.hypot(x - startScreen.x, y - startScreen.y) < 4) return;
        moved = true;
        const m = this.marqueeEl;
        m.hidden = false;
        Object.assign(m.style, {
          left: `${Math.min(x, startScreen.x)}px`, top: `${Math.min(y, startScreen.y)}px`,
          width: `${Math.abs(x - startScreen.x)}px`, height: `${Math.abs(y - startScreen.y)}px`,
        });
        startScreen.end = { x, y };
      }
    });
    const end = (e) => {
      if (!mode || e.pointerId !== pid) return;
      el.releasePointerCapture?.(pid);
      if (mode === 'drag') this.hooks.onDragEnd?.(moved);
      else if (mode === 'handle') this.hooks.onHandleEnd?.(moved);
      else if (mode === 'marquee') {
        this.marqueeEl.hidden = true;
        if (moved && startScreen.end) {
          const a = startScreen, b = startScreen.end;
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
          const ids = [];
          const w = el.clientWidth, h = el.clientHeight;
          for (const [id, p] of this.people) {
            if (!p.root.visible) continue;
            const v = new THREE.Vector3(p.root.position.x, this.view === '3d' ? 0.9 : 0, p.root.position.z).project(this.camera);
            const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
            if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(id);
          }
          this.hooks.onMarquee?.(ids, a.add);
        } else {
          this.hooks.onMarquee?.([], startScreen.add);
        }
      }
      el.style.cursor = 'default';
      mode = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', (e) => {
      const hit = this.pick(e);
      if (hit?.handle) this.hooks.onHandleReset?.(hit.handle);
      else if (hit?.id) this.hooks.onDancerDblClick?.(hit.id);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Snapshot the canvas (for library thumbnails, if wanted later)
  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/jpeg', 0.7); }
}

/* Procedural maple floor: planks running across the stage, with spike numbers along the front edge. */
function woodTexture(w, d) {
  const ppm = 96;
  const c = document.createElement('canvas');
  c.width = Math.round(w * ppm);
  c.height = Math.round(d * ppm);
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#DDB487';
  g.fillRect(0, 0, c.width, c.height);
  const plankH = 0.19 * ppm;
  for (let y = 0, row = 0; y < c.height; y += plankH, row++) {
    let x = -rnd() * 2.4 * ppm;
    while (x < c.width) {
      const len = (1.6 + rnd() * 1.6) * ppm;
      const l = 0.94 + rnd() * 0.12;
      g.fillStyle = `rgb(${Math.round(226 * l)},${Math.round(186 * l)},${Math.round(140 * l)})`;
      g.fillRect(x, y, len, plankH);
      g.strokeStyle = 'rgba(120,80,40,.10)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const yy = y + plankH * (0.2 + rnd() * 0.6);
        g.beginPath();
        g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + (rnd() - 0.5) * 6, x + len * 0.6, yy + (rnd() - 0.5) * 6, x + len, yy + (rnd() - 0.5) * 4);
        g.stroke();
      }
      g.fillStyle = 'rgba(90,55,25,.28)';
      g.fillRect(x, y, 1.5, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(90,55,25,.22)';
    g.fillRect(0, y, c.width, 1.2);
  }
  // Spike numbers along the downstage edge (audience side = bottom of texture)
  g.fillStyle = 'rgba(70,40,15,.55)';
  g.font = `600 ${0.22 * ppm}px Geist, system-ui, sans-serif`;
  g.textAlign = 'center';
  for (let m = -Math.floor(w / 2); m <= w / 2; m++) {
    if (m % 2) continue;
    const x = c.width / 2 + m * ppm;
    g.fillRect(x - 1.5, c.height - 0.16 * ppm, 3, 0.16 * ppm);
    g.fillText(String(Math.abs(m)), x, c.height - 0.22 * ppm);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
