import './style.css';
import * as THREE from 'three';
import { U, waterOptics } from './shading.js';
import { buildChunk, CS, LOD } from './flora.js';
import { heightAt, kelpDensity, LM } from './terrain.js';
import { buildLandmarks, LANDMARKS, ventTops } from './landmarks.js';
import { Submarine, P } from './sub.js';
import { createFauna, SP } from './fauna.js';
import { createFX, SUN_DIR } from './fx.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const SPECIES_COUNT = Object.keys(SP).length;

// ---------- renderer / escena ----------
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pr = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(pr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a4a58, 0.012);
const camera = new THREE.PerspectiveCamera(66, 1, 0.2, 1400);
scene.add(new THREE.HemisphereLight(0xcfeaff, 0x2a4a5a, 1.1));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.6); sunLight.position.copy(SUN_DIR).multiplyScalar(100); scene.add(sunLight);
const fogColor = new THREE.Color();
scene.background = fogColor;

const sub = new Submarine();
scene.add(sub.group);
sub.quat.setFromAxisAngle(new V3(0, 1, 0), -1.95);
const fx = createFX(scene, camera);
fx.attachBeams(sub.group);
const landmarksSys = buildLandmarks(scene);
const fauna = createFauna(scene);
const sound = new Sound();

// ---------- chunks ----------
const chunks = new Map();
let RAD = 3; LOD.s = 1.9;
// calidad: 0 baja, 1 media, 2 alta
const QUAL = [
  { name: 'BAJA', rad: 1, caustic: 0, fx: false, prCap: 0.6, fogK: 1.8, lod: 0.5 },
  { name: 'MEDIA', rad: 2, caustic: 1, fx: true, prCap: 1, fogK: 1, lod: 1 },
  { name: 'ALTA', rad: 3, caustic: 1, fx: true, prCap: 1.5, fogK: 0.9, lod: 1.9 },
];
let quality = 2, Qc = QUAL[2];
function setQuality(q, silent) {
  quality = q; Qc = QUAL[q]; RAD = Qc.rad; LOD.s = Qc.lod; U.uCaustic.value = Qc.caustic;
  pr = Math.min(pr, Qc.prCap); renderer.setPixelRatio(pr); resize();
  if (!silent) toast(`<span class="toast-k">GRÁFICOS</span><b>Calidad ${Qc.name}</b><span>Pulsa G para cambiar.</span>`, 2200);
}
function updateChunks(budget) {
  const ccx = Math.floor(sub.pos.x / CS), ccz = Math.floor(sub.pos.z / CS);
  const need = [];
  for (let dz = -RAD; dz <= RAD; dz++) for (let dx = -RAD; dx <= RAD; dx++) {
    const key = (ccx + dx) + ',' + (ccz + dz);
    if (!chunks.has(key)) need.push([Math.hypot(dx, dz), ccx + dx, ccz + dz, key, Math.max(Math.abs(dx), Math.abs(dz))]);
  }
  need.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < Math.min(budget, need.length); i++) {
    const [, cx, cz, key, ring] = need[i];
    const c = buildChunk(cx, cz, ring); scene.add(c.group); chunks.set(key, c);
  }
  for (const [key, c] of chunks) if (Math.abs(c.cx - ccx) > RAD + 1 || Math.abs(c.cz - ccz) > RAD + 1) { scene.remove(c.group); c.dispose(); chunks.delete(key); }
  return need.length;
}

// ---------- entrada ----------
const keys = new Set();
let started = false, camMode = 0, camYaw = 0, camPitch = 0.28, camDist = 15, dragging = false, lastDrag = 0, fpYaw = 0, fpPitch = 0;
addEventListener('keydown', (e) => {
  if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (!started) return;
  if (e.code === 'KeyF') { sub.lights = !sub.lights; toast(sub.lights ? 'Focos encendidos' : 'Focos apagados'); }
  if (e.code === 'KeyV') { camMode ^= 1; $('app').classList.toggle('cockpit', camMode === 1); sub.group.visible = true; }
  if (e.code === 'KeyE') sonarPing();
  if (e.code === 'KeyG') setQuality((quality + 1) % 3);
  if (e.code === 'KeyH' || e.code === 'Slash') $('help').classList.toggle('hidden');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const keyChips = [...document.querySelectorAll('.key[data-k]')].map((el) => [el, el.dataset.k.split(' ')]);
function updateKeyChips() { for (const [el, codes] of keyChips) el.classList.toggle('pressed', codes.some((c) => keys.has(c))); }
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; lastDrag = performance.now(); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  if (camMode === 0) { camYaw -= e.movementX * 0.006; camPitch = Math.min(1.3, Math.max(-0.35, camPitch + e.movementY * 0.005)); }
  else { fpYaw = Math.max(-1.2, Math.min(1.2, fpYaw - e.movementX * 0.004)); fpPitch = Math.max(-0.7, Math.min(0.7, fpPitch - e.movementY * 0.004)); }
});
canvas.addEventListener('wheel', (e) => { camDist = Math.min(40, Math.max(7, camDist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: true });
$('help-button').onclick = () => $('help').classList.toggle('hidden');
$('close-help').onclick = () => $('help').classList.add('hidden');
$('sonar-button').onclick = () => sonarPing();

function readInput() {
  const k = (c) => (keys.has(c) ? 1 : 0), i = sub.input;
  i.fwd = k('KeyW') - k('KeyS'); i.yaw = k('KeyA') - k('KeyD'); i.heave = k('Space') - (k('ShiftLeft') || k('ShiftRight'));
  i.pitch = k('ArrowUp') - k('ArrowDown'); i.pump = k('KeyZ') - k('KeyX');
  updateKeyChips();
}

// ---------- mensajes y descubrimientos ----------
let toastT = 0;
function toast(html, ms = 3200) { const t = $('toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const discovered = [];
function discover(kind, name, sci, text) {
  discovered.unshift({ kind, name, sci, text });
  $('discovery-count').textContent = `${discovered.length} / ${LANDMARKS.length + SPECIES_COUNT}`;
  const list = $('discovery-list');
  list.innerHTML = discovered.map((d) => `<div class="disc ${d.kind}"><b>${d.name}</b>${d.sci ? `<i>${d.sci}</i>` : ''}<small>${d.text}</small></div>`).join('');
  toast(`<span class="toast-k">${kind === 'place' ? 'LUGAR DESCUBIERTO' : 'ESPECIE REGISTRADA'}</span><b>${name}</b>${sci ? `<i>${sci}</i>` : ''}<span>${text}</span>`, 9000);
  sound.chime();
}

// ---------- sonar ----------
let sonar = null, sonarCool = 0;
const SONAR_R = 180;
function sonarPing() {
  if (!started || !sub.alive || sonarCool > 0 || sub.battery <= 0) return;
  sonarCool = 4; sub.battery = Math.max(0, sub.battery - 0.02);
  fx.ping(sub.pos); sound.ping();
  const cells = [], step = 14;
  for (let x = -SONAR_R; x <= SONAR_R; x += step) for (let z = -SONAR_R; z <= SONAR_R; z += step) {
    if (Math.hypot(x, z) > SONAR_R) continue;
    cells.push([x, z, heightAt(sub.pos.x + x, sub.pos.z + z)]);
  }
  const blips = [];
  for (const l of LANDMARKS) if (l.pos.distanceTo(sub.pos) < 260) blips.push({ x: l.pos.x, z: l.pos.z, t: 'L', n: discovered.some((d) => d.name === l.name) ? l.name : '?' });
  for (const a of fauna.list) if (['sperm', 'manta', 'hammer', 'squid', 'turtle', 'dolphin'].includes(a.sp.id) && a.dist < SONAR_R * 1.2) blips.push({ x: a.pos.x, z: a.pos.z, t: 'A' });
  sonar = { t: 0, ox: sub.pos.x, oy: sub.pos.y, oz: sub.pos.z, cells, blips };
  toast(blips.length ? `Sonar: ${blips.length} contacto${blips.length > 1 ? 's' : ''} en el radar` : 'Sonar: sin contactos cercanos', 2500);
}

// ---------- HUD ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const compassSpans = [...$('compass').querySelectorAll('span')];
function drawMinimap() {
  const W = mm.width, H = mm.height, cx = W / 2, cy = H / 2, sc = 72 / SONAR_R;
  mctx.clearRect(0, 0, W, H);
  const gr = mctx.createRadialGradient(cx, cy, 5, cx, cy, 78); gr.addColorStop(0, 'rgba(10,50,60,0.55)'); gr.addColorStop(1, 'rgba(3,15,22,0.85)');
  mctx.fillStyle = gr; mctx.beginPath(); mctx.arc(cx, cy, 74, 0, 7); mctx.fill();
  const fx_ = sub.fwd.x, fz_ = sub.fwd.z, fl = Math.hypot(fx_, fz_) || 1, f = [fx_ / fl, fz_ / fl], r = [-f[1], f[0]];
  const toScr = (dx, dz) => [cx + (dx * r[0] + dz * r[1]) * sc, cy - (dx * f[0] + dz * f[1]) * sc];
  if (sonar) {
    const fade = Math.max(0, 1 - sonar.t / 14), sweep = Math.min(1, sonar.t / 1.6) * SONAR_R;
    mctx.save(); mctx.beginPath(); mctx.arc(cx, cy, 74, 0, 7); mctx.clip();
    for (const [x, z, h] of sonar.cells) {
      if (Math.hypot(x, z) > sweep) continue;
      const rel = h - sonar.oy, [sx, sy] = toScr(sonar.ox + x - sub.pos.x, sonar.oz + z - sub.pos.z);
      const near = rel > -6;
      mctx.fillStyle = near ? `rgba(255,${140 - Math.min(rel + 6, 40) * 2},70,${0.65 * fade})` : `rgba(40,${Math.max(80, 220 + rel * 0.9)},${Math.max(110, 200 + rel * 0.6)},${(0.18 + Math.min(1, 40 / (-rel + 40)) * 0.45) * fade})`;
      mctx.fillRect(sx - 3, sy - 3, 6.2, 6.2);
    }
    for (const b of sonar.blips) {
      const [sx, sy] = toScr(b.x - sub.pos.x, b.z - sub.pos.z);
      mctx.fillStyle = b.t === 'L' ? `rgba(255,214,102,${fade + 0.25})` : `rgba(120,255,214,${fade})`;
      mctx.beginPath(); if (b.t === 'L') { mctx.moveTo(sx, sy - 5); mctx.lineTo(sx + 4, sy); mctx.lineTo(sx, sy + 5); mctx.lineTo(sx - 4, sy); mctx.fill(); } else { mctx.arc(sx, sy, 2.3, 0, 7); mctx.fill(); }
      if (b.t === 'L' && b.n !== '?') { mctx.font = '8px "DM Mono",monospace'; mctx.fillText(b.n.slice(0, 16), sx + 7, sy + 3); }
    }
    mctx.restore();
  }
  mctx.strokeStyle = 'rgba(150,230,240,0.25)'; mctx.lineWidth = 1;
  for (const rr of [24, 48, 72]) { mctx.beginPath(); mctx.arc(cx, cy, rr, 0, 7); mctx.stroke(); }
  mctx.beginPath(); mctx.moveTo(cx, cy - 74); mctx.lineTo(cx, cy + 74); mctx.moveTo(cx - 74, cy); mctx.lineTo(cx + 74, cy); mctx.stroke();
  mctx.fillStyle = '#5ef2d0'; mctx.beginPath(); mctx.moveTo(cx, cy - 7); mctx.lineTo(cx + 5, cy + 6); mctx.lineTo(cx, cy + 3); mctx.lineTo(cx - 5, cy + 6); mctx.fill();
  if (sonar && sonar.t < 1.6) { mctx.strokeStyle = `rgba(94,242,208,${1 - sonar.t / 1.6})`; mctx.beginPath(); mctx.arc(cx, cy, Math.min(1, sonar.t / 1.6) * 74, 0, 7); mctx.stroke(); }
}

const el = {}; ['depth-value', 'depth-fill', 'depth-marker', 'speed-value', 'heading-value', 'floor-value', 'pressure-value', 'temp-value', 'battery-value', 'battery-bar', 'o2-value', 'o2-bar', 'hull-value', 'hull-bar', 'ballast-value', 'ballast-bar', 'power-value', 'biome', 'coords', 'status-text', 'status-row', 'sonar-cooldown'].forEach((k) => (el[k] = $(k)));
const setBar = (k, v, warn, crit) => { el[k + '-value'].textContent = Math.round(v) + '%'; const b = el[k + '-bar']; b.style.width = v + '%'; b.className = v < crit ? 'crit' : v < warn ? 'warn' : ''; };
let hudT = 0;
let mapT = 0, fpsSm = 60;
const fpsEl = document.createElement('span'); fpsEl.style.cssText = 'margin-left:14px;opacity:.55'; $('biome').parentElement.appendChild(fpsEl);
function updateHUD(dt) {
  fpsSm += (1 / Math.max(dt, 1e-3) - fpsSm) * 0.05;
  mapT -= dt; if (mapT <= 0) { mapT = 1 / 15; drawMinimap(); }
  hudT -= dt; if (hudT > 0) return; hudT = 1 / 12;
  const d = sub.depth, alt = sub.pos.y - heightAt(sub.pos.x, sub.pos.z) - P.radius;
  el['depth-value'].textContent = Math.max(0, d).toFixed(d < 100 ? 1 : 0);
  const pct = Math.min(100, Math.max(0, d / 2)); el['depth-fill'].style.height = pct + '%'; el['depth-marker'].style.bottom = (100 - pct) + '%';
  el['speed-value'].innerHTML = `${(sub.speedFwd * 1.944).toFixed(1)} <small>nudos</small>`;
  const hdg = (Math.atan2(sub.fwd.x, -sub.fwd.z) * 180 / Math.PI + 360) % 360;
  el['heading-value'].textContent = `${String(Math.round(hdg) % 360).padStart(3, '0')}° ${CARD[Math.round(hdg / 45) % 8]}`;
  const ci = Math.round(hdg / 45); compassSpans.forEach((s, k) => (s.textContent = CARD[(ci + k - 2 + 16) % 8]));
  el['floor-value'].textContent = `${Math.max(0, alt).toFixed(0)} m`;
  el['pressure-value'].innerHTML = `${(1.013 + 1025 * 9.81 * Math.max(0, d) / 1e5).toFixed(1)} <small>bar</small>`;
  let temp = 4 + 18 * Math.exp(-Math.max(0, d) / 45);
  for (const v of ventTops) { const dd = v.distanceTo(sub.pos); if (dd < 40) temp += 60 * Math.pow(1 - dd / 40, 2); }
  el['temp-value'].innerHTML = `${temp.toFixed(1)} <small>°C</small>`;
  setBar('battery', sub.battery / P.battery * 100, 25, 10); setBar('o2', sub.o2, 30, 12); setBar('hull', sub.hull, 60, 30);
  el['ballast-value'].textContent = Math.round(sub.ballast * 100) + '%'; el['ballast-bar'].style.width = sub.ballast * 100 + '%';
  el['power-value'].innerHTML = `${sub.powerKW.toFixed(1)} <small>kW</small>`;
  // zona
  const hv = LANDMARKS.find((l) => l.id === 'vents'); let zone;
  if (hv && hv.pos.distanceTo(sub.pos) < 120) zone = 'CAMPO HIDROTERMAL';
  else if (d < 3) zone = 'SUPERFICIE';
  else if (d > 8 && d < 40 && kelpDensity(sub.pos.x, sub.pos.z) > 0.6) zone = 'BOSQUE DE KELP';
  else if (d < 35) zone = 'ARRECIFE SOLEADO'; else if (d < 90) zone = 'ARRECIFE CREPUSCULAR'; else if (d < 150) zone = 'ZONA AFÓTICA'; else zone = 'ABISMO';
  el['biome'].textContent = zone; fpsEl.textContent = `${Math.round(fpsSm)} FPS · ${Qc.name} (G)`;
  el['coords'].textContent = `${Math.abs(Math.round(sub.pos.z))} m ${sub.pos.z < 0 ? 'N' : 'S'} · ${Math.abs(Math.round(sub.pos.x))} m ${sub.pos.x < 0 ? 'O' : 'E'}`;
  const w = [];
  if (!sub.alive) w.push(['crit', 'SISTEMAS CAÍDOS']);
  else {
    if (sub.hull < 40) w.push(['crit', 'CASCO DAÑADO']); if (d > P.testDepth) w.push(['crit', 'PRESIÓN CRÍTICA']);
    if (sub.battery / P.battery < 0.1) w.push(['crit', 'BATERÍA CRÍTICA']); else if (sub.battery / P.battery < 0.25) w.push(['warn', 'BATERÍA BAJA']);
    if (sub.o2 < 15) w.push(['crit', 'OXÍGENO CRÍTICO']); else if (sub.o2 < 30) w.push(['warn', 'OXÍGENO BAJO']);
    if (sub.touching) w.push(['warn', 'CONTACTO CON EL FONDO']);
    if (sub.pos.y > -1.2) w.push(['ok', 'EN SUPERFICIE · RECARGANDO']);
  }
  const top = w[0] || ['ok', 'SISTEMAS NOMINALES']; el['status-text'].textContent = top[1]; el['status-row'].className = 'status-row ' + top[0];
  const cd = Math.max(0, sonarCool); el['sonar-cooldown'].style.transform = `scaleX(${cd / 4})`;
}

// ---------- camara ----------
const camTarget = new V3(), _v = new V3(), _q = new THREE.Quaternion();
let camInit = false;
function updateCamera(dt) {
  if (camMode === 0) {
    if (!dragging && performance.now() - lastDrag > 2500) { camYaw *= Math.exp(-dt * 0.8); camPitch += (0.28 - camPitch) * (1 - Math.exp(-dt * 0.8)); }
    const hy = Math.atan2(sub.fwd.x, sub.fwd.z), a = hy + camYaw;
    const cp = Math.cos(camPitch);
    camTarget.set(Math.sin(a) * cp * camDist * -1, Math.sin(camPitch) * camDist, Math.cos(a) * cp * camDist * -1).add(sub.pos);
    const k = camInit ? 1 - Math.exp(-dt * 5) : 1; camInit = true;
    camera.position.lerp(camTarget, k);
    const h = heightAt(camera.position.x, camera.position.z); if (camera.position.y < h + 1.2) camera.position.y = h + 1.2;
    _v.copy(sub.pos); _v.y += 0.6; camera.lookAt(_v);
  } else {
    if (!dragging) { fpYaw *= Math.exp(-dt * 2); fpPitch *= Math.exp(-dt * 2); }
    camera.position.set(0, 0.5, -1.55).applyQuaternion(sub.quat).add(sub.pos);
    _q.copy(sub.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(fpPitch, fpYaw, 0, 'YXZ')));
    camera.quaternion.copy(_q);
    // vibracion por impactos
  }
  if (sub.impact > 0.1) { camera.position.x += (Math.random() - 0.5) * sub.impact * 0.05; camera.position.y += (Math.random() - 0.5) * sub.impact * 0.05; }
}

// ---------- fin de partida ----------
function endGame() {
  if (document.getElementById('end')) return;
  const d = document.createElement('div'); d.id = 'end'; d.className = 'end';
  d.innerHTML = `<div class="end-card glass"><div class="panel-eyebrow">EXPEDICIÓN FINALIZADA</div><h2>${sub.cause}</h2><p>Descubrimientos: <b>${discovered.length}</b> de ${LANDMARKS.length + SPECIES_COUNT}.<br>Profundidad máxima alcanzada: <b>${maxDepth.toFixed(0)} m</b>.</p><button class="start-button" id="retry">NUEVA EXPEDICIÓN <span>↗</span></button></div>`;
  $('app').appendChild(d); $('retry').onclick = () => location.reload();
}

// ---------- bucle ----------
const clock = new THREE.Clock();
let slow = 0, perfAcc = 0, perfN = 0, time = 0, acc = 0, maxDepth = 0, optics = { exposure: 1 }, expo = 1, tipT = 0, alarmT = 0, introT = 0;
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt; U.uTime.value = time;
  if (started && sub.alive) {
    readInput(); acc += dt;
    let n = 0;
    while (acc >= 1 / 120 && n++ < 8) { sub.step(1 / 120, time); acc -= 1 / 120; }
    if (sub.impact > 0.9 && sub.sinceHit < 0.1 || (sub.impact > 0.5 && !sub._thumped)) { sound.thump(sub.impact); sub._thumped = true; }
    if (sub.impact < 0.2) sub._thumped = false;
  } else if (started && !sub.alive) endGame();
  if (!started) { sub.input.fwd = 0; introT += dt; sub.pos.y = -18 + Math.sin(introT * 0.8) * 0.15; camYaw = introT * 0.12; }
  sub.update(dt);
  maxDepth = Math.max(maxDepth, sub.depth);
  sonarCool -= dt; if (sonar) sonar.t += dt;

  updateChunks(started ? 1 : 0);
  landmarksSys.update(time);
  updateCamera(dt);
  camera.updateMatrixWorld();

  // optica del agua segun la profundidad de la camara
  const camDepth = Math.max(0, -camera.position.y), under = camera.position.y < 0;
  optics = waterOptics(camDepth, fogColor);
  const win = new V3(Math.exp(-U.uAbsorb.value.x * camDepth), Math.exp(-U.uAbsorb.value.y * camDepth), Math.exp(-U.uAbsorb.value.z * camDepth));
  let fogD;
  if (under) { fogD = (0.0105 + 0.007 * (1 - Math.exp(-camDepth / 70))) * Qc.fogK; scene.fog.color.copy(fogColor); }
  else { fogD = 0.0006; fogColor.setRGB(0.45, 0.68, 0.88); scene.fog.color.copy(fogColor); }
  scene.fog.density = fogD;
  expo += ((under ? optics.exposure : 1) - expo) * Math.min(1, dt * 1.2); renderer.toneMappingExposure = expo;
  document.querySelector('.surface-glow').style.opacity = (Math.exp(-camDepth / 18) * 0.8).toFixed(3);

  // focos del submarino (uniformes para los shaders)
  sub.group.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    U.uSpotPos.value[i].copy(sub.group.userData.lampLocal[i]).applyMatrix4(sub.group.matrixWorld);
    U.uSpotDir.value[i].set(0, -0.04, -1).applyQuaternion(sub.quat).normalize();
  }
  const lampOn = sub.lights && sub.battery > 0 && sub.alive ? 1 : 0;
  U.uSpotOn.value += (lampOn - U.uSpotOn.value) * Math.min(1, dt * 8);

  fx.setEnabled(Qc.fx);
  fx.update(dt, { under, fog: fogColor, win, camDepth, fogDensity: fogD, lamps: lampOn });
  // estela de burbujas y venteo de lastre
  if (started && sub.depth > 0.5) {
    if (Math.abs(sub.thrust) > 0.25 && Math.random() < Math.abs(sub.thrust) * 0.5) fx.emitBubbles(new V3(0, 0, 4.3).applyQuaternion(sub.quat).add(sub.pos), 1, 0.5);
    if (sub.pumping < 0 && sub.ballast > 0.01) fx.emitBubbles(new V3(0, 1.6, 0.3).applyQuaternion(sub.quat).add(sub.pos), 2, 0.8);
  }

  const subInfo = { pos: sub.pos, speed: sub.speed, fwd: sub.fwd };
  if (started) fauna.update(dt, time, subInfo, (sp) => discover('species', sp.name, sp.sci, sp.text));
  else fauna.update(dt, time, subInfo, () => {});
  if (started) for (const l of LANDMARKS) if (!discovered.some((d) => d.name === l.name) && l.pos.distanceTo(sub.pos) < l.radius) discover('place', l.name, '', l.text);

  const wh = fauna.nearest('sperm', sub.pos);
  sound.update(dt, { thrust: sub.thrust, vert: Math.abs(sub.vup), alive: sub.alive, under: sub.pos.y < -0.5, depth: sub.depth, stress: sub.stress, bubbling: sub.pumping < 0 || Math.abs(sub.thrust) > 0.8, whaleDist: wh ? wh.dist : 1e9 });
  alarmT -= dt; if (started && sub.alive && alarmT <= 0 && (sub.battery / P.battery < 0.1 || sub.o2 < 15 || sub.hull < 30 || sub.depth > P.testDepth)) { sound.alarm(); alarmT = 1.2; }
  tipT += dt;
  if (started) {
    if (tipT > 14 && discovered.length === 0 && !sonar) { toast('<span class="toast-k">CONSEJO</span><span>Pulsa <b>E</b> para emitir un pulso de sonar y localizar lugares singulares. Prueba hacia el este.</span>', 7000); tipT = -999; }
  }
  updateHUD(dt);
  renderer.render(scene, camera);
  // resolucion dinamica: mantiene ~45-60 fps bajando/subiendo la escala de render
  perfAcc += dt; perfN++;
  if (perfAcc > 1.5) {
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    if (avg > 0.024 && pr > 0.5) { pr = Math.max(0.5, pr - 0.15); renderer.setPixelRatio(pr); resize(); slow = 0; }
    else if (avg > 0.045 && pr <= 0.5) { if (++slow >= 2 && quality > 0) { setQuality(quality - 1); slow = 0; } }
    else if (avg < 0.012 && pr < Math.min(devicePixelRatio, Qc.prCap)) { pr = Math.min(Math.min(devicePixelRatio, Qc.prCap), pr + 0.1); renderer.setPixelRatio(pr); resize(); }
  }
}

// ---------- arranque ----------
const startBtn = $('start-button');
startBtn.disabled = true; const startLabel = startBtn.innerHTML; startBtn.innerHTML = 'GENERANDO OCÉANO…';
camera.position.set(8, -12, 14);
setTimeout(() => {
  let left = 1; while (left) left = updateChunks(60);
  startBtn.disabled = false; startBtn.innerHTML = startLabel;
}, 50);
startBtn.onclick = () => {
  started = true; sound.start(); $('intro').classList.add('hidden'); camInit = false; camYaw = 0;
  toast('<span class="toast-k">INMERSIÓN</span><span>Mantén <b>W</b> para avanzar y usa <b>A</b>/<b>D</b> para girar. Pulsa <b>Espacio</b> para subir y <b>Shift</b> para bajar.</span>', 6500);
};
frame();
window.__game = { sub, scene, camera, renderer, fauna, chunks, discovered };
