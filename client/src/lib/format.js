// Chip formatting helpers.

export function fmt(n) {
  n = Math.round(Number(n) || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
  if (Math.abs(n) >= 100000) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
}

// Display in big blinds when the viewer prefers it.
export function fmtAmount(n, bb, inBB) {
  if (inBB && bb) {
    const v = n / bb;
    const s = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v % 1 === 0 ? 0 : 1);
    return `${s} BB`;
  }
  return fmt(n);
}

export const AVATARS = [
  { emoji: '🦊', bg: 'linear-gradient(145deg,#ff8a3d,#c2410c)' },
  { emoji: '🐼', bg: 'linear-gradient(145deg,#6b7280,#111827)' },
  { emoji: '🐯', bg: 'linear-gradient(145deg,#f59e0b,#92400e)' },
  { emoji: '🦁', bg: 'linear-gradient(145deg,#fbbf24,#b45309)' },
  { emoji: '🐸', bg: 'linear-gradient(145deg,#4ade80,#15803d)' },
  { emoji: '🐙', bg: 'linear-gradient(145deg,#f472b6,#9d174d)' },
  { emoji: '🦉', bg: 'linear-gradient(145deg,#a78bfa,#4c1d95)' },
  { emoji: '🐺', bg: 'linear-gradient(145deg,#94a3b8,#1e293b)' },
  { emoji: '🐨', bg: 'linear-gradient(145deg,#9ca3af,#374151)' },
  { emoji: '🐧', bg: 'linear-gradient(145deg,#38bdf8,#0c4a6e)' },
  { emoji: '🦄', bg: 'linear-gradient(145deg,#f0abfc,#7e22ce)' },
  { emoji: '🐲', bg: 'linear-gradient(145deg,#34d399,#065f46)' },
  { emoji: '🦈', bg: 'linear-gradient(145deg,#60a5fa,#1e3a8a)' },
  { emoji: '🐻', bg: 'linear-gradient(145deg,#d97706,#78350f)' },
  { emoji: '🦅', bg: 'linear-gradient(145deg,#e5e7eb,#4b5563)' },
  { emoji: '🐱', bg: 'linear-gradient(145deg,#fda4af,#be123c)' },
];

export function avatarOf(i) { return AVATARS[((Number(i) || 0) % AVATARS.length + AVATARS.length) % AVATARS.length]; }

export const ACTION_LABEL = {
  fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in',
  sb: 'SB', bb: 'BB', ante: 'Ante', bomb: 'Bomb',
};
