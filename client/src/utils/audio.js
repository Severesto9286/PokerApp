// Poker Audio Engine
// All sounds are procedurally generated via Web Audio API — no files needed.

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let musicPlaying = false;
let musicIntervalId = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMasterVolume(v) {
  if (masterGain) masterGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.05);
}

export function setMusicVolume(v) {
  if (musicGain) musicGain.gain.setTargetAtTime(v * 0.25, getCtx().currentTime, 0.05);
}

export function setSfxVolume(v) {
  if (sfxGain) sfxGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.05);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playTone(freq, type, duration, gainVal, dest, startTime, endGain = 0) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(gainVal, startTime);
  g.gain.exponentialRampToValueAtTime(Math.max(endGain, 0.001), startTime + duration);
  osc.connect(g);
  g.connect(dest || sfxGain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
  return osc;
}

function noise(duration, gainVal, dest) {
  const c = getCtx();
  const bufSize = c.sampleRate * duration;
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gainVal, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.8;
  src.connect(filter);
  filter.connect(g);
  g.connect(dest || sfxGain);
  src.start();
  src.stop(c.currentTime + duration);
}

// ─── Realistic Chip Click ─────────────────────────────────────────────────────
// A real casino chip: sharp attack transient (wideband click),
// a bright ceramic resonance ~3–5kHz, quick decay ~40–80ms.
// Layered: (1) impact click, (2) ceramic ring, (3) subtle body thud.

function chipClick(time, gain = 1.0, dest) {
  const c = getCtx();
  const out = dest || sfxGain;

  // 1. Sharp impact — very short burst of shaped noise, highpass filtered
  const impactBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.018), c.sampleRate);
  const impactData = impactBuf.getChannelData(0);
  for (let i = 0; i < impactData.length; i++) {
    // Sharply decaying noise envelope
    impactData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impactData.length, 3);
  }
  const impactSrc = c.createBufferSource();
  impactSrc.buffer = impactBuf;

  const impactFilter = c.createBiquadFilter();
  impactFilter.type = 'highpass';
  impactFilter.frequency.value = 4000;
  impactFilter.Q.value = 0.5;

  const impactGain = c.createGain();
  impactGain.gain.setValueAtTime(gain * 0.9, time);
  impactGain.gain.exponentialRampToValueAtTime(0.001, time + 0.018);

  impactSrc.connect(impactFilter);
  impactFilter.connect(impactGain);
  impactGain.connect(out);
  impactSrc.start(time);
  impactSrc.stop(time + 0.02);

  // 2. Ceramic ring — short sine burst at chip resonant frequency ~3.8kHz
  // with a slight pitch drop (ceramic settling)
  const ringOsc = c.createOscillator();
  ringOsc.type = 'sine';
  ringOsc.frequency.setValueAtTime(3800 + Math.random() * 400, time);
  ringOsc.frequency.exponentialRampToValueAtTime(3200, time + 0.04);

  const ringGain = c.createGain();
  ringGain.gain.setValueAtTime(gain * 0.25, time);
  ringGain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

  ringOsc.connect(ringGain);
  ringGain.connect(out);
  ringOsc.start(time);
  ringOsc.stop(time + 0.06);

  // 3. Second harmonic shimmer (~7.5kHz) — gives that bright "clink"
  const shimmerOsc = c.createOscillator();
  shimmerOsc.type = 'sine';
  shimmerOsc.frequency.setValueAtTime(7500 + Math.random() * 300, time);

  const shimmerGain = c.createGain();
  shimmerGain.gain.setValueAtTime(gain * 0.08, time);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

  shimmerOsc.connect(shimmerGain);
  shimmerGain.connect(out);
  shimmerOsc.start(time);
  shimmerOsc.stop(time + 0.03);

  // 4. Low thud — the chip hitting the felt (lowpass, very short)
  const thudBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.03), c.sampleRate);
  const thudData = thudBuf.getChannelData(0);
  for (let i = 0; i < thudData.length; i++) {
    thudData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / thudData.length, 2);
  }
  const thudSrc = c.createBufferSource();
  thudSrc.buffer = thudBuf;

  const thudFilter = c.createBiquadFilter();
  thudFilter.type = 'lowpass';
  thudFilter.frequency.value = 300;

  const thudGain = c.createGain();
  thudGain.gain.setValueAtTime(gain * 0.35, time);
  thudGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

  thudSrc.connect(thudFilter);
  thudFilter.connect(thudGain);
  thudGain.connect(out);
  thudSrc.start(time);
  thudSrc.stop(time + 0.035);
}

// ─── Sound Effects ─────────────────────────────────────────────────────────────

export function playCardDeal() {
  const c = getCtx();
  const t = c.currentTime;
  noise(0.06, 0.35, sfxGain);
  playTone(800, 'sine', 0.08, 0.12, sfxGain, t, 0);
}

export function playCardFlip() {
  const c = getCtx();
  const t = c.currentTime;
  noise(0.1, 0.4, sfxGain);
  playTone(600, 'sine', 0.12, 0.15, sfxGain, t, 0);
  playTone(900, 'sine', 0.08, 0.08, sfxGain, t + 0.03, 0);
}

// Call / small bet: 2–3 chips placed down one after another
export function playChipBet() {
  const c = getCtx();
  const t = c.currentTime;
  const count = 2 + Math.floor(Math.random() * 2); // 2 or 3 chips
  for (let i = 0; i < count; i++) {
    // Slight timing variation per chip — sounds like stacking
    chipClick(t + i * 0.055 + (Math.random() * 0.01), 0.75 - i * 0.08);
  }
}

// Raise: more chips, slightly faster, louder first impact
export function playChipRaise() {
  const c = getCtx();
  const t = c.currentTime;
  const count = 4 + Math.floor(Math.random() * 3); // 4–6 chips
  for (let i = 0; i < count; i++) {
    const delay = i * 0.045 + (Math.random() * 0.008);
    const gain = i === 0 ? 1.0 : 0.85 - i * 0.06;
    chipClick(t + delay, Math.max(gain, 0.3));
  }
}

export function playFold() {
  const c = getCtx();
  const t = c.currentTime;
  noise(0.12, 0.3, sfxGain);
  playTone(400, 'sawtooth', 0.15, 0.06, sfxGain, t, 0);
}

export function playCheck() {
  const c = getCtx();
  const t = c.currentTime;
  // Single quiet chip tap on the felt
  chipClick(t, 0.45);
}

// All-in: a big cascade of chips — rapid-fire with a pronounced first slam
export function playAllIn() {
  const c = getCtx();
  const t = c.currentTime;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const delay = i * 0.032 + (Math.random() * 0.006);
    // First chip is the loudest slam
    const gain = i === 0 ? 1.2 : Math.max(0.9 - i * 0.07, 0.25);
    chipClick(t + delay, gain);
  }
  // Low thud underneath to sell the weight of the all-in push
  playTone(80, 'sine', 0.25, 0.3, sfxGain, t, 0.001);
}

export function playWin() {
  const c = getCtx();
  const t = c.currentTime;
  // Ascending celebratory arpeggio
  const notes = [261, 329, 392, 523, 659, 784, 1046];
  notes.forEach((freq, i) => {
    playTone(freq, 'sine', 0.3, 0.3, sfxGain, t + i * 0.07, 0);
    playTone(freq * 1.5, 'triangle', 0.2, 0.06, sfxGain, t + i * 0.07, 0);
  });
  // Chip pile sound after the fanfare
  setTimeout(() => {
    const c2 = getCtx();
    for (let i = 0; i < 6; i++) {
      chipClick(c2.currentTime + i * 0.04, 0.5);
    }
  }, 400);
}

export function playBombPot() {
  const c = getCtx();
  const t = c.currentTime;
  playTone(60, 'sine', 0.4, 0.5, sfxGain, t, 0.001);
  playTone(80, 'sawtooth', 0.3, 0.2, sfxGain, t, 0.001);
  noise(0.2, 0.5, sfxGain);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, t + 0.1);
  osc.frequency.linearRampToValueAtTime(800, t + 0.5);
  g.gain.setValueAtTime(0.15, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t + 0.1);
  osc.stop(t + 0.6);
}

export function playYourTurn() {
  const c = getCtx();
  const t = c.currentTime;
  playTone(660, 'sine', 0.1, 0.2, sfxGain, t, 0);
  playTone(880, 'sine', 0.15, 0.18, sfxGain, t + 0.1, 0);
}

export function playNewStreet() {
  const c = getCtx();
  const t = c.currentTime;
  playTone(440, 'sine', 0.15, 0.12, sfxGain, t, 0);
  playTone(550, 'sine', 0.12, 0.1, sfxGain, t + 0.08, 0);
}

export function playShowdown() {
  const c = getCtx();
  const t = c.currentTime;
  playTone(220, 'sawtooth', 0.3, 0.15, sfxGain, t, 0.001);
  playTone(440, 'sine', 0.2, 0.12, sfxGain, t + 0.05, 0);
  playTone(660, 'sine', 0.15, 0.1, sfxGain, t + 0.1, 0);
}

// ─── Background Music ──────────────────────────────────────────────────────────

const CHORD_PROGRESSIONS = [
  [
    { root: 293.66, type: 'minor7' },
    { root: 392.00, type: 'dom7' },
    { root: 261.63, type: 'maj7' },
    { root: 261.63, type: 'maj7' },
  ],
  [
    { root: 261.63, type: 'maj7' },
    { root: 220.00, type: 'minor7' },
    { root: 293.66, type: 'minor7' },
    { root: 392.00, type: 'dom7' },
  ]
];

const CHORD_INTERVALS = {
  maj7:   [1, 1.26, 1.498, 1.888],
  minor7: [1, 1.189, 1.498, 1.782],
  dom7:   [1, 1.26, 1.498, 1.782],
};

let chordIndex = 0;
let progIndex = 0;
let beatCount = 0;

function playChord(chord, time, duration) {
  const c = getCtx();
  const intervals = CHORD_INTERVALS[chord.type];
  intervals.forEach((interval, i) => {
    const freq = chord.root * interval * 0.5;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.12 - i * 0.02, time + 0.05);
    g.gain.setValueAtTime(0.12 - i * 0.02, time + duration - 0.1);
    g.gain.linearRampToValueAtTime(0, time + duration);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  });
}

function playBassNote(freq, time, duration) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq * 0.25;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.3, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.7);
  osc.connect(g);
  g.connect(musicGain);
  osc.start(time);
  osc.stop(time + duration);
}

function playHiHat(time, accent = false) {
  const c = getCtx();
  const bufSize = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  const g = c.createGain();
  g.gain.setValueAtTime(accent ? 0.08 : 0.04, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  src.connect(filter);
  filter.connect(g);
  g.connect(musicGain);
  src.start(time);
  src.stop(time + 0.05);
}

function scheduleMusic() {
  const c = getCtx();
  const BPM = 82;
  const beatDur = 60 / BPM;
  const barDur = beatDur * 4;
  const now = c.currentTime + 0.1;

  const prog = CHORD_PROGRESSIONS[progIndex % CHORD_PROGRESSIONS.length];
  const chord = prog[chordIndex % prog.length];

  playChord(chord, now, barDur * 0.95);
  playBassNote(chord.root, now, beatDur * 0.8);
  playBassNote(chord.root, now + beatDur * 2, beatDur * 0.8);

  for (let beat = 0; beat < 4; beat++) {
    playHiHat(now + beat * beatDur, beat === 0 || beat === 2);
    playHiHat(now + beat * beatDur + beatDur * 0.5);
  }

  chordIndex++;
  if (chordIndex >= prog.length) {
    chordIndex = 0;
    progIndex++;
  }

  beatCount++;
}

export function startMusic() {
  if (musicPlaying) return;
  getCtx();
  musicPlaying = true;
  scheduleMusic();
  const BPM = 82;
  const barDur = (60 / BPM) * 4 * 1000;
  musicIntervalId = setInterval(() => {
    if (musicPlaying) scheduleMusic();
  }, barDur - 50);
}

export function stopMusic() {
  musicPlaying = false;
  if (musicIntervalId) { clearInterval(musicIntervalId); musicIntervalId = null; }
}

export function toggleMusic() {
  if (musicPlaying) stopMusic(); else startMusic();
  return musicPlaying;
}

export function isMusicPlaying() { return musicPlaying; }
