import React from 'react';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export default function Card({ card, size = 'md', highlight = false, isNew = false, faceDown = false }) {
  const sizeClass = size === 'sm' ? 'card-sm' : size === 'lg' ? 'card-lg' : '';
  const highlightClass = highlight ? 'card-highlight' : '';
  const newClass = isNew ? 'card-new' : '';

  if (faceDown || !card) {
    return <div className={`card card-back ${sizeClass}`} />;
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const colorClass = RED_SUITS.has(suit) ? 'red-suit' : 'black-suit';
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`card ${sizeClass} ${highlightClass} ${newClass}`}>
      <span className={`card-rank ${colorClass}`}>{displayRank}</span>
      <span className={`card-suit-center ${colorClass}`}>{symbol}</span>
      <span className={`card-rank-bottom ${colorClass}`}>{displayRank}</span>
    </div>
  );
}
