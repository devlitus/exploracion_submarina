import { noise2, fbm, smoothstep, lerp, clamp } from './noise.js';

// Puntos singulares del mundo (1 unidad = 1 metro, y = 0 es la superficie).
export const LM = {
  wreck:  { id: 'wreck',  x: 150,  z: 60,   floor: -34,  R1: 42, R2: 95,  tint: [0.42, 0.36, 0.30] },
  ruins:  { id: 'ruins',  x: -190, z: -70,  floor: -27,  R1: 48, R2: 100, tint: [0.78, 0.74, 0.62] },
  kelp:   { id: 'kelp',   x: -90,  z: 170,  floor: -23,  R1: 55, R2: 120, tint: null },
  arch:   { id: 'arch',   x: 60,   z: -210, floor: -31,  R1: 38, R2: 90,  tint: [0.7, 0.66, 0.55] },
  vents:  { id: 'vents',  x: -330, z: 260,  floor: -148, R1: 55, R2: 130, tint: [0.55, 0.32, 0.16] },
  whale:  { id: 'whale',  x: 300,  z: -280, floor: -112, R1: 45, R2: 110, tint: [0.72, 0.7, 0.62] },
};
const LMS = Object.values(LM);

export const MIN_Y = -188;

export function heightAt(x, z) {
  const big = fbm(x * 0.0013 + 10, z * 0.0013 - 7, 4, 1);
  let h = -58 + big * 78;
  const ridge = 1 - Math.abs(noise2(x * 0.0029, z * 0.0029, 5) * 1.4);
  h -= Math.pow(clamp(ridge, 0, 1), 7) * 75;
  h += fbm(x * 0.02, z * 0.02, 3, 9) * 5.5;
  h += noise2(x * 0.11, z * 0.11, 13) * 0.55;
  // cuenca de salida cerca del punto de partida
  const d0 = Math.hypot(x, z);
  const w0 = smoothstep(260, 70, d0);
  h = lerp(h, -42 + noise2(x * 0.03, z * 0.03, 3) * 3, w0);
  // puntos singulares: aplanan el terreno a su cota
  for (let i = 0; i < LMS.length; i++) {
    const L = LMS[i];
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.R2) {
      const m = smoothstep(L.R2, L.R1, d);
      h = lerp(h, L.floor + noise2(x * 0.07, z * 0.07, 21) * 0.5, m);
    }
  }
  if (h < -150) h = -150 + (h + 150) * 0.55;
  return Math.max(h, MIN_Y);
}

const _n = { x: 0, y: 1, z: 0 };
export function normalAt(x, z, e = 1.2) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  _n.x = -hx / l; _n.y = 2 * e / l; _n.z = -hz / l;
  return _n;
}

export function kelpDensity(x, z) {
  const n = noise2(x * 0.006 + 3, z * 0.006 - 2, 11) * 0.5 + 0.5;
  let d = smoothstep(0.55, 0.75, n);
  const k = LM.kelp;
  d = Math.max(d, smoothstep(k.R2, k.R1 * 0.4, Math.hypot(x - k.x, z - k.z)));
  return d;
}

export function landmarkTint(x, z, out) {
  for (let i = 0; i < LMS.length; i++) {
    const L = LMS[i];
    if (!L.tint) continue;
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.R2) {
      const m = smoothstep(L.R2, L.R1 * 0.6, d) * 0.75;
      out[0] = lerp(out[0], L.tint[0], m);
      out[1] = lerp(out[1], L.tint[1], m);
      out[2] = lerp(out[2], L.tint[2], m);
    }
  }
}

// Corrientes: marea lenta + movimiento orbital del oleaje (decae con exp(-k z)).
const G = 9.81, OMEGA = 1.05, KW = OMEGA * OMEGA / G;
export function currentAt(x, y, z, t, out) {
  const a = noise2(x * 0.0021 + t * 0.004, z * 0.0021, 31) * 3.0;
  const s = 0.14 + 0.1 * (noise2(x * 0.003, z * 0.003 + t * 0.003, 37) * 0.5 + 0.5);
  const depth = Math.max(0, -y);
  const wave = 0.32 * Math.exp(-KW * depth);
  const ph = OMEGA * t - KW * x;
  out.x = Math.cos(a) * s + wave * Math.cos(ph);
  out.y = wave * Math.sin(ph) * 0.8;
  out.z = Math.sin(a) * s;
  return out;
}
export const waveHeight = (x, z, t) => 0.45 * Math.sin(KW * x - OMEGA * t + z * 0.01) ;
