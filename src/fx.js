import * as THREE from 'three';
import { U } from './shading.js';
import { makeRng } from './noise.js';

const V3 = THREE.Vector3;
const TAIL = `\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n`;
export const SUN_DIR = new V3(0.35, 0.82, 0.25).normalize();

export function createFX(scene, camera) {
  const shared = {
    uTime: U.uTime, uUnder: { value: 0 }, uFog: { value: new THREE.Color() }, uWin: { value: new V3(1, 1, 1) },
    uSun: { value: SUN_DIR }, uCam: { value: new V3() }, uFogD: { value: 0.012 },
  };
  // ---------- cielo / cupula de la superficie vista desde abajo ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    uniforms: shared, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uUnder; uniform vec3 uFog; uniform vec3 uWin; uniform vec3 uSun; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float sd = max(dot(d, uSun), 0.0); vec3 col;
        if (uUnder < 0.5) {
          vec3 hor = vec3(0.45,0.7,0.9), zen = vec3(0.06,0.25,0.65);
          col = mix(hor, zen, pow(clamp(d.y,0.0,1.0), 0.55)); col += vec3(1.0,0.9,0.7) * (pow(sd, 900.0) * 20.0 + pow(sd, 12.0) * 0.12);
          col = mix(col, vec3(0.05,0.2,0.3), smoothstep(0.0,-0.25,d.y));
        } else {
          float win = smoothstep(0.62, 0.7, d.y);                      // ventana de Snell: cos(48.6 grados) = 0.66
          vec3 sk = mix(vec3(0.5,0.75,0.95), vec3(0.1,0.35,0.8), d.y) + vec3(1.0,0.9,0.7) * pow(sd, 300.0) * 30.0;
          col = uFog * (0.55 + 0.9 * smoothstep(-0.3, 1.0, d.y)) + sk * uWin * win * 1.4;
          col = mix(col, uFog * 0.5, smoothstep(0.0, -0.6, d.y) * 0.6);
        }
        gl_FragColor = vec4(col, 1.0); ${TAIL} }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // ---------- superficie del agua ----------
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uUnder, uFogD; uniform vec3 uFog, uWin, uSun, uCam; varying vec3 vW;
      vec3 wn(vec2 p){ float t = uTime; vec2 g = vec2(0.0);
        g += vec2(cos(p.x*0.9+t*1.1+p.y*0.3), cos(p.y*0.8+t*0.9)) * 0.05;
        g += vec2(cos(p.x*2.3-t*1.7+p.y*1.1), cos(p.y*2.1+t*1.4-p.x*0.7)) * 0.035;
        g += vec2(cos(p.x*5.1+t*2.3), cos(p.y*5.7-t*2.1+p.x*1.3)) * 0.018;
        return normalize(vec3(-g.x, 1.0, -g.y)); }
      void main(){ vec3 V = normalize(uCam - vW); vec3 N = wn(vW.xz); float dist = length(uCam - vW); vec3 col; float a = 1.0;
        if (uUnder > 0.5) {
          float c = clamp(dot(V, -N), 0.0, 1.0); float s2 = 1.33 * 1.33 * (1.0 - c * c);
          if (s2 >= 1.0) { col = uFog * (0.7 + 0.5 * N.x); }       // reflexion total interna
          else { vec3 r = refract(-V, -N, 1.33); float sd = max(dot(normalize(r), uSun), 0.0);
            col = (mix(vec3(0.5,0.75,0.95), vec3(0.1,0.35,0.8), clamp(r.y,0.0,1.0)) + vec3(1.0,0.9,0.7) * pow(sd, 400.0) * 40.0) * uWin * 1.5; }
          float f = 1.0 - exp(-pow(dist * uFogD, 2.0)); col = mix(col, uFog, f);
        } else {
          float c = clamp(dot(V, N), 0.0, 1.0); float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
          vec3 R = reflect(-V, N); vec3 skyc = mix(vec3(0.5,0.72,0.9), vec3(0.08,0.3,0.7), pow(clamp(R.y,0.0,1.0), 0.5));
          col = mix(vec3(0.0,0.2,0.28), skyc, F) + vec3(1.0,0.9,0.7) * pow(max(dot(R, uSun), 0.0), 500.0) * 12.0;
          a = clamp(0.62 + F * 0.4 + (1.0 - c) * 0.2, 0.0, 1.0);
        }
        gl_FragColor = vec4(col, a); ${TAIL} }`,
  }));
  surf.renderOrder = 5; surf.frustumCulled = false; scene.add(surf);

  // ---------- nieve marina ----------
  const NS = 2600, seed = new Float32Array(NS * 3), rng = makeRng(77);
  for (let i = 0; i < NS * 3; i++) seed[i] = rng();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const snow = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { ...U, uCam: shared.uCam, uFog: shared.uFog, uBox: { value: 80 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 aSeed; uniform vec3 uCam; uniform float uTime, uBox, uSpotOn; uniform vec3 uFog, uSpotPos[2], uSpotDir[2]; varying float vB; varying float vA;
      void main(){ vec3 p = aSeed * uBox + vec3(sin(uTime*0.23 + aSeed.x*40.0)*0.6, -uTime*0.12 + sin(uTime*0.4+aSeed.y*20.0)*0.2, cos(uTime*0.19 + aSeed.z*50.0)*0.6);
        p = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5 + uCam;
        vec4 mv = viewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv;
        float sp = 0.0; for (int i = 0; i < 2; i++){ vec3 L = uSpotPos[i] - p; float d = length(L); sp += smoothstep(0.78, 0.95, dot(-L/d, uSpotDir[i])) * exp(-0.04*d) * 3.0 / (1.0 + 0.01*d*d); }
        vB = sp * uSpotOn; float dist = -mv.z; vA = (0.35 + vB) * smoothstep(uBox*0.5, uBox*0.25, dist) * step(p.y, -1.0);
        gl_PointSize = clamp((1.3 + aSeed.x * 2.0) * (220.0 / dist), 1.0, 7.0); }`,
    fragmentShader: `uniform vec3 uFog; varying float vB; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA;
      vec3 c = uFog * 2.2 + vec3(1.0, 0.95, 0.8) * vB * 0.9; gl_FragColor = vec4(c, a * 0.8); ${TAIL} }`,
  }));
  snow.frustumCulled = false; scene.add(snow);

  // ---------- rayos de luz ----------
  const shafts = new THREE.Group(), SH = [];
  const shMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vU; varying vec3 vWp; void main(){ vU = uv; vec4 w = modelMatrix * vec4(position,1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uI; uniform vec3 uWin; varying vec2 vU; varying vec3 vWp;
      void main(){ float e = smoothstep(0.0, 0.5, vU.x) * smoothstep(1.0, 0.5, vU.x); float v = pow(clamp(1.0 + vWp.y / 70.0, 0.0, 1.0), 1.5);
        float fl = 0.65 + 0.35 * sin(uTime * 0.8 + vWp.x * 0.7 + vWp.z * 0.5); vec3 c = uWin * vec3(0.7,1.0,1.0) * e * v * fl * uI; gl_FragColor = vec4(c, 1.0); ${TAIL} }`,
  });
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 + rng() * 7, 80), shMat);
    m.position.y = -38; shafts.add(m); SH.push({ ox: rng() * 260, oz: rng() * 260, lean: (rng() - 0.5) * 0.12 });
  }
  shafts.frustumCulled = false; scene.add(shafts);

  // ---------- haces de los focos ----------
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 1 }, uK: { value: 0.1 }, uFog: shared.uFog }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vZ = -position.z / 46.0; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOn, uK; varying vec3 vN; varying vec3 vV; varying float vZ;
      void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float l = pow(1.0 - clamp(vZ,0.0,1.0), 1.8) * smoothstep(0.0, 0.04, vZ);
        vec3 c = vec3(1.0,0.95,0.78) * e * l * uK * uOn; gl_FragColor = vec4(c, 1.0); ${TAIL} }`,
  });
  const beamGeo = new THREE.CylinderGeometry(15, 0.15, 46, 28, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -23);
  const beams = [new THREE.Mesh(beamGeo, beamMat), new THREE.Mesh(beamGeo, beamMat)];
  beams.forEach((b) => { b.frustumCulled = false; b.renderOrder = 4; });

  // ---------- pulso de sonar ----------
  const ring = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(vec3(0.2,0.9,0.85) * f * uA * 1.6, 1.0); ${TAIL} }`,
  }));
  ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 6; scene.add(ring);
  let ringT = 99;

  // ---------- burbujas (el radio sigue la ley de Boyle: r ~ P^-1/3) ----------
  const NB = 260, bp = new Float32Array(NB * 3), bs = new Float32Array(NB), bb = new Float32Array(NB), bl = new Float32Array(NB).fill(-1), bv = new Float32Array(NB * 3);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bg.setAttribute('aSize', new THREE.BufferAttribute(bs, 1));
  const bubbles = new THREE.Points(bg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uFog: shared.uFog },
    vertexShader: `attribute float aSize; uniform vec3 uFog; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * 260.0 / -mv.z, 0.0, 30.0); }`,
    fragmentShader: `uniform vec3 uFog; void main(){ float d = length(gl_PointCoord-0.5); float rim = smoothstep(0.5,0.38,d) * (0.35 + smoothstep(0.25,0.48,d)); gl_FragColor = vec4((uFog*3.0 + 0.5) * rim * 0.55, 1.0); ${TAIL} }`,
  }));
  bubbles.frustumCulled = false; scene.add(bubbles);
  let bi = 0;
  const emit = (p, v, size) => {
    const i = bi++ % NB;
    bp[i * 3] = p.x; bp[i * 3 + 1] = p.y; bp[i * 3 + 2] = p.z;
    bv[i * 3] = v.x; bv[i * 3 + 1] = v.y; bv[i * 3 + 2] = v.z; bl[i] = 6 + Math.random() * 4; bb[i] = size;
  };

  const _a = new V3(), _b = new V3();
  return {
    attachBeams(subGroup) { beams.forEach((b, i) => { b.position.copy(subGroup.userData.lampLocal[i]); b.rotation.x = -0.04; subGroup.add(b); }); },
    ping(origin) { ring.position.copy(origin); ringT = 0; ring.visible = true; },
    emitBubbles(p, n, spread = 0.5) { for (let i = 0; i < n; i++) emit(_a.copy(p).add(_b.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)), _b.set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3), 0.05 + Math.random() * 0.06); },
    setEnabled(on) { snow.visible = on; beams.forEach((b) => (b.visible = on)); this.fxOn = on; },
    update(dt, st) {
      shared.uUnder.value = st.under ? 1 : 0; shared.uFog.value.copy(st.fog); shared.uWin.value.copy(st.win); shared.uCam.value.copy(camera.position);
      shared.uFogD.value = st.fogDensity;
      sky.position.copy(camera.position);
      surf.position.set(camera.position.x, 0, camera.position.z);
      shafts.visible = st.under && this.fxOn !== false;
      shMat.uniforms.uI.value = 0.22 * Math.exp(-st.camDepth / 38) * (st.under ? 1 : 0);
      const cx = camera.position.x, cz = camera.position.z;
      shafts.children.forEach((m, i) => {
        const s = SH[i], x = cx + ((((s.ox - cx) % 260) + 390) % 260) - 130, z = cz + ((((s.oz - cz) % 260) + 390) % 260) - 130;
        m.position.set(x, -38, z); m.rotation.set(0, Math.atan2(cx - x, cz - z), s.lean, 'YXZ');
      });
      beamMat.uniforms.uOn.value = st.lamps ? 1 : 0; beamMat.uniforms.uK.value = 0.09 + 0.07 * (1 - Math.exp(-st.camDepth / 40));
      if (ringT < 3) { ringT += dt; const r = ringT * 110; ring.scale.setScalar(Math.max(r, 0.1)); ring.material.uniforms.uA.value = Math.max(0, 1 - ringT / 3) * (r < 3 ? r / 3 : 1) * 0.5; if (ringT >= 3) ring.visible = false; }
      for (let i = 0; i < NB; i++) {
        if (bl[i] < 0) { bs[i] = 0; continue; }
        bl[i] -= dt;
        bv[i * 3] += (Math.sin(performance.now() * 0.004 + i) * 0.4 - bv[i * 3]) * dt;
        bp[i * 3] += bv[i * 3] * dt; bp[i * 3 + 1] += bv[i * 3 + 1] * dt; bp[i * 3 + 2] += bv[i * 3 + 2] * dt;
        if (bp[i * 3 + 1] > -0.05) bl[i] = -1;
        bs[i] = bb[i] * Math.pow(1 + Math.max(0, -bp[i * 3 + 1]) / 10.3, -1 / 3);
      }
      bg.attributes.position.needsUpdate = true; bg.attributes.aSize.needsUpdate = true;
    },
    boyle(depth) { return Math.pow(1 + depth / 10.3, -1 / 3); },
  };
}
