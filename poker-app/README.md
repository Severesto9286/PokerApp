# 🃏 Felt & Friends Poker

A private multiplayer poker app for you and your friends — fake money, real fun.

**Features:**
- Texas Hold'em (up to 6 players)
- PLO Bomb Pots (host-configurable frequency)
- Run It Twice when all-in
- Host controls: set stacks, blinds, approve/deny joins
- Side pots calculated automatically
- Real-time via WebSockets (Socket.io)
- In-game chat
- 30-second action timer

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- npm

### 1. Install dependencies

```bash
# From the poker-app root:
npm install          # installs concurrently
npm run install:all  # installs server + client deps
```

### 2. Start both servers

```bash
npm run dev
```

This starts:
- **Server** on `http://localhost:3001`
- **Client** on `http://localhost:5173` (with proxy to server)

Open `http://localhost:5173` in your browser.

---

## How to Play

### Host (creates the table)
1. Click **Create a Table**, enter your name
2. Share the **room code** (shown top-left in-game) with friends
3. As friends request to join, you'll see them in the **Host tab** → set their starting stack → click ✓
4. Set blinds and bomb pot frequency in the Host panel
5. Click **▶ Deal New Hand** to start

### Players (joining)
1. Click **Join a Table**, enter your name + room code
2. Wait for the host to approve you
3. Once approved you're at the table — the host deals

### Gameplay
- **Fold / Check / Call / Raise / All In** buttons appear on your turn
- Use raise presets (½ Pot, ¾ Pot, Pot, 2× Pot) or enter a custom amount
- When going all-in against another all-in player, you'll be offered to **Run It Twice**
- Both players must agree to run it twice; if either declines, it runs once

### Bomb Pots
- The host sets frequency (0–100%) in the Host panel
- When triggered: everyone posts the big blind, 4 hole cards dealt (PLO), flop dealt immediately, no preflop action
- Standard PLO rules: must use exactly 2 hole cards + 3 board cards

---

## Deploying (so friends can join remotely)

### Recommended: Railway (server) + Vercel (client)

**Server on Railway:**
1. Create account at [railway.app](https://railway.app)
2. New project → Deploy from GitHub (push `poker-app/server` folder, or use the full repo)
3. Set start command: `node index.js`
4. Note the generated URL, e.g. `https://poker-server-prod.railway.app`

**Client on Vercel:**
1. Push the `poker-app/client` folder to a GitHub repo
2. Import to [vercel.com](https://vercel.com)
3. Add environment variable: `VITE_SERVER_URL=https://poker-server-prod.railway.app`
4. Deploy

**Alternative: single server with static files**
```bash
cd client && npm run build
# Copy dist/ into server/public/
# Add to server/index.js:
# app.use(express.static(path.join(__dirname, 'public')));
# app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
```
Then deploy just the server folder to Railway/Render/Fly.io.

---

## Project Structure

```
poker-app/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── gameRoom.js       # Game state machine
│   ├── pokerEngine.js    # Hand evaluation, deck, side pots
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx           # Main app, lobby, game table
│   │   ├── components/
│   │   │   ├── Card.jsx          # Playing card renderer
│   │   │   ├── PlayerSeat.jsx    # Seat around the table
│   │   │   ├── ActionPanel.jsx   # Fold/Call/Raise controls
│   │   │   ├── HandResult.jsx    # Winner overlay
│   │   │   └── HostControls.jsx  # Host sidebar panel
│   │   ├── hooks/
│   │   │   └── useSocket.js      # Socket.io connection hook
│   │   └── index.css         # Full dark poker theme
│   └── package.json
└── package.json          # Root scripts
```

---

## Configuration

| Setting | Default | Where |
|---|---|---|
| Server port | `3001` | `server/.env` → `PORT` |
| Starting stack | `$1000` | Set per-player in Host panel |
| Small blind | `$10` | Host panel (changeable between hands) |
| Big blind | `$20` | Host panel |
| Bomb pot frequency | `20%` | Host panel slider |
| Action timeout | 30s | `server/index.js` → `ACTION_TIMEOUT` |
| Max players | 6 | `server/index.js` |

---

## Known Limitations / Future Ideas
- No persistent database (rooms are in-memory; restart = reset)
- No reconnection state recovery after full server restart
- No tournament mode / blind levels timer
- No straddle
- Omaha hi/lo not included
