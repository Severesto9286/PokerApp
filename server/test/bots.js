'use strict';

// Dev helper: seat a few bots at a table so you can try the UI alone.
//   node test/bots.js <TABLECODE> [count=3] [server=http://localhost:3001] [style=normal|maniac|calling|tight]
// Bots act after a short random delay: mostly check/call, sometimes raise, occasionally shove.

const { io } = require('socket.io-client');

const [,, code, countArg = '3', server = 'http://localhost:3001', style = 'normal'] = process.argv;
if (!code) { console.error('usage: node test/bots.js <TABLECODE> [count] [server] [style]'); process.exit(1); }

const NAMES = ['Ace Bot', 'Bluffy', 'Nitro', 'Fishy', 'Solver', 'Calling Sam', 'Tilt', 'Grinder'];
const count = Math.min(8, Math.max(1, Number(countArg) || 3));

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

for (let i = 0; i < count; i++) {
  const name = NAMES[i % NAMES.length];
  const sock = io(server, { transports: ['websocket'] });
  let me = null;
  let pendingTimer = null;
  let stack = 200;

  sock.on('connect', () => {
    sock.emit('table:join', { tableId: code, name, avatar: (i * 5 + 3) % 16, buyIn: 200 }, (res) => {
      if (res.error) { console.error(`${name}: ${res.error}`); sock.close(); return; }
      me = res.playerId;
      console.log(`${name} ${res.pending ? 'requested to join' : 'seated'} at ${res.tableId}`);
    });
  });

  sock.on('state', (s) => {
    if (!me) return;
    const mine = s.seats.find((p) => p && p.id === me);
    if (mine) stack = mine.stack;
    if (!s.hand || s.hand.finished) return;
    if (s.hand.rit && mine && s.hand.rit.votes[mine.seat] === null) {
      setTimeout(() => sock.emit('ritVote', { yes: Math.random() < 0.8 }), 500 + Math.random() * 2000);
    }
    const seat = s.seats.find((p) => p && p.id === me);
    if (seat) stack = seat.stack;
    if (!seat || s.hand.actionSeat !== seat.seat || !s.legal) return;
    if (pendingTimer) return;
    const legal = s.legal;
    const delay = 600 + Math.random() * 1800;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const r = Math.random();
      let action = legal.canCheck ? 'check' : 'call';
      let amount;
      const raiseChance = style === 'maniac' ? 0.45 : style === 'calling' ? 0.05 : 0.2;
      const foldChance = style === 'calling' ? 0.02 : style === 'tight' ? 0.85 : 0.15;
      if (legal.canRaise && r < raiseChance) {
        action = legal.currentBet === 0 ? 'bet' : 'raise';
        const sizes = [legal.minRaiseTo, Math.round(legal.currentBet + legal.potTotal * 0.6), Math.round(legal.currentBet + legal.potTotal), legal.maxRaiseTo];
        amount = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, pick(sizes)));
        if (Math.random() < (style === 'maniac' ? 0.25 : 0.08)) action = 'allin';
      } else if (!legal.canCheck && r > 1 - foldChance) {
        action = 'fold';
      }
      sock.emit('action', { action, amount }, (res) => {
        if (res && res.error) console.log(`${name}: ${action} ${amount || ''} -> ${res.error}`);
        else console.log(`${name}: ${action}${amount ? ' ' + amount : ''}`);
      });
    }, delay);
  });

  sock.on('event', (e) => {
    if (e.type === 'handEnd' && me && stack === 0) {
      setTimeout(() => sock.emit('rebuy', { amount: 200 }), 500); // asks the host
    }
    if (e.type === 'chat' && e.message.playerId !== me && Math.random() < 0.15) {
      setTimeout(() => sock.emit('chat', { text: pick(['gg', 'nice hand', 'lol', 'sigh', 'run good', '🔥']) }), 800 + Math.random() * 2000);
    }
  });

  sock.on('kicked', () => { console.log(`${name} was removed`); sock.close(); });
  sock.on('joinStatus', (j) => console.log(`${name}: ${j.status}`));
}
