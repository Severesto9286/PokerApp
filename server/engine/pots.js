'use strict';

// Build main/side pots from each player's total contribution to the hand.
// contributions: [{ id, amount, folded }]
// Folded players' chips go in but they are never eligible to win.
function buildPots(contributions) {
  const live = contributions.filter((c) => c.amount > 0);
  if (live.length === 0) return [];

  const levels = [...new Set(live.filter((c) => !c.folded).map((c) => c.amount))].sort((a, b) => a - b);
  // If everybody folded except one, still need a level to sweep the chips.
  const maxAll = Math.max(...live.map((c) => c.amount));
  if (levels.length === 0 || levels[levels.length - 1] < maxAll) levels.push(maxAll);

  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of live) amount += Math.max(0, Math.min(c.amount, level) - prev);
    const eligible = live.filter((c) => !c.folded && c.amount >= level).map((c) => c.id);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }

  // Merge consecutive pots with identical eligibility (happens when a folded
  // player's contribution created a level nobody live sits at).
  const merged = [];
  for (const p of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligible, p.eligible)) last.amount += p.amount;
    else merged.push({ amount: p.amount, eligible: p.eligible.slice() });
  }
  return merged;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Split an amount between winners; odd chips go to earliest winners in order.
function splitAmount(amount, winners) {
  const base = Math.floor(amount / winners.length);
  let rem = amount - base * winners.length;
  return winners.map((id) => ({ id, amount: base + (rem-- > 0 ? 1 : 0) }));
}

module.exports = { buildPots, splitAmount };
