import * as THREE from 'three';
import { clamp } from './noise.js';
import { heightAt, normalAt, currentAt } from './terrain.js';
import { colliders } from './landmarks.js';
import { patch } from './shading.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;

// ---------- parametros fisicos (SI) ----------
export const P = {
  rho: 1025, g: 9.81, V0: 8.0,
  mHull: 6000, tank: 2400,                // kg; lastre variable
  added: [0.9, 0.9, 0.1],                  // masa añadida x (lateral), y (vertical), z (axial) como fraccion de rho*V
  I: [24000, 24000, 5600],                 // kg m^2 (x=cabeceo, y=guinada, z=balanceo), incluye masa añadida
  cdA: [12.5, 11.5, 1.2],                  // Cd*A (m^2) por eje del casco
  rotC2: [40000, 43000, 4000], rotC1: [8000, 6000, 5000],
  BG: 0.25,                                // CB sobre CG (m): par adrizante
  Tmax: 16000, Trev: 8000, vert: 4000,     // N
  Ad: 0.38, Av: 0.2, eta: 0.85,            // area de disco de helice / de toberas, rendimiento
  yawTorque: 14000, rudderK: 800, planeK: 775,
  battery: 20,                              // kWh
  hotel: 1.2, lamp: 0.35,                   // kW
  o2Minutes: 100, testDepth: 150, crushDepth: 220,
  radius: 1.25,
};
const SPHERES = [new V3(0, 0, -1.9), new V3(0, 0, 0), new V3(0, 0, 1.9)];

// fraccion sumergida de un cilindro de radio r cuyo eje esta a altura y
const submerged = (y, r) => { const c = clamp(-y / r, -1, 1); return (Math.acos(-c) + c * Math.sqrt(1 - c * c)) / Math.PI; };

export class Submarine {
  constructor() {
    this.group = buildModel(this);
    this.pos = new V3(0, -18, 0); this.quat = new Q(); this.vel = new V3(); this.omega = new V3();
    this.ballast = 0.9167; this.thrust = 0; this.vup = 0;
    this.input = { fwd: 0, yaw: 0, heave: 0, pitch: 0, pump: 0 };
    this.battery = P.battery; this.o2 = 100; this.hull = 100;
    this.lights = true; this.powerKW = 0; this.impact = 0; this.alive = true; this.cause = '';
    this.fwd = new V3(0, 0, -1); this.speedFwd = 0; this.speed = 0; this.propPh = 0;
    this._cur = new V3(); this.lastTm = 0; this.lastFvert = 0; this.lastRudder = 0; this.sinceHit = 99; this.pumping = 0; this.stress = 0; this.touching = false;
  }
  get depth() { return -this.pos.y; }
  get mass() { return P.mHull + P.tank * this.ballast; }

  step(dt, t) {
    const R = P.rho, g = P.g, inp = this.input;
    const q = this.quat, qi = q.clone().invert();
    const depth = Math.max(0, -this.pos.y);
    const rhoW = R * (1 + 4.4e-5 * depth), V = P.V0 * (1 - 2e-5 * depth);
    const f = submerged(this.pos.y, 1.3);
    const m = this.mass;
    const Vd = P.V0 * f;
    const M = [m + P.added[0] * R * Vd, m + P.added[1] * R * Vd, m + P.added[2] * R * Vd];
    // actuadores (con retraso de primer orden)
    const powerOk = this.battery > 0 && this.alive;
    const cmd = powerOk ? inp.fwd : 0;
    this.thrust += (cmd - this.thrust) * Math.min(1, dt / 0.5);
    const Tm = this.thrust >= 0 ? this.thrust * P.Tmax : this.thrust * P.Trev;
    const heave = powerOk ? inp.heave : 0, pitchIn = powerOk ? inp.pitch : 0, yawIn = powerOk ? inp.yaw : 0;
    const Ff = clamp((heave + pitchIn * 0.6) * P.vert, -P.vert, P.vert), Fa = clamp((heave - pitchIn * 0.6) * P.vert, -P.vert, P.vert);
    this.vup += (heave - this.vup) * Math.min(1, dt / 0.4);

    const cur = currentAt(this.pos.x, this.pos.y, this.pos.z, t, this._cur);
    const vrel = this.vel.clone().sub(cur).applyQuaternion(qi);   // velocidad relativa al agua, ejes del casco
    const dens = Math.max(f, 0.002);
    const Fb = new V3(), Tq = new V3();
    const rB = new V3(0, P.BG, 0);
    // resistencia (cuadratica) aplicada en el centro de carena
    const Fd = new V3(-0.5 * R * dens * P.cdA[0] * Math.abs(vrel.x) * vrel.x, -0.5 * R * dens * P.cdA[1] * Math.abs(vrel.y) * vrel.y, -0.5 * R * dens * P.cdA[2] * Math.abs(vrel.z) * vrel.z);
    Fb.add(Fd); Tq.add(new V3().crossVectors(rB, Fd));
    // propulsion principal (eje -z, ligeramente bajo el CG) y toberas verticales
    const rT = new V3(0, 0.22, 1.9), FT = new V3(0, 0, -Tm * Math.min(1, f * 3));
    Fb.add(FT); Tq.add(new V3().crossVectors(rT, FT));
    for (const [F, z] of [[Ff, -1.3], [Fa, 1.3]]) { const Fv = new V3(0, F * Math.min(1, f * 3), 0); Fb.add(Fv); Tq.add(new V3().crossVectors(new V3(0, 1.0, z), Fv)); }
    // guinada: toberas laterales + timon (efectivo con velocidad)
    const Uf = -vrel.z; // velocidad de avance
    Tq.y += yawIn * (P.yawTorque + P.rudderK * Uf * Math.abs(Uf));
    Tq.x += pitchIn * P.planeK * Uf * Math.abs(Uf);
    // hidrostatica
    const FB = new V3(0, rhoW * g * V * f, 0);
    const FBb = FB.clone().applyQuaternion(qi);
    Tq.add(new V3().crossVectors(rB, FBb));
    const Fw = Fb.clone().applyQuaternion(q).add(FB).add(new V3(0, -m * g, 0));
    // aceleracion con masa anisotropica (ejes del casco)
    const ab = Fw.clone().applyQuaternion(qi); ab.set(ab.x / M[0], ab.y / M[1], ab.z / M[2]);
    this.vel.addScaledVector(ab.applyQuaternion(q), dt);
    // dinamica rotacional (Euler) + amortiguamiento hidrodinamico
    const w = this.omega, I = P.I;
    const Iw = new V3(I[0] * w.x, I[1] * w.y, I[2] * w.z), gyro = new V3().crossVectors(w, Iw);
    const dd = dens;
    w.x += ((Tq.x - gyro.x - dd * (P.rotC1[0] * w.x + P.rotC2[0] * Math.abs(w.x) * w.x)) / I[0]) * dt;
    w.y += ((Tq.y - gyro.y - dd * (P.rotC1[1] * w.y + P.rotC2[1] * Math.abs(w.y) * w.y)) / I[1]) * dt;
    w.z += ((Tq.z - gyro.z - dd * (P.rotC1[2] * w.z + P.rotC2[2] * Math.abs(w.z) * w.z)) / I[2]) * dt;
    const wl = w.length();
    if (wl > 1e-6) q.multiply(new Q().setFromAxisAngle(w.clone().divideScalar(wl), wl * dt)).normalize();
    this.pos.addScaledVector(this.vel, dt);
    this.collide(M);
    this.lastTm = Tm; this.lastFvert = Math.abs(Ff) + Math.abs(Fa); this.lastRudder = Math.abs(yawIn);
  }

  collide(M) {
    const q = this.quat, qi = q.clone().invert(), w = this.omega, I = P.I;
    this.touching = false;
    const Meff = (M[0] + M[1] + M[2]) / 3;
    const resolve = (rl, n, pen) => {
      this.pos.addScaledVector(n, pen);
      const rw = rl.clone().applyQuaternion(q);
      const vc = this.vel.clone().add(new V3().crossVectors(w.clone().applyQuaternion(q), rw));
      const vn = vc.dot(n);
      this.touching = true;
      if (vn >= 0) return;
      const nb = n.clone().applyQuaternion(qi), rxn = new V3().crossVectors(rl, nb);
      const Iinv = new V3(rxn.x / I[0], rxn.y / I[1], rxn.z / I[2]);
      const k = 1 / Meff + new V3().crossVectors(Iinv, rl).dot(nb);
      const e = vn < -0.35 ? 0.18 : 0;
      const j = -(1 + e) * vn / k;
      this.vel.addScaledVector(n, j / Meff);
      const jb = new V3().crossVectors(rl, nb).multiplyScalar(j);
      w.x += jb.x / I[0]; w.y += jb.y / I[1]; w.z += jb.z / I[2];
      const vt = vc.clone().addScaledVector(n, -vn), vtl = vt.length();
      if (vtl > 1e-3) this.vel.addScaledVector(vt.divideScalar(vtl), -Math.min(0.35 * j, vtl * k * 0.5) / Meff);
      const sp = -vn;
      if (sp > 0.7) { const dmg = Math.pow(sp - 0.7, 2) * 2.2; this.damage(dmg); this.impact = Math.max(this.impact, sp); }
      else if (sp > 0.25) this.impact = Math.max(this.impact, sp * 0.4);
    };
    for (const lp of SPHERES) {
      const c = lp.clone().applyQuaternion(q).add(this.pos);
      const h = heightAt(c.x, c.z);
      if (c.y - P.radius < h) {
        const nn = normalAt(c.x, c.z), n = new V3(nn.x, nn.y, nn.z);
        resolve(lp, n, (h - (c.y - P.radius)) * Math.max(n.y, 0.3));
      }
      for (const k of colliders) {
        const dx = c.x - k.x, dy = c.y - k.y, dz = c.z - k.z, rr = k.r + P.radius;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < rr && d > 1e-4) resolve(lp, new V3(dx / d, dy / d, dz / d), rr - d);
      }
    }
  }

  damage(pct) {
    if (!this.alive || pct <= 0) return;
    this.hull = Math.max(0, this.hull - pct); this.sinceHit = 0;
    if (this.hull <= 0) this.die('El casco cedió: el submarino se inunda.');
  }
  die(msg) { if (this.alive) { this.alive = false; this.cause = msg; } }

  // actualizacion por fotograma: recursos, helice y orientacion
  update(dt) {
    const f = submerged(this.pos.y, 1.3), depth = this.depth;
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    const vb = this.vel.clone().applyQuaternion(this.quat.clone().invert());
    this.speedFwd = -vb.z; this.speed = this.vel.length();
    this.sinceHit += dt; this.impact *= Math.exp(-dt * 4);
    const nzSurf = this.pos.y > -1.2;
    // potencia electrica (disco actuador: P = T^1.5 / sqrt(2 rho A))
    const Pm = Math.pow(Math.abs(this.lastTm || 0), 1.5) / Math.sqrt(2 * P.rho * P.Ad) / P.eta / 1000;
    const Pv = this.lastFvert ? 2 * Math.pow(this.lastFvert / 2, 1.5) / Math.sqrt(2 * P.rho * P.Av) / P.eta / 1000 : 0;
    const Py = Math.pow(this.lastRudder * P.yawTorque / 2.4, 1.5) / Math.sqrt(2 * P.rho * 0.15) / P.eta / 1000;
    const Pp = Math.abs(this.input.pump) * 0.8;
    this.powerKW = P.hotel + (this.lights ? 2 * P.lamp : 0) + Pm + Pv + Py + Pp;
    let gain = 0;
    if (nzSurf && this.alive) gain = 8;  // generador en superficie
    this.battery = clamp(this.battery + (gain - this.powerKW) * dt / 3600, 0, P.battery);
    if (nzSurf) this.o2 = Math.min(100, this.o2 + 4 * dt); else this.o2 = Math.max(0, this.o2 - dt * 100 / (P.o2Minutes * 60));
    if (this.o2 <= 0) this.die('Oxígeno agotado.');
    // estres por presion
    this.stress = clamp((depth - P.testDepth) / (P.crushDepth - P.testDepth), 0, 1);
    if (depth > P.testDepth) this.damage(dt * 0.3 * (1 + 4 * this.stress * this.stress));
    if (depth > P.crushDepth) this.die('Profundidad de colapso superada: el casco implosionó.');
    // lastre
    this.pumping = this.alive && this.battery > 0 ? this.input.pump : 0;
    this.ballast = clamp(this.ballast + this.pumping * 0.04 * dt, 0, 1);
    this.propPh += dt * (this.lastTm || 0) / P.Tmax * 40 + dt * 1.5;
    this.group.userData.prop.rotation.z = this.propPh;
    this.group.position.copy(this.pos); this.group.quaternion.copy(this.quat);
    const on = Math.sin(performance.now() * 0.004) > 0.7;
    this.group.userData.led.material.color.setRGB(on ? 1 : 0.1, on ? 0.08 : 0.01, on ? 0.08 : 0.01);
  }
}

// ---------- modelo 3D ----------
function buildModel() {
  const g = new THREE.Group();
  const mk = (color, o = {}) => patch(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, ...o }), { key: 'sub' });
  const yellow = mk(0xf2b100, { roughness: 0.32, metalness: 0.35, emissive: 0x3a2c00 }), dark = mk(0x23282e, {}),
    white = mk(0xe9edf0, {}), steel = mk(0x7c8791, {}), blue = mk(0x2c4a63);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const hullGeo = new THREE.CapsuleGeometry(1.2, 3.1, 10, 28); hullGeo.rotateX(Math.PI / 2); hullGeo.scale(1, 1.06, 1);
  add(hullGeo, yellow);
  add(new THREE.CylinderGeometry(1.215, 1.215, 0.18, 28, 1, true).rotateX(Math.PI / 2), dark, 0, 0, 0.3);
  // domo de acrilico + interior
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), patch(new THREE.MeshLambertMaterial({ color: 0xaadfee, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), { key: 'dome' }));
  dome.rotation.x = -Math.PI / 2; dome.position.set(0, 0.1, -2.05); g.add(dome);
  add(new THREE.BoxGeometry(0.7, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0x38d9a9 }), 0, 0.15, -1.5, -0.4);
  for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), dark, s * 0.45, -0.1, -0.7); add(new THREE.SphereGeometry(0.2, 12, 10), mk(0xd9a47c), s * 0.45, 0.4, -0.7); }
  // popa, helice y timones
  add(new THREE.CylinderGeometry(0.45, 1.0, 1.3, 20).rotateX(Math.PI / 2), yellow, 0, 0, 3.35);
  add(new THREE.TorusGeometry(0.62, 0.07, 8, 24), dark, 0, 0, 4.15);
  const prop = new THREE.Group(); prop.position.set(0, 0, 4.0); g.add(prop);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.04), steel); b.position.y = 0.3; b.rotation.z = 0; const piv = new THREE.Group(); piv.rotation.z = i * Math.PI / 2; piv.add(b); b.rotation.y = 0.5; prop.add(piv); }
  add(new THREE.SphereGeometry(0.14, 10, 8), steel, 0, 0, 4.0);
  add(new THREE.BoxGeometry(0.07, 1.7, 0.9), white, 0, 0.85, 3.5); add(new THREE.BoxGeometry(0.07, 1.3, 0.9), white, 0, -0.65, 3.5);
  add(new THREE.BoxGeometry(3.2, 0.07, 0.8), white, 0, 0, 3.3);
  // patines, tanques, toberas verticales, torreta
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8).rotateX(Math.PI / 2), dark, s * 0.85, -1.5, 0.1);
    for (const z of [-1.4, 1.5]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), dark, s * 0.85, -1.3, z);
    add(new THREE.CapsuleGeometry(0.3, 1.9, 4, 12).rotateX(Math.PI / 2), blue, s * 1.2, -0.55, 0.7);
  }
  for (const z of [-1.3, 1.3]) { const p = add(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 14, 1, true), dark, 0, 1.3, z); p.material.side = THREE.DoubleSide; }
  add(new THREE.CylinderGeometry(0.5, 0.58, 0.55, 16), white, 0, 1.38, 0.35);
  add(new THREE.TorusGeometry(0.42, 0.05, 6, 16).rotateX(Math.PI / 2), steel, 0, 1.68, 0.35);
  add(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), dark, 0.3, 2.3, 1.9);
  const led = add(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.3, 3.1, 1.9);
  // brazo manipulador
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), steel, 0.7, -0.95, -1.8, 1.0); add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), steel, 0.7, -1.2, -2.5, 1.7);
  add(new THREE.BoxGeometry(0.1, 0.06, 0.3), dark, 0.7, -1.2, -3.0);
  // focos
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 14).rotateX(Math.PI / 2), dark, s * 0.8, -0.1, -2.25);
    add(new THREE.CircleGeometry(0.15, 14), new THREE.MeshBasicMaterial({ color: 0xfff4cc, toneMapped: false }), s * 0.8, -0.1, -2.41).rotation.y = Math.PI;
  }
  g.userData.prop = prop; g.userData.led = led;
  g.userData.lampLocal = [new V3(-0.8, -0.1, -2.5), new V3(0.8, -0.1, -2.5)];
  return g;
}
