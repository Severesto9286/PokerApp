'use strict';

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';

const RANK_VALUE = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2]));
const RANK_NAMES = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};
const RANK_PLURAL = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights',
  9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

// Fisher-Yates with crypto-grade randomness so shuffles are not predictable.
function shuffle(deck) {
  const { randomInt } = require('crypto');
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const freshDeck = () => shuffle(makeDeck());
const rankOf = (card) => RANK_VALUE[card[0]];
const suitOf = (card) => card[1];

module.exports = { RANKS, SUITS, RANK_VALUE, RANK_NAMES, RANK_PLURAL, makeDeck, shuffle, freshDeck, rankOf, suitOf };
