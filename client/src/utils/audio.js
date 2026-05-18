// Poker Audio Engine
// All sounds are procedurally generated via Web Audio API — no files needed.

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let musicOscillators = [];
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

export function playChipBet() {
  const c = getCtx();
  const t = c.currentTime;
  // Multiple chip clicks
  [0, 0.04, 0.08].forEach((offset, i) => {
    noise(0.05, 0.2 - i * 0.05, sfxGain);
    playTone(1200 - i * 80, 'sine', 0.06, 0.1, sfxGain, t + offset, 0);
  });
}

export function playChipRaise() {
  const c = getCtx();
  const t = c.currentTime;
  [0, 0.04, 0.08, 0.12, 0.16].forEach((offset, i) => {
    noise(0.05, 0.25 - i * 0.04, sfxGain);
    playTone(1400 - i * 60, 'sine', 0.06, 0.12, sfxGain, t + offset, 0);
  });
  // Rising tone
  playTone(300, 'triangle', 0.2, 0.08, sfxGain, t + 0.05, 0);
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
  playTone(900, 'sine', 0.06, 0.1, sfxGain, t, 0);
  playTone(700, 'sine', 0.08, 0.07, sfxGain, t + 0.04, 0);
}

export function playAllIn() {
  const c = getCtx();
  const t = c.currentTime;
  // Dramatic chip slam
  for (let i = 0; i < 8; i++) {
    noise(0.06, 0.3 - i * 0.02, sfxGain);
    playTone(1600 - i * 50, 'sine', 0.08, 0.15, sfxGain, t + i * 0.035, 0);
  }
  playTone(200, 'triangle', 0.4, 0.2, sfxGain, t + 0.1, 0);
}

export function playWin() {
  const c = getCtx();
  const t = c.currentTime;
  // Ascending celebratory arpeggio
  const notes = [261, 329, 392, 523, 659, 784, 1046];
  notes.forEach((freq, i) => {
    playTone(freq, 'sine', 0.3, 0.15, sfxGain, t + i * 0.07, 0);
    playTone(freq * 1.5, 'triangle', 0.2, 0.06, sfxGain, t + i * 0.07, 0);
  });
  // Chip pile sound
  setTimeout(() => {
    for (let i = 0; i < 6; i++) noise(0.04, 0.2, sfxGain);
  }, 400);
}

export function playBombPot() {
  const c = getCtx();
  const t = c.currentTime;
  // Deep boom
  playTone(60, 'sine', 0.5, 0.4, sfxGain, t, 0.001);
  playTone(80, 'sawtooth', 0.3, 0.2, sfxGain, t, 0.001);
  noise(0.2, 0.5, sfxGain);
  // Rising alarm
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
  // Dramatic reveal
  playTone(220, 'sawtooth', 0.3, 0.15, sfxGain, t, 0.001);
  playTone(440, 'sine', 0.2, 0.12, sfxGain, t + 0.05, 0);
  playTone(660, 'sine', 0.15, 0.1, sfxGain, t + 0.1, 0);
}

// ─── Background Music ──────────────────────────────────────────────────────────
// Jazzy lo-fi poker lounge vibes, purely synthesized

const CHORD_PROGRESSIONS = [
  // ii-V-I in C
  [
    { root: 293.66, type: 'minor7' },   // Dm7
    { root: 392.00, type: 'dom7' },     // G7
    { root: 261.63, type: 'maj7' },     // Cmaj7
    { root: 261.63, type: 'maj7' },
  ],
  // I-VI-ii-V
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
    const freq = chord.root * interval * 0.5; // lower octave
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    // Slight detune for warmth
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

  // Chord
  playChord(chord, now, barDur * 0.95);

  // Bass on beats 1 and 3
  playBassNote(chord.root, now, beatDur * 0.8);
  playBassNote(chord.root, now + beatDur * 2, beatDur * 0.8);

  // Hi-hats on every beat, accent on 1 and 3
  for (let beat = 0; beat < 4; beat++) {
    playHiHat(now + beat * beatDur, beat === 0 || beat === 2);
    // Offbeat hi-hat
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
