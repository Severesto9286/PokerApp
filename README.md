# ♠ Felt & Friends

Private online poker for you and your friends, styled after GGPoker. Fake chips, real drama.

- **No Limit Hold'em** with occasional **Pot Limit Omaha** hands (frequency set by the host), either as normal PLO hands with blinds or as **bomb pots** (everyone antes, straight to the flop, optional double board)
- Full rules engine: side pots, short all-in raise rules, heads-up blinds, pot-limit sizing, uncalled bet return, UTG straddle, time bank
- Run it twice decided per hand: everyone in an all-in gets a 10-second yes/no prompt, and it only runs twice if they all agree
- Win without a showdown and you can choose to show your cards; hand history only reveals what was actually shown (plus your own cards)
- Rebuys are requests: players ask, the host approves the amount
- GG-style table: stadium felt, avatars with timer rings, chip stacks, dealer button, dealt/flipped cards, chips flying to the pot and to the winner, showdown highlights, hand-name badges
- Real soundtrack: a lounge-jazz playlist (Kevin MacLeod) that ducks under a looping tension track during all-ins and big pots, plus recorded card, chip and knock effects (Kenney) — see `client/public/audio/CREDITS.md`
- Host controls: approve joins, blinds, antes, buy-ins, stacks, PLO frequency & style, timing, run-it-twice, auto-deal, pause, kick
- Chat with quick emoji, full hand history with every player's cards, reconnect after refresh, pre-action buttons (check/fold, call any), keyboard shortcuts (F / C / R)

## Run it locally

Requires Node 18+.

```bash
npm run install:all   # installs root, server and client deps
npm run dev           # server on :3001, client on :5173
```

Open http://localhost:5173, create a table, and share the 5-letter code. To try it alone, open a second tab with `?p=2` in the URL (each `p` value keeps its own session) or seat some bots:

```bash
cd server
node test/bots.js <TABLECODE> 3            # 3 bots that mostly call
node test/bots.js <TABLECODE> 4 http://localhost:3001 maniac
```

Run the engine tests with `npm test`.

## Deploy so friends can join remotely

### Free setup: Vercel (site) + Render (server)

Vercel can't host the game server (it needs a long-lived Socket.io process with in-memory tables and timers), so split it:

1. **Server on Render** (free tier): render.com → New → *Blueprint* → pick this repo. `render.yaml` sets everything up (root `server/`, `node index.js`). Copy the service URL, e.g. `https://pokerapp-server.onrender.com`.
2. **Site on Vercel**: import the repo with *Root Directory* = `client`. Add the environment variable `VITE_SERVER_URL=https://pokerapp-server.onrender.com` and deploy.

Free Render services sleep after 15 minutes idle and take ~30–60 s to wake; the site shows "Connecting to server…" until then. A free uptime pinger (e.g. cron-job.org hitting `/health` every 10 minutes) keeps it awake during game nights.

### Single service

The server serves the built client, so a single deployment is enough (Railway, Render, Fly.io, a VPS…). The included `Dockerfile` and `nixpacks.toml` build the client and start the server on `$PORT`.

Manual equivalent:

```bash
npm run build         # builds client/dist
npm start             # node server/index.js  (serves the API, sockets and the built client)
```

If you'd rather host the client separately (e.g. Vercel), set `VITE_SERVER_URL` to the server URL before building.

## Project layout

```
server/
  index.js            Express + Socket.io, sessions, host commands
  engine/table.js     Table state machine (seats, hands, betting, run-outs, showdown, timers)
  engine/evaluator.js Hand evaluation (Hold'em + Omaha)
  engine/pots.js      Side pots
  test/               node:test suite and the bot script
client/src/
  App.jsx             Session + screens
  lib/useGame.js      Socket state, animation timeline
  lib/audio.js        Music playlist + sample player (assets in client/public/audio)
  lib/layout.js       Stage geometry and seat positions
  components/         Lobby, TableView, Seat, Card, Chips, ActionBar, SidePanel
  styles/             Design tokens and table/panel styles
```

## Notes

- Tables live in memory; restarting the server ends all games.
- Set `TIMING='{"showdownHold":20000}'` on the server to slow down run-outs/showdowns while debugging.
