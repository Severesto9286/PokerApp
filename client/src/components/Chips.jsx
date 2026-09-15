import React from 'react';
import { fmtAmount } from '../lib/format';

// Chip colours by denomination, largest first.
const DENOMS = [
  [100000, 'chip-pink'], [25000, 'chip-orange'], [5000, 'chip-purple'], [1000, 'chip-gold'],
  [500, 'chip-black'], [100, 'chip-green'], [25, 'chip-blue'], [5, 'chip-red'], [1, 'chip-white'],
];

// Break an amount into up to `max` chips for display.
export function chipsFor(amount, max = 10) {
  const chips = [];
  let rem = Math.max(0, Math.round(amount));
  for (const [v, cls] of DENOMS) {
    let n = Math.floor(rem / v);
    if (n <= 0) continue;
    if (n > 4) n = 4; // cap per denomination so stacks stay readable
    for (let i = 0; i < n && chips.length < max; i++) chips.push(cls);
    rem -= n * v;
    if (chips.length >= max) break;
  }
  if (chips.length === 0) chips.push('chip-white');
  return chips;
}

export function ChipStack({ amount, label = true, bb, inBB, className = '', style, size = 22 }) {
  const chips = chipsFor(amount, 9);
  return (
    <div className={`chipstack ${className}`} style={{ '--chip': `${size}px`, ...style }}>
      <div className="chipstack-pile">
        {chips.map((cls, i) => (
          <div key={i} className={`chip ${cls}`} style={{ bottom: `${i * (size * 0.16)}px`, zIndex: i }}>
            <div className="chip-core" />
          </div>
        ))}
      </div>
      {label && <div className="chipstack-label">{fmtAmount(amount, bb, inBB)}</div>}
    </div>
  );
}

export function PotPile({ amount, bb, inBB }) {
  // Several small piles side by side for big pots.
  const piles = [];
  let rem = amount;
  const chunks = amount > 0 ? Math.min(4, 1 + Math.floor(Math.log10(Math.max(1, amount / (bb || 1))))) : 0;
  for (let i = 0; i < chunks; i++) {
    const share = i === chunks - 1 ? rem : Math.round(amount / chunks);
    piles.push(share);
    rem -= share;
  }
  return (
    <div className="potpile">
      {piles.map((p, i) => <ChipStack key={i} amount={p} label={false} size={20} />)}
    </div>
  );
}
