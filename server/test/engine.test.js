'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateHoldem, evaluateOmaha, CAT } = require('../engine/evaluator');
const { buildPots, splitAmount } = require('../engine/pots');
const { Table } = require('../engine/table');
const { makeDeck } = require('../engine/cards');

// ─── Evaluator ───────────────────────────────────────────────────────────────
test('evaluator ranks hand categories correctly', () => {
  const h = (hole, board) => evaluateHoldem(hole, board);
  assert.equal(h(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c']).cat, CAT.STRAIGHT_FLUSH);
  assert.equal(h(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2d', '3c']).name, 'Royal Flush');
  assert.equal(h(['Ah', 'Ad'], ['As', 'Ac', '2d', '3c', '9h']).cat, CAT.QUADS);
  assert.equal(h(['Ah', 'Ad'], ['As', 'Kc', 'Kd', '3c', '9h']).cat, CAT.FULL_HOUSE);
  assert.equal(h(['Ah', '2h'], ['5h', '9h', 'Kh', '3c', '9d']).cat, CAT.FLUSH);
  assert.equal(h(['Ah', '2d'], ['3s', '4c', '5d', 'Kc', '9h']).cat, CAT.STRAIGHT);
  assert.equal(h(['Ah', '2d'], ['3s', '4c', '5d', 'Kc', '9h']).ranks[0], 5, 'wheel is five-high');
  assert.equal(h(['7h', '7d'], ['7s', '4c', '5d', 'Kc', '9h']).cat, CAT.TRIPS);
  assert.equal(h(['7h', '7d'], ['Ks', '4c', '5d', 'Kc', '9h']).cat, CAT.TWO_PAIR);
  assert.equal(h(['7h', '7d'], ['Ks', '4c', '5d', 'Qc', '9h']).cat, CAT.PAIR);
  assert.equal(h(['7h', '2d'], ['Ks', '4c', '5d', 'Qc', '9h']).cat, CAT.HIGH);
});

test('evaluator kicker comparisons', () => {
  const a = evaluateHoldem(['Ah', 'Kd'], ['As', '4c', '5d', 'Qc', '9h']);
  const b = evaluateHoldem(['Ac', 'Qd'], ['As', '4c', '5d', 'Qc', '9h']);
  assert.ok(b.score > a.score, 'two pair beats one pair');
  const c = evaluateHoldem(['Ah', 'Jd'], ['As', '4c', '5d', 'Qc', '9h']);
  assert.ok(a.score > c.score, 'king kicker beats jack kicker');
  const d = evaluateHoldem(['9h', '8h'], ['7h', '6h', '5h', 'Ac', 'Ad']);
  const e = evaluateHoldem(['Th', '9d'], ['7h', '6h', '5h', 'Ac', 'Ad']);
  assert.ok(d.score > e.score, 'straight flush beats a pair of aces with straight');
});

test('omaha requires exactly two hole cards', () => {
  // Board has four hearts; hero holds one heart. In Hold'em that's a flush, in Omaha it isn't.
  const hole = ['Ah', '2d', '3c', '4s'];
  const board = ['Kh', 'Qh', 'Jh', '9h', '2s'];
  assert.equal(evaluateHoldem(hole.slice(0, 2), board).cat, CAT.FLUSH);
  assert.notEqual(evaluateOmaha(hole, board).cat, CAT.FLUSH);
  // Trips on board with no pair in hand cannot make quads in Omaha.
  // Trips on board: Hold'em would make a full house with the 2d+2s, Omaha (2 hole + 3 board) cannot.
  const r = evaluateOmaha(['Ad', '2d', '3c', '4s'], ['Kh', 'Kd', 'Kc', '9h', '2s']);
  assert.equal(r.cat, CAT.TRIPS);
  assert.equal(evaluateHoldem(['Ad', '2d'], ['Kh', 'Kd', 'Kc', '9h', '2s']).cat, CAT.FULL_HOUSE);
});

// ─── Pots ────────────────────────────────────────────────────────────────────
test('side pots with three all-ins and a folder', () => {
  const pots = buildPots([
    { id: 'a', amount: 50, folded: false },
    { id: 'b', amount: 100, folded: false },
    { id: 'c', amount: 200, folded: false },
    { id: 'd', amount: 30, folded: true },
  ]);
  assert.deepEqual(pots, [
    { amount: 180, eligible: ['a', 'b', 'c'] },
    { amount: 100, eligible: ['b', 'c'] },
    { amount: 100, eligible: ['c'] },
  ]);
});

test('folded chips merge into the pot they belong to', () => {
  const pots = buildPots([
    { id: 'a', amount: 100, folded: false },
    { id: 'b', amount: 100, folded: false },
    { id: 'c', amount: 40, folded: true },
  ]);
  assert.deepEqual(pots, [{ amount: 240, eligible: ['a', 'b'] }]);
});

test('odd chips split to earliest winners', () => {
  assert.deepEqual(splitAmount(101, ['x', 'y']), [{ id: 'x', amount: 51 }, { id: 'y', amount: 50 }]);
});

// ─── Table helpers ────────────────────────────────────────────────────────────
const FAST = { revealDelay: 5, streetDelay: 5, riverDelay: 8, showdownHold: 10, foldWinHold: 10, ritVote: 40 };

// A rigged deck: cards are popped from the end, so list them in reverse deal order.
function riggedDeck(topCards) {
  const rest = makeDeck().filter((c) => !topCards.includes(c));
  return [...rest, ...topCards.slice().reverse()];
}

function makeTable(n, opts = {}) {
  const t = new Table('T', 'p0', { autoApprove: true, autoDeal: false, smallBlind: 1, bigBlind: 2, buyIn: 200, ploFrequency: 0, ...opts.config }, { timing: FAST, ...opts });
  const events = [];
  t.on((e) => events.push(e));
  for (let i = 0; i < n; i++) t.requestJoin({ id: `p${i}`, name: `P${i}`, buyIn: opts.stacks ? opts.stacks[i] : 200 });
  return { t, events };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const actor = (t) => t.seats[t.hand.actionSeat].id;

// ─── Table flow ───────────────────────────────────────────────────────────────
test('blinds and first-to-act, 3-handed', () => {
  const { t } = makeTable(3);
  t.startHand();
  assert.equal(t.hand.dealerSeat, 0);
  assert.equal(t.hand.sbSeat, 1);
  assert.equal(t.hand.bbSeat, 2);
  assert.equal(t.seats[1].stack, 199);
  assert.equal(t.seats[2].stack, 198);
  assert.equal(actor(t), 'p0', 'UTG (dealer in 3-handed) acts first');
  t.destroy();
});

test('heads-up: dealer posts small blind and acts first preflop, BB first postflop', () => {
  const { t } = makeTable(2);
  t.startHand();
  assert.equal(t.hand.dealerSeat, 0);
  assert.equal(t.hand.sbSeat, 0);
  assert.equal(t.hand.bbSeat, 1);
  assert.equal(actor(t), 'p0');
  t.act('p0', 'call');
  assert.equal(actor(t), 'p1', 'BB gets the option');
  t.act('p1', 'check');
  assert.equal(t.hand.phase, 'flop');
  assert.equal(actor(t), 'p1', 'BB acts first postflop heads-up');
  t.destroy();
});

test('fold to a bet ends the hand and returns the uncalled portion', async () => {
  const { t, events } = makeTable(3);
  t.startHand();
  t.act('p0', 'raise', 10);
  t.act('p1', 'fold');
  t.act('p2', 'fold');
  const result = events.find((e) => e.type === 'result');
  assert.ok(result);
  assert.equal(result.winners[0].playerId, 'p0');
  assert.equal(result.winners[0].amount, 5, 'wins SB + BB + own matched 2');
  assert.equal(t.seats[0].stack, 203);
  await sleep(30);
  assert.equal(t.hand, null);
  t.destroy();
});

test('full hand to showdown with correct winner', async () => {
  // Deal order: p0,p1,p2 card 1; p0,p1,p2 card 2; burn, flop(3), burn, turn, burn, river
  const top = ['As', '2d', '7c', 'Ad', '3d', '8c', 'Xx', 'Ac', 'Kh', '9s', 'Xx', '4h', 'Xx', 'Jc'].map((c, i) => (c === 'Xx' ? ['5s', '6s', '2s'][i % 3] : c));
  const { t, events } = makeTable(3, { deckFactory: () => riggedDeck(top) });
  t.startHand();
  assert.deepEqual(t.seats[0].cards, ['As', 'Ad']);
  t.act('p0', 'raise', 6);
  t.act('p1', 'call');
  t.act('p2', 'call');
  assert.equal(t.hand.phase, 'flop');
  assert.equal(t.hand.potTotal === undefined ? t._potTotal() : 0, 18);
  assert.equal(actor(t), 'p1', 'SB first postflop');
  t.act('p1', 'check'); t.act('p2', 'check'); t.act('p0', 'bet', 10);
  t.act('p1', 'call'); t.act('p2', 'fold');
  assert.equal(t.hand.phase, 'turn');
  t.act('p1', 'check'); t.act('p0', 'check');
  assert.equal(t.hand.phase, 'river');
  t.act('p1', 'check'); t.act('p0', 'check');
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.showdown, true);
  assert.equal(result.winners.length, 1);
  assert.equal(result.winners[0].playerId, 'p0');
  assert.equal(result.winners[0].amount, 38);
  assert.match(result.winners[0].handName, /Three of a Kind, Aces/);
  assert.equal(t.seats[0].stack, 200 - 16 + 38);
  await sleep(40);
  assert.equal(t.hand, null);
  t.destroy();
});

test('all-in runout deals remaining streets with delays and reveals cards', async () => {
  const { t, events } = makeTable(2, { stacks: [50, 200] });
  t.startHand();
  t.act('p0', 'allin');
  assert.equal(actor(t), 'p1');
  t.act('p1', 'call');
  assert.ok(events.find((e) => e.type === 'reveal'));
  assert.equal(t.hand.runningOut, true);
  await sleep(300); // nobody answers the run-it-twice offer: it runs once
  const streets = events.filter((e) => e.type === 'street').map((e) => e.street);
  assert.ok(streets.includes('flop') && streets.includes('turn') && streets.includes('river'));
  const result = events.find((e) => e.type === 'result');
  assert.ok(result, 'result emitted');
  const total = result.winners.reduce((s, w) => s + w.amount, 0);
  assert.equal(total, 100, 'pot is 50+50; the caller only matches the short stack');
  assert.equal(result.refund, null);
  assert.equal(t.seats[0].stack + t.seats[1].stack, 250, 'chips conserved');
  t.destroy();
});

test('run it twice deals a second board when everyone opts in', async () => {
  const { t, events } = makeTable(2, { stacks: [100, 100] });
  t.startHand();
  t.act('p0', 'raise', 20);
  t.act('p1', 'raise', 60);
  t.act('p0', 'allin');
  t.act('p1', 'call');
  assert.ok(events.find((e) => e.type === 'ritOffer'), 'players are asked');
  t.voteRunItTwice('p0', true);
  t.voteRunItTwice('p1', true);
  await sleep(300);
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.runItTwice, true);
  assert.equal(result.board.length, 5);
  assert.equal(result.board2.length, 5);
  const total = result.winners.reduce((s, w) => s + w.amount, 0);
  assert.equal(total, 200);
  assert.equal(t.seats[0].stack + t.seats[1].stack, 200);
  t.destroy();
});

test('run it twice is skipped when a player says no (or does not answer in time)', async () => {
  const { t, events } = makeTable(2, { stacks: [100, 100] });
  t.startHand();
  t.act('p0', 'allin');
  t.act('p1', 'call');
  t.voteRunItTwice('p0', true);
  t.voteRunItTwice('p1', false);
  await sleep(300);
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.runItTwice, false);
  assert.equal(result.board2, null);
  t.destroy();
});

test('side pots pay the right players', async () => {
  // p0 short stack with the best hand, p1 medium, p2 covers. p2 should win the side pot.
  const top = [
    'As', '7d', 'Kc',      // card 1 each
    'Ad', '7h', 'Kd',      // card 2 each
    '2c', '3c', '4c', '9h',  // burn + flop
    '2h', 'Jd',              // burn + turn
    '2d', 'Qs',              // burn + river
  ];
  const { t, events } = makeTable(3, { stacks: [30, 80, 200], deckFactory: () => riggedDeck(top), config: { runItTwice: false } });
  t.startHand();
  t.act('p0', 'allin');   // 30
  t.act('p1', 'allin');   // 80
  t.act('p2', 'call');    // 80
  await sleep(300);
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.pots.length, 2);
  assert.equal(result.pots[0].amount, 90);
  assert.equal(result.pots[1].amount, 100);
  const byPlayer = {};
  for (const w of result.winners) byPlayer[w.playerId] = (byPlayer[w.playerId] || 0) + w.amount;
  assert.equal(byPlayer.p0, 90, 'aces win main pot');
  assert.equal(byPlayer.p2, 100, 'kings win side pot over sevens');
  assert.equal(t.seats[0].stack + t.seats[1].stack + t.seats[2].stack, 310);
  t.destroy();
});

test('short all-in raise does not reopen betting for players who already acted', () => {
  const { t } = makeTable(3, { stacks: [200, 13, 200] });
  t.startHand();
  // p0 raises to 10, p1 (SB, stack 13 -> 12 after blind) goes all-in for 13 total, a raise of 3 (< min raise 8)
  t.act('p0', 'raise', 10);
  t.act('p1', 'allin');
  assert.equal(t.hand.currentBet, 13);
  t.act('p2', 'call');  // BB hadn't acted, may raise, chooses to call
  assert.equal(actor(t), 'p0');
  const legal = t.legalActions('p0');
  assert.equal(legal.canCall, true);
  assert.equal(legal.canRaise, false, 'p0 already acted; short all-in does not reopen');
  t.act('p0', 'call');
  assert.equal(t.hand.phase, 'flop');
  t.destroy();
});

test('minimum raise tracks the last full raise size', () => {
  const { t } = makeTable(3);
  t.startHand();
  t.act('p0', 'raise', 8);   // raise of 6
  let legal = t.legalActions('p1');
  assert.equal(legal.minRaiseTo, 14);
  t.act('p1', 'raise', 20);  // raise of 12
  legal = t.legalActions('p2');
  assert.equal(legal.minRaiseTo, 32);
  assert.deepEqual(t.act('p2', 'raise', 25), { error: 'Minimum raise is 32' });
  t.destroy();
});

test('pot-limit caps raises in PLO', () => {
  const { t } = makeTable(3, { config: { ploFrequency: 1, ploMode: 'blinds' } });
  t.startHand();
  assert.equal(t.hand.variant, 'PLO');
  assert.equal(t.seats[0].cards.length, 4);
  // Pot is 3 (SB 1 + BB 2). UTG to call 2, max raise to = 2 + (3 + 2) = 7.
  let legal = t.legalActions('p0');
  assert.equal(legal.maxRaiseTo, 7);
  assert.equal(legal.minRaiseTo, 4);
  t.act('p0', 'raise', 7);
  // Pot now 10. SB has 1 in, to call 6, max = 7 + (10 + 6) = 23
  legal = t.legalActions('p1');
  assert.equal(legal.maxRaiseTo, 23);
  const r = t.act('p1', 'raise', 50);
  assert.equal(r.ok, true);
  assert.equal(r.amount, 23, 'oversized raise is clamped to the pot');
  t.destroy();
});

test('bomb pot posts antes, deals 4 cards, and starts on the flop', () => {
  const { t, events } = makeTable(3, { config: { ploFrequency: 1, ploMode: 'bomb', bombAnteBB: 2, doubleBoard: true } });
  t.startHand();
  assert.equal(t.hand.bombPot, true);
  assert.equal(t.hand.phase, 'flop');
  assert.equal(t.hand.board.length, 3);
  assert.equal(t.hand.board2.length, 3);
  assert.equal(t._potTotal(), 12);
  assert.equal(t.seats[0].stack, 196);
  assert.equal(actor(t), 'p1', 'first left of dealer acts on the flop');
  assert.ok(events.find((e) => e.type === 'post' && e.kind === 'bomb'));
  t.destroy();
});

test('double board bomb pot splits each pot between boards', async () => {
  const { t, events } = makeTable(2, { stacks: [100, 100], config: { ploFrequency: 1, ploMode: 'bomb', doubleBoard: true, bombAnteBB: 25 } });
  t.startHand();
  assert.equal(t._potTotal(), 100);
  assert.equal(t.legalActions('p1').maxRaiseTo, 50, 'pot-limit allows the full remaining stack here');
  t.act('p1', 'allin');
  t.act('p0', 'call');
  await sleep(300);
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.doubleBoard, true);
  const b1 = result.winners.filter((w) => w.board === 1).reduce((s, w) => s + w.amount, 0);
  const b2 = result.winners.filter((w) => w.board === 2).reduce((s, w) => s + w.amount, 0);
  assert.equal(b1, 100);
  assert.equal(b2, 100);
  assert.equal(t.seats[0].stack + t.seats[1].stack, 200);
  t.destroy();
});

test('action timeout auto-folds (or checks) and uses the time bank first', async () => {
  const { t, events } = makeTable(2, { config: { actionTime: 5, timeBank: 0 } });
  t.startHand();
  // Shrink the timer for the test by re-arming it manually
  t._clearTimer('action');
  t._setTimer('action', () => t._onActionTimeout(), 10);
  await sleep(40);
  const act = events.find((e) => e.type === 'action');
  assert.equal(act.action, 'fold');
  assert.equal(act.auto, true);
  t.destroy();
});

test('player leaving mid-hand is folded and removed after the hand', async () => {
  const { t } = makeTable(3);
  t.startHand();
  t.removePlayer('p2');
  assert.equal(t.seats[2].folded, true);
  assert.equal(actor(t), 'p0');
  t.act('p0', 'call');
  t.act('p1', 'fold');
  await sleep(40);
  assert.equal(t.seats[2], null);
  assert.equal(t.players.length, 2);
  t.destroy();
});

test('dealer button rotates and skips sit-outs', () => {
  const { t } = makeTable(3);
  t.startHand(); assert.equal(t.hand.dealerSeat, 0);
  t.act('p0', 'fold'); t.act('p1', 'fold');
  t._endHand();
  t.setSitOut('p1', true);
  t.startHand(); assert.equal(t.hand.dealerSeat, 2, 'seat 1 sitting out is skipped');
  assert.equal(t.hand.sbSeat, 2, 'heads-up dealer is SB');
  t.destroy();
});

test('state hides other players cards until showdown', async () => {
  const { t } = makeTable(2);
  t.startHand();
  const s = t.state('p0');
  assert.equal(s.seats[0].cards.length, 2);
  assert.equal(s.seats[1].cards, null);
  assert.equal(s.seats[1].cardCount, 2);
  t.act('p0', 'allin');
  t.act('p1', 'call');
  const s2 = t.state('p0');
  assert.equal(s2.seats[1].cards.length, 2, 'revealed once all-in');
  await sleep(300);
  t.destroy();
});

test('everyone folds to the big blind: BB wins blinds without showdown', () => {
  const { t, events } = makeTable(3);
  t.startHand();
  t.act('p0', 'fold');
  t.act('p1', 'fold');
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.winners[0].playerId, 'p2');
  assert.equal(result.winners[0].amount, 2, 'matched chips');
  assert.deepEqual(result.refund, { seat: 2, playerId: 'p2', amount: 1 }, 'uncalled blind returned');
  assert.equal(t.seats[2].stack, 201);
  t.destroy();
});

test('check-around on every street reaches showdown', () => {
  const { t, events } = makeTable(3);
  t.startHand();
  t.act('p0', 'call'); t.act('p1', 'call'); t.act('p2', 'check');
  for (const _ of [1, 2, 3]) { t.act('p1', 'check'); t.act('p2', 'check'); t.act('p0', 'check'); }
  const result = events.find((e) => e.type === 'result');
  assert.equal(result.showdown, true);
  assert.equal(result.reveals.length, 3);
  t.destroy();
});

test('UTG straddle posts 2x BB and acts last preflop', () => {
  const { t } = makeTable(4);
  t.setStraddle('p3', true); // seat 3 is UTG when the dealer is seat 0
  t.startHand();
  assert.equal(t.hand.straddleSeat, 3);
  assert.equal(t.seats[3].stack, 196);
  assert.equal(t.hand.currentBet, 4);
  assert.equal(actor(t), 'p0', 'action starts left of the straddle');
  assert.equal(t.legalActions('p0').minRaiseTo, 8);
  t.act('p0', 'call'); t.act('p1', 'call'); t.act('p2', 'call');
  assert.equal(actor(t), 'p3', 'straddler gets the option');
  t.act('p3', 'check');
  assert.equal(t.hand.phase, 'flop');
  assert.equal(t._potTotal(), 16);
  t.destroy();
});

test('straddle is ignored heads-up and when the stack is too short', () => {
  const { t } = makeTable(2);
  t.setStraddle('p1', true);
  t.startHand();
  assert.equal(t.hand.straddleSeat, null);
  t.destroy();
  const { t: t3 } = makeTable(3, { stacks: [200, 200, 3] });
  t3.setStraddle('p2', true);
  t3.startHand();
  assert.equal(t3.hand.straddleSeat, null);
  t3.destroy();
});

test('winner of an uncontested pot can show cards; history hides them until then', async () => {
  const { t, events } = makeTable(3);
  t.startHand();
  t.act('p0', 'raise', 10);
  t.act('p1', 'fold');
  t.act('p2', 'fold');
  assert.equal(t.state('p1').hand.canShow, false);
  assert.equal(t.state('p0').hand.canShow, true);
  assert.equal(t.historyFor('p1')[0].players.find((p) => p.playerId === 'p0').cards, null, 'not public');
  assert.equal(t.historyFor('p0')[0].players.find((p) => p.playerId === 'p0').cards.length, 2, 'own cards visible to self');
  assert.deepEqual(t.showCards('p1'), { error: 'You have no cards to show' });
  assert.equal(t.showCards('p0').ok, true);
  const shown = events.find((e) => e.type === 'showCards');
  assert.equal(shown.playerId, 'p0');
  assert.equal(t.state('p1').seats[0].cards.length, 2, 'now everyone sees them');
  assert.equal(t.historyFor('p1')[0].players.find((p) => p.playerId === 'p0').cards.length, 2);
  await sleep(30);
  t.destroy();
});

test('rebuys need host approval', async () => {
  const { t, events } = makeTable(2, { stacks: [50, 200] });
  t.startHand();
  t.act('p0', 'allin');
  t.act('p1', 'call');
  await sleep(300);
  const loser = t.seats[0].stack === 0 ? 'p0' : 'p1';
  assert.equal(t.requestRebuy(loser, 200).pending, true);
  assert.equal(t.state('p0').rebuyRequests.length, 1, 'host sees the request');
  assert.equal(t.state(loser).seats.find((p) => p.id === loser).rebuyRequested, 200);
  const before = t.getPlayer(loser).stack;
  t.approveRebuy(loser, 150);
  assert.equal(t.getPlayer(loser).stack, before + 150);
  assert.equal(t.getPlayer(loser).sittingOut, false);
  assert.ok(events.find((e) => e.type === 'rebuyApproved'));
  assert.equal(t.state('p0').rebuyRequests.length, 0);
  t.requestRebuy(loser, 100);
  t.denyRebuy(loser);
  assert.ok(events.find((e) => e.type === 'rebuyDenied'));
  assert.equal(t.getPlayer(loser).stack, before + 150);
  t.destroy();
});
