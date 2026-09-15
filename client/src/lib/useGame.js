import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { socket, call, saveSession } from './socket';
import { audio } from './audio';
import { seatPositions, betPosition, slotFor, getLayout } from './layout';

// How long each event occupies the animation timeline (ms).
function durationOf(e) {
  switch (e.type) {
    case 'handStart': return 200;
    case 'deal': return 320 + e.seats.length * e.cardsEach * 70;
    case 'post': return 120;
    case 'action': return e.action === 'fold' ? 260 : 340;
    case 'collect': return e.moved > 0 ? 700 : 80;
    case 'street': return e.street === 'flop' ? 820 : e.street === 'split' ? 350 : 520;
    case 'reveal': return 700;
    case 'result': return e.showdown ? 1500 : 900;
    case 'handEnd': return 300;
    default: return 0;
  }
}

const initialAnim = {
  board: [], board2: null, boardKeys: {}, // boardKeys: card -> timestamp dealt (for animation)
  bets: {},            // seat -> amount currently in front of them
  pot: 0,              // chips collected in the middle
  flights: [],         // animated chip stacks
  tags: {},            // seat -> { action, amount, at }
  dealing: null,       // { seats, cardsEach, at, dealerSeat }
  folded: {},          // seat -> at
  reveals: {},         // seat -> cards
  result: null,        // last result (banner)
  winners: {},         // seat -> amount
  refund: null,
  runningOut: false,
  runItTwice: false,
  handNumber: 0,
  variant: 'NLH',
  bombPot: false,
  handActive: false,
  turnSeat: null,
  showdown: false,
};

let flightId = 0;

function animReducer(anim, a) {
  switch (a.type) {
    case 'reset': return { ...initialAnim, handNumber: anim.handNumber };
    case 'patch': return { ...anim, ...a.patch };
    case 'fn': return a.fn(anim);
    default: return anim;
  }
}

export function useGame(session, onSessionLost) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [chat, setChat] = useState([]);
  const [history, setHistory] = useState([]);
  const [joinStatus, setJoinStatus] = useState(session?.pending ? 'pending' : 'seated');
  const [toasts, setToasts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [anim, dispatch] = useReducer(animReducer, initialAnim);
  const clock = useRef(0);
  const timers = useRef(new Set());
  const stateRef = useRef(null);
  const animRef = useRef(anim);
  animRef.current = anim;
  const serverOffset = useRef(0);
  const chatOpenRef = useRef(false);

  const toast = useCallback((text, kind = 'info', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  // Browsers throttle timers in hidden tabs, so animations there are skipped entirely.
  const later = useCallback((fn, ms) => {
    if (document.hidden) { fn(); return; }
    const id = setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);

  // Geometry helpers for flights need the hero seat.
  const geometry = useCallback(() => {
    const s = stateRef.current;
    if (!s) return null;
    const hero = s.seats.find((p) => p && p.id === s.you);
    const max = s.seats.length;
    const L = getLayout();
    const positions = seatPositions(max, L);
    const posOf = (seat) => positions[slotFor(seat, hero ? hero.seat : 0, max)] || positions[0];
    const pot = animRef.current.board2 ? L.POT_TWO_BOARDS : L.POT;
    return { posOf, betOf: (seat) => betPosition(posOf(seat), L), pot: [pot.x, pot.y] };
  }, []);

  const addFlights = useCallback((items, dur) => {
    if (document.hidden) return;
    const list = items.map((it) => ({ id: ++flightId, dur, ...it }));
    dispatch({ type: 'fn', fn: (a) => ({ ...a, flights: [...a.flights, ...list] }) });
    later(() => dispatch({ type: 'fn', fn: (a) => ({ ...a, flights: a.flights.filter((f) => !list.find((l) => l.id === f.id)) }) }), dur + 80);
  }, [later]);

  // ─── Apply a single event to the animation state ─────────────────────────
  const apply = useCallback((e) => {
    if (import.meta.env.DEV) console.debug('[anim]', e.type, e.seq, Math.round(performance.now() - (e._recv || performance.now())));
    const s = stateRef.current;
    const mySeat = s ? (s.seats.find((p) => p && p.id === s.you)?.seat ?? null) : null;
    const bb = s?.config?.bigBlind || 1;
    const g = geometry();
    switch (e.type) {
      case 'handStart':
        dispatch({ type: 'fn', fn: (a) => ({ ...initialAnim, handNumber: e.handNumber, variant: e.variant, bombPot: e.bombPot, handActive: true }) });
        audio.setTension(0);
        if (e.variant === 'PLO') { audio.notify(); toast(e.bombPot ? '💣 Bomb pot! PLO, everyone posts, straight to the flop' : '🃏 PLO hand — four cards, pot limit', 'variant', 3600); }
        break;
      case 'post':
        dispatch({ type: 'fn', fn: (a) => ({ ...a, bets: { ...a.bets, [e.seat]: e.streetBet ?? ((a.bets[e.seat] || 0) + e.amount) } }) });
        if (e.kind === 'bomb' || e.kind === 'ante') { if (e.seat === (s?.hand?.dealerSeat ?? e.seat)) audio.chips(e.amount); }
        else audio.chips(e.amount);
        break;
      case 'deal':
        dispatch({ type: 'patch', patch: { dealing: { seats: e.seats, cardsEach: e.cardsEach, at: Date.now(), dealerSeat: e.dealerSeat } } });
        for (let i = 0; i < Math.min(e.seats.length * e.cardsEach, 12); i++) later(() => audio.deal(), i * 70);
        break;
      case 'action': {
        dispatch({ type: 'fn', fn: (a) => {
          const next = { ...a, tags: { ...a.tags, [e.seat]: { action: e.action, amount: e.amount, allIn: e.allIn, at: Date.now() } } };
          if (e.action === 'fold') next.folded = { ...a.folded, [e.seat]: Date.now() };
          if (e.action === 'call' || e.action === 'bet' || e.action === 'raise') next.bets = { ...a.bets, [e.seat]: e.streetBet };
          return next;
        } });
        if (e.action === 'fold') audio.fold();
        else if (e.action === 'check') audio.check();
        else if (e.allIn) audio.allIn();
        else audio.chips(e.amount, e.action === 'raise' && e.amount > 20 * bb);
        // Tension rises with the pot and with all-ins during live action.
        if (e.allIn) audio.setTension(Math.max(audio.tension, 0.45));
        else if (e.potTotal > 60 * bb) audio.setTension(Math.max(audio.tension, 0.3));
        break;
      }
      case 'collect': {
        const a = animRef.current;
        const entries = Object.entries(a.bets).filter(([, v]) => v > 0);
        if (entries.length && g) {
          addFlights(entries.map(([seat, amount]) => ({ kind: 'chips', amount, from: g.betOf(Number(seat)), to: g.pot })), 520);
          audio.collect();
          later(() => dispatch({ type: 'fn', fn: (x) => ({ ...x, bets: {}, pot: e.total }) }), 460);
        } else {
          dispatch({ type: 'fn', fn: (x) => ({ ...x, bets: {}, pot: e.total }) });
        }
        break;
      }
      case 'street': {
        if (e.street === 'split') {
          dispatch({ type: 'fn', fn: (a) => ({ ...a, board2: e.board2.slice(), runItTwice: true }) });
          break;
        }
        const now = Date.now();
        dispatch({ type: 'fn', fn: (a) => {
          const keys = { ...a.boardKeys };
          for (const c of e.newCards || []) keys[c] = now;
          for (const c of e.newCards2 || []) keys[c] = now;
          const next = { ...a, boardKeys: keys, runningOut: !!e.runningOut };
          if (e.boardKey === 'board2') next.board2 = e.board2.slice();
          else { next.board = e.board.slice(); if (e.board2) next.board2 = e.board2.slice(); }
          return next;
        } });
        const n = (e.newCards || []).length + (e.newCards2 || []).length;
        for (let i = 0; i < n; i++) later(() => audio.flip(), i * 160);
        if (e.runningOut) {
          const level = e.street === 'flop' ? 0.72 : e.street === 'turn' ? 0.85 : 1;
          audio.setTension(level);
          if (e.street === 'turn') later(() => audio.riser(2000), 200);
          if (e.street === 'river') later(() => audio.hit(1), 120);
        }
        break;
      }
      case 'reveal': {
        const reveals = {};
        for (const r of e.seats) reveals[r.seat] = r.cards;
        dispatch({ type: 'fn', fn: (a) => ({ ...a, reveals: { ...a.reveals, ...reveals }, runningOut: true, runItTwice: e.runItTwice, showdown: true }) });
        audio.setTension(0.7);
        for (let i = 0; i < e.seats.length; i++) later(() => audio.flip(), i * 120);
        break;
      }
      case 'result': {
        const reveals = {};
        for (const r of e.reveals || []) reveals[r.seat] = r.cards;
        const winners = {};
        for (const w of e.winners) winners[w.seat] = (winners[w.seat] || 0) + w.amount;
        const total = e.winners.reduce((x, w) => x + w.amount, 0);
        const big = total >= 40 * bb || e.showdown;
        dispatch({ type: 'fn', fn: (a) => ({ ...a, reveals: { ...a.reveals, ...reveals }, result: e, winners, refund: e.refund, showdown: e.showdown, turnSeat: null }) });
        if (g) {
          const flights = [];
          if (e.refund) flights.push({ kind: 'chips', amount: e.refund.amount, from: g.pot, to: g.betOf(e.refund.seat), refund: true });
          for (const [seat, amount] of Object.entries(winners)) flights.push({ kind: 'chips', amount, from: g.pot, to: g.posOf(Number(seat)) });
          later(() => { addFlights(flights, 700); audio.collect(); }, e.showdown ? 500 : 250);
          later(() => dispatch({ type: 'fn', fn: (x) => ({ ...x, pot: 0, bets: {} }) }), e.showdown ? 520 : 270);
        }
        later(() => audio.win(big), e.showdown ? 350 : 150);
        later(() => audio.setTension(0), 1800);
        break;
      }
      case 'handEnd':
        dispatch({ type: 'fn', fn: (a) => ({ ...initialAnim, handNumber: a.handNumber }) });
        audio.setTension(0);
        break;
      case 'turn':
        dispatch({ type: 'patch', patch: { turnSeat: e.seat } });
        if (e.seat === mySeat) audio.yourTurn();
        break;
      case 'timeBank':
        if (e.seat === mySeat) toast('⏳ Time bank activated', 'warn', 2000);
        break;
      default:
        break;
    }
  }, [geometry, addFlights, later, toast]);

  // Queue an event on the animation timeline.
  // Events are played back sequentially. If a burst arrives (tab was stalled or
  // hidden) the timeline compresses so the table never lags far behind reality.
  const enqueue = useCallback((e) => {
    const now = performance.now();
    e._recv = now;
    if (document.hidden) { clock.current = now; apply(e); return; }
    const lag = clock.current - now;
    if (lag > 4000) { clock.current = now; apply(e); return; }
    const factor = lag > 1500 ? 0.25 : 1;
    const startAt = Math.max(now, clock.current);
    clock.current = startAt + durationOf(e) * factor;
    const delay = startAt - now;
    if (delay <= 4) apply(e); else later(() => apply(e), delay);
  }, [apply, later]);

  // ─── Socket wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;

    const resume = async () => {
      const res = await call('table:resume', { tableId: session.tableId, playerId: session.playerId, secret: session.secret });
      if (cancelled) return;
      if (res.error) { onSessionLost(res.error); return; }
      setJoinStatus(res.pending ? 'pending' : 'seated');
      if (res.chat) setChat(res.chat);
      if (res.history) setHistory(res.history);
      stateRef.current = res.state;
      setState(res.state);
      syncFromState(res.state, true);
    };

    const syncFromState = (s, force) => {
      if (!s) return;
      serverOffset.current = s.serverTime - Date.now();
      const idle = performance.now() >= clock.current;
      if (!idle && !force) return;
      const h = s.hand;
      dispatch({ type: 'fn', fn: (prev) => {
        if (!h) return (prev.handActive || prev.result || Object.keys(prev.winners).length) ? { ...initialAnim, handNumber: s.handNumber } : prev;
        // A different hand than the one we were animating: start clean.
        const a = prev.handNumber === h.number ? prev : { ...initialAnim, handNumber: h.number };
        const bets = {};
        let streetTotal = 0;
        for (const p of s.seats) if (p && p.inHand && p.streetBet > 0) { bets[p.seat] = p.streetBet; streetTotal += p.streetBet; }
        const reveals = { ...a.reveals };
        for (const p of s.seats) if (p && p.cards && p.id !== s.you) reveals[p.seat] = p.cards;
        const folded = { ...a.folded };
        for (const p of s.seats) if (p && p.folded && !folded[p.seat]) folded[p.seat] = 0;
        return {
          ...a,
          board: h.board.slice(), board2: h.board2 ? h.board2.slice() : null,
          bets: h.finished ? {} : bets,
          pot: h.finished ? 0 : Math.max(0, h.potTotal - streetTotal),
          reveals, folded,
          handNumber: h.number, variant: h.variant, bombPot: h.bombPot, handActive: true,
          runningOut: h.runningOut, runItTwice: h.runItTwice,
          turnSeat: h.actionSeat,
          result: h.finished ? (a.result || s.lastResult) : null,
          winners: h.finished && s.lastResult ? Object.fromEntries(s.lastResult.winners.map((w) => [w.seat, w.amount])) : {},
          showdown: h.finished ? !!(s.lastResult && s.lastResult.showdown) : h.runningOut,
        };
      } });
    };

    const onState = (s) => { if (import.meta.env.DEV) console.debug('[state]', s.seq, s.hand ? `${s.hand.phase}${s.hand.finished ? '/finished' : ''}` : 'no-hand', 'idle=', performance.now() >= clock.current); stateRef.current = s; setState(s); syncFromState(s, false); };
    const onEvent = (e) => {
      if (e.type === 'chat') {
        setChat((c) => [...c.slice(-199), e.message]);
        if (!chatOpenRef.current && e.message.playerId !== session.playerId) { setUnread((u) => u + 1); audio.click(); }
        return;
      }
      if (e.type === 'joinRequest') { audio.notify(); return; }
      if (e.type === 'result' || e.type === 'handEnd') {
        if (e.type === 'result') call('history').then((r) => { if (r.history) setHistory(r.history); });
      }
      if (e.type === 'playerSeated' && e.player.id !== session.playerId) toast(`${e.player.name} joined the table`, 'info', 2500);
      if (e.type === 'playerLeft' && e.playerId !== session.playerId) {
        const p = stateRef.current?.seats.find((x) => x && x.id === e.playerId);
        if (p) toast(`${p.name} left the table`, 'info', 2500);
      }
      enqueue(e);
    };
    const onJoin = (j) => {
      setJoinStatus(j.status);
      if (j.status === 'seated') { saveSession({ ...session, pending: false }); toast('You are seated. Good luck!', 'success'); }
      if (j.status === 'denied') { onSessionLost('The host declined your request to join.'); }
    };
    const onKicked = (k) => onSessionLost(k && k.reason === 'kicked' ? 'The host removed you from the table.' : 'You have left the table.');
    const onConnect = () => { setConnected(true); resume(); };
    const onDisconnect = () => setConnected(false);

    const onVisible = () => { if (!document.hidden && stateRef.current) { clock.current = 0; syncFromState(stateRef.current, true); } };
    document.addEventListener('visibilitychange', onVisible);
    socket.on('state', onState);
    socket.on('event', onEvent);
    socket.on('joinStatus', onJoin);
    socket.on('kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) resume();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      socket.off('state', onState);
      socket.off('event', onEvent);
      socket.off('joinStatus', onJoin);
      socket.off('kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const id of timers.current) clearTimeout(id);
      timers.current.clear();
    };
  }, [session, enqueue, onSessionLost, toast]);

  // ─── Commands ─────────────────────────────────────────────────────────────
  const act = useCallback(async (action, amount) => {
    audio.click();
    const res = await call('action', { action, amount });
    if (res.error) toast(res.error, 'error');
    return res;
  }, [toast]);

  const send = useCallback(async (event, payload) => {
    const res = await call(event, payload);
    if (res && res.error) toast(res.error, 'error');
    return res;
  }, [toast]);

  const sendChat = useCallback((text) => call('chat', { text }), []);
  const setChatOpen = useCallback((open) => { chatOpenRef.current = open; if (open) setUnread(0); }, []);

  const me = useMemo(() => (state ? state.seats.find((p) => p && p.id === state.you) || null : null), [state]);

  return { state, me, anim, connected, chat, history, joinStatus, toasts, unread, act, send, sendChat, setChatOpen, toast, serverOffset };
}
