'use strict';

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuid } = require('uuid');
const { GameRoom } = require('./gameRoom');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const rooms = new Map(); // roomId → GameRoom
const socketToPlayer = new Map(); // socketId → { roomId, playerId }

// ─── REST endpoints ──────────────────────────────────────────────────────────

// Create room (host)
app.post('/api/rooms', (req, res) => {
  const { hostName } = req.body;
  if (!hostName) return res.status(400).json({ error: 'hostName required' });

  const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  const hostId = uuid();
  const room = new GameRoom(roomId, hostId);
  rooms.set(roomId, room);

  // Auto-approve host
  room.addPendingJoin(hostId, hostName, null);
  room.approveJoin(hostId, 1000); // Default stack, host can change

  res.json({ roomId, playerId: hostId, isHost: true });
});

// Join room request
app.post('/api/rooms/:roomId/join', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= 6) return res.status(400).json({ error: 'Room full' });

  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ error: 'playerName required' });

  const playerId = uuid();
  const added = room.addPendingJoin(playerId, playerName, null);
  if (!added) return res.status(400).json({ error: 'Already pending or in room' });

  // Notify host
  const hostSocket = [...io.sockets.sockets.values()].find(s => {
    const sp = socketToPlayer.get(s.id);
    return sp && sp.roomId === room.roomId && sp.playerId === room.hostId;
  });
  if (hostSocket) {
    hostSocket.emit('joinRequest', { playerId, playerName });
  }

  res.json({ playerId, roomId: room.roomId, status: 'pending' });
});

// Room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ roomId: room.roomId, playerCount: room.players.length, phase: room.phase });
});

// ─── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('identify', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });

    const player = room.getPlayer(playerId);
    if (!player) return socket.emit('error', { message: 'Player not found in room' });

    player.socketId = socket.id;
    player.connected = true;
    socketToPlayer.set(socket.id, { roomId, playerId });
    socket.join(roomId);

    socket.emit('identified', { playerId, isHost: playerId === room.hostId });
    socket.emit('gameState', room.publicState(playerId));

    // Notify others
    socket.to(roomId).emit('playerConnected', { playerId, name: player.name });
    broadcastState(room);
  });

  // ── Host Actions ──────────────────────────────────────────────────────────

  socket.on('approveJoin', ({ playerId: pendingId, stackSize }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return socket.emit('error', { message: 'Not host' });

    const player = room.approveJoin(pendingId, stackSize || 1000);
    if (!player) return socket.emit('error', { message: 'Could not approve player' });

    // Notify the approved player
    const pendingSocket = [...io.sockets.sockets.values()].find(s => {
      const ssp = socketToPlayer.get(s.id);
      return ssp && ssp.roomId === room.roomId && ssp.playerId === pendingId;
    });
    if (pendingSocket) {
      pendingSocket.emit('joinApproved', { stackSize: player.stack });
    }

    io.to(sp.roomId).emit('playerJoined', { playerId: player.id, name: player.name, stack: player.stack });
    broadcastState(room);
  });

  socket.on('denyJoin', ({ playerId: pendingId }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return;
    room.denyJoin(pendingId);
    broadcastState(room);
  });

  socket.on('setStack', ({ targetPlayerId, amount }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return;
    const player = room.getPlayer(targetPlayerId);
    if (player) {
      player.stack = parseInt(amount) || player.stack;
      broadcastState(room);
    }
  });

  socket.on('setBlinds', ({ smallBlind, bigBlind }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return;
    if (room.phase !== 'waiting') return socket.emit('error', { message: 'Can only change blinds between hands' });
    room.smallBlind = parseInt(smallBlind) || room.smallBlind;
    room.bigBlind = parseInt(bigBlind) || room.bigBlind;
    io.to(sp.roomId).emit('blindsChanged', { smallBlind: room.smallBlind, bigBlind: room.bigBlind });
    broadcastState(room);
  });

  socket.on('setBombPotFrequency', ({ frequency }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return;
    room.bombPotFrequency = Math.max(0, Math.min(1, parseFloat(frequency) || 0));
    broadcastState(room);
  });

  socket.on('removePlayer', ({ targetPlayerId }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return;
    if (room.phase !== 'waiting') return socket.emit('error', { message: 'Can only remove players between hands' });
    room.removePlayer(targetPlayerId);
    const targetSocket = [...io.sockets.sockets.values()].find(s => {
      const ssp = socketToPlayer.get(s.id);
      return ssp && ssp.roomId === room.roomId && ssp.playerId === targetPlayerId;
    });
    if (targetSocket) targetSocket.emit('kicked', {});
    broadcastState(room);
  });

  socket.on('startHand', () => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room || sp.playerId !== room.hostId) return socket.emit('error', { message: 'Not host' });
    if (!room.canStartHand()) return socket.emit('error', { message: 'Cannot start hand' });

    const result = room.startHand();
    if (result.error) return socket.emit('error', { message: result.error });

    io.to(sp.roomId).emit('handStarted', {
      handNumber: room.handNumber,
      isBombPot: result.isBombPot,
      isOmaha: result.isOmaha,
      board: result.board || [],
      phase: result.phase
    });

    broadcastState(room);

    if (result.phase !== 'waiting') {
      emitTurnNotification(room);
    }
  });

  // ── Player Actions ────────────────────────────────────────────────────────

  socket.on('action', ({ action, amount }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room) return;

    const result = room.processAction(sp.playerId, action, amount);
    if (result.error) return socket.emit('error', { message: result.error });

    io.to(sp.roomId).emit('actionTaken', result.actionResult);

    const next = result.next;
    if (!next) return;

    if (next.type === 'handComplete') {
      io.to(sp.roomId).emit('handComplete', next);
      broadcastState(room);
    } else if (next.type === 'newStreet') {
      io.to(sp.roomId).emit('newStreet', { phase: next.phase, board: next.board });
      broadcastState(room);
      emitTurnNotification(room);
    } else if (next.type === 'runItTwiceOffer') {
      io.to(sp.roomId).emit('runItTwiceOffer', next);
      broadcastState(room);
    } else if (next.type === 'action') {
      broadcastState(room);
      emitTurnNotification(room);
    }
  });

  socket.on('voteRunItTwice', ({ vote }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room) return;

    io.to(sp.roomId).emit('runItTwiceVote', { playerId: sp.playerId, vote });

    const result = room.voteRunItTwice(sp.playerId, vote);
    if (!result) return;
    if (result.waiting) return;

    if (result.type === 'handComplete') {
      io.to(sp.roomId).emit('handComplete', result);
    } else if (result.type === 'newStreet') {
      io.to(sp.roomId).emit('newStreet', { phase: result.phase, board: result.board });
      emitTurnNotification(room);
    }
    broadcastState(room);
  });

  socket.on('sitOut', ({ sitOut }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room) return;
    const player = room.getPlayer(sp.playerId);
    if (player) {
      player.sitOut = !!sitOut;
      broadcastState(room);
    }
  });

  socket.on('chat', ({ message }) => {
    const sp = socketToPlayer.get(socket.id);
    if (!sp) return;
    const room = rooms.get(sp.roomId);
    if (!room) return;
    const player = room.getPlayer(sp.playerId);
    if (!player) return;

    const msg = {
      id: uuid(),
      playerId: sp.playerId,
      playerName: player.name,
      message: message.slice(0, 200),
      timestamp: Date.now()
    };
    room.chatHistory.push(msg);
    if (room.chatHistory.length > 100) room.chatHistory.shift();
    io.to(sp.roomId).emit('chat', msg);
  });

  socket.on('disconnect', () => {
    const sp = socketToPlayer.get(socket.id);
    if (sp) {
      const room = rooms.get(sp.roomId);
      if (room) {
        const player = room.getPlayer(sp.playerId);
        if (player) {
          player.connected = false;
          socket.to(sp.roomId).emit('playerDisconnected', { playerId: sp.playerId });
          broadcastState(room);
        }
      }
      socketToPlayer.delete(socket.id);
    }
    console.log('Socket disconnected:', socket.id);
  });
});

function broadcastState(room) {
  for (const player of room.players) {
    if (!player.socketId) continue;
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) {
      sock.emit('gameState', room.publicState(player.id));
    }
  }
}

function emitTurnNotification(room) {
  const activePlayers = room.players.filter(p => !p.folded && !p.isAllIn && p.holeCards?.length > 0);
  if (room.actionIndex === undefined || !activePlayers[room.actionIndex]) return;
  const currentPlayer = activePlayers[room.actionIndex];
  io.to(room.roomId).emit('yourTurn', { playerId: currentPlayer.id });
}

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Poker server running on port ${PORT}`));
