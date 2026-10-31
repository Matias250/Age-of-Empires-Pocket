// Sonidos y música hechos con WebAudio (sin archivos): golpes, flechas, cañonazos, avisos y una
// música medieval suave que se genera sola. Se pueden apagar por separado en Configuración.
import { saveSettings, settings } from './settings.js';

export type Sfx = 'hit' | 'arrow' | 'boom' | 'death' | 'built' | 'trained' | 'alert' | 'age' | 'click' | 'win' | 'lose' | 'tech';

let shared: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (shared) return shared;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    shared = new C();
    // los navegadores arrancan el audio recién con un toque
    const wake = () => { void shared?.resume(); };
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
  } catch { shared = null; }
  return shared;
}

export class Sound {
  private last = new Map<string, number>();
  private musicTimer = 0;
  private musicGain?: GainNode;
  private drone: OscillatorNode[] = [];
  private noiseBuf?: AudioBuffer;

  private out(vol: number): { a: AudioContext; g: GainNode } | null {
    if (!settings.sound) return null;
    const a = ctx();
    if (!a || a.state === 'closed') return null;
    const g = a.createGain(); g.gain.value = vol; g.connect(a.destination);
    return { a, g };
  }
  private noise(a: AudioContext): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const b = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.noiseBuf = b);
  }
  private tone(a: AudioContext, dst: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dst); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private burst(a: AudioContext, dst: AudioNode, filt: BiquadFilterType, f: number, t0: number, dur: number, vol: number, q = 1) {
    const s = a.createBufferSource(); s.buffer = this.noise(a);
    const bq = a.createBiquadFilter(); bq.type = filt; bq.frequency.value = f; bq.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bq); bq.connect(g); g.connect(dst); s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
  }

  /** Reproduce un efecto (con un mínimo de tiempo entre repeticiones del mismo) */
  play(k: Sfx, vol = 1) {
    const gap: Partial<Record<Sfx, number>> = { hit: 70, arrow: 90, boom: 120, death: 120, alert: 4000, trained: 200, built: 300, click: 40 };
    const now = performance.now();
    if ((gap[k] ?? 0) > now - (this.last.get(k) ?? -1e9)) return;
    this.last.set(k, now);
    const o = this.out(0.5 * vol);
    if (!o) return;
    const { a, g } = o, t = a.currentTime + 0.005;
    switch (k) {
      case 'hit':
        this.burst(a, g, 'bandpass', 2400 + Math.random() * 800, t, 0.07, 0.35, 3);
        this.tone(a, g, 'square', 1800 + Math.random() * 400, 900, t, 0.06, 0.05);
        break;
      case 'arrow': this.burst(a, g, 'highpass', 3000, t, 0.09, 0.12); break;
      case 'boom':
        this.tone(a, g, 'sine', 110, 38, t, 0.45, 0.6);
        this.burst(a, g, 'lowpass', 900, t, 0.35, 0.5);
        break;
      case 'death': this.tone(a, g, 'triangle', 180, 70, t, 0.22, 0.18); break;
      case 'built':
        this.burst(a, g, 'bandpass', 700, t, 0.06, 0.4, 4); this.burst(a, g, 'bandpass', 600, t + 0.12, 0.06, 0.4, 4);
        this.tone(a, g, 'triangle', 784, 784, t + 0.25, 0.35, 0.12);
        break;
      case 'trained': this.tone(a, g, 'sine', 660, 990, t, 0.14, 0.15); break;
      case 'tech': this.tone(a, g, 'triangle', 523, 523, t, 0.18, 0.12); this.tone(a, g, 'triangle', 784, 784, t + 0.12, 0.3, 0.12); break;
      case 'alert':
        for (const [i, f] of [[0, 196], [1, 196], [2, 262]] as const) this.tone(a, g, 'sawtooth', f, f * 0.98, t + i * 0.22, 0.3, 0.08);
        break;
      case 'age':
        [262, 330, 392, 523].forEach((f, i) => this.tone(a, g, 'triangle', f, f, t + i * 0.14, 0.5, 0.16));
        break;
      case 'win': [392, 494, 587, 784].forEach((f, i) => this.tone(a, g, 'triangle', f, f, t + i * 0.18, 0.7, 0.18)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone(a, g, 'triangle', f, f, t + i * 0.25, 0.8, 0.15)); break;
      case 'click': this.tone(a, g, 'sine', 1200, 900, t, 0.03, 0.05); break;
    }
  }

  /** Música de fondo: un bordón y un laúd que improvisa en modo dórico */
  music(on: boolean) {
    clearInterval(this.musicTimer); this.musicTimer = 0;
    for (const d of this.drone) try { d.stop(); } catch { /* ya parado */ }
    this.drone = [];
    if (this.musicGain) { this.musicGain.disconnect(); this.musicGain = undefined; }
    if (!on || !settings.music) return;
    const a = ctx();
    if (!a) return;
    const mg = a.createGain(); mg.gain.value = 0.07; mg.connect(a.destination);
    this.musicGain = mg;
    // bordón: re y la graves, muy suaves
    for (const f of [73.4, 110]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.value = f; g.gain.value = 0.18;
      o.connect(g); g.connect(mg); o.start(); this.drone.push(o);
    }
    const scale = [293.7, 329.6, 349.2, 392, 440, 493.9, 523.3, 587.3];
    let step = 0, note = 4, next = a.currentTime + 0.3;
    const beat = 0.42;
    const pluck = (f: number, t: number, v: number) => {
      const o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(lp); lp.connect(g); g.connect(mg); o.start(t); o.stop(t + 1);
    };
    const drum = (t: number) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(mg); o.start(t); o.stop(t + 0.22);
    };
    this.musicTimer = window.setInterval(() => {
      if (!settings.music || !this.musicGain) return;
      while (next < a.currentTime + 1.2) {
        const bar = step % 16;
        if (bar % 4 === 0) drum(next);
        if (Math.random() < (bar % 2 === 0 ? 0.75 : 0.35)) {
          note = Math.max(0, Math.min(scale.length - 1, note + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
          pluck(scale[note] * (bar === 0 ? 0.5 : 1), next, 0.16);
          if (bar === 0 || bar === 8) pluck(scale[Math.max(0, note - 2)] * 0.5, next, 0.1);
        }
        next += beat * (Math.random() < 0.15 ? 0.5 : 1);
        step++;
      }
    }, 300);
  }

  static toggle(kind: 'sound' | 'music', v: boolean) { settings[kind] = v; saveSettings(); }
}
