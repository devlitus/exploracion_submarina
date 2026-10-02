import * as THREE from 'three';
import { makeRng, hash2, clamp, lerp, smoothstep, noise2 } from './noise.js';
import { heightAt } from './terrain.js';
import { fishGeo, sharkGeo, cetaceanGeo, mantaGeo, turtleGeo, jellyGeo, anglerGeo, squidGeo, creatureMat, ANGLER_LURE } from './creatures.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

// ---------- catalogo de especies (datos reales) ----------
// floor: profundidad del fondo donde puede aparecer; band: profundidad a la que nada
export const SP = {
  sardine:  { id: 'sardine', name: 'Sardina', sci: 'Sardina pilchardus', kind: 'school', n: 100, floor: [10, 95], band: [3, 40], w: 3, speed: 2.4, turn: 0.7, spread: [3.2, 1.6, 5], see: 30,
    text: 'Se agrupan en bancos de miles de individuos: moverse al unísono confunde a los depredadores.' },
  anthias:  { id: 'anthias', name: 'Anthias', sci: 'Pseudanthias squamipinnis', kind: 'school', n: 64, floor: [5, 38], band: [3, 28], w: 2.5, speed: 0.7, turn: 0.9, spread: [3, 2, 3], see: 26, home: 14,
    text: 'Todos nacen hembras: si desaparece el macho dominante, la hembra mayor cambia de sexo.' },
  snapper:  { id: 'snapper', name: 'Pargo cola amarilla', sci: 'Ocyurus chrysurus', kind: 'school', n: 36, floor: [14, 70], band: [8, 45], w: 1.5, speed: 1.5, turn: 0.5, spread: [5, 2.5, 6], see: 28, home: 60,
    text: 'Nada en la columna de agua sobre el arrecife y se alimenta de zooplancton y pequeños peces.' },
  tuna:     { id: 'tuna', name: 'Atún rojo', sci: 'Thunnus thynnus', kind: 'school', n: 14, floor: [32, 160], band: [10, 90], w: 1, speed: 4.2, turn: 0.35, spread: [6, 3, 8], see: 36,
    text: 'Alcanza ~70 km/h en ráfagas y es parcialmente de sangre caliente, lo que le permite cazar en aguas frías.' },
  moonjelly:{ id: 'moonjelly', name: 'Medusa luna', sci: 'Aurelia aurita', kind: 'jelly', turn: 0.15, n: 9, floor: [6, 85], band: [2, 30], w: 1.6, speed: 0.15, see: 20,
    text: 'Sin cerebro ni corazón y compuesta en un 95 % de agua: avanza pulsando su umbrela.' },
  turtle:   { id: 'turtle', name: 'Tortuga verde', sci: 'Chelonia mydas', kind: 'single', floor: [6, 50], band: [3, 30], w: 1.1, speed: 1.0, turn: 0.4, clear: 3, see: 26, size: 1.25,
    text: 'Puede dormir bajo el agua varias horas y migra miles de kilómetros hasta su playa natal para desovar.' },
  manta:    { id: 'manta', name: 'Manta gigante', sci: 'Mobula birostris', kind: 'single', floor: [28, 130], band: [8, 75], w: 0.9, speed: 2.0, turn: 0.3, clear: 6, see: 45, size: 1.0, curious: 1,
    text: 'Con hasta 7 m de envergadura es el mayor de los rayos; filtra plancton y tiene el cerebro más grande de todos los peces.' },
  dolphin:  { id: 'dolphin', name: 'Delfín mular', sci: 'Tursiops truncatus', kind: 'single', floor: [16, 160], band: [0.5, 12], w: 1, speed: 5.5, turn: 0.8, clear: 4, see: 60, size: 1, curious: 1, leaps: true,
    text: 'Cada delfín tiene un silbido propio, como un nombre, y ecolocaliza con chasquidos para «ver» con el sonido.' },
  hammer:   { id: 'hammer', name: 'Tiburón martillo', sci: 'Sphyrna lewini', kind: 'single', floor: [32, 150], band: [14, 95], w: 0.6, speed: 2.4, turn: 0.35, clear: 5, see: 45, size: 1,
    text: 'Su cabeza ancha amplía el campo de electrorrecepción (ampollas de Lorenzini) y detecta presas enterradas en la arena.' },
  sperm:    { id: 'sperm', name: 'Cachalote', sci: 'Physeter macrocephalus', kind: 'single', floor: [65, 200], band: [18, 150], w: 0.3, speed: 1.8, turn: 0.12, clear: 12, see: 70, size: 1, whale: true,
    text: 'Bucea a más de 1 000 m y aguanta 90 min en apnea; sus chasquidos (~230 dB) son el sonido más potente que produce un animal.' },
  atolla:   { id: 'atolla', name: 'Medusa Atolla', sci: 'Atolla wyvillei', kind: 'jelly', turn: 0.15, n: 7, deep: true, floor: [95, 200], band: [70, 180], w: 1.3, speed: 0.12, see: 22,
    text: 'Si la atacan emite destellos azules en espiral: una «alarma antirrobo» que atrae a depredadores mayores.' },
  angler:   { id: 'angler', name: 'Rape abisal', sci: 'Melanocetus johnsonii', kind: 'single', floor: [100, 200], band: [80, 190], w: 1.1, speed: 0.5, turn: 0.5, clear: 3, see: 26, size: 1, lure: true, nearFloor: true,
    text: 'Pesca con un señuelo luminoso lleno de bacterias bioluminiscentes; en algunas especies los machos diminutos se fusionan a la hembra.' },
  squid:    { id: 'squid', name: 'Calamar gigante', sci: 'Architeuthis dux', kind: 'single', floor: [105, 200], band: [85, 180], w: 0.35, speed: 1.2, turn: 0.2, clear: 10, see: 55, size: 1, squid: true,
    text: 'Sus ojos, de hasta 27 cm, son los mayores del reino animal: quizá sirvan para detectar el brillo de los cachalotes que lo cazan.' },
  lantern:  { id: 'lantern', name: 'Pez linterna', sci: 'Myctophidae', kind: 'school', n: 80, glow: true, floor: [90, 200], band: [60, 185], w: 2, speed: 0.9, turn: 0.6, spread: [3, 2, 3], see: 24,
    text: 'Protagonizan la mayor migración vertical diaria del planeta; sus fotóforos los camuflan por contraluz.' },
};
const SPL = Object.values(SP);

// ---------- recursos compartidos ----------
const G = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.sardine = fishGeo(0.26, 0.05, 0.04, [0.12, 0.28, 0.5], [0.88, 0.92, 0.95], [0.5, 0.55, 0.6]);
  G.anthias = fishGeo(0.14, 0.05, 0.03, [1, 0.42, 0.08], [1, 0.62, 0.55], [1, 0.3, 0.25]);
  G.snapper = fishGeo(0.5, 0.14, 0.09, [0.95, 0.75, 0.2], [0.95, 0.95, 0.85], [1, 0.82, 0.2]);
  G.tuna = fishGeo(1.5, 0.38, 0.3, [0.07, 0.12, 0.25], [0.8, 0.82, 0.85], [0.18, 0.2, 0.3], 0.35);
  G.lantern = fishGeo(0.16, 0.04, 0.03, [0.1, 0.12, 0.2], [0.5, 0.7, 0.9], [0.1, 0.12, 0.2]);
  G.moon = jellyGeo(false); G.atolla = jellyGeo(true);
  G.turtle = turtleGeo(); G.manta = mantaGeo(); G.hammer = sharkGeo();
  G.dolphin = cetaceanGeo(2.7, 0.55, 0.5, false); G.sperm = cetaceanGeo(14, 2.7, 2.4, true);
  G.angler = anglerGeo(); G.squid = squidGeo();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  G.glowTex = new THREE.CanvasTexture(c);
  return G;
}
const glowSprite = (color, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: geos().glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size); return s;
};

const _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3(), _up = new V3(0, 1, 0);
function basisFrom(dir) {
  _z.copy(dir).normalize();
  _x.crossVectors(_up, _z); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
  _y.crossVectors(_z, _x);
}
function writeInst(arr, i, px, py, pz, s) {
  const o = i * 16;
  arr[o] = _x.x * s; arr[o + 1] = _x.y * s; arr[o + 2] = _x.z * s; arr[o + 3] = 0;
  arr[o + 4] = _y.x * s; arr[o + 5] = _y.y * s; arr[o + 6] = _y.z * s; arr[o + 7] = 0;
  arr[o + 8] = _z.x * s; arr[o + 9] = _z.y * s; arr[o + 10] = _z.z * s; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

class Agent {
  constructor(sp, pos, seed, scene) {
    this.sp = sp; this.pos = pos; this.seed = seed; this.scene = scene; this.t0 = seed * 100;
    this.yaw = seed * TAU; this.pitch = 0; this.dir = new V3(); this.speed = sp.speed; this.ph = 0;
    this.home = pos.clone(); this.air = false; this.vel = new V3(); this.dist = 1e9; this.leap = 20 + seed * 40;
    this.dTarget = -pos.y; this.updateDir();
    this.build();
  }
  updateDir() { const cp = Math.cos(this.pitch); this.dir.set(cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw)); }
  build() {
    const sp = this.sp, g = geos(), s = this.scene;
    if (sp.kind === 'school') {
      const geo = { sardine: g.sardine, anthias: g.anthias, snapper: g.snapper, tuna: g.tuna, lantern: g.lantern }[sp.id];
      const L = { sardine: 0.26, anthias: 0.14, snapper: 0.5, tuna: 1.5, lantern: 0.16 }[sp.id];
      this.mat = creatureMat(0, { amp: 0.09, len: L, rough: 0.35, metal: sp.glow ? 0 : 0.25, emissive: sp.glow ? [0.1, 0.45, 0.8] : null, emissiveI: 0.7 });
      this.mesh = new THREE.InstancedMesh(geo, this.mat, sp.n);
      this.mesh.frustumCulled = false;
      this.fish = Array.from({ length: sp.n }, (_, i) => {
        const r = makeRng(this.seed * 1e6 + i * 97);
        return { p: [r() * TAU, r() * TAU, r() * TAU], w: [0.25 + r() * 0.5, 0.2 + r() * 0.5, 0.2 + r() * 0.5], k: [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], sc: 0.8 + r() * 0.5 };
      });
      this.spreadK = 1;
      s.add(this.mesh);
    } else if (sp.kind === 'jelly') {
      this.mat = creatureMat(3, { transparent: true, opacity: sp.deep ? 0.7 : 0.5, emissive: sp.deep ? [0.05, 0.25, 0.9] : [0.35, 0.55, 0.75], emissiveI: sp.deep ? 0.4 : 0.45, rough: 0.3 });
      this.mesh = new THREE.InstancedMesh(sp.deep ? g.atolla : g.moon, this.mat, sp.n);
      this.mesh.frustumCulled = false;
      this.jel = Array.from({ length: sp.n }, (_, i) => {
        const r = makeRng(this.seed * 1e6 + i * 131);
        return { o: [(r() - 0.5) * 30, (r() - 0.5) * 12, (r() - 0.5) * 30], sc: (sp.deep ? 0.8 : 0.45) + r() * (sp.deep ? 1.0 : 0.9), ph: r() * TAU, tilt: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3] };
      });
      s.add(this.mesh);
    } else {
      const mk = {
        turtle: () => [g.turtle, creatureMat(2, { amp: 0.6, span: 1.0, thr: 0.35, rough: 0.6 })],
        manta: () => [g.manta, creatureMat(2, { amp: 0.22, span: 3.0, thr: 0.05, rough: 0.5 })],
        dolphin: () => [g.dolphin, creatureMat(1, { amp: 0.045, len: 2.7, rough: 0.3 })],
        hammer: () => [g.hammer, creatureMat(0, { amp: 0.05, len: 3.8, rough: 0.5 })],
        sperm: () => [g.sperm, creatureMat(1, { amp: 0.02, len: 14, rough: 0.55 })],
        angler: () => [g.angler, creatureMat(0, { amp: 0.06, len: 1.5, rough: 0.6 })],
        squid: () => [g.squid, creatureMat(0, { amp: 0.04, len: 10, s0: 0, rough: 0.4 })],
      }[sp.id]();
      this.mat = mk[1];
      this.mesh = new THREE.Mesh(mk[0], this.mat);
      if (sp.lure) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1, 0.85), toneMapped: false }));
        l.position.copy(ANGLER_LURE); this.mesh.add(l);
        const sprite = glowSprite(new THREE.Color(0.25, 0.9, 0.8), 2.4); sprite.position.copy(ANGLER_LURE); this.mesh.add(sprite);
        this.lure = sprite;
      }
      this.mesh.scale.setScalar(sp.size || 1);
      s.add(this.mesh);
    }
    if (sp.deep || sp.glow) this.glow = [];
  }
  dispose() {
    this.scene.remove(this.mesh);
    if (this.mesh.dispose) this.mesh.dispose();
    this.mat?.dispose();
  }
  steer(dt, t, sub) {
    const sp = this.sp;
    if (this.air) { // vuelo balistico del delfin
      this.vel.y -= 9.81 * dt; this.pos.addScaledVector(this.vel, dt);
      this.dir.copy(this.vel).normalize();
      this.yaw = Math.atan2(this.dir.x, this.dir.z); this.pitch = Math.asin(clamp(this.dir.y, -1, 1));
      if (this.pos.y < 0 && this.vel.y < 0) { this.air = false; this.speed = sp.speed; this.leap = 25 + Math.random() * 50; }
      return;
    }
    const nz = noise2(this.seed * 13 + t * 0.08, this.seed * 7, 5);
    this.yaw += nz * sp.turn * dt * 2;
    const depth = -this.pos.y;
    const mid = (sp.band[0] + sp.band[1]) / 2, amp = (sp.band[1] - sp.band[0]) * 0.4;
    this.dTarget = mid + amp * Math.sin(t * 0.04 + this.seed * 20);
    let pt = clamp((depth - this.dTarget) * 0.05, -0.55, 0.55);
    const ahead = heightAt(this.pos.x + this.dir.x * Math.max(4, this.speed * 5), this.pos.z + this.dir.z * Math.max(4, this.speed * 5));
    const clearance = this.pos.y - ahead;
    if (sp.nearFloor) this.dTarget = clamp(-ahead - (6 + 6 * Math.sin(t * 0.05 + this.seed * 9)), sp.band[0], sp.band[1]);
    if (clearance < (sp.clear || 3) + 2) { pt = Math.max(pt, 0.5); this.yaw += (this.seed > 0.5 ? 1 : -1) * 0.5 * dt; }
    if (depth < 1.2 && !sp.leaps) pt = Math.min(pt, -0.25);
    if (sp.home) {
      const dx = this.home.x - this.pos.x, dz = this.home.z - this.pos.z;
      if (Math.hypot(dx, dz) > sp.home) this.yaw += clamp(wrapPi(Math.atan2(dx, dz) - this.yaw), -1, 1) * sp.turn * dt * 2;
    }
    let sMul = 1;
    const dx = sub.pos.x - this.pos.x, dy = sub.pos.y - this.pos.y, dz = sub.pos.z - this.pos.z, d = Math.hypot(dx, dy, dz);
    if (sp.kind === 'school' && d < 22 && sub.speed > 0.8) { // huida
      this.yaw += clamp(wrapPi(Math.atan2(-dx, -dz) - this.yaw), -1, 1) * 2 * dt; sMul = 1.6;
    }
    if (sp.curious && d < 130 && d > 14) { this.yaw += clamp(wrapPi(Math.atan2(dx, dz) - this.yaw), -1, 1) * 0.6 * dt; pt = clamp(pt * 0.4 + dy * 0.01, -0.4, 0.4); }
    if (sp.curious && d <= 14) { this.yaw += 0.5 * dt; }
    this.pitch += (pt - this.pitch) * Math.min(1, dt * 0.8);
    this.leap -= dt;
    if (sp.leaps && this.leap < 0) { // salto del delfin: sube a la superficie y emerge en parabola
      pt = 0.7;
      if (depth < 2.4) { this.air = true; this.pitch = 0.8; this.updateDir(); this.vel.copy(this.dir).multiplyScalar(9); this.vel.y = Math.max(this.vel.y, 7.5); return; }
    }
    let speed = sp.speed * sMul;
    if (sp.squid) speed = sp.speed * (0.25 + 0.9 * Math.pow(Math.max(0, Math.sin(t * 1.4 + this.seed * 9)), 2));
    this.speed += (speed - this.speed) * Math.min(1, dt * 1.5);
    this.updateDir();
    this.pos.addScaledVector(this.dir, this.speed * dt);
    const h = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < h + 1.0) this.pos.y = h + 1.0;
    if (this.pos.y > -0.3) this.pos.y = -0.3;
  }
  update(dt, t, sub) {
    const sp = this.sp, dx = sub.pos.x - this.pos.x, dz = sub.pos.z - this.pos.z;
    this.dist = Math.hypot(dx, sub.pos.y - this.pos.y, dz);
    const far = this.dist > 340;
    this.mesh.visible = this.dist < 320;
    if (far) { this.pos.addScaledVector(this.dir, this.speed * dt * 0.5); return; }
    this.steer(dt, t, sub);
    const freq = sp.kind === 'jelly' ? 1.6 : sp.whale ? 0.6 : sp.id === 'manta' ? 1.1 : sp.id === 'turtle' ? 1.4 : sp.id === 'dolphin' ? 4 : 2.2 + this.speed * 1.4;
    this.ph += dt * freq * (sp.kind === 'jelly' ? 1.0 : 1) * TAU * (sp.kind === 'school' ? 1 : 0.5);
    this.mat.userData.u.uPh.value = this.ph;
    if (!this.mesh.visible) return;
    if (sp.kind === 'school') this.updateSchool(t, sub);
    else if (sp.kind === 'jelly') this.updateJelly(dt, t);
    else {
      this.mesh.position.copy(this.pos);
      basisFrom(this.dir); _m.makeBasis(_x, _y, _z); this.mesh.quaternion.setFromRotationMatrix(_m);
      if (this.lure) this.lure.material.opacity = 0.7 + 0.3 * Math.sin(t * 3 + this.seed * 9);
    }
  }
  updateSchool(t, sub) {
    const sp = this.sp, arr = this.mesh.instanceMatrix.array;
    const dxs = sub.pos.x - this.pos.x, dys = sub.pos.y - this.pos.y, dzs = sub.pos.z - this.pos.z, ds = Math.hypot(dxs, dys, dzs);
    const target = 1 + 1.2 * smoothstep(26, 9, ds);
    this.spreadK += (target - this.spreadK) * 0.05;
    basisFrom(this.dir);
    const rx = _x.clone(), ry = _y.clone(), rz = _z.clone();
    const [A, B, C] = sp.spread, K = this.spreadK;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      const s0 = Math.sin(f.p[0] + t * f.w[0]), s1 = Math.sin(f.p[1] + t * f.w[1]), s2 = Math.sin(f.p[2] + t * f.w[2]);
      const c0 = Math.cos(f.p[0] + t * f.w[0]) * f.w[0], c1 = Math.cos(f.p[1] + t * f.w[1]) * f.w[1], c2 = Math.cos(f.p[2] + t * f.w[2]) * f.w[2];
      const ox = A * K * s0 * f.k[0], oy = B * K * s1 * f.k[1], oz = C * K * s2 * f.k[2];
      const px = this.pos.x + rx.x * ox + ry.x * oy + rz.x * oz, py = this.pos.y + rx.y * ox + ry.y * oy + rz.y * oz, pz = this.pos.z + rx.z * ox + ry.z * oy + rz.z * oz;
      const vx = this.speed * rz.x + rx.x * A * K * c0 * f.k[0] + ry.x * B * K * c1 * f.k[1] + rz.x * C * K * c2 * f.k[2];
      const vy = this.speed * rz.y + rx.y * A * K * c0 * f.k[0] + ry.y * B * K * c1 * f.k[1] + rz.y * C * K * c2 * f.k[2];
      const vz = this.speed * rz.z + rx.z * A * K * c0 * f.k[0] + ry.z * B * K * c1 * f.k[1] + rz.z * C * K * c2 * f.k[2];
      _z.set(vx, vy, vz);
      basisFrom(_z);
      writeInst(arr, i, px, Math.min(py, -0.3), pz, f.sc);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  updateJelly(dt, t) {
    const arr = this.mesh.instanceMatrix.array, o = new THREE.Object3D();
    // deriva con la corriente y migracion vertical lenta
    this.pos.x += Math.sin(t * 0.05 + this.seed * 9) * 0.25 * dt; this.pos.z += Math.cos(t * 0.04 + this.seed * 7) * 0.25 * dt;
    this.pos.y += Math.sin(t * 0.07 + this.seed * 5) * 0.12 * dt;
    const h = heightAt(this.pos.x, this.pos.z); if (this.pos.y < h + 3) this.pos.y = h + 3; if (this.pos.y > -1.5) this.pos.y = -1.5;
    for (let i = 0; i < this.jel.length; i++) {
      const j = this.jel[i];
      o.position.set(this.pos.x + j.o[0], Math.min(this.pos.y + j.o[1] + Math.sin(t * 1.6 + j.ph) * 0.25, -0.8), this.pos.z + j.o[2]);
      o.rotation.set(j.tilt[0], j.ph, j.tilt[1]); o.scale.setScalar(j.sc); o.updateMatrix();
      o.matrix.toArray(arr, i * 16);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.sp.deep) this.mat.emissiveIntensity = 0.25 + 1.4 * Math.pow(Math.max(0, Math.sin(t * 2.2 + this.seed * 30)), 10);
  }
}

// ---------- gestor del ecosistema ----------
const CELL = 170;
export function createFauna(scene) {
  const cells = new Map();
  const list = [];
  const found = new Set();
  let acc = 0;

  const pickSpecies = (d, rng) => {
    const cand = SPL.filter((s) => d >= s.floor[0] && d <= s.floor[1]);
    const tot = cand.reduce((a, s) => a + s.w, 0);
    if (!tot) return null;
    let r = rng() * tot;
    for (const s of cand) { r -= s.w; if (r <= 0) return s; }
    return cand[0];
  };
  const spawnCell = (cx, cz) => {
    const rng = makeRng((hash2(cx, cz, 999) * 4294967296) >>> 0), arr = [];
    const n = 1 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const x = (cx + rng()) * CELL, z = (cz + rng()) * CELL, h = heightAt(x, z), d = -h;
      if (d < 5) continue;
      const sp = pickSpecies(d, rng);
      if (!sp) continue;
      const lo = Math.max(sp.band[0], 0.5), hi = Math.min(sp.band[1], d - 3);
      if (hi < lo) continue;
      const depth = sp.nearFloor ? Math.min(d - 5, hi) : lerp(lo, hi, rng());
      const a = new Agent(sp, new V3(x, -depth, z), rng(), scene);
      arr.push(a); list.push(a);
    }
    cells.set(cx + ',' + cz, arr);
  };
  const unspawn = (key) => {
    for (const a of cells.get(key)) { a.dispose(); list.splice(list.indexOf(a), 1); }
    cells.delete(key);
  };

  return {
    list, found,
    update(dt, t, sub, onSee) {
      acc -= dt;
      if (acc <= 0) {
        acc = 0.5;
        const ccx = Math.floor(sub.pos.x / CELL), ccz = Math.floor(sub.pos.z / CELL);
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!cells.has((ccx + dx) + ',' + (ccz + dz))) spawnCell(ccx + dx, ccz + dz);
        for (const key of [...cells.keys()]) {
          const [kx, kz] = key.split(',').map(Number);
          if (Math.abs(kx - ccx) > 3 || Math.abs(kz - ccz) > 3) unspawn(key);
        }
      }
      for (const a of list) {
        a.update(dt, t, sub);
        if (a.dist < a.sp.see && !found.has(a.sp.id)) {
          const dx = a.pos.x - sub.pos.x, dy = a.pos.y - sub.pos.y, dz = a.pos.z - sub.pos.z, l = Math.hypot(dx, dy, dz) || 1;
          if ((dx * sub.fwd.x + dy * sub.fwd.y + dz * sub.fwd.z) / l > -0.1) { found.add(a.sp.id); onSee(a.sp, a); }
        }
      }
    },
    nearest(id, pos) {
      let best = null, bd = 1e9;
      for (const a of list) if (a.sp.id === id) { const d = a.pos.distanceTo(pos); if (d < bd) { bd = d; best = a; } }
      return best ? { agent: best, dist: bd } : null;
    },
  };
}
