'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { randomUUID, randomBytes } = require('crypto');
const { Table } = require('./engine/table');

const PORT = process.env.PORT || 3001;
// Optional timing overrides for debugging, e.g. TIMING='{"showdownHold":20000}'
let TIMING = {};
try { TIMING = JSON.parse(process.env.TIMING || '{}'); } catch { TIMING = {}; }
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ─── State ────────────────────────────────────────────────────────────────────
const tables = new Map();      // tableId -> Table
const credentials = new Map(); // playerId -> secret
const identities = new Map();  // playerId -> { name, avatar }
const sockets = new Map();     // socket.id -> { tableId, playerId }

function newTableId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  const bytes = randomBytes(5);
  for (let i = 0; i < 5; i++) id += alphabet[bytes[i] % alphabet.length];
  return tables.has(id) ? newTableId() : id;
}

function issueCredentials() {
  const playerId = randomUUID();
  const secret = randomBytes(16).toString('hex');
  credentials.set(playerId, secret);
  return { playerId, secret };
}

function authed(playerId, secret) {
  return !!playerId && credentials.get(playerId) === secret;
}

function roomOf(tableId) { return `table:${tableId}`; }

// Events that may only go to specific sockets are filtered here.
const PRIVATE_EVENTS = new Set();

function attachTable(table) {
  let pending = false;
  const flush = () => {
    pending = false;
    for (const [sid, info] of sockets) {
      if (info.tableId !== table.id) continue;
      const sock = io.sockets.sockets.get(sid);
      if (sock) sock.emit('state', table.state(info.playerId));
    }
  };
  table.on((evt) => {
    if (evt.type === 'joinRequest') {
      // Only the host needs to know, and the requester needs a status.
      const req = evt.request;
      emitToPlayer(table.id, req.id, 'joinStatus', { status: 'pending', tableId: table.id });
    } else if (evt.type === 'joinDenied') {
      emitToPlayer(table.id, evt.playerId, 'joinStatus', { status: 'denied', tableId: table.id });
    } else if (evt.type === 'playerSeated') {
      emitToPlayer(table.id, evt.player.id, 'joinStatus', { status: 'seated', tableId: table.id });
    } else if (evt.type === 'playerLeft') {
      emitToPlayer(table.id, evt.playerId, 'kicked', { tableId: table.id, reason: evt.reason });
    }
    if (!PRIVATE_EVENTS.has(evt.type)) io.to(roomOf(table.id)).emit('event', evt);
    if (!pending) { pending = true; setImmediate(flush); }
  });
}

function emitToPlayer(tableId, playerId, name, payload) {
  for (const [sid, info] of sockets) {
    if (info.tableId === tableId && info.playerId === playerId) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) sock.emit(name, payload);
    }
  }
}

function getContext(socket) {
  const info = sockets.get(socket.id);
  if (!info) return null;
  const table = tables.get(info.tableId);
  if (!table) return null;
  return { table, playerId: info.playerId, isHost: table.isHost(info.playerId) };
}

function bindSocketToTable(socket, tableId, playerId) {
  const prev = sockets.get(socket.id);
  if (prev && prev.tableId !== tableId) socket.leave(roomOf(prev.tableId));
  sockets.set(socket.id, { tableId, playerId });
  socket.join(roomOf(tableId));
}

// ─── Socket API ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const reply = (cb, payload) => { if (typeof cb === 'function') cb(payload); };

  socket.on('table:create', ({ name, avatar, config } = {}, cb) => {
    const { playerId, secret } = issueCredentials();
    const id = newTableId();
    const safeConfig = {};
    if (config && typeof config === 'object') Object.assign(safeConfig, config);
    const table = new Table(id, playerId, {}, { timing: TIMING });
    table.updateConfig(safeConfig);
    tables.set(id, table);
    attachTable(table);
    identities.set(playerId, { name, avatar });
    bindSocketToTable(socket, id, playerId);
    const res = table.requestJoin({ id: playerId, name, avatar, buyIn: safeConfig.buyIn || table.config.buyIn });
    if (res.error) return reply(cb, { error: res.error });
    reply(cb, { tableId: id, playerId, secret, state: table.state(playerId) });
  });

  socket.on('table:join', ({ tableId, name, avatar, buyIn } = {}, cb) => {
    const table = tables.get(String(tableId || '').toUpperCase().trim());
    if (!table) return reply(cb, { error: 'Table not found. Check the code and try again.' });
    const { playerId, secret } = issueCredentials();
    identities.set(playerId, { name, avatar });
    bindSocketToTable(socket, table.id, playerId);
    const res = table.requestJoin({ id: playerId, name, avatar, buyIn });
    if (res.error) { sockets.delete(socket.id); socket.leave(roomOf(table.id)); return reply(cb, { error: res.error }); }
    reply(cb, { tableId: table.id, playerId, secret, pending: !!res.pending, state: table.state(playerId) });
  });

  // Reconnect after refresh / network blip.
  socket.on('table:resume', ({ tableId, playerId, secret } = {}, cb) => {
    const table = tables.get(String(tableId || '').toUpperCase());
    if (!table) return reply(cb, { error: 'That table no longer exists.' });
    if (!authed(playerId, secret)) return reply(cb, { error: 'Session expired.' });
    const seated = table.getPlayer(playerId);
    const pending = table.pending.find((p) => p.id === playerId);
    if (!seated && !pending) return reply(cb, { error: 'You are no longer at this table.' });
    bindSocketToTable(socket, table.id, playerId);
    if (seated) table.setConnected(playerId, true);
    reply(cb, { ok: true, tableId: table.id, pending: !!pending, state: table.state(playerId), chat: table.chat.slice(-60), history: table.history.slice(0, 30) });
  });

  socket.on('table:leave', (_, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { ok: true });
    const { table, playerId } = ctx;
    table.pending = table.pending.filter((p) => p.id !== playerId);
    if (table.getPlayer(playerId)) table.removePlayer(playerId);
    sockets.delete(socket.id);
    socket.leave(roomOf(table.id));
    reply(cb, { ok: true });
    maybeCleanup(table);
  });

  socket.on('action', ({ action, amount } = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    const res = ctx.table.act(ctx.playerId, action, amount);
    reply(cb, res);
  });

  socket.on('sitOut', ({ sitOut } = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    reply(cb, ctx.table.setSitOut(ctx.playerId, sitOut));
  });

  socket.on('rebuy', ({ amount } = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    reply(cb, ctx.table.rebuy(ctx.playerId, amount));
  });

  socket.on('prefs', ({ runItTwice } = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    if (runItTwice !== undefined) ctx.table.setRunItTwice(ctx.playerId, runItTwice);
    reply(cb, { ok: true });
  });

  socket.on('chat', ({ text } = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    ctx.table.addChat(ctx.playerId, text);
    reply(cb, { ok: true });
  });

  socket.on('history', (_, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { history: [] });
    reply(cb, { history: ctx.table.history.slice(0, 50) });
  });

  // ── Host controls ──
  const hostOnly = (handler) => (payload = {}, cb) => {
    const ctx = getContext(socket);
    if (!ctx) return reply(cb, { error: 'Not at a table' });
    if (!ctx.isHost) return reply(cb, { error: 'Host only' });
    reply(cb, handler(ctx, payload) || { ok: true });
  };

  socket.on('host:approve', hostOnly(({ table }, { playerId, buyIn }) => table.approveJoin(playerId, buyIn)));
  socket.on('host:deny', hostOnly(({ table }, { playerId }) => { table.denyJoin(playerId); }));
  socket.on('host:config', hostOnly(({ table }, { patch }) => table.updateConfig(patch || {})));
  socket.on('host:startHand', hostOnly(({ table }, { variant }) => table.startHand(variant === 'PLO' || variant === 'NLH' ? variant : undefined)));
  socket.on('host:pause', hostOnly(({ table }, { paused }) => { table.setPaused(paused); }));
  socket.on('host:nextVariant', hostOnly(({ table }, { variant }) => { table.forceNextVariant(variant); }));
  socket.on('host:setStack', hostOnly(({ table }, { playerId, amount }) => table.setStack(playerId, amount)));
  socket.on('host:addChips', hostOnly(({ table }, { playerId, amount }) => table.rebuy(playerId, amount)));
  socket.on('host:kick', hostOnly(({ table }, { playerId }) => {
    if (table.isHost(playerId)) return { error: 'Cannot remove the host' };
    return table.removePlayer(playerId, 'kicked');
  }));

  socket.on('disconnect', () => {
    const ctx = getContext(socket);
    sockets.delete(socket.id);
    if (!ctx) return;
    const stillConnected = [...sockets.values()].some((i) => i.tableId === ctx.table.id && i.playerId === ctx.playerId);
    if (!stillConnected && ctx.table.getPlayer(ctx.playerId)) ctx.table.setConnected(ctx.playerId, false);
    maybeCleanup(ctx.table);
  });
});

// Drop tables that have had nobody connected for a while.
function maybeCleanup(table) {
  setTimeout(() => {
    const anyone = [...sockets.values()].some((i) => i.tableId === table.id);
    if (!anyone && Date.now() - table.lastActivity > 30 * 60 * 1000) {
      table.destroy();
      tables.delete(table.id);
    }
  }, 31 * 60 * 1000).unref();
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, tables: tables.size }));
app.get('/api/tables/:id', (req, res) => {
  const table = tables.get(String(req.params.id).toUpperCase());
  if (!table) return res.status(404).json({ error: 'Table not found' });
  res.json({ id: table.id, players: table.players.length, maxSeats: table.config.maxSeats, blinds: [table.config.smallBlind, table.config.bigBlind], inHand: !!table.hand });
});

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_, res) => res.sendFile(path.join(dist, 'index.html')));
}

httpServer.listen(PORT, () => console.log(`Poker server listening on :${PORT}`));
