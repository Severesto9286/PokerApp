import React, { useState, useEffect, useRef } from 'react';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export default function Card({ card, size = 'md', highlight = false, isNew = false, faceDown = false, animationSpeed = 1, animate = true, dealDelay = 0 }) {
  // Track whether this card has been revealed yet
  const [revealed, setRevealed] = useState(!isNew || faceDown || !animate);
  const prevCard = useRef(card);

  const duration = animate ? Math.round(280 / Math.max(animationSpeed, 0.1)) : 0;

  useEffect(() => {
    // Only animate if isNew AND animate AND we have a real card AND card just changed
    if (isNew && animate && card && !faceDown) {
      setRevealed(false);
      const t = setTimeout(() => setRevealed(true), dealDelay + 40);
      return () => clearTimeout(t);
    } else {
      setRevealed(!faceDown && !!card);
    }
    prevCard.current = card;
  }, [card, isNew, faceDown, animate, dealDelay]);

  const sizeClass = size === 'sm' ? 'card-sm' : size === 'lg' ? 'card-lg' : size === 'xl' ? 'card-xl' : '';
  const highlightClass = highlight ? 'card-highlight' : '';

  // Flip style: cards start rotated 90deg (edge-on = invisible), rotate to 0 when revealed
  const flipStyle = (animate && isNew) ? {
    transition: revealed ? `transform ${duration}ms ease-out` : 'none',
    transform: revealed ? 'rotateY(0deg)' : 'rotateY(90deg)',
  } : {};

  if (!revealed || faceDown || !card) {
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
