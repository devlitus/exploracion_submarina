import * as THREE from 'three';
import { noise2, makeRng, clamp, lerp, smoothstep } from './noise.js';
import { heightAt, LM } from './terrain.js';
import { patch } from './shading.js';
import { GEO, MAT, prep, paint, merge } from './flora.js';

const M4 = THREE.Matrix4, V3 = THREE.Vector3;
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  g.applyMatrix4(new M4().compose(new V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new V3(sx, sy, sz)));
  return g;
};
const part = (g, r, gg, b) => paint(g, (x, y, z, c) => c.setRGB(r, gg, b));
const growth = (geo, amount = 1) => {
  const c = geo.attributes.color, p = geo.attributes.position;
  for (let i = 0; i < c.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise2(x * 0.45 + z * 0.3, z * 0.45 - y * 0.3, 61), v = 0.7 + 0.45 * (noise2(x * 2.2, z * 2.2 + y, 62) * 0.5 + 0.5);
    const g = smoothstep(0.0, 0.5, n) * amount;
    c.setXYZ(i, lerp(c.getX(i), 0.2, g * 0.55) * v, lerp(c.getY(i), 0.38, g * 0.55) * v, lerp(c.getZ(i), 0.2, g * 0.55) * v);
  }
  return geo;
};
const stdMat = (o = {}) => patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide, ...o }), { caustics: true, key: 'lm' });
const matSolid = stdMat();
const matBone = stdMat();

export const colliders = []; // esferas {x,y,z,r} en coordenadas de mundo
export const LANDMARKS = [];

function register(def, group, local, floorY) {
  group.updateMatrixWorld(true);
  for (const [x, y, z, r] of local) {
    const p = new V3(x, y, z).applyMatrix4(group.matrixWorld);
    colliders.push({ x: p.x, y: p.y, z: p.z, r });
  }
  LANDMARKS.push({ ...def, group, pos: new V3(LM[def.id].x, floorY + def.lift, LM[def.id].z) });
}

// ---------- pecio ----------
function buildWreck() {
  const rng = makeRng(101), P = [];
  const rust = () => [0.3 + rng() * 0.08, 0.17 + rng() * 0.05, 0.1];
  const B = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, col = rust()) => P.push(part(T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), ...col));
  const C = (rt, rb, h, x, y, z, rx, ry, rz, col = rust(), seg = 12) => P.push(part(T(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz), ...col));
  B(8, 0.5, 33, 0, 0.3, 0);
  B(0.4, 5.5, 8, 2.1, 3, 20, 0, -0.42, 0); B(0.4, 5.5, 8, -2.1, 3, 20, 0, 0.42, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 16; i++) {
    const z = -16 + i * 2 + 1;
    if (rng() > 0.2) B(0.32, 2.9, 1.95, s * 4, 1.9, z, 0, 0, s * 0.06);
    if (rng() > 0.55 + (i < 4 ? -0.3 : 0)) B(0.32, 2.9, 1.95, s * 4.3, 4.8, z, 0, 0, s * 0.1);
  }
  for (let i = 0; i < 17; i++) {
    const z = -16 + i * 2;
    for (const s of [-1, 1]) if (rng() > 0.2) B(0.22, 6.3, 0.22, s * 4.1, 3.3, z, 0, 0, s * 0.08);
    if (rng() > 0.45) B(8.2, 0.2, 0.22, 0, 6.1, z);
  }
  B(7, 0.3, 0.3, 0, 6.2, -9); B(0.3, 0.3, 28, 0, 6.2, 0);
  // casco de popa
  B(0.3, 4.5, 6, 3.5, 3.3, -11.5); B(0.3, 4.5, 6, -3.5, 3.3, -11.5); B(7.2, 4.5, 0.3, 0, 3.3, -14.5);
  B(2.8, 4.5, 0.3, 2.3, 3.3, -8.5); B(2.8, 4.5, 0.3, -2.3, 3.3, -8.5); B(7.2, 0.3, 6.2, 0.4, 5.4, -11.6, 0.05, 0.1, -0.12);
  C(1.35, 1.5, 6, 5, 1.6, -8, 0, 0, 1.45, [0.25, 0.14, 0.1]);
  C(0.2, 0.22, 15, -5.5, 2.0, 4, 0.1, 0, 1.3, [0.26, 0.2, 0.15], 7);
  B(0.15, 0.15, 5, -3.2, 3.6, 4, 0.1, 0.3, 0.2);
  C(1.7, 1.7, 5, 0, 2.3, -2, Math.PI / 2, 0, 0, [0.22, 0.14, 0.1], 14);
  C(0.3, 0.3, 5, 0, 1.2, -18.5, Math.PI / 2, 0, 0, [0.35, 0.3, 0.2], 8);
  for (let k = 0; k < 3; k++) B(0.2, 3, 0.5, 0, 1.2, -21.3, (k * 2.09), 0, 0, [0.5, 0.38, 0.12]);
  const cargo = [[0.55, 0.1, 0.08], [0.1, 0.25, 0.5], [0.12, 0.4, 0.2], [0.7, 0.4, 0.08], [0.5, 0.5, 0.52]];
  for (let i = 0; i < 6; i++) B(2.5, 2.7, 6, 8 + rng() * 5, 1.3 + (i > 3 ? 2.7 : 0), -9 + (i % 4) * 6.5 + rng(), 0, rng() * 0.6 - 0.3, rng() * 0.2, cargo[i % 5]);
  const geo = growth(merge(P), 1);
  const mesh = new THREE.Mesh(geo, matSolid);
  const g = new THREE.Group(); g.add(mesh);
  const floor = heightAt(LM.wreck.x, LM.wreck.z);
  g.position.set(LM.wreck.x, floor - 0.6, LM.wreck.z); g.rotation.set(0.04, 0.7, 0.26);
  const loc = []; for (let z = -14; z <= 16; z += 5) loc.push([0, 3, z, 4.6]);
  loc.push([0, 4, -11.5, 4.2], [10, 2, 0, 4.5], [10, 2, -6, 3.5], [10, 2, 7, 3.5]);
  register({ id: 'wreck', name: "Pecio del «Santa Clara»", radius: 62, lift: 8, text: 'Los naufragios funcionan como arrecifes artificiales: en pocos años el acero oxidado se cubre de corales, esponjas y cardúmenes.' }, g, loc, floor);
  return g;
}

// ---------- ruinas ----------
function buildRuins() {
  const rng = makeRng(202), P = [], loc = [];
  const floor = heightAt(LM.ruins.x, LM.ruins.z);
  const mar = () => { const v = 0.78 + rng() * 0.1; return [v, v * 0.97, v * 0.86]; };
  const B = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => P.push(part(T(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), ...mar()));
  const col = (x, z, h, tilt = 0, fallen = false) => {
    const g = new THREE.CylinderGeometry(0.85, 0.95, h, 14, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.05 * Math.cos(a * 16); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    if (fallen) P.push(part(T(g, x, 0.9, z, 0.04, rng() * 3, Math.PI / 2 + 0.03), ...mar()));
    else {
      P.push(part(T(g, x, 0.6 + h / 2, z, tilt, 0, tilt * 0.7), ...mar()));
      B(2.6, 0.6, 2.6, x, 0.3, z); B(2.4, 0.5, 2.4, x, 0.6 + h + 0.25, z, tilt, 0, tilt * 0.7);
      loc.push([x, 4, z, 1.5]);
    }
  };
  B(34, 0.6, 34, 0, 0.3, 0); B(31, 0.6, 31, 0, 0.9, 0); B(28, 0.6, 28, 0, 1.5, 0);
  const R = 12, N = 14, local = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 6.283, x = Math.cos(a) * R, z = Math.sin(a) * R;
    const r = rng();
    if (r < 0.2) col(x, z, 7.5, 0, true); else col(x, z, r < 0.5 ? 3 + rng() * 3 : 9, (rng() - 0.5) * 0.06);
    if (r > 0.5) {
      const a2 = ((i + 1) / N) * 6.283;
      B(2 * R * Math.sin(Math.PI / N) + 0.3, 0.9, 1.8, (x + Math.cos(a2) * R) / 2, 11.1, (z + Math.sin(a2) * R) / 2, 0, -(a + Math.PI / N) + Math.PI / 2, 0);
    }
  }
  for (let i = 0; i < 6; i++) col((rng() - 0.5) * 8, (rng() - 0.5) * 8, 2 + rng() * 6, 0, rng() < 0.4);
  for (let i = 0; i < 8; i++) B(1.4 + rng() * 2, 1 + rng(), 1.4 + rng() * 2, (rng() - 0.5) * 36, 0.5, (rng() - 0.5) * 36, 0, rng() * 3, 0);
  // estatua truncada
  B(2.6, 2.2, 2.6, 0, 2.4, 0); P.push(part(T(new THREE.CapsuleGeometry(0.7, 2.4, 3, 8), 0, 4.9, 0, 0, 0, 0.08), 0.8, 0.78, 0.7)); loc.push([0, 4, 0, 2]);
  const geo = growth(merge(P), 1.1);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, matSolid));
  g.position.set(LM.ruins.x, floor + 0.2, LM.ruins.z);
  // anforas
  const am = new THREE.LatheGeometry([[0, 0], [0.18, 0.03], [0.3, 0.3], [0.32, 0.5], [0.2, 0.75], [0.1, 0.95], [0.16, 1.0], [0.14, 1.03]].map(p => new THREE.Vector2(p[0], p[1])), 10);
  paint(am, (x, y, z, c) => c.setRGB(0.62, 0.3, 0.16));
  const amph = new THREE.InstancedMesh(am, MAT.coral, 26), o = new THREE.Object3D();
  for (let i = 0; i < 26; i++) {
    const a = rng() * 6.28, r = 8 + rng() * 12;
    const x = LM.ruins.x + Math.cos(a) * r, z = LM.ruins.z + Math.sin(a) * r;
    o.position.set(x, heightAt(x, z) + 0.1, z); o.rotation.set(rng() < 0.6 ? 1.4 : 0, rng() * 6, rng() * 0.5); o.scale.setScalar(1 + rng() * 0.8); o.updateMatrix();
    amph.setMatrixAt(i, o.matrix);
    amph.setColorAt(i, new THREE.Color().setRGB(0.9 + rng() * 0.2, 0.9, 0.9));
  }
  amph.computeBoundingSphere();
  g.userData.extra = amph;
  register({ id: 'ruins', name: 'Ruinas sumergidas', radius: 62, lift: 6, text: 'Como en Pavlopetri (Grecia), puertos y templos pueden quedar bajo el mar cuando se hunde la costa o sube el nivel del agua: ciudades de hace más de 5 000 años.' }, g, loc, floor);
  return [g, amph];
}

// ---------- arco natural ----------
function buildArch() {
  const floor = heightAt(LM.arch.x, LM.arch.z);
  const g0 = new THREE.TorusGeometry(13, 4.6, 14, 30, Math.PI);
  const p = g0.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * noise2(x * 0.25 + z * 0.15, y * 0.25, 71) + 0.07 * noise2(x * 1.1, y * 1.1 + z, 72);
    p.setXYZ(i, x * k, y * k, z * k * 1.5);
  }
  g0.computeVertexNormals();
  const g1 = paint(prep(g0), (x, y, z, c) => { const v = 0.55 + 0.4 * (noise2(x * 0.6, y * 0.6 + z * 0.4, 73) * 0.5 + 0.5); c.setRGB(v * 0.9, v * 0.88, v * 0.82); });
  const geo = growth(g1, 0.7);
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, matSolid));
  g.position.set(LM.arch.x, floor - 1.2, LM.arch.z); g.rotation.y = 0.5;
  const loc = [];
  for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; loc.push([Math.cos(a) * 13, Math.sin(a) * 13, 0, 5.3]); }
  loc.push([13, 0, 0, 5.5], [-13, 0, 0, 5.5]);
  register({ id: 'arch', name: 'Arco natural de roca', radius: 60, lift: 14, text: 'Siglos de oleaje y corrientes esculpen la roca hasta abrir túneles y arcos. Las corrientes que los atraviesan se aceleran y traen alimento: son oasis de vida.' }, g, loc, floor);
  return g;
}

// ---------- campo hidrotermal ----------
let ventUniform = null;
export const ventTops = [];
function buildVents() {
  const floor = heightAt(LM.vents.x, LM.vents.z), rng = makeRng(303), P = [], loc = [];
  const g = new THREE.Group(); g.position.set(LM.vents.x, floor, LM.vents.z);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rng(), r = i === 0 ? 0 : 10 + rng() * 20, h = i === 0 ? 15 : 4 + rng() * 9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, rb = 1.8 + rng() * 2;
    const cg = new THREE.CylinderGeometry(rb * 0.32, rb, h, 12, 6, true);
    const p = cg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
      const f = 1 + 0.25 * noise2(px * 0.9 + i * 5, py * 0.7 + pz * 0.9, 81);
      p.setXYZ(k, px * f, py, pz * f);
    }
    cg.translate(x, h / 2 - 0.5, z);
    paint(cg, (px, py, pz, c) => { const t = clamp((py + 0.5) / h, 0, 1); const v = 0.8 + 0.4 * noise2(px, py * 1.5 + pz, 82); c.setRGB((0.16 + t * 0.2 + (t > 0.85 ? 0.35 : 0)) * v, (0.12 + t * 0.12 + (t > 0.85 ? 0.2 : 0)) * v, (0.1 + t * 0.03) * v); });
    P.push(cg);
    ventTops.push(new V3(x, h - 0.5, z).add(g.position));
    for (let k = 0; k < 4; k++) loc.push([x, (h * (k + 0.5)) / 4, z, rb * (1 - 0.5 * k / 4) + 0.6]);
  }
  g.add(new THREE.Mesh(merge(P), matSolid));
  // gusanos tubo
  const worms = new THREE.InstancedMesh(GEO.tubeworm, MAT.tubeworm, 260), o = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const t = ventTops[(rng() * n) | 0], a = rng() * 6.28, r = 3 + rng() * 9;
    const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    o.position.set(x, heightAt(x, z) - 0.1, z); o.rotation.set((rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3); o.scale.setScalar(0.6 + rng() * 1.1); o.updateMatrix();
    worms.setMatrixAt(i, o.matrix);
  }
  worms.computeBoundingSphere();
  // humo negro + resplandor
  const pts = 160 * n, base = new Float32Array(pts * 3), seed = new Float32Array(pts);
  for (let i = 0; i < pts; i++) { const t = ventTops[i % n]; base.set([t.x, t.y, t.z], i * 3); seed[i] = rng(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3)); geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  ventUniform = { uTime: { value: 0 } };
  const smoke = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: ventUniform, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 aBase; attribute float aSeed; uniform float uTime; varying float vA; varying float vH;
      void main(){ float age = fract(uTime*0.06 + aSeed); float rise = age*45.0;
        vec3 p = aBase + vec3(sin(aSeed*40.+age*3.)*age*6.+age*age*8., rise, cos(aSeed*53.+age*2.7)*age*6.);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp((6.0+age*70.0)*(260.0/-mv.z), 2.0, 140.0); vA = (1.0-age)*smoothstep(0.0,0.04,age); vH = 1.0-age; }`,
    fragmentShader: `varying float vA; varying float vH;
      void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.05,d)*vA*0.42;
        vec3 c = mix(vec3(0.02,0.02,0.025), vec3(0.45,0.2,0.07), pow(vH,5.0)); gl_FragColor = vec4(c, a); }`,
  }));
  smoke.frustumCulled = false;
  const light = new THREE.PointLight(0xff6a22, 40, 55, 1.6); light.position.copy(ventTops[0]).sub(g.position).add(new V3(0, 3, 0)); g.add(light);
  g.userData.extra = [worms, smoke];
  g.userData.update = (t) => { ventUniform.uTime.value = t; light.intensity = 38 + Math.sin(t * 3.1) * 5 + Math.sin(t * 7.7) * 3; };
  register({ id: 'vents', name: 'Campo hidrotermal', radius: 70, lift: 12, text: 'Fumarolas negras que expulsan agua a ~350 °C. Sin luz solar, la vida se basa en la quimiosíntesis: bacterias que oxidan sulfuro de hidrógeno alimentan a los gusanos tubo gigantes (Riftia).' }, g, loc, floor);
  return [g, worms, smoke];
}

// ---------- cadaver de ballena ----------
function buildWhaleFall() {
  const floor = heightAt(LM.whale.x, LM.whale.z), rng = makeRng(404), P = [], loc = [];
  const bone = () => { const v = 0.78 + rng() * 0.14; return [v, v * 0.95, v * 0.82]; };
  const spine = (i) => ({ x: Math.sin(i * 0.22) * 2.2, y: 0.9 + Math.sin(i * 0.5) * 0.15, z: -11 + i * 0.95 });
  for (let i = 0; i < 24; i++) {
    const s = spine(i), r = 0.55 * (1 - i / 36) + 0.15;
    P.push(part(T(new THREE.CylinderGeometry(r, r * 1.05, 0.7, 8), s.x, s.y, s.z, Math.PI / 2, 0, 0), ...bone()));
    P.push(part(T(new THREE.BoxGeometry(0.2, 0.9 * (1 - i / 40), 0.35), s.x, s.y + 0.6, s.z), ...bone()));
    if (i % 3 === 0) loc.push([s.x, 1, s.z, 1.2]);
    if (i > 2 && i < 17) for (const side of [-1, 1]) {
      const len = 3.4 * Math.sin((i - 2) / 15 * Math.PI) + 1.2;
      const rib = new THREE.TorusGeometry(len, 0.13 - i * 0.002, 6, 14, Math.PI * 0.8);
      P.push(part(T(rib, s.x + side * 0.3, s.y, s.z, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? 0 : Math.PI, 1, 1, 1), ...bone()));
    }
  }
  const sk = spine(-4);
  P.push(part(T(new THREE.SphereGeometry(1, 14, 10), sk.x, 1.5, sk.z - 1, 0, 0, 0, 2.1, 1.3, 4.6), ...bone()));
  P.push(part(T(new THREE.BoxGeometry(2.4, 0.5, 8), sk.x, 0.4, sk.z - 1.5), ...bone()));
  loc.push([sk.x, 1.5, sk.z - 1, 3], [sk.x, 1.2, sk.z - 4, 2.6]);
  const geo = growth(merge(P), 0.2);
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, matBone));
  g.position.set(LM.whale.x, floor, LM.whale.z); g.rotation.y = -0.6;
  // gusanos de hueso (Osedax)
  const worms = new THREE.InstancedMesh(GEO.tubeworm, MAT.tubeworm, 140), o = new THREE.Object3D();
  g.updateMatrixWorld(true);
  for (let i = 0; i < 140; i++) {
    const s = spine((rng() * 24) | 0), l = new V3(s.x + (rng() - 0.5) * 5, 0.2, s.z + (rng() - 0.5) * 2).applyMatrix4(g.matrixWorld);
    o.position.copy(l); o.rotation.set((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.4); o.scale.setScalar(0.18 + rng() * 0.25); o.updateMatrix();
    worms.setMatrixAt(i, o.matrix);
  }
  worms.computeBoundingSphere();
  g.userData.extra = worms;
  register({ id: 'whale', name: 'Cadáver de ballena', radius: 62, lift: 6, text: 'Un solo cuerpo de ballena puede alimentar un ecosistema entero del fondo durante más de 50 años: primero carroñeros, luego gusanos que devoran el hueso y, al final, bacterias.' }, g, loc, floor);
  return [g, worms];
}

export function buildLandmarks(scene) {
  const out = [buildWreck(), ...buildRuins(), buildArch(), ...buildVents(), ...buildWhaleFall()];
  for (const o of out) scene.add(o);
  // la nube de kelp es un punto sin malla propia
  LANDMARKS.push({ id: 'kelp', name: 'Bosque de kelp gigante', radius: 60, lift: -6, pos: new V3(LM.kelp.x, heightAt(LM.kelp.x, LM.kelp.z) - 6, LM.kelp.z), text: 'El kelp (Macrocystis pyrifera) puede crecer hasta 50 cm al día y alcanzar 45 m: es uno de los ecosistemas más productivos del planeta y refugio de nutrias, peces y erizos.' });
  return {
    update(t) { for (const l of LANDMARKS) l.group?.userData.update?.(t); },
  };
}
