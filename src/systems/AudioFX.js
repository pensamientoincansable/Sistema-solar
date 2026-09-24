import { settings } from './Settings.js';

/**
 * AudioFX - Efectos de sonido sintetizados con WebAudio (0 KB de descargas).
 * El volumen sale de Ajustes. El contexto de audio se crea/reanuda en el
 * primer gesto del usuario (requisito de los navegadores móviles).
 */
class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this._last = {};
    settings.onChange((key) => { if (key === 'volume') this._applyVolume(); });
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this._applyVolume();
        const len = Math.floor(this.ctx.sampleRate * 0.6);
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* sin audio */ }
  }

  _applyVolume() {
    if (!this.master) return;
    const v = Math.max(0, Math.min(100, Number(settings.get('volume')) || 0)) / 100;
    this.master.gain.value = v * v * 0.55;
  }

  _ok(name, minGapMs) {
    if (!this.ctx || !this.master || this.master.gain.value <= 0.0001) return false;
    if (this.ctx.state !== 'running') return false;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < minGapMs) return false;
    this._last[name] = now;
    return true;
  }

  _tone(type, f0, f1, dur, gain = 0.3, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise(dur, gain = 0.3, f0 = 3000, f1 = 200, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name) {
    try {
      switch (name) {
        case 'laser': if (this._ok(name, 70)) this._tone('square', 1500, 500, 0.09, 0.08); break;
        case 'plasma': if (this._ok(name, 120)) { this._tone('sawtooth', 420, 140, 0.25, 0.12); this._noise(0.15, 0.05, 2000, 300); } break;
        case 'scatter': if (this._ok(name, 150)) this._noise(0.22, 0.25, 5000, 300); break;
        case 'missile': if (this._ok(name, 150)) { this._noise(0.5, 0.12, 600, 3000); this._tone('sawtooth', 200, 700, 0.4, 0.05); } break;
        case 'explosion': if (this._ok(name, 60)) { this._noise(0.7, 0.45, 1800, 60); this._tone('sine', 120, 40, 0.5, 0.25); } break;
        case 'hit': if (this._ok(name, 90)) { this._tone('sine', 160, 60, 0.18, 0.35); this._noise(0.12, 0.15, 900, 200); } break;
        case 'pickup': if (this._ok(name, 60)) this._tone('triangle', 880, 1760, 0.1, 0.12); break;
        case 'water': if (this._ok(name, 60)) { this._tone('sine', 1200, 600, 0.12, 0.14); this._tone('sine', 1600, 900, 0.1, 0.08, 0.05); } break;
        case 'deposit': if (this._ok(name, 300)) [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.16, 0.12, i * 0.07)); break;
        case 'buy': if (this._ok(name, 150)) { this._tone('square', 988, 988, 0.08, 0.08); this._tone('square', 1319, 1319, 0.22, 0.08, 0.08); } break;
        case 'error': if (this._ok(name, 200)) this._tone('square', 220, 180, 0.18, 0.08); break;
        case 'alert': if (this._ok(name, 1500)) [0, 0.28, 0.56].forEach(d => { this._tone('sawtooth', 660, 440, 0.24, 0.1, d); }); break;
        case 'repair': if (this._ok(name, 110)) this._noise(0.08, 0.1, 6000, 2500); break;
        case 'restored': if (this._ok(name, 400)) [392, 523, 659, 784].forEach((f, i) => this._tone('sine', f, f, 0.2, 0.14, i * 0.09)); break;
        case 'ui': if (this._ok(name, 60)) this._tone('sine', 700, 900, 0.05, 0.06); break;
        default: break;
      }
    } catch (e) { /* noop */ }
  }
}

export const audio = new AudioFX();
