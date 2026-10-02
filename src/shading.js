import * as THREE from 'three';

// Uniformes globales compartidos por todos los materiales del mundo.
export const U = {
  uTime: { value: 0 },
  // coeficientes de absorcion del agua (1/m) para R, G, B (agua oceanica clara)
  uAbsorb: { value: new THREE.Vector3(0.28, 0.05, 0.018) },
  uSpotPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uSpotDir: { value: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)] },
  uSpotCol: { value: new THREE.Vector3(1, 0.94, 0.8) },
  uSpotOn: { value: 1 },
  uCaustic: { value: 1 },
};

const FRAG_DECL = /* glsl */`
uniform float uTime; uniform vec3 uAbsorb; uniform vec3 uSpotPos[2]; uniform vec3 uSpotDir[2];
uniform vec3 uSpotCol; uniform float uSpotOn; uniform float uCaustic;
varying vec3 vWPos; varying vec3 vWN;
float causticPattern(vec2 uv, float t){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0; vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
`;

const FRAG_MAIN = /* glsl */`
float fdep = max(0.0, -vWPos.y);
vec3 att = exp(-uAbsorb * fdep);
vec3 Nw = normalize(vWN);
vec3 spotL = vec3(0.0);
for (int si = 0; si < 2; si++) {
  vec3 Lv = uSpotPos[si] - vWPos; float sd = length(Lv); vec3 Ld = Lv / max(sd, 0.001);
  float cone = smoothstep(0.80, 0.94, dot(-Ld, uSpotDir[si]));
  float sa = exp(-0.04 * sd) / (1.0 + 0.010 * sd * sd);
  float ndl = max(dot(Nw, Ld), 0.0) * 0.8 + 0.2;
  spotL += cone * sa * ndl;
}
vec3 caus = vec3(0.0);
#ifdef UW_CAUSTICS
if (uCaustic > 0.0 && vWPos.y < 0.0 && vWPos.y > -70.0 && Nw.y > 0.2) {
  float cc = causticPattern(vWPos.xz * 0.08, uTime * 0.6) * 1.1;
  caus = diffuseColor.rgb * cc * max(Nw.y, 0.0) * att * 2.2 * uCaustic;
}
#endif
vec3 outgoingLight = (totalDiffuse + totalSpecular) * att + totalEmissiveRadiance + caus + diffuseColor.rgb * spotL * uSpotCol * uSpotOn * 5.5;
`;

export function patch(mat, o = {}) {
  const key = 'uw' + (o.key || '') + (o.caustics ? 'c' : '') + (o.frag === false ? 'n' : '');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN; uniform float uTime;
${o.vdecl || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = dot(instanceMatrix[3].xyz, vec3(0.37, 0.73, 0.51));
  float ihash = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
#else
  float ph = 0.0; float ihash = 0.0;
#endif
${o.vbody || ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
mat4 wm = modelMatrix;
#ifdef USE_INSTANCING
  wm = wm * instanceMatrix;
#endif
vWPos = (wm * vec4(transformed, 1.0)).xyz;
${o.frag === false ? 'vWN = vec3(0.0, 1.0, 0.0);' : 'vWN = normalize(mat3(wm) * objectNormal);'}`);
    if (o.frag !== false) {
      sh.fragmentShader = (o.caustics ? '#define UW_CAUSTICS\n' : '') + sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_DECL + (o.fdecl || ''))
        .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', 'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse; vec3 totalSpecular = vec3(0.0);\n' + FRAG_MAIN + (o.fbody || ''))
        .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', FRAG_MAIN + (o.fbody || ''));
    } else {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;');
    }
  };
  return mat;
}

// Estado optico del agua segun la profundidad de la camara (ley de Beer-Lambert).
const _c = new THREE.Color();
export function waterOptics(depth, fogColor, scene, renderer, lights) {
  const d = Math.max(0, depth);
  const a = U.uAbsorb.value;
  const scatter = [0.03, 0.34, 0.42];
  const k = 0.55;
  const fr = scatter[0] * Math.exp(-a.x * d * k) + 0.0006;
  const fg = scatter[1] * Math.exp(-a.y * d * k) + 0.0012;
  const fb = scatter[2] * Math.exp(-a.z * d * k) + 0.003;
  fogColor.setRGB(fr, fg, fb);
  const sunAt = Math.exp(-0.5 * (a.x + a.y + a.z) * d);
  return { sunAt, exposure: 1 + 1.5 * (1 - Math.exp(-d / 70)) };
}
