import * as THREE from 'three';
import { makeRng, clamp, lerp, smoothstep, noise2 } from './noise.js';
import { patch } from './shading.js';
import { prep, paint, merge } from './flora.js';

const M4 = THREE.Matrix4, V3 = THREE.Vector3;
const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  g.applyMatrix4(new M4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz)));
  return g;
};
const flat = (g, c) => paint(g, (x, y, z, col) => col.setRGB(c[0], c[1], c[2]));

// cuerpo de revolucion a lo largo de z (morro en +z)
function body(L, H, W, prof, back, belly, sa = 14, sl = 22) {
  const pos = [], idx = [];
  for (let i = 0; i <= sl; i++) {
    const t = i / sl, z = L * (0.5 - t), r = prof(t);
    for (let j = 0; j <= sa; j++) { const a = (j / sa) * 6.2832; pos.push(Math.cos(a) * r * W * 0.5, Math.sin(a) * r * H * 0.5, z); }
  }
  for (let i = 0; i < sl; i++) for (let j = 0; j < sa; j++) {
    const a = i * (sa + 1) + j, b = a + sa + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const ng = prep(g);
  return paint(ng, (x, y, z, c) => {
    const k = smoothstep(-0.12, 0.3, -y / (H * 0.5));
    c.setRGB(lerp(back[0], belly[0], k), lerp(back[1], belly[1], k), lerp(back[2], belly[2], k));
  });
}
// aleta vertical: puntos [z, y]
function finV(pts, col, x = 0) {
  const s = new THREE.Shape(); pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  const g = new THREE.ShapeGeometry(s); g.rotateY(-Math.PI / 2); g.translate(x, 0, 0);
  return flat(prep(g), col);
}
// aleta horizontal: puntos [x, z]
function finH(pts, col, y = 0) {
  const s = new THREE.Shape(); pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  return flat(prep(g), col);
}
const mir = (pts) => pts.map(([a, b]) => [-a, b]).reverse();

export function fishGeo(L, H, W, back, belly, fin, tailH = 0.6) {
  const prof = (t) => {
    let r = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.62);
    return Math.max(r, 0.1 * smoothstep(0.7, 0.95, t));
  };
  const parts = [body(L, H, W, prof, back, belly, 11, 16)];
  const tl = L * tailH;
  parts.push(finV([[-L * 0.46, 0], [-L * 0.5 - tl, tl * 0.75], [-L * 0.5 - tl * 0.7, 0], [-L * 0.5 - tl, -tl * 0.75]], fin));
  parts.push(finV([[L * 0.12, H * 0.42], [-L * 0.2, H * 0.4], [-L * 0.26, H * 0.95]], fin));
  const pf = [[W * 0.4, L * 0.12], [W * 0.4 + L * 0.16, -L * 0.04], [W * 0.4, -L * 0.04]];
  parts.push(finH(pf, fin, -H * 0.2), finH(mir(pf), fin, -H * 0.2));
  return merge(parts);
}

export function sharkGeo() {
  const L = 3.8, H = 0.62, W = 0.55, back = [0.28, 0.3, 0.32], belly = [0.82, 0.83, 0.82], fin = [0.22, 0.24, 0.26];
  const prof = (t) => Math.max(Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.7), 0.07 * smoothstep(0.7, 0.95, t));
  const parts = [body(L, H, W, prof, back, belly)];
  parts.push(flat(prep(T(new THREE.BoxGeometry(1.05, 0.07, 0.3), 0, 0, L * 0.5 - 0.1)), back));
  parts.push(finV([[-L * 0.44, 0], [-L * 0.5 - 0.5, 0.95], [-L * 0.5 - 0.1, 0.05], [-L * 0.5 - 0.35, -0.35]], fin));
  parts.push(finV([[0.45, H * 0.4], [-0.35, H * 0.4], [-0.15, 1.0]], fin));
  const pf = [[0.2, 0.3], [1.0, -0.45], [0.2, -0.3]];
  parts.push(finH(pf, fin, -0.15), finH(mir(pf), fin, -0.15));
  return merge(parts);
}

export function cetaceanGeo(L, H, W, sperm) {
  const back = sperm ? [0.2, 0.22, 0.25] : [0.35, 0.4, 0.46], belly = sperm ? [0.48, 0.48, 0.5] : [0.85, 0.86, 0.88], fin = sperm ? [0.16, 0.17, 0.2] : [0.25, 0.28, 0.32];
  const prof = sperm
    ? (t) => (t < 0.05 ? 0.78 * Math.sqrt(t / 0.05) : 0.78 + 0.22 * smoothstep(0.05, 0.3, t)) * (t < 0.5 ? 1 : lerp(1, 0.1, Math.pow((t - 0.5) / 0.5, 1.2)))
    : (t) => (t < 0.1 ? 0.35 + 0.5 * smoothstep(0, 0.1, t) * Math.sqrt(t / 0.1) * 0.4 : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7)) * (t > 0.2 ? 1 : 0.6 + t * 2);
  const g = body(L, H, W, (t) => Math.max(prof(t), 0.07 * smoothstep(0.7, 0.98, t)), back, belly, 16, 28);
  const parts = [g];
  const fl = L * 0.16, fw = L * 0.28;
  parts.push(finH([[0, -L * 0.45], [fw, -L * 0.5 - fl], [fw * 0.35, -L * 0.5 - fl * 0.35], [0, -L * 0.48], [-fw * 0.35, -L * 0.5 - fl * 0.35], [-fw, -L * 0.5 - fl]], fin));
  const pf = [[W * 0.45, L * 0.18], [W * 0.45 + L * 0.11, L * 0.06], [W * 0.45, L * 0.02]];
  parts.push(finH(pf, fin, -H * 0.3), finH(mir(pf), fin, -H * 0.3));
  parts.push(finV(sperm ? [[-L * 0.2, H * 0.5], [-L * 0.34, H * 0.5], [-L * 0.3, H * 0.72]] : [[0.0, H * 0.45], [-L * 0.14, H * 0.5], [-L * 0.1, H * 0.88]], fin));
  return merge(parts);
}

export function mantaGeo() {
  const L = 2.6, W = 6, T0 = 0.28, nz = 16, nx = 28, pos = [], idx = [], col = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let iz = 0; iz <= nz; iz++) {
      const u = (iz / nz) * 2 - 1;
      const s = (W / 2) * Math.max(0, 1 - Math.pow(Math.abs(u + 0.25), 1.4) / Math.pow(u < -0.25 ? 0.75 : 1.25, 1.4));
      for (let ix = 0; ix <= nx; ix++) {
        const v = (ix / nx) * 2 - 1, th = T0 * (1 - Math.pow(Math.abs(v), 1.4)) * (1 - u * u);
        pos.push(v * s, side > 0 ? th : -th * 0.4, -u * (L / 2));
        if (side > 0) { const shoulder = Math.abs(Math.abs(v) - 0.35) < 0.14 && u < -0.1 && u > -0.7; col.push(shoulder ? 0.75 : 0.07, shoulder ? 0.78 : 0.09, shoulder ? 0.8 : 0.12); }
        else col.push(0.88, 0.9, 0.92);
      }
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = base + iz * (nx + 1) + ix, b = a + nx + 1;
      if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const parts = [prep(g)];
  const tail = new THREE.ConeGeometry(0.07, 2.6, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -L / 2 - 1.2);
  parts.push(flat(prep(tail), [0.08, 0.1, 0.13]));
  for (const s of [-1, 1]) { const h = new THREE.ConeGeometry(0.1, 0.8, 5); h.rotateX(Math.PI / 2); h.translate(s * 0.4, 0, L / 2 + 0.2); parts.push(flat(prep(h), [0.08, 0.1, 0.13])); }
  return merge(parts);
}

export function turtleGeo() {
  const shell = new THREE.SphereGeometry(0.5, 18, 12); T(shell, 0, 0.08, 0, 0, 0, 0, 0.95, 0.38, 1.25);
  const shellP = paint(prep(shell), (x, y, z, c) => { const k = 0.65 + 0.35 * Math.abs(Math.sin(x * 9) * Math.sin(z * 7)); c.setRGB(0.28 * k + 0.06, 0.22 * k + 0.05, 0.1 * k); });
  const skin = [0.5, 0.45, 0.25];
  const parts = [shellP];
  parts.push(flat(prep(T(new THREE.SphereGeometry(0.17, 10, 8), 0, 0.12, 0.72, 0, 0, 0, 0.9, 0.85, 1.2)), skin));
  const ff = new THREE.SphereGeometry(0.5, 10, 6);
  for (const s of [-1, 1]) {
    parts.push(flat(prep(T(ff.clone(), s * 0.78, 0.0, 0.35, 0, 0, s * -0.25, 0.8, 0.07, 0.24)), skin));
    parts.push(flat(prep(T(ff.clone(), s * 0.34, 0.0, -0.5, 0, s * 0.3, 0, 0.32, 0.06, 0.14)), skin));
  }
  parts.push(flat(prep(T(new THREE.ConeGeometry(0.06, 0.3, 5), 0, 0, -0.68, -Math.PI / 2, 0, 0)), skin));
  return merge(parts);
}

// medusa: umbrela (y>0) + tentaculos (y<0). Ajustable para especie somera / abisal.
export function jellyGeo(deep) {
  const rng = makeRng(deep ? 21 : 17), pts = [];
  for (let k = 0; k <= 12; k++) { const th = (1 - k / 12) * Math.PI * 0.5 * 0.96; pts.push(new THREE.Vector2(0.5 * Math.sin(th) + 0.001, 0.36 * Math.cos(th))); }
  const bell = new THREE.LatheGeometry(pts, 22);
  const cb = deep ? [0.55, 0.04, 0.07] : [0.75, 0.88, 0.96];
  const parts = [paint(prep(bell), (x, y, z, c) => { const k = 0.7 + 0.3 * y / 0.36; c.setRGB(cb[0] * k, cb[1] * k, cb[2] * k); })];
  if (!deep) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.5; parts.push(flat(prep(T(new THREE.TorusGeometry(0.07, 0.025, 6, 10), Math.cos(a) * 0.19, 0.17, Math.sin(a) * 0.19, Math.PI / 2, 0, 0, 1, 1.1, 1)), [0.95, 0.5, 0.65])); }
  const ribbon = (x0, z0, len, w, col, wob) => {
    const n = 7, p = [], ix = [];
    for (let j = 0; j <= n; j++) { const t = j / n; const ox = Math.sin(t * 5 + wob) * 0.04 * t; p.push(x0 + ox - w * (1 - t * 0.5), -t * len, z0, x0 + ox + w * (1 - t * 0.5), -t * len, z0); }
    for (let j = 0; j < n; j++) { const a = j * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
    return flat(prep(g), col);
  };
  const nT = deep ? 14 : 24;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * 6.283;
    parts.push(T(ribbon(0, 0, (deep ? 1.6 : 0.8) * (0.7 + rng() * 0.8), 0.006, deep ? [0.8, 0.1, 0.12] : [0.85, 0.9, 1], rng() * 6), Math.cos(a) * 0.47, 0.0, Math.sin(a) * 0.47, 0, a, 0));
  }
  if (!deep) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283; parts.push(T(ribbon(0, 0, 0.9, 0.05, [0.9, 0.6, 0.8], i), Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1, 0, a, 0)); }
  return merge(parts);
}

export function anglerGeo() {
  const dark = [0.1, 0.07, 0.06], parts = [];
  parts.push(flat(prep(T(new THREE.SphereGeometry(0.5, 14, 10), 0, 0, -0.05, 0, 0, 0, 0.85, 0.85, 1.15)), dark));
  parts.push(flat(prep(T(new THREE.SphereGeometry(0.42, 12, 8, 0, 6.283, Math.PI / 2, Math.PI / 2), 0, -0.12, 0.38, -0.35, 0, 0, 0.95, 0.65, 1.15)), [0.07, 0.05, 0.05]));
  const tooth = new THREE.ConeGeometry(0.018, 0.2, 4);
  for (let i = 0; i < 18; i++) {
    const a = (i / 17 - 0.5) * 2.4, up = i % 2;
    parts.push(flat(prep(T(tooth.clone(), Math.sin(a) * 0.42, up ? 0.06 : -0.14, 0.62 + Math.cos(a) * 0.22, up ? Math.PI : 0, 0, 0)), [0.9, 0.88, 0.8]));
  }
  const stalk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, 0.38, 0.2), new V3(0, 0.75, 0.45), new V3(0, 0.82, 0.95)]), 8, 0.014, 4);
  parts.push(flat(prep(stalk), dark));
  parts.push(finV([[-0.5, 0.05], [-0.95, 0.28], [-0.95, -0.28]], dark));
  const pf = [[0.35, 0.1], [0.6, -0.15], [0.35, -0.15]];
  parts.push(finH(pf, dark, -0.15), finH(mir(pf), dark, -0.15));
  return merge(parts);
}
export const ANGLER_LURE = new V3(0, 0.82, 0.95);

export function squidGeo() {
  const red = [0.42, 0.07, 0.06], pale = [0.7, 0.45, 0.4], parts = [];
  const prof = (t) => Math.pow(smoothstep(0, 0.45, t), 0.6) * (1 - 0.35 * t);
  parts.push(body(3.2, 0.95, 0.95, (t) => Math.max(prof(t), 0.02), red, pale, 12, 18));
  parts.push(finH([[0, 1.45], [1.0, 0.7], [0, 0.0], [-1.0, 0.7]], red, 0));
  parts.push(flat(prep(T(new THREE.SphereGeometry(0.5, 12, 8), 0, 0, -1.85, 0, 0, 0, 1, 1, 1.2)), red));
  for (const s of [-1, 1]) {
    parts.push(flat(prep(T(new THREE.SphereGeometry(0.27, 12, 10), s * 0.48, 0.05, -1.75)), [0.02, 0.02, 0.03]));
    parts.push(flat(prep(T(new THREE.TorusGeometry(0.24, 0.025, 6, 14), s * 0.62, 0.05, -1.75, 0, Math.PI / 2, 0)), [0.8, 0.75, 0.6]));
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * 6.283, len = 3.2 + (k % 3) * 0.4;
    const g = new THREE.CylinderGeometry(0.015, 0.1, len, 6, 6); g.translate(0, -len / 2, 0); g.rotateX(Math.PI / 2);
    parts.push(flat(prep(T(g, Math.cos(a) * 0.22, Math.sin(a) * 0.22, -2.2)), red));
  }
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.012, 0.045, 8, 5, 10); g.translate(0, -4, 0); g.rotateX(Math.PI / 2);
    parts.push(flat(prep(T(g, s * 0.12, 0.1, -2.2)), pale));
    parts.push(flat(prep(T(new THREE.SphereGeometry(0.11, 8, 6), s * 0.12, 0.1, -10.3, 0, 0, 0, 1, 1, 2)), pale));
  }
  return merge(parts);
}

// ---------- materiales con animacion por vertex shader ----------
// mode 0: ondulacion lateral (x) / 1: vertical (y) / 2: aleteo de alas / 3: pulsacion de medusa
export function creatureMat(mode, o = {}) {
  const u = { uPh: { value: 0 }, uAmp: { value: o.amp ?? 0.12 }, uLen: { value: o.len ?? 1 }, uS0: { value: o.s0 ?? 0.5 }, uSpan: { value: o.span ?? 3 } };
  const bend = {
    0: `float s = clamp(uS0 - transformed.z / uLen, 0.0, 1.0); transformed.x += sin(uPh + ph * 6.0 - s * 4.0) * uAmp * s * s * uLen;`,
    1: `float s = clamp(uS0 - transformed.z / uLen, 0.0, 1.0); transformed.y += sin(uPh + ph * 6.0 - s * 4.0) * uAmp * s * s * uLen;`,
    2: `float wx = abs(transformed.x) / uSpan; float wgt = smoothstep(${(o.thr ?? 0.0).toFixed(2)}, 1.0, wx);
        transformed.y += sin(uPh - wx * 2.4) * uAmp * wgt * uSpan * (wx * 0.8 + 0.2);
        transformed.z -= 0.1 * uAmp * wgt * uSpan * sin(uPh - wx * 2.4 + 1.2);`,
    3: `float pl = sin(uPh + ph * 6.0);
        if (transformed.y > -0.001) { float k = 1.0 - transformed.y * 1.4; transformed.xz *= 1.0 + 0.16 * pl * k; transformed.y *= 1.0 - 0.14 * pl; }
        else { float d = -transformed.y; transformed.x += sin(uPh * 0.5 + d * 5.0 + ph * 9.0) * 0.07 * d; transformed.z += cos(uPh * 0.5 + d * 4.0 + ph * 7.0) * 0.07 * d;
               transformed.xz *= 1.0 - 0.12 * pl; }`,
  };
  const base = { vertexColors: !o.plain, side: THREE.DoubleSide, roughness: o.rough ?? 0.45, metalness: o.metal ?? 0.0 };
  if (o.transparent) Object.assign(base, { transparent: true, opacity: o.opacity ?? 0.55, depthWrite: false });
  if (o.emissive) Object.assign(base, { emissive: new THREE.Color(...o.emissive), emissiveIntensity: o.emissiveI ?? 1 });
  const m = new THREE.MeshStandardMaterial(base);
  patch(m, { uniforms: u, vdecl: 'uniform float uPh; uniform float uAmp; uniform float uLen; uniform float uS0; uniform float uSpan;', vbody: bend[mode], key: 'cr' + mode + (o.thr ?? 0) });
  m.userData.u = u;
  return m;
}
