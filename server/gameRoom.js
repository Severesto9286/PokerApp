'use strict';

const { freshDeck, bestHoldemHand, bestOmahaHand, determineWinners, calcSidePots, runItTwice } = require('./pokerEngine');
const { v4: uuid } = require('uuid');

const PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'runItTwice'];
const ACTION_TIMEOUT = 30000; // 30s per action

class GameRoom {
  constructor(roomId, hostId) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.players = []; // { id, name, stack, seatIndex, connected, folded, holeCards, currentBet, totalBet, isAllIn, hasActed }
    this.pendingJoins = []; // { id, name, socketId } awaiting host approval
    this.phase = 'waiting';
    this.deck = [];
    this.board = [];
    this.pots = []; // { amount, eligible[] }
    this.currentPot = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.dealerIndex = -1;
    this.actionIndex = -1;
    this.currentBet = 0;
    this.minRaise = 0;
    this.lastRaiser = null;
    this.bombPotFrequency = 0.2; // 20% chance each hand
    this.isBombPot = false;
    this.isOmaha = false;
    this.runItTwiceOffered = false;
    this.runItTwiceVotes = {};
    this.allInPlayers = [];
    this.board2 = null; // second runout
    this.actionTimer = null;
    this.handNumber = 0;
    this.chatHistory = [];
    this.lastAction = null;
    this.autoDeal = false;
    this.handDelay = 10;
    this.handHistory = []; // last 50 hands
  }

  // ─── Player Management ──────────────────────────────────────────────────
  getPlayer(id) { return this.players.find(p => p.id === id); }

  addPendingJoin(id, name, socketId) {
    if (this.pendingJoins.find(p => p.id === id)) return false;
    if (this.players.find(p => p.id === id)) return false;
    this.pendingJoins.push({ id, name, socketId, requestedAt: Date.now() });
    return true;
  }

  approveJoin(pendingId, stackSize) {
    const pending = this.pendingJoins.find(p => p.id === pendingId);
    if (!pending) return null;
    this.pendingJoins = this.pendingJoins.filter(p => p.id !== pendingId);
    if (this.players.length >= 6) return null;
    const seatIndex = this._nextSeat();
    const player = {
      id: pending.id,
      name: pending.name,
      socketId: pending.socketId,
      stack: stackSize,
      seatIndex,
      connected: true,
      folded: false,
      holeCards: [],
      currentBet: 0,
      totalBet: 0,
      isAllIn: false,
      hasActed: false,
      sitOut: false
    };
    this.players.push(player);
    return player;
  }

  denyJoin(pendingId) {
    this.pendingJoins = this.pendingJoins.filter(p => p.id !== pendingId);
  }

  _nextSeat() {
    const taken = this.players.map(p => p.seatIndex);
    for (let i = 0; i < 6; i++) { if (!taken.includes(i)) return i; }
    return this.players.length;
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
  }

  // ─── Hand Lifecycle ─────────────────────────────────────────────────────
  canStartHand() {
    const active = this.players.filter(p => !p.sitOut && p.stack > 0);
    return active.length >= 2 && this.phase === 'waiting';
  }

  startHand() {
    const active = this.players.filter(p => !p.sitOut && p.stack > 0);
    if (active.length < 2) return { error: 'Need at least 2 players' };

    this.handNumber++;
    this.board = [];
    this.board2 = null;
    this.pots = [];
    this.currentPot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiser = null;
    this.runItTwiceOffered = false;
    this.runItTwiceVotes = {};
    this.allInPlayers = [];
    this.isBombPot = false;
    this.isOmaha = false;
    this.lastAction = null;

    // Determine if bomb pot
    if (Math.random() < this.bombPotFrequency && active.length >= 2) {
      this.isBombPot = true;
      this.isOmaha = true;
    }

    // Advance dealer
    this.dealerIndex = this._nextActiveIndex(this.dealerIndex);

    // Reset player state
    for (const p of this.players) {
      p.folded = false;
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBet = 0;
      p.isAllIn = false;
      p.hasActed = false;
    }

    this.deck = freshDeck();

    if (this.isBombPot) {
      return this._startBombPot(active);
    } else {
      return this._startHoldem(active);
    }
  }

  _startHoldem(active) {
    // Post blinds
    const sbIndex = this._nextActiveIndex(this.dealerIndex);
    const bbIndex = this._nextActiveIndex(sbIndex);

    const sbPlayer = active[sbIndex % active.length] || this.players[sbIndex % this.players.length];
    const bbPlayer = active[bbIndex % active.length] || this.players[bbIndex % this.players.length];

    // Find actual players by iterating active
    const activePlayers = this.players.filter(p => !p.sitOut && p.stack > 0);
    const sbP = activePlayers[sbIndex % activePlayers.length];
    const bbP = activePlayers[bbIndex % activePlayers.length];

    this._postBlind(sbP.id, this.smallBlind);
    this._postBlind(bbP.id, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // Deal hole cards (2 per player)
    for (const p of activePlayers) {
      p.holeCards = [this.deck.pop(), this.deck.pop()];
    }

    this.phase = 'preflop';

    // Action starts left of BB
    const utg = this._nextActiveIndex(bbIndex);
    this.actionIndex = utg % activePlayers.length;
    this.lastRaiser = bbP.id;

    return {
      phase: this.phase,
      isBombPot: false,
      isOmaha: false,
      dealer: activePlayers[this.dealerIndex % activePlayers.length]?.id,
      sb: { id: sbP.id, amount: Math.min(this.smallBlind, sbP.stack + this.smallBlind) },
      bb: { id: bbP.id, amount: Math.min(this.bigBlind, bbP.stack + this.bigBlind) }
    };
  }

  _startBombPot(active) {
    // Everyone posts BB, goes to flop immediately, PLO rules
    const activePlayers = this.players.filter(p => !p.sitOut && p.stack > 0);
    for (const p of activePlayers) {
      this._postBlind(p.id, this.bigBlind);
    }
    this.currentPot = activePlayers.reduce((s, p) => s + p.totalBet, 0);
    this.pots = [{ amount: this.currentPot, eligible: activePlayers.map(p => p.id) }];

    // Deal 4 hole cards (Omaha)
    for (const p of activePlayers) {
      p.holeCards = [this.deck.pop(), this.deck.pop(), this.deck.pop(), this.deck.pop()];
    }

    // Deal flop immediately
    this.deck.pop(); // burn
    this.board = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    this.phase = 'flop';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    // Reset bets for post-flop action
    for (const p of activePlayers) {
      p.currentBet = 0;
      p.hasActed = false;
    }

    // Action starts left of dealer
    const firstActor = this._nextActiveIndex(this.dealerIndex);
    this.actionIndex = firstActor % activePlayers.length;

    return {
      phase: this.phase,
      isBombPot: true,
      isOmaha: true,
      board: this.board,
      dealer: activePlayers[this.dealerIndex % activePlayers.length]?.id
    };
  }

  _postBlind(playerId, amount) {
    const p = this.getPlayer(playerId);
    if (!p) return;
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.currentBet = actual;
    p.totalBet = actual;
    if (p.stack === 0) p.isAllIn = true;
  }

  // ─── Actions ────────────────────────────────────────────────────────────
  processAction(playerId, action, amount) {
    const activePlayers = this._activePlayers();
    const playerIdx = activePlayers.findIndex(p => p.id === playerId);

    if (playerIdx !== this.actionIndex) return { error: 'Not your turn' };

    const player = activePlayers[playerIdx];
    if (!player) return { error: 'Player not found' };

    let actionResult = { playerId, action, amount: 0 };

    switch (action) {
      case 'fold':
        player.folded = true;
        player.hasActed = true;
        actionResult.action = 'fold';
        break;

      case 'check':
        if (this.currentBet > player.currentBet) return { error: 'Cannot check, must call or raise' };
        player.hasActed = true;
        actionResult.action = 'check';
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - player.currentBet, player.stack);
        player.stack -= toCall;
        player.currentBet += toCall;
        player.totalBet += toCall;
        if (player.stack === 0) player.isAllIn = true;
        player.hasActed = true;
        actionResult.action = 'call';
        actionResult.amount = toCall;
        break;
      }

      case 'bet':
      case 'raise': {
        const raiseAmount = parseInt(amount);
        if (isNaN(raiseAmount)) return { error: 'Invalid amount' };

        // Minimum raise: at least minRaise above current bet
        const minTotal = this.currentBet + this.minRaise;
        const totalBet = Math.min(raiseAmount, player.stack + player.currentBet);
        const actualIncrease = totalBet - player.currentBet;

        if (totalBet < minTotal && totalBet < player.stack + player.currentBet) {
          return { error: `Minimum raise is ${minTotal}` };
        }

        const toAdd = totalBet - player.currentBet;
        player.stack -= toAdd;
        this.minRaise = Math.max(this.minRaise, totalBet - this.currentBet);
        this.currentBet = totalBet;
        player.currentBet = totalBet;
        player.totalBet += toAdd;
        if (player.stack === 0) player.isAllIn = true;
        player.hasActed = true;
        this.lastRaiser = playerId;

        // Reset hasActed for others
        for (const p of activePlayers) {
          if (p.id !== playerId && !p.folded && !p.isAllIn) p.hasActed = false;
        }

        actionResult.action = action;
        actionResult.amount = totalBet;
        actionResult.totalBet = totalBet;
        break;
      }

      case 'allIn': {
        const allInAmount = player.stack + player.currentBet;
        const toAdd = player.stack;
        player.stack = 0;
        player.currentBet = allInAmount;
        player.totalBet += toAdd;
        player.isAllIn = true;
        player.hasActed = true;

        if (allInAmount > this.currentBet) {
          this.minRaise = Math.max(this.minRaise, allInAmount - this.currentBet);
          this.currentBet = allInAmount;
          this.lastRaiser = playerId;
          for (const p of activePlayers) {
            if (p.id !== playerId && !p.folded && !p.isAllIn) p.hasActed = false;
          }
        }
        actionResult.action = 'allIn';
        actionResult.amount = allInAmount;
        break;
      }

      default:
        return { error: 'Unknown action' };
    }

    this.lastAction = actionResult;
    return { success: true, actionResult, next: this._advanceAction() };
  }

  _advanceAction() {
    const activePlayers = this._activePlayers();
    const nonFolded = activePlayers.filter(p => !p.folded);
    const canAct = nonFolded.filter(p => !p.isAllIn);

    // If only 1 or fewer players can act, or everyone has acted
    const bettingDone = canAct.every(p => p.hasActed && p.currentBet >= this.currentBet)
      || canAct.length === 0;

    if (bettingDone || nonFolded.length <= 1) {
      return this._nextPhase(nonFolded);
    }

    // Find next player to act
    let next = (this.actionIndex + 1) % activePlayers.length;
    let loops = 0;
    while (loops < activePlayers.length) {
      const p = activePlayers[next];
      if (!p.folded && !p.isAllIn && (!p.hasActed || p.currentBet < this.currentBet)) {
        this.actionIndex = next;
        return { type: 'action', playerId: p.id, timeLimit: ACTION_TIMEOUT };
      }
      next = (next + 1) % activePlayers.length;
      loops++;
    }

    return this._nextPhase(nonFolded);
  }

  _nextPhase(nonFolded) {
    // Collect bets into pot
    this._collectBets();

    // Check for everyone folded
    if (nonFolded.length === 1) {
      return this._endHand(false);
    }

    // Check if all remaining are all-in → run out board
    const canAct = nonFolded.filter(p => !p.isAllIn);
    const allAllIn = canAct.length === 0 && nonFolded.length > 1;

    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentPhaseIdx = phases.indexOf(this.phase);

    if (this.phase === 'river' || allAllIn) {
      if (allAllIn && this.phase !== 'river') {
        // Run out remaining cards
        return this._runOutBoard(nonFolded);
      }
      return this._goToShowdown();
    }

    // Advance phase
    const nextPhase = phases[currentPhaseIdx + 1];
    this.phase = nextPhase;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    for (const p of this.players) { p.currentBet = 0; p.hasActed = false; }

    // Deal community cards
    if (nextPhase === 'flop') {
      this.deck.pop(); // burn
      this.board = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
    } else if (nextPhase === 'turn') {
      this.deck.pop();
      this.board.push(this.deck.pop());
    } else if (nextPhase === 'river') {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }

    // Offer run it twice if all-in and not all 5 cards dealt
    if (allAllIn && this.board.length < 5) {
      this.runItTwiceOffered = true;
      this.runItTwiceVotes = {};
      for (const p of nonFolded) this.runItTwiceVotes[p.id] = null;
      return {
        type: 'runItTwiceOffer',
        phase: this.phase,
        board: this.board,
        players: nonFolded.map(p => p.id)
      };
    }

    // Set action to first active player left of dealer
    this._resetActionForStreet(nonFolded);

    return { type: 'newStreet', phase: nextPhase, board: this.board };
  }

  _runOutBoard(nonFolded) {
    // Run remaining board cards if all-in
    while (this.board.length < 5) {
      this.deck.pop(); // burn
      this.board.push(this.deck.pop());
    }

    // Offer run it twice before we ran it? No - check earlier. Go to showdown
    return this._goToShowdown();
  }

  _goToShowdown() {
    this.phase = 'showdown';
    const nonFolded = this._activePlayers().filter(p => !p.folded);

    // Ensure board is complete
    while (this.board.length < 5) {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }

    const results = determineWinners(
      this.players.map(p => ({
        id: p.id,
        totalBet: p.totalBet,
        folded: p.folded,
        holeCards: p.holeCards
      })),
      this.board,
      this.isOmaha
    );

    return this._distributeWinnings(results, this.board, null);
  }

  _endHand(foldedOut) {
    this.phase = 'showdown';
    const nonFolded = this._activePlayers().filter(p => !p.folded);

    if (nonFolded.length === 1) {
      // Uncontested - winner gets all pots
      const winner = nonFolded[0];
      const totalPot = this.pots.reduce((s, p) => s + p.amount, 0);
      winner.stack += totalPot;
      const result = {
        type: 'handComplete',
        winners: [{ playerId: winner.id, amount: totalPot, pot: 'main', uncontested: true }],
        board: this.board,
        pots: this.pots,
        handNumber: this.handNumber
      };
      // Save uncontested hand to history
      this.handHistory.unshift({
        handNumber: this.handNumber,
        board: this.board,
        winners: [{ playerId: winner.id, amount: totalPot, uncontested: true }],
        showdownHands: {},
        pots: JSON.parse(JSON.stringify(this.pots)),
        isOmaha: this.isOmaha,
        isBombPot: this.isBombPot,
        playerSnapshots: this.players.map(p => ({
          id: p.id, name: p.name, holeCards: p.holeCards || [],
          folded: p.folded, totalBet: p.totalBet, stackAfter: p.stack
        })),
        timestamp: Date.now()
      });
      if (this.handHistory.length > 50) this.handHistory.pop();
      this.phase = 'waiting';
      return result;
    }

    return this._goToShowdown();
  }

  _distributeWinnings(potResults, board, board2) {
    const winnerSummary = [];

    for (const result of potResults) {
      const share = Math.floor(result.amount / result.winners.length);
      const remainder = result.amount - share * result.winners.length;

      result.winners.forEach((winnerId, idx) => {
        const player = this.getPlayer(winnerId);
        if (player) {
          player.stack += share + (idx === 0 ? remainder : 0);
          winnerSummary.push({
            playerId: winnerId,
            amount: share + (idx === 0 ? remainder : 0),
            potIndex: result.potIndex,
            handName: result.handInfo?.[winnerId]?.name,
            handCards: result.handInfo?.[winnerId]?.cards
          });
        }
      });
    }

    // Build showdown hands
    const showdownHands = {};
    const nonFolded = this.players.filter(p => !p.folded && p.holeCards?.length > 0);
    for (const p of nonFolded) {
      const best = this.isOmaha
        ? bestOmahaHand(p.holeCards, board)
        : bestHoldemHand(p.holeCards, board);
      showdownHands[p.id] = { ...best, holeCards: p.holeCards };
    }

    const handResult = {
      type: 'handComplete',
      winners: winnerSummary,
      board,
      board2,
      pots: this.pots,
      showdownHands,
      isOmaha: this.isOmaha,
      isBombPot: this.isBombPot,
      handNumber: this.handNumber
    };

    // Save to hand history
    const snapshot = {
      handNumber: this.handNumber,
      board,
      board2: board2 || null,
      winners: winnerSummary,
      showdownHands,
      pots: JSON.parse(JSON.stringify(this.pots)),
      isOmaha: this.isOmaha,
      isBombPot: this.isBombPot,
      ranItTwice: !!board2,
      playerSnapshots: this.players.map(p => ({
        id: p.id,
        name: p.name,
        holeCards: p.holeCards || [],
        folded: p.folded,
        totalBet: p.totalBet,
        stackAfter: p.stack
      })),
      timestamp: Date.now()
    };
    this.handHistory.unshift(snapshot);
    if (this.handHistory.length > 50) this.handHistory.pop();

    this.phase = 'waiting';
    return handResult;
  }

  // Run it twice logic
  voteRunItTwice(playerId, vote) {
    if (!this.runItTwiceOffered) return null;
    if (this.runItTwiceVotes[playerId] === undefined) return null;
    this.runItTwiceVotes[playerId] = vote;

    const votes = Object.values(this.runItTwiceVotes);
    if (votes.some(v => v === null)) return { waiting: true }; // Not all voted

    const allYes = votes.every(v => v === true);
    this.runItTwiceOffered = false;

    if (allYes) {
      return this._executeRunItTwice();
    } else {
      // Run it once
      return this._runItOnce();
    }
  }

  _executeRunItTwice() {
    const nonFolded = this.players.filter(p => !p.folded);
    const { board1, board2 } = runItTwice(this.deck, this.board);

    // Calculate winners for each board
    const results1 = determineWinners(
      this.players.map(p => ({ id: p.id, totalBet: p.totalBet, folded: p.folded, holeCards: p.holeCards })),
      board1, this.isOmaha
    );
    const results2 = determineWinners(
      this.players.map(p => ({ id: p.id, totalBet: p.totalBet, folded: p.folded, holeCards: p.holeCards })),
      board2, this.isOmaha
    );

    // Split each pot: half to each runout
    const winnerSummary = [];
    const showdownHands1 = {};
    const showdownHands2 = {};

    const process = (results, board, half, label) => {
      for (const result of results) {
        const halfPot = Math.floor(result.amount * half);
        const share = Math.floor(halfPot / result.winners.length);
        const remainder = halfPot - share * result.winners.length;
        result.winners.forEach((winnerId, idx) => {
          const player = this.getPlayer(winnerId);
          if (player) {
            player.stack += share + (idx === 0 ? remainder : 0);
            winnerSummary.push({
              playerId: winnerId,
              amount: share + (idx === 0 ? remainder : 0),
              potIndex: result.potIndex,
              runout: label,
              handName: result.handInfo?.[winnerId]?.name,
              handCards: result.handInfo?.[winnerId]?.cards
            });
          }
        });
      }
      const nf = this.players.filter(p => !p.folded && p.holeCards?.length > 0);
      const hands = {};
      for (const p of nf) {
        const best = this.isOmaha ? bestOmahaHand(p.holeCards, board) : bestHoldemHand(p.holeCards, board);
        hands[p.id] = { ...best, holeCards: p.holeCards };
      }
      return hands;
    };

    const hands1 = process(results1, board1, 0.5, 'run1');
    const hands2 = process(results2, board2, 0.5, 'run2');

    this.phase = 'waiting';
    return {
      type: 'handComplete',
      winners: winnerSummary,
      board: board1,
      board2,
      ranItTwice: true,
      pots: this.pots,
      showdownHands: hands1,
      showdownHands2: hands2,
      isOmaha: this.isOmaha,
      isBombPot: this.isBombPot,
      handNumber: this.handNumber
    };
  }

  _runItOnce() {
    while (this.board.length < 5) {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }
    return this._goToShowdown();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  _activePlayers() {
    return this.players.filter(p => !p.sitOut && p.holeCards?.length > 0);
  }

  _nextActiveIndex(fromIndex) {
    const active = this.players.filter(p => !p.sitOut && p.stack > 0);
    if (active.length === 0) return 0;
    return (fromIndex + 1) % active.length;
  }

  _collectBets() {
    const total = this.players.reduce((s, p) => s + p.currentBet, 0);
    this.currentPot += total;
    for (const p of this.players) p.currentBet = 0;

    // Recalculate side pots
    const contributing = this.players.map(p => ({
      id: p.id,
      totalBet: p.totalBet,
      folded: p.folded
    }));
    this.pots = calcSidePots(contributing);
    if (this.pots.length === 0 && this.currentPot > 0) {
      this.pots = [{ amount: this.currentPot, eligible: this.players.filter(p => !p.folded).map(p => p.id) }];
    }
  }

  _resetActionForStreet(nonFolded) {
    const active = this._activePlayers().filter(p => !p.folded && !p.isAllIn);
    if (active.length === 0) return;

    // Post-flop: action starts left of dealer
    const dealerPlayer = this.players.filter(p => !p.sitOut && p.holeCards?.length > 0)[this.dealerIndex % this.players.filter(p => !p.sitOut && p.holeCards?.length > 0).length];
    let startIdx = 0;
    const allActive = this._activePlayers();
    if (dealerPlayer) {
      const di = allActive.findIndex(p => p.id === dealerPlayer.id);
      startIdx = (di + 1) % allActive.length;
    }

    let idx = startIdx;
    for (let i = 0; i < allActive.length; i++) {
      const p = allActive[idx % allActive.length];
      if (!p.folded && !p.isAllIn) {
        this.actionIndex = idx % allActive.length;
        return;
      }
      idx++;
    }
  }

  // ─── State for broadcast ────────────────────────────────────────────────
  publicState(forPlayerId) {
    const activePlayers = this._activePlayers();
    const currentPlayer = activePlayers[this.actionIndex];

    return {
      roomId: this.roomId,
      phase: this.phase,
      board: this.board,
      board2: this.board2,
      pots: this.pots,
      currentPot: this.currentPot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      isBombPot: this.isBombPot,
      isOmaha: this.isOmaha,
      bombPotFrequency: this.bombPotFrequency,
      autoDeal: this.autoDeal,
      handDelay: this.handDelay,
      runItTwiceOffered: this.runItTwiceOffered,
      currentTurn: currentPlayer?.id || null,
      handNumber: this.handNumber,
      lastAction: this.lastAction,
      handHistory: this.handHistory,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        seatIndex: p.seatIndex,
        connected: p.connected,
        folded: p.folded,
        isAllIn: p.isAllIn,
        currentBet: p.currentBet,
        totalBet: p.totalBet,
        hasActed: p.hasActed,
        sitOut: p.sitOut,
        isDealer: p.id === this.players.filter(pl => !pl.sitOut && pl.holeCards?.length > 0)[this.dealerIndex % Math.max(1, this.players.filter(pl => !pl.sitOut && pl.holeCards?.length > 0).length)]?.id,
        cardCount: p.holeCards?.length || 0,
        // Only send hole cards to the player themselves (or if showdown)
        holeCards: (p.id === forPlayerId || this.phase === 'showdown') ? p.holeCards : null
      })),
      pendingJoins: forPlayerId === this.hostId ? this.pendingJoins.map(p => ({ id: p.id, name: p.name })) : [],
      isHost: forPlayerId === this.hostId
    };
  }
}

module.exports = { GameRoom };
