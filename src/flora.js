import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2, hash2, makeRng, smoothstep, clamp, lerp } from './noise.js';
import { heightAt, kelpDensity, landmarkTint } from './terrain.js';
import { patch } from './shading.js';

export const CS = 96;      // tamano de chunk (m)
export const SEG = 40;
export const LOD = { s: 1 };   // escala de densidad de vegetacion (calidad)     // segmentos por lado

// ---------- helpers de geometria ----------
export const prep = (g) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  return g;
};
export function paint(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), col, i);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
export const merge = (list) => {
  const ps = list.map(prep), r = mergeGeometries(ps, false);
  if (!r) throw new Error('merge fallo: ' + ps.map((g) => Object.keys(g.attributes).join('+')).join(' | '));
  return r;
};
const M4 = THREE.Matrix4, V3 = THREE.Vector3;

// ---------- geometrias base ----------
function grassGeo() {
  const rng = makeRng(3);
  const pos = [], nor = [], col = [], idx = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = rng() * 6.283, r = rng() * 0.14;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 0.55 + rng() * 0.6, w = 0.045 + rng() * 0.02, lean = (rng() - 0.5) * 0.5;
    const ca = Math.cos(a + 1.2), sa = Math.sin(a + 1.2);
    const base = pos.length / 3;
    for (let j = 0; j <= 4; j++) {
      const t = j / 4, y = t * h, ww = w * (1 - t * 0.85), off = lean * t * t;
      for (const s of [-1, 1]) {
        pos.push(bx + ca * ww * s + Math.cos(a) * off, y, bz + sa * ww * s + Math.sin(a) * off);
        nor.push(0, 0.9, 0.43);
        const g = 0.35 + 0.65 * t;
        col.push(0.18 * g + 0.05, 0.42 * g + 0.05, 0.12 * g);
      }
    }
    for (let j = 0; j < 4; j++) {
      const k = base + j * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function kelpGeo() {
  const pos = [], nor = [], col = [];
  const N = 22;
  const tri = (a, b, c, ca, cb, cc) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) nor.push(0, 0.6, 0.8);
    col.push(...ca, ...cb, ...cc);
  };
  for (let j = 0; j < N; j++) {
    const y0 = j / N, y1 = (j + 1) / N, w = 0.05;
    const c0 = [0.3 + y0 * 0.15, 0.24 + y0 * 0.2, 0.05], c1 = [0.3 + y1 * 0.15, 0.24 + y1 * 0.2, 0.05];
    tri([-w, y0, 0], [w, y0, 0], [-w, y1, 0], c0, c0, c1);
    tri([w, y0, 0], [w, y1, 0], [-w, y1, 0], c0, c1, c1);
    if (j > 1) {
      for (let s = 0; s < 2; s++) {
        const ang = j * 2.4 + s * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
        const L = 0.5 + 0.25 * Math.sin(j * 1.7);
        const tip = [ca * L, y0 + 0.07, sa * L];
        const lc = [0.42, 0.45, 0.07], lt = [0.62, 0.6, 0.12];
        tri([0, y0, 0], [ca * 0.12 - sa * 0.12, y0 + 0.012, sa * 0.12 + ca * 0.12], tip, lc, lc, lt);
        tri([0, y0, 0], tip, [ca * 0.12 + sa * 0.12, y0 + 0.012, sa * 0.12 - ca * 0.12], lc, lt, lc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function branchingCoral() {
  const rng = makeRng(5), parts = [];
  const rec = (m, len, r, depth) => {
    const g = new THREE.CylinderGeometry(r * 0.72, r, len, 5, 1);
    g.translate(0, len / 2, 0); g.applyMatrix4(m); parts.push(g);
    if (!depth) return;
    const n = depth === 3 ? 3 : 2 + (rng() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const nm = m.clone().multiply(new M4().makeTranslation(0, len * 0.92, 0))
        .multiply(new M4().makeRotationFromEuler(new THREE.Euler((rng() - 0.5) * 1.2, rng() * 6.28, (rng() - 0.5) * 1.2)));
      rec(nm, len * 0.74, r * 0.7, depth - 1);
    }
  };
  rec(new M4(), 0.42, 0.055, 3);
  const g = merge(parts);
  return paint(g, (x, y, z, c) => { const t = clamp(y / 1.1, 0, 1); c.setRGB(0.55 + 0.45 * t, 0.55 + 0.45 * t, 0.55 + 0.45 * t); });
}

function tableCoral() {
  const top = new THREE.CylinderGeometry(1, 0.9, 0.07, 18, 1);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r > 0.5) {
      const k = 1 + 0.12 * Math.sin(a * 6) + 0.06 * Math.sin(a * 13);
      p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, p.getY(i) + 0.05 * Math.sin(a * 5) + (r - 0.5) * -0.06);
    }
  }
  top.translate(0, 0.62, 0);
  const stem = new THREE.CylinderGeometry(0.1, 0.17, 0.62, 5, 1, true); stem.translate(0, 0.31, 0);
  const g = merge([top, stem]);
  return paint(g, (x, y, z, c) => { const r = Math.hypot(x, z); const t = y > 0.55 ? 0.7 + 0.3 * r : 0.5; c.setRGB(t, t, t); });
}

function brainCoral() {
  const g = new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.045 * Math.sin(x * 34 + Math.sin(z * 21) * 2) * Math.sin(z * 30 + Math.sin(y * 17));
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return paint(prep(g), (x, y, z, c) => { const t = 0.7 + 0.3 * Math.sin(x * 34 + Math.sin(z * 21) * 2) * Math.sin(z * 30); c.setRGB(t, t, t); });
}

function fanCoral() {
  const rng = makeRng(8), parts = [];
  const rec = (x, y, ang, len, depth) => {
    const w = 0.012 + depth * 0.004;
    const g = new THREE.PlaneGeometry(w * 1.6, len);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(new M4().makeRotationZ(ang).setPosition(x, y, 0));
    parts.push(g);
    if (depth === 0) return;
    const ex = x - Math.sin(ang) * len, ey = y + Math.cos(ang) * len;
    const n = depth > 2 ? 3 : 2;
    for (let k = 0; k < n; k++) rec(ex, ey, ang + (k - (n - 1) / 2) * 0.55 + (rng() - 0.5) * 0.25, len * 0.78, depth - 1);
  };
  rec(0, 0, 0, 0.25, 4);
  const g = merge(parts);
  return paint(g, (x, y, z, c) => { const t = 0.6 + 0.4 * clamp(y / 1.2, 0, 1); c.setRGB(t, t, t); });
}

function spongeTubes() {
  const rng = makeRng(12), parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.4 + rng() * 0.7, r = 0.1 + rng() * 0.07;
    const g = new THREE.CylinderGeometry(r * 1.25, r, h, 10, 1, true);
    g.translate((rng() - 0.5) * 0.45, h / 2, (rng() - 0.5) * 0.45);
    parts.push(g);
  }
  return paint(merge(parts), (x, y, z, c) => { const t = 0.55 + 0.45 * clamp(y / 1.0, 0, 1); c.setRGB(t, t, t); });
}

function anemoneGeo() {
  const rng = makeRng(15), parts = [];
  const base = new THREE.CylinderGeometry(0.11, 0.14, 0.12, 10); base.translate(0, 0.06, 0); parts.push(base);
  for (let i = 0; i < 26; i++) {
    const a = rng() * 6.28, r = Math.sqrt(rng()) * 0.1, h = 0.22 + rng() * 0.15;
    const g = new THREE.ConeGeometry(0.014, h, 4); g.translate(0, h / 2, 0);
    g.applyMatrix4(new M4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)).setPosition(Math.cos(a) * r, 0.1, Math.sin(a) * r));
    parts.push(g);
  }
  return paint(merge(parts), (x, y, z, c) => { const t = clamp(0.5 + y * 1.3, 0.5, 1.1); c.setRGB(t, t, t); });
}

function starfishGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.07 : 0.24, a = (i / 10) * 6.283 + 1.57;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return paint(prep(g), (x, y, z, c) => { const t = 0.75 + 0.25 * Math.sin(Math.hypot(x, z) * 60); c.setRGB(t, t, t); });
}

function seaPenGeo() {
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.012, 0.025, 0.5, 5); stalk.translate(0, 0.25, 0); parts.push(stalk);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.BoxGeometry(0.2 - i * 0.012, 0.012, 0.03);
    f.rotateY(0); f.translate(0, 0.28 + i * 0.045, 0);
    f.applyMatrix4(new M4().makeRotationY(i * 0.5));
    parts.push(f);
  }
  return paint(merge(parts), (x, y, z, c) => { const t = y < 0.28 ? 0.4 : 1; c.setRGB(t, t, t); });
}

function rockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.32 * noise2(v.x * 1.5 + v.y, v.z * 1.5 - v.y, 3) + 0.1 * noise2(v.x * 5, v.z * 5 + v.y * 3, 4);
    p.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k);
  }
  g.computeVertexNormals();
  return paint(prep(g), (x, y, z, c) => { const t = 0.62 + 0.38 * noise2(x * 4, z * 4 + y * 2, 6); c.setRGB(t, t * 0.98, t * 0.95); });
}

function tubewormGeo() {
  const parts = [];
  const tube = new THREE.CylinderGeometry(0.045, 0.06, 1.2, 7); tube.translate(0, 0.6, 0); parts.push(tube);
  const plume = new THREE.SphereGeometry(0.1, 8, 6); plume.scale(1, 1.5, 1); plume.translate(0, 1.28, 0); parts.push(plume);
  return paint(merge(parts), (x, y, z, c) => { if (y > 1.15) c.setRGB(0.9, 0.08, 0.08); else c.setRGB(0.95, 0.93, 0.88); });
}

export const GEO = {
  grass: grassGeo(), kelp: kelpGeo(), branch: branchingCoral(), table: tableCoral(), brain: brainCoral(),
  fan: fanCoral(), sponge: spongeTubes(), anemone: anemoneGeo(), star: starfishGeo(), seapen: seaPenGeo(),
  rock: rockGeo(), tubeworm: tubewormGeo(),
};

// ---------- materiales ----------
const std = (extra = {}) => { const { roughness, metalness, ...rest } = extra; return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...rest }); };
const SWAY = (amp, freq, yscale = 1.0) => ({
  vbody: `{ float hy = position.y * ${yscale.toFixed(2)};
    float cur = sin(uTime * ${freq.toFixed(2)} + ph * 3.0 + hy * 2.6) + 0.5 * sin(uTime * ${(freq * 1.9).toFixed(2)} + ph + hy * 5.0);
    transformed.x += cur * ${amp.toFixed(3)} * hy * hy; transformed.z += cos(uTime * ${freq.toFixed(2)} * 0.8 + ph) * ${amp.toFixed(3)} * 0.6 * hy * hy; }`,
});
export const MAT = {
  terrain: patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { caustics: true, key: 'ter' }),
  grass: patch(std({ roughness: 0.9 }), { ...SWAY(0.22, 1.4), caustics: true, key: 'gr' }),
  kelp: patch(std({ roughness: 0.7 }), { ...SWAY(1.8, 0.7), key: 'kl' }),
  coral: patch(std(), { caustics: true, key: 'co' }),
  anemone: patch(std({ roughness: 0.6 }), { ...SWAY(0.5, 1.6), caustics: true, key: 'an' }),
  fan: patch(std(), { ...SWAY(0.12, 1.1), caustics: true, key: 'fa' }),
  seapen: patch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { ...SWAY(0.14, 1.0), frag: false, key: 'sp' }),
  rock: patch(std({ roughness: 1 }), { caustics: true, key: 'rk' }),
  tubeworm: patch(std({ roughness: 0.5 }), { ...SWAY(0.06, 1.3), key: 'tw' }),
};

const PAL = {
  branch: [[1, .45, .62], [1, .62, .25], [.85, .5, 1], [.98, .88, .35], [.6, .85, .5]],
  table: [[.9, .75, .35], [.55, .85, .75], [.85, .5, .5]],
  brain: [[.75, .85, .5], [.95, .75, .45], [.7, .7, .9]],
  anemone: [[1, .35, .6], [.4, 1, .6], [1, .6, .2]],
  fan: [[.95, .12, .2], [.8, .25, .85], [1, .72, .1]],
  sponge: [[.8, .2, .6], [1, .55, .15], [.9, .85, .25], [.35, .55, 1]],
  star: [[1, .35, .1], [.9, .2, .25], [1, .6, .25]],
  seapen: [[.2, 1, .9], [.55, .55, 1], [1, .35, .85], [.3, 1, .45]],
  rock: [[.85, .83, .8], [.7, .72, .75], [.9, .8, .7]],
};

// ---------- construccion de chunks ----------
const _o = new THREE.Object3D();
const _q = new THREE.Quaternion(), _up = new V3(0, 1, 0), _nv = new V3();

export function buildChunk(cx, cz, ring) {
  const x0 = cx * CS, z0 = cz * CS, cell = CS / SEG, W = SEG + 3;
  const H = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) H[j * W + i] = heightAt(x0 + (i - 1) * cell, z0 + (j - 1) * cell);
  const NV = (SEG + 1) * (SEG + 1);
  const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
  const NY = new Float32Array(NV);
  const tint = [0, 0, 0];
  for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
    const k = j * (SEG + 1) + i, gx = i + 1, gz = j + 1;
    const h = H[gz * W + gx];
    const dhx = (H[gz * W + gx + 1] - H[gz * W + gx - 1]) / (2 * cell), dhz = (H[(gz + 1) * W + gx] - H[(gz - 1) * W + gx]) / (2 * cell);
    const l = Math.hypot(dhx, 1, dhz);
    const x = x0 + i * cell, z = z0 + j * cell;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    nor[k * 3] = -dhx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dhz / l;
    NY[k] = 1 / l;
    // color del lecho: arena clara -> limo oscuro; roca en pendientes; algas en la zona fotica
    const d = -h, slope = 1 - 1 / l;
    const n1 = noise2(x * 0.05, z * 0.05, 51) * 0.5 + 0.5, n2 = noise2(x * 0.4, z * 0.4, 52) * 0.5 + 0.5;
    const sandK = Math.exp(-d / 90);
    let r = lerp(0.36, 0.86, sandK), g = lerp(0.32, 0.77, sandK), b = lerp(0.27, 0.56, sandK);
    const rock = smoothstep(0.1, 0.32, slope);
    r = lerp(r, 0.4, rock); g = lerp(g, 0.39, rock); b = lerp(b, 0.38, rock);
    const alg = smoothstep(0.55, 0.8, n1) * smoothstep(60, 8, d) * (1 - rock);
    r = lerp(r, 0.28, alg * 0.6); g = lerp(g, 0.45, alg * 0.6); b = lerp(b, 0.22, alg * 0.6);
    const ripple = 1 + 0.06 * Math.sin((x * 0.9 + n1 * 6) * 1.2) * (1 - rock) * smoothstep(80, 10, d);
    const v = (0.82 + 0.3 * n2) * ripple;
    tint[0] = r; tint[1] = g; tint[2] = b;
    landmarkTint(x, z, tint);
    col[k * 3] = tint[0] * v; col[k * 3 + 1] = tint[1] * v; col[k * 3 + 2] = tint[2] * v;
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let t = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const terrain = new THREE.Mesh(geo, MAT.terrain);
  const group = new THREE.Group();
  group.add(terrain);

  // muestreo bilinear del malla
  const sample = (x, z) => {
    const fx = clamp((x - x0) / cell, 0, SEG - 0.001), fz = clamp((z - z0) / cell, 0, SEG - 0.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h00 = H[(j + 1) * W + i + 1], h10 = H[(j + 1) * W + i + 2], h01 = H[(j + 2) * W + i + 1], h11 = H[(j + 2) * W + i + 2];
    return { h: lerp(lerp(h00, h10, u), lerp(h01, h11, u), v), ny: NY[Math.round(fz) * (SEG + 1) + Math.round(fx)] };
  };

  const rng = makeRng((hash2(cx, cz, 77) * 4294967296) >>> 0);
  const lists = {};
  const col3 = new THREE.Color();
  const add = (type, x, y, z, yaw, sx, sy, sz, tilt, color) => {
    (lists[type] ||= []);
    _o.position.set(x, y, z);
    if (tilt) {
      const s = sample(x, z);
      const nx = (nor[(Math.round((z - z0) / cell) * (SEG + 1) + Math.round((x - x0) / cell)) * 3]) || 0;
      const nzv = (nor[(Math.round((z - z0) / cell) * (SEG + 1) + Math.round((x - x0) / cell)) * 3 + 2]) || 0;
      _nv.set(nx * tilt, 1, nzv * tilt).normalize();
      _q.setFromUnitVectors(_up, _nv);
      _o.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(_up, yaw));
    } else _o.rotation.set(0, yaw, 0);
    _o.scale.set(sx, sy, sz);
    _o.updateMatrix();
    lists[type].push({ m: _o.matrix.clone(), c: color });
  };
  const pick = (arr) => arr[(rng() * arr.length) | 0];
  const rr = (a, b) => a + rng() * (b - a);

  const near = ring <= 1, mid = ring <= 2;
  // pradera de pastos marinos
  if (near) for (let n = 0; n < 200 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 3 || d > 34 || s.ny < 0.9) continue;
    if (noise2(x * 0.035, z * 0.035, 41) < -0.05) continue;
    const sc = rr(0.8, 1.7);
    add('grass', x, s.h - 0.03, z, rng() * 6.28, sc, sc * rr(0.8, 1.3), sc, 0, [0.9 + rng() * 0.2, 1, 0.8 + rng() * 0.3]);
  }
  // bosque de kelp
  if (mid) for (let n = 0; n < 90 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 8 || d > 40 || s.ny < 0.82) continue;
    if (rng() > kelpDensity(x, z)) continue;
    const hgt = d > 30 ? rr(16, 26) : clamp(d - 1.5 - rng() * 2.5, 5, 28);
    add('kelp', x, s.h - 0.05, z, rng() * 6.28, rr(0.8, 1.3), hgt, rr(0.8, 1.3), 0, [0.85 + rng() * 0.3, 0.9 + rng() * 0.2, 0.8 + rng() * 0.3]);
  }
  // arrecife de coral
  if (mid) for (let n = 0; n < 90 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 3 || d > 48 || s.ny < 0.7) continue;
    const reef = noise2(x * 0.021 + 5, z * 0.021, 17) * 0.5 + 0.5;
    if (rng() > smoothstep(0.5, 0.66, reef) * (1 - d / 55)) continue;
    const q = rng(), yaw = rng() * 6.28;
    if (q < 0.4) { const sc = rr(0.7, 1.9); add('branch', x, s.h - 0.05, z, yaw, sc, sc, sc, 0.5, pick(PAL.branch)); }
    else if (q < 0.6) { const sc = rr(0.8, 2.2); add('table', x, s.h - 0.05, z, yaw, sc, sc, sc, 0.3, pick(PAL.table)); }
    else if (q < 0.78) { const sc = rr(0.8, 2.6); add('brain', x, s.h - 0.05, z, yaw, sc, sc, sc, 0.3, pick(PAL.brain)); }
    else if (q < 0.9 && near) { const sc = rr(0.9, 1.8); add('anemone', x, s.h - 0.03, z, yaw, sc, sc, sc, 0.3, pick(PAL.anemone)); }
    else { const sc = rr(0.9, 2.4); add('fan', x, s.h - 0.05, z, yaw, sc, sc, sc, 0.6, pick(PAL.fan)); }
  }
  // gorgonias y esponjas de aguas medias
  if (mid) for (let n = 0; n < 50 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 20 || d > 115 || s.ny < 0.55) continue;
    if (noise2(x * 0.03 + 9, z * 0.03, 19) < 0.0) continue;
    if (rng() < 0.45) { const sc = rr(1.0, 3.2); add('fan', x, s.h - 0.05, z, rng() * 6.28, sc, sc, sc, 0.6, pick(PAL.fan)); }
    else { const sc = rr(0.8, 2.4); add('sponge', x, s.h - 0.05, z, rng() * 6.28, sc, sc, sc, 0.4, pick(PAL.sponge)); }
  }
  // estrellas de mar
  if (near) for (let n = 0; n < 30 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 4 || d > 70 || s.ny < 0.9 || rng() > 0.35) continue;
    const sc = rr(0.7, 1.6); add('star', x, s.h + 0.02, z, rng() * 6.28, sc, sc, sc, 0.2, pick(PAL.star));
  }
  // plumas de mar bioluminiscentes (zona profunda)
  if (mid) for (let n = 0; n < 130 * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z), d = -s.h;
    if (d < 62 || s.ny < 0.82) continue;
    if (rng() > smoothstep(62, 100, d) * 0.7) continue;
    const sc = rr(0.9, 2.2); add('seapen', x, s.h - 0.03, z, rng() * 6.28, sc, sc * rr(0.8, 1.5), sc, 0, pick(PAL.seapen));
  }
  // rocas
  for (let n = 0; n < (near ? 45 : 18) * LOD.s; n++) {
    const x = x0 + rng() * CS, z = z0 + rng() * CS, s = sample(x, z);
    const thr = 0.12 + (1 - s.ny) * 1.2;
    if (rng() > thr) continue;
    const big = rng() < 0.08 ? rr(3, 7) : rr(0.4, 2.2);
    add('rock', x, s.h + big * 0.1, z, rng() * 6.28, big * rr(0.8, 1.4), big * rr(0.6, 1.1), big * rr(0.8, 1.4), 0.3, pick(PAL.rock));
  }

  const meshes = [];
  for (const type in lists) {
    const L = lists[type];
    const mesh = new THREE.InstancedMesh(GEO[type], MAT[type === 'branch' || type === 'table' || type === 'brain' || type === 'sponge' || type === 'star' ? 'coral' : type], L.length);
    for (let i = 0; i < L.length; i++) {
      mesh.setMatrixAt(i, L[i].m);
      col3.setRGB(L[i].c[0], L[i].c[1], L[i].c[2]);
      mesh.setColorAt(i, col3);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (type === 'kelp') mesh.boundingSphere.radius += 6;
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    group, cx, cz,
    dispose() { geo.dispose(); for (const m of meshes) m.dispose(); },
  };
}
