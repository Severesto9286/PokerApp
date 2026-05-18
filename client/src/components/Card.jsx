import React, { useState, useEffect } from 'react';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export default function Card({ card, size = 'md', highlight = false, isNew = false, faceDown = false, animationSpeed = 1, animate = true }) {
  const [flipped, setFlipped] = useState(false);
  const [showFace, setShowFace] = useState(!isNew || faceDown);

  const duration = animate ? Math.round(300 / animationSpeed) : 0;
  const halfDuration = duration / 2;

  useEffect(() => {
    if (isNew && !faceDown && animate && card) {
      setFlipped(false);
      setShowFace(false);
      const t1 = setTimeout(() => setFlipped(true), 60);
      const t2 = setTimeout(() => setShowFace(true), 60 + halfDuration);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      setShowFace(!faceDown);
      setFlipped(false);
    }
  }, [card, isNew, faceDown, animate]);

  const sizeClass = size === 'sm' ? 'card-sm' : size === 'lg' ? 'card-lg' : size === 'xl' ? 'card-xl' : '';
  const highlightClass = highlight ? 'card-highlight' : '';

  const flipStyle = animate ? {
    transition: `transform ${halfDuration}ms ease-in-out`,
    transform: flipped ? 'rotateY(0deg)' : 'rotateY(90deg)',
    transformStyle: 'preserve-3d',
  } : {};

  if (!showFace || faceDown || !card) {
    return <div className={`card card-back ${sizeClass}`} style={flipStyle} />;
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const colorClass = RED_SUITS.has(suit) ? 'red-suit' : 'black-suit';
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`card ${sizeClass} ${highlightClass}`} style={flipStyle}>
      <span className={`card-rank ${colorClass}`}>{displayRank}</span>
      <span className={`card-suit-center ${colorClass}`}>{symbol}</span>
      <span className={`card-rank-bottom ${colorClass}`}>{displayRank}</span>
    </div>
  );
}
