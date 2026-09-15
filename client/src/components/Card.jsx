import React, { useEffect, useState } from 'react';

const SUIT_PATH = {
  s: 'M12 1.5C9.2 6.8 3.5 9.3 3.5 14.2a4.6 4.6 0 0 0 7.3 3.7L9.4 22.5h5.2l-1.4-4.6a4.6 4.6 0 0 0 7.3-3.7c0-4.9-5.7-7.4-8.5-12.7z',
  h: 'M12 21.6S3.2 15.8 3.2 9.6A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.8 2.4c0 6.2-8.8 12-8.8 12z',
  d: 'M12 1.6l7.4 10.4L12 22.4 4.6 12z',
  c: 'M12 1.8a4 4 0 0 0-3.4 6.1 4.1 4.1 0 1 0 2.5 7.6L9.6 22.4h4.8l-1.5-6.9a4.1 4.1 0 1 0 2.5-7.6A4 4 0 0 0 12 1.8z',
};

const RANK_LABEL = { T: '10' };

export function Suit({ suit, className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

export function suitClass(suit, fourColor) {
  if (!fourColor) return suit === 'h' || suit === 'd' ? 'suit-red' : 'suit-black';
  return { s: 'suit-black', h: 'suit-red', d: 'suit-blue', c: 'suit-green' }[suit];
}

/**
 * A playing card. `card` like "As"; null/undefined renders a back.
 * `flipDelay` flips from back to face after N ms (used for dealing).
 */
export default function Card({ card, faceDown = false, size = 'md', flipDelay = 0, className = '', style, dim = false, highlight = false, fourColor = false, dealIndex = null, dealFrom = null }) {
  const [revealed, setRevealed] = useState(flipDelay === 0);
  useEffect(() => {
    if (flipDelay > 0) { setRevealed(false); const t = setTimeout(() => setRevealed(true), flipDelay); return () => clearTimeout(t); }
    setRevealed(true);
    return undefined;
  }, [flipDelay, card]);

  const showFace = !!card && !faceDown && revealed;
  const rank = card ? card[0] : null;
  const suit = card ? card[1] : null;
  const styles = { ...style };
  if (dealFrom) { styles['--deal-x'] = `${dealFrom[0]}px`; styles['--deal-y'] = `${dealFrom[1]}px`; }
  if (dealIndex !== null) styles.animationDelay = `${dealIndex * 70}ms`;

  return (
    <div className={`card card-${size} ${showFace ? 'is-up' : 'is-down'} ${dim ? 'is-dim' : ''} ${highlight ? 'is-hi' : ''} ${dealFrom ? 'is-dealt' : ''} ${className}`} style={styles}>
      <div className="card-inner">
        <div className="card-back" />
        {card && (
          <div className={`card-face ${suitClass(suit, fourColor)}`}>
            <div className="card-corner">
              <span className="card-rank">{RANK_LABEL[rank] || rank}</span>
              <Suit suit={suit} className="card-corner-suit" />
            </div>
            <Suit suit={suit} className="card-pip" />
          </div>
        )}
      </div>
    </div>
  );
}
