// 合成音效(照 baseball3d AudioManager 範式)。
// ★播報人聲鐵律:本專案播報只走字幕條、不做語音——絕不接 Web Speech 機器聲。
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.masterGain) this.masterGain.gain.value = enabled ? 0.2 : 0;
  }

  ensureContext() {
    if (this.context) return this.context;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    this.context = new Ctor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.enabled ? 0.2 : 0;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  unlock() {
    const context = this.ensureContext();
    if (context && context.state === "suspended") context.resume().catch(() => {});
  }

  tone({ frequency = 440, frequencyEnd = null, duration = 0.12, type = "sine", gain = 0.12, when = 0 }) {
    const context = this.ensureContext();
    if (!context || !this.enabled) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const g = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (frequencyEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 0.4), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  uiTap() { this.tone({ frequency: 520, frequencyEnd: 760, duration: 0.08, type: "triangle", gain: 0.06 }); }
  kick(power = 0.7) {
    this.tone({ frequency: 160 + power * 120, frequencyEnd: 70, duration: 0.11, type: "square", gain: 0.14 });
    this.tone({ frequency: 90, frequencyEnd: 50, duration: 0.14, type: "sawtooth", gain: 0.08, when: 0.01 });
  }
  passTap() { this.tone({ frequency: 300, frequencyEnd: 170, duration: 0.08, type: "square", gain: 0.09 }); }
  bounce() { this.tone({ frequency: 150, frequencyEnd: 90, duration: 0.06, type: "sine", gain: 0.05 }); }
  whistle() {
    this.tone({ frequency: 2100, duration: 0.16, type: "square", gain: 0.06 });
    this.tone({ frequency: 2100, duration: 0.3, type: "square", gain: 0.06, when: 0.2 });
  }
  saveThump() { this.tone({ frequency: 220, frequencyEnd: 120, duration: 0.12, type: "square", gain: 0.1 }); }
  steal() { this.tone({ frequency: 420, frequencyEnd: 240, duration: 0.1, type: "triangle", gain: 0.08 }); }
  buzz() { this.tone({ frequency: 200, frequencyEnd: 160, duration: 0.22, type: "square", gain: 0.08 }); }
  cheer() {
    this.tone({ frequency: 523, duration: 0.12, type: "triangle", gain: 0.1 });
    this.tone({ frequency: 659, duration: 0.12, type: "triangle", gain: 0.1, when: 0.1 });
    this.tone({ frequency: 784, duration: 0.22, type: "triangle", gain: 0.1, when: 0.2 });
  }
  horn() {
    this.tone({ frequency: 190, frequencyEnd: 150, duration: 0.42, type: "sawtooth", gain: 0.12 });
    this.tone({ frequency: 290, frequencyEnd: 240, duration: 0.42, type: "square", gain: 0.08, when: 0.02 });
  }
  vibrate(pattern) { if ("vibrate" in navigator) navigator.vibrate(pattern); }

  // ── 風暴音效(約拿落海):風聲 loop / 雷 / 入水 ──
  startWind() {
    const ctx = this.ensureContext();
    if (!ctx || this._wind) return;
    const buf = this.makeNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 480; bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.14;
    src.connect(bp); bp.connect(g); g.connect(this.masterGain);
    src.start();
    this._wind = { src, gain: g };
  }

  stopWind() {
    if (!this._wind) return;
    try { this._wind.src.stop(); } catch { /* ignore */ }
    this._wind = null;
  }

  thunder(strength = 0.8) {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    // 低頻隆隆(濾過雜訊)+ 一聲裂響
    const buf = this.makeNoiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 260;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.3 * strength, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1 + strength);
    src.connect(lp); lp.connect(g); g.connect(this.masterGain);
    src.start(t0); src.stop(t0 + 1.6 + strength);
    this.tone({ frequency: 90, frequencyEnd: 40, duration: 0.5, type: "sawtooth", gain: 0.1 * strength });
  }

  splash(strength = 0.6) {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    const buf = this.makeNoiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 900;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22 * strength, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    src.connect(hp); hp.connect(g); g.connect(this.masterGain);
    src.start(t0); src.stop(t0 + 0.4);
  }

  // ── 觀眾:環境人聲+喝采浪+節奏拍手(baseball3d 範式) ──
  makeNoiseBuffer() {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (this._noiseBuf) return this._noiseBuf;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.random());
    this._noiseBuf = buf;
    return buf;
  }

  startCrowd() {
    const ctx = this.ensureContext();
    if (!ctx || this._crowd) return;
    const buf = this.makeNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 620; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.09;
    src.connect(lp); lp.connect(g); g.connect(this.masterGain);
    src.start();
    this._crowd = { src, gain: g };
  }

  stopCrowd() {
    if (!this._crowd) return;
    try { this._crowd.src.stop(); } catch { /* ignore */ }
    this._crowd = null;
  }

  crowdCheer(strength = 1) {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    this.startCrowd();
    if (this._crowd) {
      const g = this._crowd.gain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.09, g.value), now);
      g.linearRampToValueAtTime(0.09 + 0.34 * strength, now + 0.1);
      g.exponentialRampToValueAtTime(0.09, now + 2.6);
    }
    const buf = this.makeNoiseBuffer();
    for (let i = 0; i < 10; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 1600;
      const g2 = ctx.createGain();
      const t0 = ctx.currentTime + Math.random() * 0.6;
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.1 * strength, t0 + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      src.connect(hp); hp.connect(g2); g2.connect(this.masterGain);
      src.start(t0); src.stop(t0 + 0.1);
    }
  }

  crowdChant() {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return;
    const buf = this.makeNoiseBuffer();
    const pattern = [0, 0.22, 0.55, 1.0, 1.22, 1.55];
    for (const off of pattern) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.2;
      const g2 = ctx.createGain();
      const t0 = ctx.currentTime + off;
      g2.gain.setValueAtTime(0.0001, t0);
      g2.gain.exponentialRampToValueAtTime(0.11, t0 + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      src.connect(bp); bp.connect(g2); g2.connect(this.masterGain);
      src.start(t0); src.stop(t0 + 0.12);
    }
  }
}
