'use strict';

// ─── Deck ────────────────────────────────────────────────────────────────────
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function freshDeck() { return shuffle(makeDeck()); }

// ─── Hand Evaluation (Texas Hold'em + Omaha) ────────────────────────────────
function rankVal(card) { return RANK_VAL[card[0]]; }
function suitOf(card) { return card[1]; }

// Returns numeric score: higher = better hand
// Score format: [handRank, ...tiebreakers] as single comparable integer
function scoreHand(cards) {
  // cards: 5-card array
  const vals = cards.map(rankVal).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every(s => s === suits[0]);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const pairs = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const freq = pairs.map(p => parseInt(p[1]));
  const byFreq = pairs.map(p => parseInt(p[0]));

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  const unique = [...new Set(vals)].sort((a, b) => b - a);
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) { isStraight = true; straightHigh = unique[0]; }
    // Wheel A-2-3-4-5
    if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
      isStraight = true; straightHigh = 5;
    }
  }

  let rank, kickers;
  if (isStraight && isFlush) { rank = 8; kickers = [straightHigh]; }
  else if (freq[0] === 4) { rank = 7; kickers = byFreq; }
  else if (freq[0] === 3 && freq[1] === 2) { rank = 6; kickers = byFreq; }
  else if (isFlush) { rank = 5; kickers = vals; }
  else if (isStraight) { rank = 4; kickers = [straightHigh]; }
  else if (freq[0] === 3) { rank = 3; kickers = byFreq; }
  else if (freq[0] === 2 && freq[1] === 2) { rank = 2; kickers = byFreq; }
  else if (freq[0] === 2) { rank = 1; kickers = byFreq; }
  else { rank = 0; kickers = vals; }

  // Encode as single number
  let score = rank * 1e12;
  for (let i = 0; i < 5; i++) score += (kickers[i] || 0) * Math.pow(15, 4 - i);
  return score;
}

function handName(cards) {
  const vals = cards.map(rankVal).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every(s => s === suits[0]);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const freq = Object.values(counts).sort((a, b) => b - a);
  const unique = [...new Set(vals)].sort((a, b) => b - a);
  let isStraight = false;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) isStraight = true;
    if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) isStraight = true;
  }
  if (isStraight && isFlush) return unique[0] === 14 && unique[1] === 13 ? 'Royal Flush' : 'Straight Flush';
  if (freq[0] === 4) return 'Four of a Kind';
  if (freq[0] === 3 && freq[1] === 2) return 'Full House';
  if (isFlush) return 'Flush';
  if (isStraight) return 'Straight';
  if (freq[0] === 3) return 'Three of a Kind';
  if (freq[0] === 2 && freq[1] === 2) return 'Two Pair';
  if (freq[0] === 2) return 'One Pair';
  return 'High Card';
}

// Best 5-card hand from 7 cards (Hold'em)
function bestHoldemHand(holeCards, board) {
  const all = [...holeCards, ...board];
  let best = null;
  let bestCards = null;
  for (let i = 0; i < all.length - 1; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const five = all.filter((_, idx) => idx !== i && idx !== j);
      const s = scoreHand(five);
      if (best === null || s > best) { best = s; bestCards = five; }
    }
  }
  return { score: best, cards: bestCards, name: handName(bestCards) };
}

// Best 5-card hand from 4 hole + 5 board (Omaha: must use exactly 2 hole, 3 board)
function bestOmahaHand(holeCards, board) {
  let best = null;
  let bestCards = null;
  // Choose 2 from hole cards
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      // Choose 3 from board
      for (let a = 0; a < board.length - 2; a++) {
        for (let b = a + 1; b < board.length - 1; b++) {
          for (let c = b + 1; c < board.length; c++) {
            const five = [holeCards[i], holeCards[j], board[a], board[b], board[c]];
            const s = scoreHand(five);
            if (best === null || s > best) { best = s; bestCards = five; }
          }
        }
      }
    }
  }
  return { score: best, cards: bestCards, name: handName(bestCards) };
}

// ─── Pot + Side Pot Calculation ──────────────────────────────────────────────
function calcPots(players) {
  // players: [{id, totalBet, folded}]
  const active = players.filter(p => p.totalBet > 0);
  const pots = [];
  let remaining = active.map(p => ({ ...p }));

  while (remaining.some(p => p.totalBet > 0)) {
    const minBet = Math.min(...remaining.filter(p => p.totalBet > 0).map(p => p.totalBet));
    const eligible = remaining.filter(p => p.totalBet > 0).map(p => p.id);
    let amount = 0;
    for (const p of remaining) {
      const contrib = Math.min(p.totalBet, minBet);
      amount += contrib;
      p.totalBet -= contrib;
    }
    pots.push({ amount, eligible });
    remaining = remaining.filter(p => p.totalBet > 0 || eligible.includes(p.id));
    remaining = remaining.filter(p => eligible.includes(p.id) || p.totalBet > 0);
    // Remove players who contributed nothing more
    remaining = remaining.filter(p => p.totalBet > 0);
    if (remaining.length === 0) break;
    // Re-add all remaining eligible
    remaining = active.map(p => ({ ...p }));
    let totalTaken = pots.reduce((s, pt) => {
      const contrib = active.find(a => a.id === p?.id);
      return s;
    }, 0);
    // Recalculate: subtract what's already been potted
    const potted = {};
    for (const pot of pots) {
      for (const id of pot.eligible) {
        potted[id] = (potted[id] || 0) + (pot.amount / pot.eligible.length); // rough
      }
    }
    break; // Use simpler approach below
  }

  // Simpler correct approach
  return calcSidePots(players);
}

function calcSidePots(players) {
  const contributing = players.filter(p => p.totalBet > 0);
  if (contributing.length === 0) return [];

  const sorted = [...contributing].sort((a, b) => a.totalBet - b.totalBet);
  const pots = [];
  let prev = 0;

  for (let i = 0; i < sorted.length; i++) {
    const cap = sorted[i].totalBet;
    if (cap === prev) continue;
    const eligible = sorted.slice(i).map(p => p.id);
    // Also include players who are not all-in (folded players excluded from winning but contributed)
    const allEligible = players.filter(p => p.totalBet >= cap || (p.totalBet > prev && !p.folded));
    let amount = 0;
    for (const p of players) {
      const contrib = Math.min(Math.max(p.totalBet - prev, 0), cap - prev);
      amount += contrib;
    }
    // Only non-folded players can win
    const winners_eligible = players.filter(p => !p.folded && p.totalBet >= cap).map(p => p.id);
    // If no non-folded players eligible (everyone folded), let last non-folder win
    pots.push({ amount, eligible: winners_eligible.length > 0 ? winners_eligible : eligible });
    prev = cap;
  }

  return pots;
}

// ─── Determine Winners ───────────────────────────────────────────────────────
function determineWinners(players, board, isOmaha) {
  // Returns array of {potIndex, winners: [id], amount}
  const activePlayers = players.filter(p => !p.folded && p.holeCards && p.holeCards.length > 0);

  const handScores = {};
  const handInfo = {};
  for (const p of activePlayers) {
    const result = isOmaha
      ? bestOmahaHand(p.holeCards, board)
      : bestHoldemHand(p.holeCards, board);
    handScores[p.id] = result.score;
    handInfo[p.id] = result;
  }

  const pots = calcSidePots(players);
  const results = [];

  for (let i = 0; i < pots.length; i++) {
    const pot = pots[i];
    const eligible = pot.eligible.filter(id => handScores[id] !== undefined);
    if (eligible.length === 0) continue;

    const bestScore = Math.max(...eligible.map(id => handScores[id]));
    const winners = eligible.filter(id => handScores[id] === bestScore);
    results.push({
      potIndex: i,
      amount: pot.amount,
      winners,
      handInfo: Object.fromEntries(eligible.map(id => [id, handInfo[id]]))
    });
  }

  return results;
}

// Run it twice: split board into two runouts after all-in
function runItTwice(deck, existingBoard) {
  // existingBoard: cards already dealt
  const needed = 5 - existingBoard.length;
  if (needed <= 0) return { board1: existingBoard, board2: existingBoard, deck };

  const run1 = [...existingBoard, ...deck.slice(0, needed)];
  const run2 = [...existingBoard, ...deck.slice(needed, needed * 2)];
  const remaining = deck.slice(needed * 2);
  return { board1: run1, board2: run2, deck: remaining };
}

module.exports = {
  freshDeck,
  bestHoldemHand,
  bestOmahaHand,
  determineWinners,
  calcSidePots,
  runItTwice,
  handName,
  scoreHand
};
