// Sonido procedural con WebAudio: motor, ambiente, crujidos del casco, sonar, ballena.
export class Sound {
  constructor() { this.ctx = null; this.creakT = 0; this.bubT = 0; this.whaleT = 0; }
  start() {
    if (this.ctx) return;
    const A = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = A.createGain(); this.master.gain.value = 0.7; this.master.connect(A.destination);
    const noise = (sec, brown) => {
      const b = A.createBuffer(1, A.sampleRate * sec, A.sampleRate), d = b.getChannelData(0);
      let l = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = brown ? (l + 0.02 * w) / 1.02 : w; d[i] = brown ? l * 3.5 : w; }
      return b;
    };
    this.noiseBuf = noise(2, false);
    const amb = A.createBufferSource(); amb.buffer = noise(4, true); amb.loop = true;
    this.ambLP = A.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 500;
    this.ambG = A.createGain(); this.ambG.gain.value = 0.3; amb.connect(this.ambLP).connect(this.ambG).connect(this.master); amb.start();
    // motor
    this.eLP = A.createBiquadFilter(); this.eLP.type = 'lowpass'; this.eLP.frequency.value = 300;
    this.eG = A.createGain(); this.eG.gain.value = 0.05;
    this.o1 = A.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 50;
    this.o2 = A.createOscillator(); this.o2.type = 'sine'; this.o2.frequency.value = 180;
    this.wG = A.createGain(); this.wG.gain.value = 0;
    this.o1.connect(this.eLP).connect(this.eG).connect(this.master); this.o2.connect(this.wG).connect(this.master);
    this.o1.start(); this.o2.start();
    // ballena
    this.wh1 = A.createOscillator(); this.wh2 = A.createOscillator(); this.whG = A.createGain(); this.whG.gain.value = 0;
    this.wh1.frequency.value = 140; this.wh2.frequency.value = 213; const lfo = A.createOscillator(); lfo.frequency.value = 5; const lg = A.createGain(); lg.gain.value = 6;
    lfo.connect(lg); lg.connect(this.wh1.frequency); lg.connect(this.wh2.frequency); lfo.start();
    this.wh1.connect(this.whG); this.wh2.connect(this.whG); this.whG.connect(this.master); this.wh1.start(); this.wh2.start();
    // eco para el sonar
    this.delay = A.createDelay(1.5); this.delay.delayTime.value = 0.42; const fb = A.createGain(); fb.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(this.master);
  }
  env(node, t0, a, d, peak) { node.gain.setValueAtTime(0.0001, t0); node.gain.exponentialRampToValueAtTime(peak, t0 + a); node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  tone(type, f0, f1, dur, vol, echo = false) {
    const A = this.ctx; if (!A) return; const t = A.currentTime;
    const o = A.createOscillator(), g = A.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.01, dur, vol); o.connect(g); g.connect(this.master); if (echo) g.connect(this.delay); o.start(t); o.stop(t + dur + 0.1);
  }
  ping() { this.tone('sine', 1500, 1480, 1.8, 0.22, true); }
  chime() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone('sine', f, f * 0.998, 1.2, 0.09, true), i * 110)); }
  alarm() { this.tone('square', 880, 880, 0.18, 0.05); }
  thump(v) {
    const A = this.ctx; if (!A) return; const t = A.currentTime;
    const s = A.createBufferSource(); s.buffer = this.noiseBuf; const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; const g = A.createGain();
    this.env(g, t, 0.005, 0.5, Math.min(0.9, 0.15 + v * 0.15)); s.connect(lp).connect(g).connect(this.master); s.start(t); s.stop(t + 0.7);
    this.tone('sine', 90, 35, 0.6, Math.min(0.8, 0.2 + v * 0.12));
  }
  creak(stress) {
    const A = this.ctx, t = A.currentTime, o = A.createOscillator(), bp = A.createBiquadFilter(), g = A.createGain();
    o.type = 'sawtooth'; const f = 70 + Math.random() * 120; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.6 + Math.random() * 0.9), t + 1.2);
    bp.type = 'bandpass'; bp.frequency.value = 300 + Math.random() * 500; bp.Q.value = 8;
    this.env(g, t, 0.15, 1.0, 0.04 + stress * 0.18); o.connect(bp).connect(g).connect(this.master); o.start(t); o.stop(t + 1.4);
  }
  bubble() { this.tone('sine', 400 + Math.random() * 500, 1400, 0.07, 0.03); }
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, thr = Math.abs(s.thrust);
    this.o1.frequency.setTargetAtTime(42 + 80 * thr, t, 0.2); this.eLP.frequency.setTargetAtTime(220 + 600 * thr, t, 0.2);
    this.eG.gain.setTargetAtTime((s.alive ? 0.04 : 0) + 0.2 * thr + 0.06 * s.vert, t, 0.15);
    this.o2.frequency.setTargetAtTime(160 + 520 * thr + 90 * s.vert, t, 0.2); this.wG.gain.setTargetAtTime(0.012 * (thr + s.vert), t, 0.2);
    this.ambLP.frequency.setTargetAtTime(s.under ? 420 : 2600, t, 0.1); this.ambG.gain.setTargetAtTime(s.under ? 0.34 : 0.2, t, 0.2);
    this.master.gain.setTargetAtTime(s.under ? 0.7 : 0.55, t, 0.3);
    this.creakT -= dt;
    if (s.depth > 90 && this.creakT <= 0) { this.creak(s.stress); this.creakT = (3 + Math.random() * 6) * (1 - 0.8 * s.stress); }
    this.bubT -= dt;
    if (s.bubbling && this.bubT <= 0) { this.bubble(); this.bubT = 0.05 + Math.random() * 0.15; }
    const wd = s.whaleDist;
    this.whG.gain.setTargetAtTime(wd < 320 && s.under ? Math.pow(1 - wd / 320, 2) * 0.35 : 0, t, 0.4);
    this.whaleT -= dt;
    if (this.whaleT <= 0) { const f = 70 + Math.random() * 300; this.wh1.frequency.exponentialRampToValueAtTime(f, t + 2.5); this.wh2.frequency.exponentialRampToValueAtTime(f * (1.4 + Math.random() * 0.4), t + 2.5); this.whaleT = 2.5 + Math.random() * 3; }
  }
}
