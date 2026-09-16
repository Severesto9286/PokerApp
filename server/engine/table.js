'use strict';

const { freshDeck } = require('./cards');
const { evaluate } = require('./evaluator');
const { buildPots, splitAmount } = require('./pots');

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_CARDS = { flop: 3, turn: 1, river: 1 };

const DEFAULT_CONFIG = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  maxSeats: 6,
  buyIn: 200,          // default stack for new players (in chips)
  actionTime: 20,      // seconds per decision
  timeBank: 30,        // extra seconds each player can burn
  ploFrequency: 0.15,  // chance a hand is PLO (0..1)
  ploMode: 'blinds',   // 'blinds' = normal PLO with blinds, 'bomb' = bomb pot
  bombAnteBB: 2,       // bomb pot ante in big blinds
  doubleBoard: false,  // bomb pots dealt with two boards
  runItTwice: true,    // allow RIT when all-in with cards to come
  autoDeal: true,
  autoDealDelay: 5,    // seconds after a hand ends
  autoApprove: false,  // host must approve joins
  allowRebuy: true,
};

// Timing of dramatic moments (ms). Overridable for tests.
const DEFAULT_TIMING = {
  revealDelay: 1100,      // cards flip before the run-out starts
  streetDelay: 1500,      // gap between run-out streets
  riverDelay: 2400,       // suspense before the last card
  showdownHold: 6000,     // results stay on screen before the hand ends
  foldWinHold: 2600,
  ritVote: 10000,         // how long players get to answer "run it twice?"
};

class Table {
  constructor(id, hostId, config = {}, opts = {}) {
    this.id = id;
    this.hostId = hostId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timing = { ...DEFAULT_TIMING, ...(opts.timing || {}) };
    this.random = opts.random || Math.random;
    this.deckFactory = opts.deckFactory || freshDeck;
    this.seats = Array.from({ length: this.config.maxSeats }, () => null);
    this.pending = [];
    this.rebuyRequests = [];
    this.hand = null;
    this.handNumber = 0;
    this.history = [];
    this.chat = [];
    this.paused = false;
    this.seq = 0;
    this.timers = new Map();
    this.listeners = [];
    this.nextHandVariant = null; // host can force the next hand's variant
    this.lastResult = null;
    this.lastDealerSeat = -1;
    this.autoDealAt = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  emit(type, payload = {}) {
    this.seq++;
    this.lastActivity = Date.now();
    const evt = { type, ...payload, seq: this.seq, at: Date.now() };
    for (const fn of this.listeners) fn(evt);
  }

  _setTimer(name, fn, ms) {
    this._clearTimer(name);
    this.timers.set(name, setTimeout(() => { this.timers.delete(name); fn(); }, ms));
  }
  _clearTimer(name) {
    const t = this.timers.get(name);
    if (t) { clearTimeout(t); this.timers.delete(name); }
  }
  destroy() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); this.listeners = []; }

  // ─── Players / seats ───────────────────────────────────────────────────────
  get players() { return this.seats.filter(Boolean); }
  getPlayer(id) { return this.seats.find((p) => p && p.id === id) || null; }
  isHost(id) { return id === this.hostId; }

  requestJoin({ id, name, avatar, buyIn }) {
    if (this.getPlayer(id)) return { error: 'Already seated' };
    if (this.pending.find((p) => p.id === id)) return { error: 'Already requested' };
    if (this.players.length + this.pending.length >= this.config.maxSeats) return { error: 'Table is full' };
    const req = { id, name: String(name || 'Player').slice(0, 16), avatar: Number(avatar) || 0, buyIn: this._sanitizeBuyIn(buyIn), at: Date.now() };
    if (this.config.autoApprove || id === this.hostId) return this._seat(req);
    this.pending.push(req);
    this.emit('joinRequest', { request: { id: req.id, name: req.name, buyIn: req.buyIn } });
    return { pending: true };
  }

  approveJoin(reqId, buyIn) {
    const req = this.pending.find((p) => p.id === reqId);
    if (!req) return { error: 'No such request' };
    this.pending = this.pending.filter((p) => p.id !== reqId);
    if (buyIn !== undefined && buyIn !== null) req.buyIn = this._sanitizeBuyIn(buyIn);
    return this._seat(req);
  }

  denyJoin(reqId) {
    this.pending = this.pending.filter((p) => p.id !== reqId);
    this.emit('joinDenied', { playerId: reqId });
  }

  _sanitizeBuyIn(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n <= 0) return this.config.buyIn;
    return Math.min(n, 1e9);
  }

  _seat(req) {
    const seat = this.seats.findIndex((s) => s === null);
    if (seat < 0) return { error: 'Table is full' };
    const player = {
      id: req.id, name: req.name, avatar: req.avatar, seat,
      stack: req.buyIn, connected: true, sittingOut: false,
      timeBank: this.config.timeBank, straddle: false,
      cards: [], folded: false, allIn: false, streetBet: 0, handBet: 0,
      acted: false, raiseLocked: false, lastAction: null, inHand: false,
      pendingRebuy: 0, leaving: false,
    };
    this.seats[seat] = player;
    this.emit('playerSeated', { player: this._publicPlayer(player) });
    if (!this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
    return { player };
  }

  removePlayer(id, reason = 'left') {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    p.leaveReason = reason;
    if (this.hand && p.inHand && !p.folded && !this.hand.finished) {
      p.leaving = true;
      p.sittingOut = true;
      if (this.hand.actionSeat === p.seat) {
        this.act(id, 'fold');
      } else if (!p.allIn) {
        p.folded = true;
        p.lastAction = 'fold';
        this.hand.log.push({ seat: p.seat, action: 'fold', amount: 0, street: this.hand.phase });
        this.emit('action', { seat: p.seat, playerId: p.id, action: 'fold', amount: 0, street: this.hand.phase, stack: p.stack, streetBet: p.streetBet });
        this._afterAction(true);
      }
      return { ok: true, deferred: true };
    }
    this.rebuyRequests = this.rebuyRequests.filter((r) => r.id !== id);
    this.seats[p.seat] = null;
    this.emit('playerLeft', { playerId: id, seat: p.seat, reason });
    return { ok: true };
  }

  setConnected(id, connected) {
    const p = this.getPlayer(id);
    if (!p) return;
    p.connected = connected;
    // Players we sat out because they dropped come straight back in when they return.
    if (connected && p.autoSatOut) {
      p.autoSatOut = false;
      if (p.stack > 0 && !p.leaving) p.sittingOut = false;
      if (!this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
    }
    this.emit('presence', { playerId: id, connected });
  }

  setSitOut(id, sitOut) {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    p.sittingOut = !!sitOut;
    p.autoSatOut = false;
    this.emit('sitOut', { playerId: id, sittingOut: p.sittingOut });
    if (!p.sittingOut && !this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
    return { ok: true };
  }

  setStraddle(id, enabled) {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    p.straddle = !!enabled;
    this.emit('prefs', { playerId: id });
    return { ok: true };
  }

  // Players ask; the host approves (or just adds chips directly).
  requestRebuy(id, amount) {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    if (!this.config.allowRebuy) return { error: 'Rebuys are disabled at this table' };
    const add = this._sanitizeBuyIn(amount);
    const existing = this.rebuyRequests.find((r) => r.id === id);
    if (existing) existing.amount = add;
    else this.rebuyRequests.push({ id, name: p.name, avatar: p.avatar, amount: add, at: Date.now() });
    this.emit('rebuyRequest', { playerId: id, name: p.name, amount: add });
    return { ok: true, pending: true };
  }

  cancelRebuy(id) {
    this.rebuyRequests = this.rebuyRequests.filter((r) => r.id !== id);
    this.emit('prefs', { playerId: id });
    return { ok: true };
  }

  approveRebuy(id, amount) {
    const req = this.rebuyRequests.find((r) => r.id === id);
    if (!req) return { error: 'No such request' };
    this.rebuyRequests = this.rebuyRequests.filter((r) => r.id !== id);
    const res = this.addChips(id, amount !== undefined && amount !== null ? amount : req.amount);
    if (!res.error) this.emit('rebuyApproved', { playerId: id, amount: res.amount, pending: !!res.pending });
    return res;
  }

  denyRebuy(id) {
    this.rebuyRequests = this.rebuyRequests.filter((r) => r.id !== id);
    this.emit('rebuyDenied', { playerId: id });
    return { ok: true };
  }

  addChips(id, amount) {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    const add = this._sanitizeBuyIn(amount);
    if (this.hand && p.inHand && !this.hand.finished) {
      p.pendingRebuy += add;
      this.emit('prefs', { playerId: id });
      return { ok: true, pending: true, amount: add };
    }
    p.stack += add;
    p.sittingOut = false;
    this.emit('stackChange', { playerId: id, seat: p.seat, stack: p.stack, delta: add });
    if (!this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
    return { ok: true, amount: add };
  }

  // After winning without a showdown, the winner may show their cards.
  showCards(id) {
    const hand = this.hand;
    const p = this.getPlayer(id);
    if (!hand || !hand.finished || !p) return { error: 'Nothing to show right now' };
    if (!p.inHand || p.folded || !p.cards.length) return { error: 'You have no cards to show' };
    if (hand.revealed.has(p.seat)) return { ok: true };
    hand.revealed.add(p.seat);
    const record = this.history.find((r) => r.handNumber === hand.number);
    if (record) {
      const entry = record.players.find((x) => x.playerId === id);
      if (entry) entry.cards = p.cards;
    }
    this.emit('showCards', { seat: p.seat, playerId: id, cards: p.cards });
    return { ok: true };
  }

  // Run-it-twice is decided per hand by the players involved in the all-in.
  voteRunItTwice(id, yes) {
    const hand = this.hand;
    const p = this.getPlayer(id);
    if (!hand || !hand.rit || !p) return { error: 'No run-it-twice decision pending' };
    if (!(p.seat in hand.rit.votes)) return { error: 'You are not in this pot' };
    if (hand.rit.votes[p.seat] !== null) return { ok: true };
    hand.rit.votes[p.seat] = !!yes;
    this.emit('ritVote', { seat: p.seat, playerId: id, yes: !!yes });
    if (Object.values(hand.rit.votes).every((v) => v !== null)) { this._clearTimer('rit'); this._resolveRit(); }
    return { ok: true };
  }

  setStack(id, amount) {
    const p = this.getPlayer(id);
    if (!p) return { error: 'Not seated' };
    const n = Math.max(0, Math.floor(Number(amount)) || 0);
    if (this.hand && p.inHand && !this.hand.finished) return { error: 'Player is in a hand' };
    const delta = n - p.stack;
    p.stack = n;
    if (n > 0 && p.sittingOut && !p.leaving) p.sittingOut = false;
    this.emit('stackChange', { playerId: id, seat: p.seat, stack: p.stack, delta });
    if (!this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
    return { ok: true };
  }

  updateConfig(patch) {
    const c = { ...this.config };
    const num = (k, min, max, int = true) => {
      if (patch[k] === undefined) return;
      let v = Number(patch[k]);
      if (!Number.isFinite(v)) return;
      if (int) v = Math.round(v);
      c[k] = Math.min(max, Math.max(min, v));
    };
    num('smallBlind', 1, 1e8); num('bigBlind', 1, 1e8); num('ante', 0, 1e8);
    num('buyIn', 1, 1e9); num('actionTime', 5, 120); num('timeBank', 0, 300);
    num('ploFrequency', 0, 1, false); num('bombAnteBB', 0.5, 20, false);
    num('autoDealDelay', 2, 60);
    if (patch.ploMode === 'blinds' || patch.ploMode === 'bomb') c.ploMode = patch.ploMode;
    for (const k of ['doubleBoard', 'runItTwice', 'autoDeal', 'autoApprove', 'allowRebuy']) {
      if (patch[k] !== undefined) c[k] = !!patch[k];
    }
    if (c.smallBlind > c.bigBlind) c.smallBlind = c.bigBlind;
    this.config = c;
    this.emit('config', { config: this.config });
    if (!this.hand) {
      if (c.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
      if (!c.autoDeal) { this._clearTimer('autoDeal'); this.autoDealAt = null; }
    }
    return { ok: true };
  }

  setPaused(paused) {
    this.paused = !!paused;
    if (this.paused) { this._clearTimer('autoDeal'); this.autoDealAt = null; }
    this.emit('paused', { paused: this.paused });
    if (!this.paused && !this.hand && this.config.autoDeal && this.canStartHand()) this._scheduleAutoDeal();
  }

  forceNextVariant(variant) {
    this.nextHandVariant = variant === 'PLO' || variant === 'NLH' ? variant : null;
    this.emit('prefs', {});
  }

  // ─── Hand lifecycle ────────────────────────────────────────────────────────
  _eligiblePlayers() {
    return this.players.filter((p) => !p.sittingOut && p.stack > 0 && !p.leaving);
  }

  canStartHand() {
    return !this.hand && !this.paused && this._eligiblePlayers().length >= 2;
  }

  startHand(forceVariant) {
    if (this.hand) return { error: 'Hand in progress' };
    if (this.paused) return { error: 'Table is paused' };
    this._clearTimer('autoDeal');
    this.autoDealAt = null;
    const eligible = this._eligiblePlayers();
    if (eligible.length < 2) return { error: 'Need at least 2 players' };

    this.handNumber++;
    this.lastResult = null;
    for (const p of this.players) {
      p.cards = []; p.folded = false; p.allIn = false; p.streetBet = 0; p.handBet = 0;
      p.acted = false; p.raiseLocked = false; p.lastAction = null; p.inHand = false;
      p.timeBank = Math.min(this.config.timeBank, p.timeBank + 2);
    }
    for (const p of eligible) { p.inHand = true; p.stackBefore = p.stack; }

    const variant = forceVariant || this.nextHandVariant || (this.random() < this.config.ploFrequency ? 'PLO' : 'NLH');
    this.nextHandVariant = null;
    const bombPot = variant === 'PLO' && this.config.ploMode === 'bomb';

    const order = eligible.map((p) => p.seat).sort((a, b) => a - b);
    const dealerSeat = this._nextSeatAfter(this.lastDealerSeat, order);
    this.lastDealerSeat = dealerSeat;

    const hand = {
      number: this.handNumber,
      variant, bombPot,
      doubleBoard: bombPot && this.config.doubleBoard,
      deck: this.deckFactory(),
      board: [], board2: null, sharedBoard: null,
      phase: 'preflop',
      dealerSeat, sbSeat: null, bbSeat: null, straddleSeat: null, actionSeat: null,
      currentBet: 0, minRaise: this.config.bigBlind,
      aggressorSeat: null,
      revealed: new Set(),
      runItTwice: false, rit: null,
      deadline: null, usingTimeBank: false,
      log: [],
      finished: false,
      startedAt: Date.now(),
      bombAnte: 0,
      runningOut: false,
    };
    this.hand = hand;

    const cardsEach = variant === 'PLO' ? 4 : 2;

    this.emit('handStart', {
      handNumber: hand.number, variant, bombPot, doubleBoard: hand.doubleBoard,
      dealerSeat, seats: order, cardsEach,
    });

    if (this.config.ante > 0) {
      for (const seat of order) this._post(this.seats[seat], this.config.ante, 'ante');
    }

    if (bombPot) {
      hand.bombAnte = Math.max(1, Math.round(this.config.bombAnteBB * this.config.bigBlind));
      for (const seat of order) this._post(this.seats[seat], hand.bombAnte, 'bomb');
    } else {
      const headsUp = order.length === 2;
      hand.sbSeat = headsUp ? dealerSeat : this._nextSeatAfter(dealerSeat, order);
      hand.bbSeat = this._nextSeatAfter(hand.sbSeat, order);
      this._post(this.seats[hand.sbSeat], this.config.smallBlind, 'sb');
      this._post(this.seats[hand.bbSeat], this.config.bigBlind, 'bb');
      hand.currentBet = this.config.bigBlind;
      hand.minRaise = this.config.bigBlind;
      // UTG straddle: a live blind of 2x the big blind, posted before the cards.
      if (!headsUp) {
        const utg = this._nextSeatAfter(hand.bbSeat, order);
        const sp = this.seats[utg];
        const amount = this.config.bigBlind * 2;
        if (sp.straddle && sp.stack >= amount) {
          this._post(sp, amount, 'straddle');
          hand.straddleSeat = utg;
          hand.currentBet = amount;
          hand.minRaise = amount;
        }
      }
    }

    for (let c = 0; c < cardsEach; c++) {
      for (const seat of order) this.seats[seat].cards.push(hand.deck.pop());
    }
    this.emit('deal', { seats: order, cardsEach, dealerSeat });

    if (bombPot) {
      this._collectStreet();
      this._dealStreet('flop');
      this._beginStreetAction();
    } else {
      const active = this._activeSeats();
      if (active.length === 0) return this._continueAfterNoAction(), { ok: true, handNumber: hand.number };
      // Preflop: first to act is left of the big blind / straddle (heads-up: the dealer/SB).
      const first = this._nextSeatAfter(hand.straddleSeat ?? hand.bbSeat, active);
      this._setActor(first);
    }
    return { ok: true, handNumber: hand.number };
  }

  // Rare case: blinds put everybody all-in already.
  _continueAfterNoAction() { this._endStreetAndFinish(); }

  _post(p, amount, kind) {
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.handBet += actual;
    if (kind === 'sb' || kind === 'bb' || kind === 'straddle') p.streetBet += actual;
    if (p.stack === 0) p.allIn = true;
    this.hand.log.push({ seat: p.seat, action: kind, amount: actual, street: 'preflop' });
    this.emit('post', { seat: p.seat, playerId: p.id, kind, amount: actual, allIn: p.allIn, stack: p.stack, streetBet: p.streetBet });
  }

  _nextSeatAfter(seat, seatsAsc) {
    if (seatsAsc.length === 0) return null;
    for (const s of seatsAsc) if (s > seat) return s;
    return seatsAsc[0];
  }

  _inHandPlayers() { return this.players.filter((p) => p.inHand); }
  _liveSeats() { return this._inHandPlayers().filter((p) => !p.folded).map((p) => p.seat).sort((a, b) => a - b); }
  _activeSeats() { return this._inHandPlayers().filter((p) => !p.folded && !p.allIn).map((p) => p.seat).sort((a, b) => a - b); }
  _potTotal() { return this._inHandPlayers().reduce((s, p) => s + p.handBet, 0); }

  // ─── Turn management ───────────────────────────────────────────────────────
  _setActor(seat) {
    const hand = this.hand;
    hand.actionSeat = seat;
    const p = this.seats[seat];
    const ms = this.config.actionTime * 1000;
    hand.deadline = Date.now() + ms;
    hand.usingTimeBank = false;
    this.emit('turn', { seat, playerId: p.id, deadline: hand.deadline, timeBank: p.timeBank, legal: this.legalActions(p.id) });
    this._setTimer('action', () => this._onActionTimeout(), ms);
  }

  _onActionTimeout() {
    const hand = this.hand;
    if (!hand || hand.actionSeat === null || hand.finished) return;
    const p = this.seats[hand.actionSeat];
    if (!p) return;
    if (!hand.usingTimeBank && p.timeBank > 0 && p.connected) {
      hand.usingTimeBank = true;
      const ms = p.timeBank * 1000;
      hand.deadline = Date.now() + ms;
      hand.timeBankStart = Date.now();
      this.emit('timeBank', { seat: p.seat, playerId: p.id, deadline: hand.deadline, timeBank: p.timeBank });
      this._setTimer('action', () => this._onActionTimeout(), ms);
      return;
    }
    if (hand.usingTimeBank) p.timeBank = 0;
    const legal = this.legalActions(p.id);
    const action = legal && legal.canCheck ? 'check' : 'fold';
    if (!p.connected) { p.sittingOut = true; p.autoSatOut = true; }
    this.act(p.id, action, 0, { auto: true });
  }

  legalActions(playerId) {
    const hand = this.hand;
    const p = this.getPlayer(playerId);
    if (!hand || !p || hand.actionSeat !== p.seat || hand.finished) return null;
    const toCall = Math.max(0, hand.currentBet - p.streetBet);
    const canCheck = toCall === 0;
    const callAmount = Math.min(toCall, p.stack);
    const potTotal = this._potTotal();
    const maxTotal = p.streetBet + p.stack;
    let minRaiseTo = hand.currentBet > 0 ? hand.currentBet + hand.minRaise : this.config.bigBlind;
    let maxRaiseTo = maxTotal;
    if (hand.variant === 'PLO') {
      // Pot limit: call first, then raise by the size of the pot including that call.
      maxRaiseTo = Math.min(maxTotal, hand.currentBet + potTotal + toCall);
    }
    const canRaise = !p.raiseLocked && maxTotal > hand.currentBet && maxRaiseTo > hand.currentBet;
    if (minRaiseTo > maxRaiseTo) minRaiseTo = maxRaiseTo;
    return {
      canCheck, canCall: toCall > 0, callAmount, callIsAllIn: toCall >= p.stack,
      canRaise, minRaiseTo, maxRaiseTo, potTotal, currentBet: hand.currentBet,
      stack: p.stack, streetBet: p.streetBet, bigBlind: this.config.bigBlind,
      potLimit: hand.variant === 'PLO', toCall,
    };
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  act(playerId, action, amount = 0, meta = {}) {
    const hand = this.hand;
    const p = this.getPlayer(playerId);
    if (!hand || hand.finished) return { error: 'No hand in progress' };
    if (!p || hand.actionSeat !== p.seat) return { error: 'Not your turn' };
    const legal = this.legalActions(playerId);
    let result;
    switch (action) {
      case 'fold':
        p.folded = true;
        result = { action: 'fold', amount: 0 };
        break;
      case 'check':
        if (!legal.canCheck) return { error: 'Cannot check' };
        result = { action: 'check', amount: 0 };
        break;
      case 'call': {
        if (!legal.canCall) return { error: 'Nothing to call' };
        const amt = legal.callAmount;
        this._commit(p, amt);
        result = { action: 'call', amount: amt };
        break;
      }
      case 'bet':
      case 'raise':
      case 'allin': {
        let total;
        if (action === 'allin') {
          total = p.streetBet + p.stack;
          if (total <= hand.currentBet) {
            const amt = p.stack;
            this._commit(p, amt);
            result = { action: 'call', amount: amt };
            break;
          }
          if (total > legal.maxRaiseTo) total = legal.maxRaiseTo; // pot-limit cap
        } else {
          total = Math.floor(Number(amount));
          if (!Number.isFinite(total)) return { error: 'Invalid amount' };
        }
        if (!legal.canRaise) return { error: 'Raising is not allowed right now' };
        if (total > legal.maxRaiseTo) total = legal.maxRaiseTo;
        const isAllIn = total >= p.streetBet + p.stack;
        if (total < legal.minRaiseTo && !isAllIn) return { error: `Minimum raise is ${legal.minRaiseTo}` };
        if (total <= hand.currentBet) return { error: 'Raise must exceed the current bet' };
        const raiseSize = total - hand.currentBet;
        const fullRaise = raiseSize >= hand.minRaise;
        const wasBet = hand.currentBet === 0;
        this._commit(p, total - p.streetBet);
        hand.currentBet = total;
        hand.aggressorSeat = p.seat;
        for (const o of this._inHandPlayers()) {
          if (o.seat === p.seat || o.folded || o.allIn) continue;
          if (fullRaise) { o.acted = false; o.raiseLocked = false; }
          else if (o.acted) { o.acted = false; o.raiseLocked = true; }
        }
        if (fullRaise) hand.minRaise = raiseSize;
        result = { action: wasBet ? 'bet' : 'raise', amount: total };
        break;
      }
      default:
        return { error: 'Unknown action' };
    }
    p.acted = true;
    p.lastAction = result.action;
    hand.log.push({ seat: p.seat, ...result, street: hand.phase });
    this._clearTimer('action');
    hand.lastActorSeat = p.seat;
    hand.actionSeat = null;
    hand.deadline = null;
    this.emit('action', { seat: p.seat, playerId: p.id, ...result, allIn: p.allIn, auto: !!meta.auto, street: hand.phase, stack: p.stack, streetBet: p.streetBet, potTotal: this._potTotal() });
    this._afterAction();
    return { ok: true, ...result };
  }

  _commit(p, amt) {
    amt = Math.min(amt, p.stack);
    p.stack -= amt;
    p.streetBet += amt;
    p.handBet += amt;
    if (p.stack === 0) p.allIn = true;
  }

  _afterAction(outOfTurn = false) {
    const hand = this.hand;
    if (!hand || hand.finished) return;
    if (outOfTurn && hand.actionSeat !== null) {
      // Someone folded out of turn (left the table); the current actor keeps the turn
      // unless the fold ended the hand.
      if (this._liveSeats().length <= 1) { this._clearTimer('action'); hand.actionSeat = null; return this._endStreetAndFinish(); }
      return;
    }
    const live = this._liveSeats();
    if (live.length <= 1) return this._endStreetAndFinish();

    const active = this._activeSeats();
    const roundDone = active.every((s) => { const p = this.seats[s]; return p.acted && p.streetBet === hand.currentBet; });
    if (roundDone) return this._endStreetAndFinish();

    let seat = this._nextSeatAfter(hand.lastActorSeat, active);
    for (let i = 0; i < active.length; i++) {
      const p = this.seats[seat];
      if (!p.acted || p.streetBet < hand.currentBet) { this._setActor(seat); return; }
      seat = this._nextSeatAfter(seat, active);
    }
    this._endStreetAndFinish();
  }

  _endStreetAndFinish() {
    const hand = this.hand;
    this._collectStreet();
    const live = this._liveSeats();
    if (live.length <= 1) return this._finishFoldWin(live[0]);
    if (hand.phase === 'river') return this._showdown();
    if (this._activeSeats().length <= 1) return this._runout();
    this._dealStreet(STREETS[STREETS.indexOf(hand.phase) + 1]);
    this._beginStreetAction();
  }

  _collectStreet() {
    const hand = this.hand;
    let moved = 0;
    for (const p of this._inHandPlayers()) { moved += p.streetBet; p.streetBet = 0; p.acted = false; p.raiseLocked = false; }
    hand.currentBet = 0;
    hand.minRaise = this.config.bigBlind;
    hand.aggressorSeat = null;
    hand.lastActorSeat = undefined;
    this.emit('collect', { pots: this._displayPots(), total: this._potTotal(), moved });
  }

  _displayPots() {
    return buildPots(this._inHandPlayers().map((p) => ({ id: p.seat, amount: p.handBet, folded: p.folded })));
  }

  _dealStreet(street, boardKey = 'board') {
    const hand = this.hand;
    hand.phase = street;
    const n = STREET_CARDS[street];
    const draw = () => { hand.deck.pop(); const c = []; for (let i = 0; i < n; i++) c.push(hand.deck.pop()); return c; };
    const cards = draw();
    if (boardKey === 'board2' && !hand.board2) hand.board2 = [];
    hand[boardKey].push(...cards);
    let cards2 = null;
    if (hand.doubleBoard && boardKey === 'board') {
      if (!hand.board2) hand.board2 = [];
      cards2 = draw();
      hand.board2.push(...cards2);
    }
    this.emit('street', {
      street, board: hand.board.slice(), board2: hand.board2 ? hand.board2.slice() : null,
      newCards: cards, newCards2: cards2, boardKey: cards2 ? 'both' : boardKey, runningOut: hand.runningOut,
    });
  }

  _beginStreetAction() {
    const hand = this.hand;
    const active = this._activeSeats();
    if (active.length === 0) return this._endStreetAndFinish();
    // Postflop: first active player left of the dealer.
    this._setActor(this._nextSeatAfter(hand.dealerSeat, active));
  }

  // Everybody's all-in (or only one player has chips): reveal and deal the rest.
  _runout() {
    const hand = this.hand;
    hand.runningOut = true;
    this._clearTimer('action');
    const livePlayers = this._liveSeats().map((s) => this.seats[s]);
    for (const p of livePlayers) hand.revealed.add(p.seat);
    hand.sharedBoard = hand.board.slice();
    this.emit('reveal', { seats: livePlayers.map((p) => ({ seat: p.seat, playerId: p.id, cards: p.cards })) });

    const canOffer = this.config.runItTwice && !hand.doubleBoard && hand.board.length < 5 && livePlayers.length >= 2;
    if (canOffer) {
      const votes = {};
      for (const p of livePlayers) votes[p.seat] = null;
      hand.rit = { votes, deadline: Date.now() + this.timing.ritVote, seats: livePlayers.map((p) => p.seat) };
      this.emit('ritOffer', { seats: hand.rit.seats, deadline: hand.rit.deadline });
      this._setTimer('rit', () => this._resolveRit(), this.timing.ritVote);
      return;
    }
    this._startRunout(false);
  }

  _resolveRit() {
    const hand = this.hand;
    if (!hand || !hand.rit) return;
    const yes = Object.values(hand.rit.votes).every((v) => v === true);
    hand.rit = null;
    this.emit('ritDecided', { runItTwice: yes });
    this._startRunout(yes);
  }

  _startRunout(canRIT) {
    const hand = this.hand;
    hand.runItTwice = canRIT;
    const streets = STREETS.slice(STREETS.indexOf(hand.phase) + 1);
    const plan = streets.map((st) => ({ st, key: 'board' }));
    if (canRIT) {
      plan.push({ st: 'split' });
      for (const st of streets) plan.push({ st, key: 'board2' });
    }

    let i = 0;
    const next = () => {
      if (this.hand !== hand) return;
      if (i >= plan.length) return this._showdown();
      const item = plan[i++];
      if (item.st === 'split') {
        hand.board2 = hand.sharedBoard.slice();
        this.emit('street', { street: 'split', board: hand.board.slice(), board2: hand.board2.slice(), newCards: [], boardKey: 'board2', runningOut: true });
        return this._setTimer('runout', next, this.timing.streetDelay * 0.7);
      }
      const suspense = item.st === 'river' && plan.length > 1 ? this.timing.riverDelay - this.timing.streetDelay : 0;
      const deal = () => {
        if (this.hand !== hand) return;
        this._dealStreet(item.st, item.key);
        this._setTimer('runout', next, this.timing.streetDelay);
      };
      if (suspense > 0) this._setTimer('runout', deal, suspense); else deal();
    };
    this._setTimer('runout', next, this.timing.revealDelay);
  }

  // ─── Showdown / results ────────────────────────────────────────────────────
  _refundUncalled() {
    const inHand = this._inHandPlayers();
    const live = inHand.filter((p) => !p.folded);
    if (live.length === 0) return null;
    const top = live.reduce((a, b) => (b.handBet > a.handBet ? b : a));
    const secondHighest = Math.max(0, ...inHand.filter((p) => p !== top).map((p) => p.handBet));
    const excess = top.handBet - secondHighest;
    if (excess > 0) {
      top.handBet -= excess;
      top.stack += excess;
      if (top.stack > 0) top.allIn = false;
      return { seat: top.seat, playerId: top.id, amount: excess };
    }
    return null;
  }

  _finishFoldWin(winnerSeat) {
    const hand = this.hand;
    const refund = this._refundUncalled();
    const winner = this.seats[winnerSeat];
    const pots = this._displayPots();
    const total = pots.reduce((s, p) => s + p.amount, 0);
    winner.stack += total;
    const result = {
      handNumber: hand.number, variant: hand.variant, bombPot: hand.bombPot,
      board: hand.board.slice(), board2: hand.board2 ? hand.board2.slice() : null,
      winners: [{ seat: winner.seat, playerId: winner.id, name: winner.name, amount: total, potIndex: 0, board: 1, uncontested: true }],
      reveals: [], refund, pots, showdown: false, runItTwice: false, doubleBoard: false,
    };
    this._completeHand(result, this.timing.foldWinHold);
  }

  _showdown() {
    const hand = this.hand;
    hand.phase = 'showdown';
    this._clearTimer('runout');
    const refund = this._refundUncalled();
    const live = this._inHandPlayers().filter((p) => !p.folded);
    for (const p of live) hand.revealed.add(p.seat);

    const boards = [{ cards: hand.board, idx: 1 }];
    if (hand.board2 && hand.board2.length === 5) boards.push({ cards: hand.board2, idx: 2 });
    const twoBoards = boards.length === 2;

    const evals = {};
    for (const p of live) evals[p.seat] = boards.map((b) => evaluate(p.cards, b.cards, hand.variant));

    const pots = buildPots(this._inHandPlayers().map((p) => ({ id: p.seat, amount: p.handBet, folded: p.folded })));
    const winners = [];
    pots.forEach((pot, potIndex) => {
      const shares = twoBoards ? [Math.ceil(pot.amount / 2), Math.floor(pot.amount / 2)] : [pot.amount];
      boards.forEach((b, bi) => {
        const amount = shares[bi];
        if (amount <= 0) return;
        const elig = pot.eligible.filter((s) => evals[s]);
        let bestScore = -1;
        for (const s of elig) bestScore = Math.max(bestScore, evals[s][bi].score);
        const potWinners = elig.filter((s) => evals[s][bi].score === bestScore);
        for (const { id: seat, amount: amt } of splitAmount(amount, potWinners)) {
          const p = this.seats[seat];
          p.stack += amt;
          winners.push({ seat, playerId: p.id, name: p.name, amount: amt, potIndex, board: b.idx, handName: evals[seat][bi].name, handCards: evals[seat][bi].cards });
        }
      });
    });

    const reveals = live.map((p) => ({
      seat: p.seat, playerId: p.id, name: p.name, cards: p.cards,
      hands: evals[p.seat].map((e, bi) => ({ board: bi + 1, name: e.name, cat: e.cat, cards: e.cards })),
    }));

    const result = {
      handNumber: hand.number, variant: hand.variant, bombPot: hand.bombPot,
      board: hand.board.slice(), board2: hand.board2 ? hand.board2.slice() : null,
      winners, reveals, refund, pots: pots.map((p) => ({ amount: p.amount, eligible: p.eligible })),
      showdown: true, runItTwice: hand.runItTwice, doubleBoard: hand.doubleBoard,
    };
    this._completeHand(result, this.timing.showdownHold);
  }

  _completeHand(result, hold) {
    const hand = this.hand;
    hand.finished = true;
    hand.phase = 'complete';
    hand.actionSeat = null;
    hand.deadline = null;
    this._clearTimer('action');
    const players = this._inHandPlayers().map((p) => ({
      seat: p.seat, playerId: p.id, name: p.name, avatar: p.avatar,
      cards: hand.revealed.has(p.seat) ? p.cards : null,
      folded: p.folded, handBet: p.handBet, stackAfter: p.stack,
      net: p.stack - (p.stackBefore ?? p.stack),
    }));
    // Everyone's hole cards are kept privately so each player can see their own in the history.
    const holeCards = Object.fromEntries(this._inHandPlayers().map((p) => [p.id, p.cards]));
    const record = { ...result, players, holeCards, log: hand.log.slice(), at: Date.now(), dealerSeat: hand.dealerSeat, blinds: { sb: this.config.smallBlind, bb: this.config.bigBlind } };
    this.history.unshift(record);
    if (this.history.length > 100) this.history.pop();
    this.lastResult = result;
    this.emit('result', result);
    this._setTimer('handEnd', () => this._endHand(), hold);
  }

  _endHand() {
    const hand = this.hand;
    if (!hand) return;
    this.hand = null;
    for (const p of this.players) {
      p.cards = []; p.folded = false; p.allIn = false; p.streetBet = 0; p.handBet = 0;
      p.acted = false; p.raiseLocked = false; p.lastAction = null; p.inHand = false;
      if (p.pendingRebuy > 0) { p.stack += p.pendingRebuy; p.pendingRebuy = 0; }
      if (p.stack === 0) p.sittingOut = true;
    }
    for (const p of this.players.filter((x) => x.leaving)) {
      this.seats[p.seat] = null;
      this.emit('playerLeft', { playerId: p.id, seat: p.seat, reason: p.leaveReason || 'left' });
    }
    this.emit('handEnd', { handNumber: hand.number });
    if (this.config.autoDeal) this._scheduleAutoDeal();
  }

  _scheduleAutoDeal() {
    if (!this.config.autoDeal || this.paused || this.hand) return;
    if (!this.canStartHand()) return;
    if (this.timers.has('autoDeal')) return;
    const ms = this.config.autoDealDelay * 1000;
    this.autoDealAt = Date.now() + ms;
    this.emit('nextHandIn', { ms, at: this.autoDealAt });
    this._setTimer('autoDeal', () => { this.autoDealAt = null; if (this.canStartHand()) this.startHand(); }, ms);
  }

  // History as seen by one player: public cards plus their own.
  historyFor(playerId, limit = 50) {
    return this.history.slice(0, limit).map(({ holeCards, ...rec }) => ({
      ...rec,
      players: rec.players.map((pl) => (pl.playerId === playerId && !pl.cards && holeCards[playerId] ? { ...pl, cards: holeCards[playerId] } : pl)),
    }));
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────
  addChat(playerId, text) {
    const p = this.getPlayer(playerId);
    if (!p) return null;
    const clean = String(text || '').trim().slice(0, 240);
    if (!clean) return null;
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, playerId, name: p.name, avatar: p.avatar, text: clean, at: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.shift();
    this.emit('chat', { message: msg });
    return msg;
  }

  // ─── Serialization ─────────────────────────────────────────────────────────
  _publicPlayer(p, viewerId) {
    const hand = this.hand;
    const showCards = viewerId === p.id || (hand && hand.revealed.has(p.seat));
    return {
      id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, stack: p.stack,
      connected: p.connected, sittingOut: p.sittingOut, inHand: p.inHand,
      folded: p.folded, allIn: p.allIn, streetBet: p.streetBet, handBet: p.handBet,
      lastAction: p.lastAction, timeBank: p.timeBank, straddle: p.straddle,
      rebuyRequested: this.rebuyRequests.some((r) => r.id === p.id) ? this.rebuyRequests.find((r) => r.id === p.id).amount : 0,
      cardCount: p.cards.length,
      cards: showCards ? p.cards : null,
      pendingRebuy: p.pendingRebuy, leaving: p.leaving,
      isDealer: !!hand && hand.dealerSeat === p.seat,
      isSB: !!hand && hand.sbSeat === p.seat,
      isBB: !!hand && hand.bbSeat === p.seat,
      isStraddle: !!hand && hand.straddleSeat === p.seat,
    };
  }

  state(viewerId) {
    const hand = this.hand;
    const viewer = this.getPlayer(viewerId);
    return {
      id: this.id, seq: this.seq, hostId: this.hostId, config: this.config, paused: this.paused,
      handNumber: this.handNumber,
      seats: this.seats.map((p) => (p ? this._publicPlayer(p, viewerId) : null)),
      hand: hand ? {
        number: hand.number, variant: hand.variant, bombPot: hand.bombPot, doubleBoard: hand.doubleBoard,
        board: hand.board, board2: hand.board2, phase: hand.phase,
        dealerSeat: hand.dealerSeat, sbSeat: hand.sbSeat, bbSeat: hand.bbSeat,
        actionSeat: hand.actionSeat, deadline: hand.deadline, usingTimeBank: !!hand.usingTimeBank,
        currentBet: hand.currentBet, minRaise: hand.minRaise,
        pots: this._displayPots(), potTotal: this._potTotal(),
        runItTwice: hand.runItTwice, runningOut: hand.runningOut, finished: hand.finished,
        rit: hand.rit ? { seats: hand.rit.seats, votes: hand.rit.votes, deadline: hand.rit.deadline } : null,
        straddleSeat: hand.straddleSeat,
        canShow: !!(hand.finished && this.lastResult && !this.lastResult.showdown && viewer && viewer.inHand && !viewer.folded && viewer.cards.length && !hand.revealed.has(viewer.seat)),
        bombAnte: hand.bombAnte,
      } : null,
      legal: viewer ? this.legalActions(viewerId) : null,
      lastResult: this.lastResult,
      pending: this.isHost(viewerId) ? this.pending.map((r) => ({ id: r.id, name: r.name, buyIn: r.buyIn, avatar: r.avatar })) : [],
      rebuyRequests: this.isHost(viewerId) ? this.rebuyRequests.map((r) => ({ id: r.id, name: r.name, amount: r.amount, avatar: r.avatar })) : [],
      pendingCount: this.pending.length,
      nextHandVariant: this.nextHandVariant,
      isHost: this.isHost(viewerId),
      you: viewer ? viewer.id : null,
      nextHandAt: this.autoDealAt,
      serverTime: Date.now(),
    };
  }
}

module.exports = { Table, DEFAULT_CONFIG, DEFAULT_TIMING, STREETS };
