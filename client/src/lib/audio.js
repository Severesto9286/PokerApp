// Procedural audio engine (Web Audio API, no asset files).
//
// Music: a cosy, lo-fi lounge loop (Rhodes chords, soft bass, brushed drums,
// vinyl crackle). A "tension" layer (low string drone, heartbeat, rising pad)
// fades in during all-ins and big pots, and the cosy loop ducks under it.

const SETTINGS_KEY = 'ff-poker-audio';

const defaults = { master: 0.8, music: 0.55, sfx: 0.9, musicOn: true, sfxOn: true };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = { ...defaults, ...(safeParse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    this.tension = 0;
    this.musicRunning = false;
    this.listeners = new Set();
    this.unlocked = false;
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.master;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfxOn ? this.settings.sfx : 0;
    this.sfxBus.connect(this.master);

    // Cosy loop bus: warm lowpass + gentle duck under tension.
    this.cosyBus = ctx.createGain();
    this.cosyBus.gain.value = 0;
    this.cosyFilter = ctx.createBiquadFilter();
    this.cosyFilter.type = 'lowpass';
    this.cosyFilter.frequency.value = 3600;
    this.cosyFilter.Q.value = 0.4;
    this.cosyBus.connect(this.cosyFilter);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.musicOn ? this.settings.music : 0;
    this.cosyFilter.connect(this.musicBus);
    this.musicBus.connect(this.master);

    this.tenseBus = ctx.createGain();
    this.tenseBus.gain.value = 0;
    this.tenseBus.connect(this.musicBus);

    // A short convolver-free "room" using feedback delay for glue.
    this.verb = ctx.createDelay(1.0);
    this.verb.delayTime.value = 0.23;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.22;
    this.verbFilter = ctx.createBiquadFilter();
    this.verbFilter.type = 'lowpass';
    this.verbFilter.frequency.value = 2200;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 1;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.verbFilter);
    this.verbFilter.connect(this.verbGain);
    this.verbGain.connect(this.verb);
    this.verbGain.connect(this.musicBus);

    this.noiseBuffer = makeNoise(ctx, 2);
    this.unlocked = true;
    if (this.settings.musicOn) this.startMusic();
    this._emit();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this.settings); }

  update(patch) {
    this.settings = { ...this.settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.settings.master, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(this.settings.sfxOn ? this.settings.sfx : 0, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.settings.musicOn ? this.settings.music : 0, t, 0.1);
      if (this.settings.musicOn && !this.musicRunning) this.startMusic();
      if (!this.settings.musicOn && this.musicRunning) this.stopMusic();
    }
    this._emit();
  }

  // ─── Music ────────────────────────────────────────────────────────────────
  startMusic() {
    if (!this.ctx || this.musicRunning) return;
    this.musicRunning = true;
    const ctx = this.ctx;
    this.bpm = 74;
    this.beat = 60 / this.bpm;
    this.bar = 0;
    this.step = 0; // 8th-note step index within the bar (0..7)
    this.nextStepTime = ctx.currentTime + 0.1;
    this.cosyBus.gain.setTargetAtTime(1, ctx.currentTime, 1.2);

    // Vinyl crackle bed.
    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = this.noiseBuffer;
    this.crackle.loop = true;
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass'; cf.frequency.value = 5000; cf.Q.value = 0.6;
    const cg = ctx.createGain();
    cg.gain.value = 0.012;
    this.crackle.connect(cf); cf.connect(cg); cg.connect(this.cosyBus);
    this.crackle.start();

    // Tension layer nodes (silent until tension rises).
    this._buildTension();

    this.schedulerId = setInterval(() => this._schedule(), 60);
  }

  stopMusic() {
    if (!this.ctx || !this.musicRunning) return;
    this.musicRunning = false;
    clearInterval(this.schedulerId);
    const t = this.ctx.currentTime;
    this.cosyBus.gain.setTargetAtTime(0, t, 0.4);
    try { this.crackle.stop(t + 2); } catch { /* ignore */ }
    this._teardownTension();
  }

  _schedule() {
    const ctx = this.ctx;
    const lookahead = 0.25;
    while (this.nextStepTime < ctx.currentTime + lookahead) {
      try { this._playStep(this.step, this.bar, this.nextStepTime); } catch (err) { console.warn('music step failed', err); }
      const swing = this.step % 2 === 1 ? this.beat * 0.08 : -this.beat * 0.08;
      this.nextStepTime += this.beat / 2 + swing;
      this.step = (this.step + 1) % 8;
      if (this.step === 0) this.bar++;
    }
  }

  _playStep(step, bar, t) {
    const prog = COSY_PROGRESSION;
    const chord = prog[bar % prog.length];
    const nextChord = prog[(bar + 1) % prog.length];

    // Rhodes chord on beat 1, with a softer restrike on the "and" of 3.
    if (step === 0) this._rhodes(chord.notes, t, this.beat * 3.6, 0.5);
    if (step === 5 && bar % 2 === 1) this._rhodes(chord.notes.slice(1), t, this.beat * 1.2, 0.22);

    // Bass: root on 1, fifth or approach note on the "and" of 3.
    if (step === 0) this._bass(chord.root, t, this.beat * 1.6);
    if (step === 5) this._bass(bar % 4 === 3 ? nextChord.root + (nextChord.root > chord.root ? -1 : 1) : chord.root + 7, t, this.beat * 0.9);

    // Melody: a sparse pentatonic noodle, more often in later bars of the phrase.
    if (step % 2 === 1 && Math.random() < (bar % 4 === 3 ? 0.55 : 0.28)) {
      const scale = chord.melody;
      const n = scale[Math.floor(Math.random() * scale.length)] + 12;
      this._bell(n, t + 0.01, this.beat * 0.9, 0.12);
    }

    // Drums: kick 1 & 3, brush snare 2 & 4, hats every 8th (quiet), ghost on some.
    if (step === 0 || step === 4) this._kick(t, 0.5);
    if (step === 2 || step === 6) this._brush(t, 0.16);
    this._hat(t, step % 2 === 0 ? 0.045 : 0.03);
    if (step === 7 && bar % 2 === 1) this._brush(t, 0.07);
  }

  _voice(type, freq, t, dur, peak, dest, { attack = 0.01, release = 0.3, detune = 0, filter = null } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.0001, t + dur, release / 3);
    let node = osc;
    if (filter) { const f = ctx.createBiquadFilter(); setFilter(f, filter); osc.connect(f); node = f; }
    node.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + release + 0.1);
    return osc;
  }

  _rhodes(notes, t, dur, vel) {
    // Two-op FM-ish tone: sine carrier + quiet triangle an octave up, slow tremolo.
    for (const [i, n] of notes.entries()) {
      const f = mtof(n);
      const tt = t + i * 0.018; // gentle roll
      this._voice('sine', f, tt, dur, vel * 0.16, this.cosyBus, { attack: 0.02, release: 0.9 });
      this._voice('triangle', f * 2, tt, dur * 0.7, vel * 0.03, this.cosyBus, { attack: 0.02, release: 0.5 });
      this._voice('sine', f, tt, dur, vel * 0.05, this.verbSend, { attack: 0.02, release: 0.9, detune: 5 });
    }
  }

  _bass(n, t, dur) {
    const f = mtof(n - 12);
    this._voice('sine', f, t, dur, 0.28, this.cosyBus, { attack: 0.015, release: 0.25 });
    this._voice('triangle', f, t, dur * 0.6, 0.05, this.cosyBus, { attack: 0.01, release: 0.2, filter: { type: 'lowpass', frequency: 500 } });
  }

  _bell(n, t, dur, vel) {
    const f = mtof(n);
    this._voice('sine', f, t, dur, vel, this.cosyBus, { attack: 0.005, release: 0.6 });
    this._voice('sine', f * 3.01, t, dur * 0.3, vel * 0.12, this.cosyBus, { attack: 0.003, release: 0.2 });
    this._voice('sine', f, t, dur, vel * 0.5, this.verbSend, { attack: 0.005, release: 0.6 });
  }

  _kick(t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vel * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(this.cosyBus);
    o.start(t); o.stop(t + 0.3);
  }

  _noiseBurst(t, dur, vel, dest, filter) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    setFilter(f, filter);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _brush(t, vel) { this._noiseBurst(t, 0.16, vel, this.cosyBus, { type: 'bandpass', frequency: 1800, Q: 0.7 }); }
  _hat(t, vel) { this._noiseBurst(t, 0.05, vel, this.cosyBus, { type: 'highpass', frequency: 7000, Q: 0.5 }); }

  // ─── Tension layer ─────────────────────────────────────────────────────────
  _buildTension() {
    const ctx = this.ctx;
    this.tense = {};
    // Low drone: detuned saws through a lowpass that opens with tension.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    droneFilter.Q.value = 2;
    const oscs = [];
    for (const [f, d] of [[36.7, -6], [36.7, 6], [73.4, 0]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      o.connect(droneFilter); o.start(); oscs.push(o);
    }
    droneFilter.connect(droneGain);
    droneGain.connect(this.tenseBus);

    // Strings pad: D minor chord, saws through slow lowpass, very slow attack.
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 700; padFilter.Q.value = 0.5;
    for (const n of [50, 57, 62, 64, 69]) { // Dsus2 voicing sits under both the major loop and the dark drone
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = d;
        const g = ctx.createGain(); g.gain.value = 0.04;
        o.connect(g); g.connect(padFilter); o.start(); oscs.push(o);
      }
    }
    padFilter.connect(padGain);
    padGain.connect(this.tenseBus);
    padGain.connect(this.verbSend);

    this.tense = { droneGain, droneFilter, padGain, padFilter, oscs, heartbeatId: null };
    this._applyTension();
  }

  _teardownTension() {
    if (!this.tense) return;
    for (const o of this.tense.oscs) { try { o.stop(); } catch { /* ignore */ } }
    if (this.tense.heartbeatId) clearInterval(this.tense.heartbeatId);
    this.tense = null;
  }

  // level 0..1
  setTension(level) {
    level = Math.max(0, Math.min(1, level));
    if (Math.abs(level - this.tension) < 0.01) return;
    this.tension = level;
    this._applyTension();
  }

  _applyTension() {
    if (!this.ctx || !this.tense) return;
    const t = this.ctx.currentTime;
    const L = this.tension;
    const { droneGain, droneFilter, padGain, padFilter } = this.tense;
    droneGain.gain.setTargetAtTime(L * 0.5, t, 0.8);
    droneFilter.frequency.setTargetAtTime(120 + L * 900, t, 1.2);
    padGain.gain.setTargetAtTime(Math.max(0, L - 0.25) * 0.9, t, 1.5);
    padFilter.frequency.setTargetAtTime(500 + L * 1800, t, 1.5);
    // Cosy loop ducks and darkens.
    this.cosyBus.gain.setTargetAtTime(this.musicRunning ? 1 - L * 0.88 : 0, t, 0.8);
    this.cosyFilter.frequency.setTargetAtTime(3600 - L * 2400, t, 0.8);
    this.tenseBus.gain.setTargetAtTime(1, t, 0.1);

    // Heartbeat pulse.
    if (L > 0.3 && !this.tense.heartbeatId) {
      const beat = () => {
        if (!this.ctx || !this.tense) return;
        const now = this.ctx.currentTime;
        const v = 0.35 + this.tension * 0.6;
        this._heart(now + 0.02, v);
        this._heart(now + 0.30, v * 0.75);
      };
      beat();
      this.tense.heartbeatId = setInterval(beat, 1150);
    } else if (L <= 0.3 && this.tense.heartbeatId) {
      clearInterval(this.tense.heartbeatId);
      this.tense.heartbeatId = null;
    }
  }

  _heart(t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.18);
    g.gain.setValueAtTime(vel * 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g); g.connect(this.tenseBus);
    o.start(t); o.stop(t + 0.36);
  }

  // Rising noise sweep used right before a dramatic card.
  riser(ms = 1800) {
    if (!this.ctx || !this.settings.musicOn) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = ms / 1000;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    src.connect(f); f.connect(g); g.connect(this.tenseBus);
    src.start(t); src.stop(t + dur + 0.3);
    // Rising tone underneath.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(440, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.12, t + dur);
    og.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    o.connect(og); og.connect(this.tenseBus);
    o.start(t); o.stop(t + dur + 0.3);
  }

  // Cinematic impact for the river / big reveal.
  hit(strength = 1) {
    if (!this.ctx || !this.settings.sfxOn) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    g.gain.setValueAtTime(0.9 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 1.2);
    this._noiseBurst(t, 0.5, 0.35 * strength, this.sfxBus, { type: 'lowpass', frequency: 900, Q: 0.7 });
  }

  // ─── SFX ──────────────────────────────────────────────────────────────────
  _ok() { return this.ctx && this.settings.sfxOn; }

  deal() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.07, 0.35, this.sfxBus, { type: 'bandpass', frequency: 2600 + Math.random() * 800, Q: 1.5 });
  }

  flip() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.12, 0.3, this.sfxBus, { type: 'bandpass', frequency: 1800, Q: 1.2 });
    this._voice('sine', 1200, t + 0.02, 0.04, 0.05, this.sfxBus, { attack: 0.003, release: 0.05 });
  }

  chips(amount = 1, big = false) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const n = big ? 7 : Math.min(5, 2 + Math.floor(Math.log10(Math.max(1, amount))));
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.035 + Math.random() * 0.02);
      const f = 3200 + Math.random() * 2200;
      this._voice('sine', f, tt, 0.03, 0.16, this.sfxBus, { attack: 0.001, release: 0.06 });
      this._voice('triangle', f * 1.5, tt, 0.02, 0.05, this.sfxBus, { attack: 0.001, release: 0.04 });
      this._noiseBurst(tt, 0.03, 0.08, this.sfxBus, { type: 'highpass', frequency: 5000, Q: 0.5 });
    }
  }

  check() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    for (const d of [0, 0.11]) {
      this._noiseBurst(t + d, 0.06, 0.5, this.sfxBus, { type: 'lowpass', frequency: 700, Q: 1 });
      this._voice('sine', 180, t + d, 0.05, 0.25, this.sfxBus, { attack: 0.002, release: 0.05 });
    }
  }

  fold() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.22, 0.2, this.sfxBus, { type: 'bandpass', frequency: 1200, Q: 0.8 });
  }

  yourTurn() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._voice('sine', 880, t, 0.09, 0.22, this.sfxBus, { attack: 0.004, release: 0.12 });
    this._voice('sine', 1320, t + 0.11, 0.14, 0.2, this.sfxBus, { attack: 0.004, release: 0.2 });
  }

  tick() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._voice('square', 1500, t, 0.02, 0.05, this.sfxBus, { attack: 0.001, release: 0.03 });
  }

  allIn() {
    if (!this._ok()) return;
    this.chips(1e6, true);
    const t = this.ctx.currentTime + 0.05;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.65);
  }

  win(big = false) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const notes = big ? [72, 76, 79, 84, 88, 91, 96] : [72, 76, 79, 84];
    notes.forEach((n, i) => {
      const tt = t + i * (big ? 0.075 : 0.09);
      this._voice('sine', mtof(n), tt, 0.35, 0.2, this.sfxBus, { attack: 0.005, release: 0.4 });
      this._voice('triangle', mtof(n) * 2, tt, 0.25, 0.05, this.sfxBus, { attack: 0.005, release: 0.3 });
    });
    if (big) {
      this.chips(1e6, true);
      setTimeout(() => this.chips(1e6, true), 220);
      this._voice('sine', mtof(60), t + 0.5, 1.4, 0.18, this.sfxBus, { attack: 0.02, release: 1.2 });
      this._voice('sine', mtof(67), t + 0.5, 1.4, 0.14, this.sfxBus, { attack: 0.02, release: 1.2 });
    }
  }

  collect() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.05;
      this._voice('sine', 3800 + Math.random() * 1500, tt, 0.025, 0.09, this.sfxBus, { attack: 0.001, release: 0.05 });
    }
  }

  click() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._voice('sine', 700, t, 0.03, 0.1, this.sfxBus, { attack: 0.002, release: 0.04 });
  }

  notify() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this._voice('sine', 660, t, 0.08, 0.15, this.sfxBus, { attack: 0.004, release: 0.12 });
    this._voice('sine', 990, t + 0.09, 0.1, 0.12, this.sfxBus, { attack: 0.004, release: 0.15 });
  }
}

// Lo-fi progression in D major-ish: Dmaj9 | Bm9 | Gmaj9 | A13 (with a Bm/F#m variation).
const COSY_PROGRESSION = [
  { root: 50, notes: [50, 54, 57, 61, 64], melody: [62, 64, 66, 69, 71, 73] },
  { root: 47, notes: [47, 50, 54, 57, 61], melody: [59, 62, 64, 66, 69, 71] },
  { root: 43, notes: [43, 47, 50, 54, 57], melody: [59, 62, 64, 66, 67, 71] },
  { root: 45, notes: [45, 49, 52, 55, 59], melody: [57, 59, 61, 64, 66, 69] },
  { root: 50, notes: [50, 54, 57, 61, 64], melody: [62, 64, 66, 69, 71, 73] },
  { root: 42, notes: [42, 45, 49, 52, 57], melody: [57, 61, 64, 66, 69, 73] },
  { root: 43, notes: [43, 47, 50, 54, 57], melody: [59, 62, 64, 66, 67, 71] },
  { root: 45, notes: [45, 49, 52, 55, 59], melody: [57, 59, 61, 64, 66, 69] },
];

function setFilter(f, { type, frequency, Q }) {
  if (type) f.type = type;
  if (frequency !== undefined) f.frequency.value = frequency;
  if (Q !== undefined) f.Q.value = Q;
}

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function makeNoise(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export const audio = new AudioEngine();
