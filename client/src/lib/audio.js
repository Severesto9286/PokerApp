// Audio engine built on real recordings (see public/audio/CREDITS.md).
//
// Music: a cosy lounge-jazz playlist streams through Web Audio so it can be
// ducked and darkened under a looping tension track that fades in during
// all-ins and big pots. SFX are short samples (cards, chips, knocks, stings)
// decoded once and played with slight random variation so they never sound
// mechanical.

const SETTINGS_KEY = 'ff-poker-audio';
const defaults = { master: 0.8, music: 0.5, sfx: 0.9, musicOn: true, sfxOn: true };

const BASE = `${import.meta.env.BASE_URL || '/'}audio/`;
const COSY_TRACKS = ['lobby-time', 'backbay-lounge'];
const TENSE_TRACKS = ['deadly-roulette', 'hidden-agenda'];

// Sample groups: a name maps to one or more files; playing a group picks a variant.
const SFX = {
  deal: ['deal-1', 'deal-2', 'deal-3', 'deal-4', 'deal-5', 'deal-6', 'deal-7', 'deal-8'],
  flip: ['flip-1', 'flip-2', 'flip-3', 'flip-4'],
  fold: ['fold-1', 'fold-2', 'fold-3', 'fold-4'],
  chip: ['chip-1', 'chip-2', 'chip-3'],
  stack: ['stack-1', 'stack-2', 'stack-3', 'stack-4', 'stack-5', 'stack-6'],
  collide: ['collide-1', 'collide-2', 'collide-3', 'collide-4'],
  handle: ['handle-1', 'handle-2', 'handle-3', 'handle-4', 'handle-5', 'handle-6'],
  knock: ['knock-1', 'knock-2', 'knock-3', 'knock-4', 'knock-5'],
  shuffle: ['shuffle'],
  fan: ['fan-1', 'fan-2'],
  hit1: ['hit-1'], hit2: ['hit-2'], bell: ['bell'],
  turn: ['turn'], notify: ['notify'], tick: ['tick'], click: ['click'], error: ['error'],
  win: ['win'], bigwin: ['bigwin'], sting: ['sting'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.settings = { ...defaults, ...(safeParse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    this.tension = 0;
    this.musicRunning = false;
    this.listeners = new Set();
    this.unlocked = false;
    this.buffers = new Map();
    this.loading = new Map();
    this.ext = null;
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      if (this.settings.musicOn && !this.musicRunning) this.startMusic();
      else if (this.musicRunning) this._kickPlayback();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const probe = document.createElement('audio');
    this.ext = probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';

    this.master = ctx.createGain();
    this.master.gain.value = this.settings.master;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 4;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfxOn ? this.settings.sfx : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.musicOn ? this.settings.music : 0;
    this.musicBus.connect(this.master);

    // Cosy layer: playlist element -> warm lowpass -> gain (ducked under tension).
    this.cosyEl = this._makeElement();
    this.cosySrc = ctx.createMediaElementSource(this.cosyEl);
    this.cosyFilter = ctx.createBiquadFilter();
    this.cosyFilter.type = 'lowpass';
    this.cosyFilter.frequency.value = 12000;
    this.cosyGain = ctx.createGain();
    this.cosyGain.gain.value = 0;
    this.cosySrc.connect(this.cosyFilter);
    this.cosyFilter.connect(this.cosyGain);
    this.cosyGain.connect(this.musicBus);
    this.cosyEl.addEventListener('ended', () => this._nextCosy());

    // Tension layer: looping track, silent until tension rises.
    this.tenseEl = this._makeElement();
    this.tenseEl.loop = true;
    this.tenseSrc = ctx.createMediaElementSource(this.tenseEl);
    this.tenseGain = ctx.createGain();
    this.tenseGain.gain.value = 0;
    this.tenseSrc.connect(this.tenseGain);
    this.tenseGain.connect(this.musicBus);

    this.noiseBuffer = makeNoise(ctx, 2);
    this.unlocked = true;
    this._preload();
    if (this.settings.musicOn) this.startMusic();
    this._emit();
  }

  _makeElement() {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.setAttribute('playsinline', '');
    return el;
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
    this.cosyIndex = Math.floor(Math.random() * COSY_TRACKS.length);
    this._setSrc(this.cosyEl, `${BASE}music/${COSY_TRACKS[this.cosyIndex]}.mp3`);
    this._setSrc(this.tenseEl, `${BASE}music/${pick(TENSE_TRACKS)}.mp3`);
    this.cosyGain.gain.setTargetAtTime(1 - this.tension * 0.85, this.ctx.currentTime, 1.5);
    this._kickPlayback();
  }

  // Chrome sometimes leaves a detached element without loading after a src change;
  // an explicit load() makes it reliable.
  _setSrc(el, url) { el.src = url; el.load(); }

  // play() can be refused until the user has interacted; we retry on every init().
  _kickPlayback() {
    if (!this.musicRunning) return;
    const p = this.cosyEl.play();
    if (p && p.catch) p.catch(() => {});
    if (this.tension > 0.02) { const q = this.tenseEl.play(); if (q && q.catch) q.catch(() => {}); }
  }

  _nextCosy() {
    if (!this.musicRunning) return;
    this.cosyIndex = (this.cosyIndex + 1) % COSY_TRACKS.length;
    this._setSrc(this.cosyEl, `${BASE}music/${COSY_TRACKS[this.cosyIndex]}.mp3`);
    this._kickPlayback();
  }

  stopMusic() {
    if (!this.ctx || !this.musicRunning) return;
    this.musicRunning = false;
    const t = this.ctx.currentTime;
    this.cosyGain.gain.setTargetAtTime(0, t, 0.4);
    this.tenseGain.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(() => { if (!this.musicRunning) { this.cosyEl.pause(); this.tenseEl.pause(); } }, 1500);
  }

  // level 0..1: how dramatic the moment is.
  setTension(level) {
    level = Math.max(0, Math.min(1, level));
    if (Math.abs(level - this.tension) < 0.01) return;
    const was = this.tension;
    this.tension = level;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const L = level;
    // Tension track fades in; the lounge ducks and loses its top end.
    this.tenseGain.gain.setTargetAtTime(L, t, L > was ? 0.9 : 1.6);
    this.cosyGain.gain.setTargetAtTime(this.musicRunning ? 1 - L * 0.85 : 0, t, 0.8);
    this.cosyFilter.frequency.setTargetAtTime(12000 - L * 10800, t, 0.8);
    if (L > 0.02 && this.musicRunning && this.tenseEl.paused) {
      const q = this.tenseEl.play();
      if (q && q.catch) q.catch(() => {});
    }
    if (L <= 0.02) {
      clearTimeout(this.tensePauseId);
      this.tensePauseId = setTimeout(() => { if (this.tension <= 0.02) this.tenseEl.pause(); }, 4000);
    }
  }

  // Rising whoosh right before a dramatic card.
  riser(ms = 1800) {
    if (!this.ctx || !this.settings.sfxOn) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = ms / 1000;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.3);
  }

  // Cinematic impact for the river / big reveal.
  hit(strength = 1) {
    if (!this._ok()) return;
    this._play('hit1', { vol: 0.9 * strength, rate: 0.85 });
    this._play('hit2', { vol: 0.5 * strength, rate: 0.7, delay: 0.02 });
    this._play('bell', { vol: 0.18 * strength, rate: 0.5, delay: 0.05 });
  }

  // ─── Samples ──────────────────────────────────────────────────────────────
  _preload() {
    const names = new Set();
    for (const list of Object.values(SFX)) for (const n of list) names.add(n);
    // Stagger so the first hand doesn't compete with the music stream.
    let i = 0;
    for (const n of names) setTimeout(() => this._load(n), i++ * 40);
  }

  _load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const p = fetch(`${BASE}sfx/${name}.${this.ext}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((buf) => { this.buffers.set(name, buf); return buf; })
      .catch(() => null)
      .finally(() => this.loading.delete(name));
    this.loading.set(name, p);
    return p;
  }

  _ok() { return this.ctx && this.settings.sfxOn; }

  _play(group, { vol = 1, rate = 1, delay = 0, variance = 0.06 } = {}) {
    if (!this._ok()) return;
    const name = pick(SFX[group] || [group]);
    const start = () => {
      const buf = this.buffers.get(name);
      if (!buf) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * rnd(1 - variance, 1 + variance);
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g); g.connect(this.sfxBus);
      src.start(ctx.currentTime + delay);
    };
    if (this.buffers.has(name)) start();
    else this._load(name).then((b) => { if (b) start(); });
  }

  // ─── SFX vocabulary used by the game ──────────────────────────────────────
  shuffle() { this._play('shuffle', { vol: 0.7 }); }
  deal() { this._play('deal', { vol: 0.8 }); }
  flip() { this._play('flip', { vol: 0.9 }); }
  fold() { this._play('fold', { vol: 0.8 }); }

  chips(amount = 1, big = false) {
    if (big) {
      this._play('stack', { vol: 1 });
      this._play('collide', { vol: 0.6, delay: 0.12 });
      return;
    }
    const n = Math.min(3, 1 + Math.floor(Math.log10(Math.max(1, amount)) / 1.5));
    for (let i = 0; i < n; i++) this._play(i === 0 ? 'chip' : 'collide', { vol: i === 0 ? 0.95 : 0.5, delay: i * 0.07 });
  }

  check() {
    this._play('knock', { vol: 0.9, rate: 1.1 });
    this._play('knock', { vol: 0.75, rate: 1.05, delay: 0.13 });
  }

  allIn() {
    this._play('handle', { vol: 1 });
    this._play('stack', { vol: 0.9, delay: 0.18 });
    this._play('collide', { vol: 0.7, delay: 0.4 });
    this._play('hit1', { vol: 0.35, rate: 0.9, delay: 0.05 });
  }

  collect() { this._play('collide', { vol: 0.7 }); this._play('handle', { vol: 0.4, delay: 0.1 }); }

  win(big = false) {
    if (big) {
      this._play('bigwin', { vol: 1, variance: 0 });
      this._play('stack', { vol: 0.9, delay: 0.25 });
      this._play('collide', { vol: 0.6, delay: 0.55 });
      this._play('collide', { vol: 0.5, delay: 0.8 });
    } else {
      this._play('win', { vol: 0.9, variance: 0 });
      this._play('collide', { vol: 0.5, delay: 0.3 });
    }
  }

  yourTurn() { this._play('turn', { vol: 0.8, variance: 0 }); }
  tick() { this._play('tick', { vol: 0.5, variance: 0 }); }
  click() { this._play('click', { vol: 0.5, variance: 0.02 }); }
  notify() { this._play('notify', { vol: 0.7, variance: 0 }); }
}

function makeNoise(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

export const audio = new AudioEngine();
