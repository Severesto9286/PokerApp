'use strict';

const { freshDeck, bestHoldemHand, bestOmahaHand, determineWinners, calcSidePots, runItTwice } = require('./pokerEngine');
const { v4: uuid } = require('uuid');

const PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown', 'runItTwice'];
const ACTION_TIMEOUT = 30000; // 30s per action

class GameRoom {
  constructor(roomId, hostId) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.players = [];
    this.pendingJoins = [];
    this.phase = 'waiting';
    this.deck = [];
    this.board = [];
    this.pots = [];
    this.currentPot = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.dealerIndex = -1;
    this.actionIndex = -1;
    this.currentBet = 0;
    this.minRaise = 0;
    this.lastRaiser = null;
    this.bombPotFrequency = 0.2;
    this.isBombPot = false;
    this.isOmaha = false;
    this.bombPotTwoBoards = false;
    this.board2 = null;
    this.runItTwiceOffered = false;
    this.runItTwiceVotes = {};
    this.allInPlayers = [];
    this.actionTimer = null;
    this.handNumber = 0;
    this.chatHistory = [];
    this.lastAction = null;
    this.autoDeal = false;
    this.handDelay = 10;
    this.handHistory = [];
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
      sitOut: false,
    };
    this.players.push(player);
    return player;
  }

  denyJoin(pendingId) {
    this.pendingJoins = this.pendingJoins.filter(p => p.id !== pendingId);
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  _nextSeat() {
    const used = new Set(this.players.map(p => p.seatIndex));
    for (let i = 0; i < 6; i++) if (!used.has(i)) return i;
    return this.players.length;
  }

  _nextActiveIndex(fromIndex) {
    const active = this.players.filter(p => !p.sitOut && p.stack > 0);
    return (fromIndex + 1) % active.length;
  }

  _activePlayers() {
    return this.players.filter(p => p.holeCards && p.holeCards.length > 0);
  }

  canStartHand() {
    const eligible = this.players.filter(p => !p.sitOut && p.stack > 0);
    return eligible.length >= 2 && this.phase === 'waiting';
  }

  // ─── Hand Start ──────────────────────────────────────────────────────────
  startHand() {
    if (!this.canStartHand()) return { error: 'Cannot start hand' };

    this.handNumber++;
    this.deck = freshDeck();
    this.board = [];
    this.board2 = null;
    this.pots = [];
    this.currentPot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiser = null;
    this.runItTwiceOffered = false;
    this.runItTwiceVotes = {};
    this.isBombPot = false;
    this.isOmaha = false;
    this.bombPotTwoBoards = false;

    for (const p of this.players) {
      p.folded = false;
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBet = 0;
      p.isAllIn = false;
      p.hasActed = false;
    }

    const activePlayers = this.players.filter(p => !p.sitOut && p.stack > 0);
    this.dealerIndex = (this.dealerIndex + 1) % activePlayers.length;

    const isBombPot = Math.random() < this.bombPotFrequency;
    if (isBombPot) {
      return this._startBombPot(activePlayers);
    } else {
      return this._startNormalHand(activePlayers);
    }
  }

  _startNormalHand(activePlayers) {
    const sbIndex = (this.dealerIndex + 1) % activePlayers.length;
    const bbIndex = (this.dealerIndex + 2) % activePlayers.length;
    const sbP = activePlayers[sbIndex % activePlayers.length];
    const bbP = activePlayers[bbIndex % activePlayers.length];

    this._postBlind(sbP.id, this.smallBlind);
    this._postBlind(bbP.id, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    for (const p of activePlayers) {
      p.holeCards = [this.deck.pop(), this.deck.pop()];
    }

    this.phase = 'preflop';

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

  _startBombPot(activePlayers) {
    // Two-board PLO: starts PREFLOP (not flop), normal blind structure,
    // 4 hole cards each, two boards dealt street by street
    this.isBombPot = true;
    this.isOmaha = true;
    this.bombPotTwoBoards = true;

    const sbIndex = (this.dealerIndex + 1) % activePlayers.length;
    const bbIndex = (this.dealerIndex + 2) % activePlayers.length;
    const sbP = activePlayers[sbIndex];
    const bbP = activePlayers[bbIndex];

    this._postBlind(sbP.id, this.smallBlind);
    this._postBlind(bbP.id, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // Deal 4 hole cards each (Omaha)
    for (const p of activePlayers) {
      p.holeCards = [this.deck.pop(), this.deck.pop(), this.deck.pop(), this.deck.pop()];
    }

    this.phase = 'preflop';

    // Action starts left of BB (UTG)
    const utg = this._nextActiveIndex(bbIndex);
    this.actionIndex = utg % activePlayers.length;
    this.lastRaiser = bbP.id;

    return {
      phase: this.phase,
      isBombPot: true,
      isOmaha: true,
      board: [],
      board2: null,
      dealer: activePlayers[this.dealerIndex % activePlayers.length]?.id,
      sb: { id: sbP.id, amount: Math.min(this.smallBlind, sbP.stack + this.smallBlind) },
      bb: { id: bbP.id, amount: Math.min(this.bigBlind, bbP.stack + this.bigBlind) }
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

    const bettingDone = canAct.every(p => p.hasActed && p.currentBet >= this.currentBet)
      || canAct.length === 0;

    if (bettingDone || nonFolded.length <= 1) {
      return this._nextPhase(nonFolded);
    }

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
    this._collectBets();

    if (nonFolded.length === 1) {
      return this._endHand(false);
    }

    const canAct = nonFolded.filter(p => !p.isAllIn);
    const allAllIn = canAct.length === 0 && nonFolded.length > 1;

    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentPhaseIdx = phases.indexOf(this.phase);

    if (this.phase === 'river' || allAllIn) {
      if (allAllIn && this.phase !== 'river') {
        return this._runOutBoard(nonFolded);
      }
      return this._goToShowdown();
    }

    const nextPhase = phases[currentPhaseIdx + 1];
    this.phase = nextPhase;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    for (const p of this.players) { p.currentBet = 0; p.hasActed = false; }

    // Deal community cards — for two-board PLO, deal both boards in parallel
    if (nextPhase === 'flop') {
      this.deck.pop(); // burn
      this.board = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      if (this.bombPotTwoBoards) {
        this.deck.pop(); // burn board 2
        this.board2 = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      }
    } else if (nextPhase === 'turn') {
      this.deck.pop();
      this.board.push(this.deck.pop());
      if (this.bombPotTwoBoards) {
        this.deck.pop();
        this.board2.push(this.deck.pop());
      }
    } else if (nextPhase === 'river') {
      this.deck.pop();
      this.board.push(this.deck.pop());
      if (this.bombPotTwoBoards) {
        this.deck.pop();
        this.board2.push(this.deck.pop());
      }
    }

    // Offer run it twice only for single-board hands
    if (allAllIn && this.board.length < 5 && !this.bombPotTwoBoards) {
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

    this._resetActionForStreet(nonFolded);

    return { type: 'newStreet', phase: nextPhase, board: this.board, board2: this.board2 };
  }

  _runOutBoard(nonFolded) {
    // For two-board PLO: run out both boards completely
    if (this.bombPotTwoBoards) {
      while (this.board.length < 5) {
        this.deck.pop();
        this.board.push(this.deck.pop());
        if (this.board2 && this.board2.length < 5) {
          this.deck.pop();
          this.board2.push(this.deck.pop());
        }
      }
    } else {
      while (this.board.length < 5) {
        this.deck.pop();
        this.board.push(this.deck.pop());
      }
    }

    return this._goToShowdown();
  }

  _goToShowdown() {
    this.phase = 'showdown';

    if (this.bombPotTwoBoards && this.board2) {
      return this._goToShowdownTwoBoards();
    }

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

  _goToShowdownTwoBoards() {
    // Ensure both boards are complete (5 cards each)
    while (this.board.length < 5) {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }
    while (this.board2.length < 5) {
      this.deck.pop();
      this.board2.push(this.deck.pop());
    }

    const playerData = this.players.map(p => ({
      id: p.id, totalBet: p.totalBet, folded: p.folded, holeCards: p.holeCards
    }));

    // Each pot is split in half: half goes to board1 winner, half to board2 winner
    // We need to run determineWinners on halved pot amounts to avoid double-counting
    const pots = calcSidePots(playerData);

    const winnerSummary = [];
    const showdownHands1 = {};
    const showdownHands2 = {};

    for (const pot of pots) {
      const halfAmount = Math.floor(pot.amount / 2);
      const remainder = pot.amount - halfAmount * 2; // any odd chip

      for (let boardIdx = 0; boardIdx < 2; boardIdx++) {
        const board = boardIdx === 0 ? this.board : this.board2;
        const label = boardIdx === 0 ? 'board1' : 'board2';
        const amount = boardIdx === 0 ? halfAmount + remainder : halfAmount;

        // Find winner for this board/pot
        const eligible = pot.eligible.filter(id => {
          const p = this.players.find(pl => pl.id === id);
          return p && !p.folded && p.holeCards?.length > 0;
        });

        if (eligible.length === 0) continue;

        const scores = {};
        for (const id of eligible) {
          const p = this.players.find(pl => pl.id === id);
          try {
            const result = bestOmahaHand(p.holeCards, board);
            scores[id] = result.score;
            const store = boardIdx === 0 ? showdownHands1 : showdownHands2;
            store[id] = { ...result, holeCards: p.holeCards };
          } catch (e) {
            scores[id] = -1;
          }
        }

        const bestScore = Math.max(...Object.values(scores));
        const winners = eligible.filter(id => scores[id] === bestScore);
        const shareEach = Math.floor(amount / winners.length);
        const shareRemainder = amount - shareEach * winners.length;

        winners.forEach((winnerId, idx) => {
          const player = this.getPlayer(winnerId);
          if (player) {
            const win = shareEach + (idx === 0 ? shareRemainder : 0);
            player.stack += win;
            winnerSummary.push({
              playerId: winnerId,
              amount: win,
              runout: label,
              handName: scores[winnerId] !== undefined
                ? (boardIdx === 0 ? showdownHands1[winnerId]?.name : showdownHands2[winnerId]?.name)
                : undefined,
            });
          }
        });
      }
    }

    const snapshot = {
      handNumber: this.handNumber,
      board: this.board,
      board2: this.board2,
      winners: winnerSummary,
      showdownHands: showdownHands1,
      showdownHands2,
      pots: JSON.parse(JSON.stringify(this.pots)),
      isOmaha: true,
      isBombPot: true,
      ranItTwice: false,
      twoBoards: true,
      playerSnapshots: this.players.map(p => ({
        id: p.id, name: p.name, holeCards: p.holeCards || [],
        folded: p.folded, totalBet: p.totalBet, stackAfter: p.stack
      })),
      timestamp: Date.now()
    };
    this.handHistory.unshift(snapshot);
    if (this.handHistory.length > 50) this.handHistory.pop();

    this.phase = 'waiting';
    this.bombPotTwoBoards = false;

    return {
      type: 'handComplete',
      winners: winnerSummary,
      board: this.board,
      board2: this.board2,
      twoBoards: true,
      pots: this.pots,
      showdownHands: showdownHands1,
      showdownHands2,
      isOmaha: true,
      isBombPot: true,
      handNumber: this.handNumber
    };
  }

  _endHand(foldedOut) {
    this.phase = 'showdown';
    const nonFolded = this._activePlayers().filter(p => !p.folded);

    if (nonFolded.length === 1) {
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
      ranItTwice: false,
      handNumber: this.handNumber
    };

    this.handHistory.unshift({
      handNumber: this.handNumber,
      board,
      board2,
      winners: winnerSummary,
      showdownHands,
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
    return handResult;
  }

  _collectBets() {
    for (const p of this.players) {
      this.currentPot += p.currentBet;
      p.currentBet = 0;
    }
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
      bombPotTwoBoards: this.bombPotTwoBoards || false,
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
        holeCards: (p.id === forPlayerId || this.phase === 'showdown') ? p.holeCards : null
      })),
      pendingJoins: forPlayerId === this.hostId
        ? this.pendingJoins.map(p => ({ id: p.id, name: p.name }))
        : [],
    };
  }

  // Run it twice voting
  voteRunItTwice(playerId, vote) {
    if (!this.runItTwiceOffered) return null;
    if (this.runItTwiceVotes[playerId] === undefined) return null;
    this.runItTwiceVotes[playerId] = vote;

    const votes = Object.values(this.runItTwiceVotes);
    if (votes.some(v => v === null)) return { waiting: true };

    const allYes = votes.every(v => v === true);
    this.runItTwiceOffered = false;

    if (allYes) {
      return this._executeRunItTwice();
    } else {
      return this._runItOnce();
    }
  }

  _executeRunItTwice() {
    const { board1, board2 } = runItTwice(this.deck, this.board);

    const results1 = determineWinners(
      this.players.map(p => ({ id: p.id, totalBet: p.totalBet, folded: p.folded, holeCards: p.holeCards })),
      board1, this.isOmaha
    );
    const results2 = determineWinners(
      this.players.map(p => ({ id: p.id, totalBet: p.totalBet, folded: p.folded, holeCards: p.holeCards })),
      board2, this.isOmaha
    );

    const winnerSummary = [];
    const showdownHands1 = {};
    const showdownHands2 = {};

    const process = (results, board, half, label, handStore) => {
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
      for (const p of nf) {
        const best = this.isOmaha ? bestOmahaHand(p.holeCards, board) : bestHoldemHand(p.holeCards, board);
        handStore[p.id] = { ...best, holeCards: p.holeCards };
      }
    };

    process(results1, board1, 0.5, 'run1', showdownHands1);
    process(results2, board2, 0.5, 'run2', showdownHands2);

    this.board = board1;
    this.board2 = board2;

    const handResult = {
      type: 'handComplete',
      winners: winnerSummary,
      board: board1,
      board2,
      pots: this.pots,
      showdownHands: showdownHands1,
      showdownHands2,
      isOmaha: this.isOmaha,
      isBombPot: this.isBombPot,
      ranItTwice: true,
      handNumber: this.handNumber
    };

    this.handHistory.unshift({
      handNumber: this.handNumber,
      board: board1,
      board2,
      winners: winnerSummary,
      showdownHands: showdownHands1,
      showdownHands2,
      pots: JSON.parse(JSON.stringify(this.pots)),
      isOmaha: this.isOmaha,
      isBombPot: this.isBombPot,
      ranItTwice: true,
      playerSnapshots: this.players.map(p => ({
        id: p.id, name: p.name, holeCards: p.holeCards || [],
        folded: p.folded, totalBet: p.totalBet, stackAfter: p.stack
      })),
      timestamp: Date.now()
    });
    if (this.handHistory.length > 50) this.handHistory.pop();

    this.phase = 'waiting';
    return handResult;
  }

  _runItOnce() {
    while (this.board.length < 5) {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }
    return this._goToShowdown();
  }
}

module.exports = GameRoom;
