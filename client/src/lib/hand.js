// Client-side copy of the server evaluator (kept in sync by hand) for live hand-strength hints.


const RANK_VALUE = Object.fromEntries([...'23456789TJQKA'].map((r, i) => [r, i + 2]));
const rankOf = (c) => RANK_VALUE[c[0]];
const suitOf = (c) => c[1];
const RANK_NAMES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const RANK_PLURAL = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };

// Hand categories, higher is better.
const CAT = {
  HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};

// Score a 5-card hand. Returns { score, cat, ranks } where score is an integer
// that compares correctly across all hands (higher wins).
function score5(cards) {
  const vals = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  // Sort groups by count desc then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5 && vals[4] === 2) straightHigh = 5; // wheel
  }

  let cat;
  let ranks;
  if (straightHigh && flush) { cat = CAT.STRAIGHT_FLUSH; ranks = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = CAT.QUADS; ranks = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = CAT.FULL_HOUSE; ranks = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = CAT.FLUSH; ranks = vals; }
  else if (straightHigh) { cat = CAT.STRAIGHT; ranks = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = CAT.TRIPS; ranks = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = CAT.TWO_PAIR; ranks = [groups[0][0], groups[1][0], groups[2][0]]; }
  else if (groups[0][1] === 2) { cat = CAT.PAIR; ranks = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]; }
  else { cat = CAT.HIGH; ranks = vals; }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] || 0);
  return { score, cat, ranks };
}

function combinations(arr, k) {
  const out = [];
  const rec = (start, combo) => {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  };
  rec(0, []);
  return out;
}

function best(candidates) {
  let top = null;
  for (const five of candidates) {
    const s = score5(five);
    if (!top || s.score > top.score) top = { ...s, cards: five };
  }
  return top;
}

// Hold'em: best 5 of any 7 (or fewer) cards.
function evaluateHoldem(hole, board) {
  const all = [...hole, ...board];
  if (all.length < 5) return null;
  const r = best(combinations(all, 5));
  return finish(r);
}

// Omaha: exactly 2 hole + exactly 3 board.
function evaluateOmaha(hole, board) {
  if (board.length < 3) return null;
  const holeCombos = combinations(hole, 2);
  const boardCombos = combinations(board, 3);
  const candidates = [];
  for (const h of holeCombos) for (const b of boardCombos) candidates.push([...h, ...b]);
  return finish(best(candidates));
}

function evaluate(hole, board, variant) {
  return variant === 'PLO' ? evaluateOmaha(hole, board) : evaluateHoldem(hole, board);
}

function finish(r) {
  if (!r) return null;
  return { score: r.score, cat: r.cat, ranks: r.ranks, cards: r.cards, name: describe(r) };
}

function describe({ cat, ranks }) {
  const R = (v) => RANK_NAMES[v];
  const P = (v) => RANK_PLURAL[v];
  switch (cat) {
    case CAT.STRAIGHT_FLUSH: return ranks[0] === 14 ? 'Royal Flush' : `Straight Flush, ${R(ranks[0])} high`;
    case CAT.QUADS: return `Four of a Kind, ${P(ranks[0])}`;
    case CAT.FULL_HOUSE: return `Full House, ${P(ranks[0])} full of ${P(ranks[1])}`;
    case CAT.FLUSH: return `Flush, ${R(ranks[0])} high`;
    case CAT.STRAIGHT: return `Straight, ${R(ranks[0])} high`;
    case CAT.TRIPS: return `Three of a Kind, ${P(ranks[0])}`;
    case CAT.TWO_PAIR: return `Two Pair, ${P(ranks[0])} and ${P(ranks[1])}`;
    case CAT.PAIR: return `Pair of ${P(ranks[0])}`;
    default: return `${R(ranks[0])} High`;
  }
}

// Short label like "Two Pair" for compact UI.
function shortName(cat) {
  return ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'][cat];
}

export { CAT, score5, evaluate, evaluateHoldem, evaluateOmaha, describe, shortName, combinations };
