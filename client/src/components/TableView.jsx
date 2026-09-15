import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Card from './Card';
import Seat from './Seat';
import ActionBar from './ActionBar';
import { ChipStack, PotPile } from './Chips';
import { layoutFor, setLayoutMode, seatPositions, betPosition, buttonPosition, slotFor } from '../lib/layout';
import { fmtAmount, fmt } from '../lib/format';
import { evaluate, shortName } from '../lib/hand';

// Pick the stage that best fits the available area and scale it to fit.
const RANK_PLURAL = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Twos' };
function describeRank(r) { return RANK_PLURAL[r] || r; }

function useStage(ref) {
  const [stage, setStage] = useState({ mode: 'landscape', scale: 1 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      const mode = r.height > r.width * 1.05 ? 'portrait' : 'landscape';
      const L = layoutFor(mode);
      setLayoutMode(mode);
      setStage({ mode, scale: Math.min(r.width / L.W, r.height / L.H) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return stage;
}

function Flights({ flights, bb, inBB }) {
  return (
    <div className="flights">
      {flights.map((f) => <Flight key={f.id} f={f} bb={bb} inBB={inBB} />)}
    </div>
  );
}

function Flight({ f, bb, inBB }) {
  const [at, setAt] = useState(f.from);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setAt(f.to))); return () => cancelAnimationFrame(id); }, [f]);
  return (
    <div className="flight" style={{ transform: `translate(${at[0]}px, ${at[1]}px)`, transition: `transform ${f.dur}ms cubic-bezier(.3,.9,.3,1)` }}>
      <ChipStack amount={f.amount} label={!f.refund} bb={bb} inBB={inBB} size={20} />
    </div>
  );
}

function BoardRow({ cards, keys, size, fourColor, highlight, dim, y }) {
  const now = Date.now();
  return (
    <div className="board-row" style={{ top: y }}>
      {cards.map((c, i) => {
        const fresh = keys[c] && now - keys[c] < 1200;
        const hi = highlight ? highlight.has(c) : false;
        return (
          <Card key={c} card={c} size={size} fourColor={fourColor} className={`board-card ${fresh ? 'is-new' : ''}`}
            flipDelay={fresh ? 120 + (i % 3) * 140 : 0} highlight={hi} dim={dim && !hi}
            style={fresh ? { animationDelay: `${(i % 3) * 140}ms` } : undefined} />
        );
      })}
      {Array.from({ length: Math.max(0, 5 - cards.length) }).map((_, i) => <div key={`ph${i}`} className={`card-slot card-slot-${size}`} />)}
    </div>
  );
}

function ResultBanner({ result, bb, inBB, seats }) {
  if (!result) return null;
  const lines = [];
  const byBoard = {};
  for (const w of result.winners) {
    const key = result.board2 && result.showdown ? w.board : 0;
    (byBoard[key] = byBoard[key] || []).push(w);
  }
  for (const [key, ws] of Object.entries(byBoard)) {
    const merged = {};
    for (const w of ws) { const m = merged[w.seat] || (merged[w.seat] = { ...w, amount: 0 }); m.amount += w.amount; }
    const prefix = key !== '0' ? (result.runItTwice ? `Run ${key}: ` : `Board ${key}: `) : '';
    lines.push(prefix + Object.values(merged).map((w) => `${w.name} wins ${fmtAmount(w.amount, bb, inBB)}${w.handName ? ` with ${w.handName}` : ''}`).join(' · '));
  }
  return (
    <div className={`banner ${result.showdown ? 'is-showdown' : ''}`}>
      {lines.map((l, i) => <div key={i} className="banner-line">{l}</div>)}
    </div>
  );
}

export default function TableView({ game, prefs, onOpenPanel, panelOpen, unread }) {
  const { state, me, anim, act, send, serverOffset } = game;
  const wrapRef = useRef(null);
  const { mode, scale } = useStage(wrapRef);
  const L = layoutFor(mode);
  const { TABLE, BOARD, POT, POT_TWO_BOARDS } = L;
  const portrait = mode === 'portrait';
  const [preAction, setPreAction] = useState(null);
  const [copied, setCopied] = useState(false);

  const hand = state.hand;
  const bb = state.config.bigBlind;
  const inBB = prefs.inBB;
  const maxSeats = state.seats.length;
  const heroSeat = me ? me.seat : 0;
  const positions = seatPositions(maxSeats, L);
  const posOf = (seat) => positions[slotFor(seat, heroSeat, maxSeats)];
  const myTurn = !!(hand && me && hand.actionSeat === me.seat && !hand.finished);
  const legal = myTurn ? state.legal : null;

  // Pre-actions fire the moment the action reaches us.
  useEffect(() => {
    if (!myTurn || !legal || !preAction) return;
    const pa = preAction;
    setPreAction(null);
    if (pa === 'checkfold') act(legal.canCheck ? 'check' : 'fold');
    else if (pa === 'check') { if (legal.canCheck) act('check'); }
    else if (pa === 'callany') act(legal.canCheck ? 'check' : 'call');
  }, [myTurn, legal, preAction, act]);
  useEffect(() => { if (!hand) setPreAction(null); }, [hand?.number]);

  // Winning cards to highlight at showdown.
  const highlight = useMemo(() => {
    if (!anim.result || !anim.result.showdown) return null;
    const set = new Set();
    for (const w of anim.result.winners) for (const c of w.handCards || []) set.add(c);
    return set;
  }, [anim.result]);

  // Live hand-strength hint for the hero (like GG's "Pair of Sevens" label).
  const heroHint = useMemo(() => {
    if (!hand || !me || !me.cards || me.cards.length < 2 || me.folded || anim.result) return null;
    const board = anim.board;
    if (hand.variant === 'PLO' && board.length < 3) return null;
    const ev = evaluate(me.cards, board, hand.variant);
    if (!ev) {
      // Preflop Hold'em: describe the hole cards.
      const [a, b] = me.cards;
      if (a[0] === b[0]) return `Pair of ${describeRank(a[0])}`;
      return `${a[0] === 'T' ? '10' : a[0]}${b[0] === 'T' ? '10' : b[0]}${a[1] === b[1] ? ' suited' : ''}`;
    }
    return ev.name;
  }, [hand?.variant, hand?.number, me?.cards, me?.folded, anim.board, anim.result]);
  const winnerSeats = anim.winners;
  const showdownActive = !!anim.result;
  const dealerPos = hand ? posOf(hand.dealerSeat) : null;
  const potShown = anim.pot;
  const streetTotal = Object.values(anim.bets).reduce((s, v) => s + v, 0);
  const totalPot = hand && !hand.finished ? potShown + streetTotal : potShown;

  const copyCode = () => {
    navigator.clipboard?.writeText(state.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const inHandCount = state.seats.filter((p) => p && !p.sittingOut && p.stack > 0).length;
  // Tick once a second while the next-hand countdown is showing.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.nextHandAt || hand) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.nextHandAt, hand]);
  const nextHandIn = state.nextHandAt ? Math.max(0, Math.ceil((state.nextHandAt - (Date.now() + serverOffset.current)) / 1000)) : null;

  const variantLabel = hand ? (hand.variant === 'PLO' ? (hand.bombPot ? 'PLO Bomb Pot' : 'Pot Limit Omaha') : "No Limit Hold'em") : (state.config.ploFrequency > 0 ? "NLH + PLO" : "No Limit Hold'em");

  return (
    <div className="tableview">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand"><span className="brand-mark">♠</span> Felt &amp; Friends</div>
          <div className="tableinfo">
            <span className="tableinfo-variant">{variantLabel}</span>
            <span className="tableinfo-blinds">{fmt(state.config.smallBlind)} / {fmt(state.config.bigBlind)}{state.config.ante ? ` · ante ${fmt(state.config.ante)}` : ''}</span>
            {hand && <span className="tableinfo-hand">Hand #{hand.number}</span>}
          </div>
        </div>
        <div className="topbar-right">
          <button className="codebtn" onClick={copyCode} title="Copy table code to share">
            <span className="codebtn-label">Table</span><span className="codebtn-code">{state.id}</span><span className="codebtn-copy">{copied ? '✓ Copied' : 'Copy'}</span>
          </button>
          <button className={`iconbtn ${panelOpen ? 'is-on' : ''}`} onClick={onOpenPanel} title="Chat, history, settings">
            <span>☰</span>{unread > 0 && !panelOpen && <span className="iconbtn-badge">{unread}</span>}
            {state.pendingCount > 0 && state.isHost && <span className="iconbtn-badge is-host">{state.pendingCount}</span>}
          </button>
        </div>
      </div>

      <div className="stage-wrap" ref={wrapRef}>
        <div className={`stage ${portrait ? 'is-portrait' : 'is-landscape'}`} style={{ width: L.W, height: L.H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <div className="table-rail" style={{ left: TABLE.cx - TABLE.w / 2, top: TABLE.cy - TABLE.h / 2, width: TABLE.w, height: TABLE.h }}>
            <div className="table-felt">
              <div className="table-logo"><span>♠</span>FELT &amp; FRIENDS</div>
              {hand && hand.variant === 'PLO' && <div className={`table-variant ${hand.bombPot ? 'is-bomb' : ''}`}>{hand.bombPot ? '💣 BOMB POT · PLO' : 'PLO'}</div>}
            </div>
          </div>

          {/* Empty seats */}
          {state.seats.map((p, seat) => p ? null : (
            <div key={`e${seat}`} className="seat-empty" style={{ left: posOf(seat)[0], top: posOf(seat)[1] }}>Empty</div>
          ))}

          {/* Pot */}
          {hand && (
            <div className="pot" style={{ left: POT.x, top: anim.board2 ? POT_TWO_BOARDS.y : POT.y }}>
              {potShown > 0 && <PotPile amount={potShown} bb={bb} inBB={inBB} />}
              <div className="pot-text">
                {totalPot > 0 && <div className="pot-label">Total Pot: <b>{fmtAmount(totalPot, bb, inBB)}</b></div>}
                {hand.pots.length > 1 && !hand.finished && state.seats.some((p) => p && p.inHand && p.allIn) && (
                  <div className="pot-sides">{hand.pots.map((p, i) => <span key={i}>{i === 0 ? 'Main' : `Side ${i}`}: {fmtAmount(p.amount, bb, inBB)}</span>)}</div>
                )}
              </div>
            </div>
          )}

          {/* Board */}
          {hand && (
            <div className="board" style={{ left: BOARD.x, top: BOARD.y }}>
              {anim.board2 ? (
                <>
                  <BoardRow cards={anim.board} keys={anim.boardKeys} size={L.boardSize2} fourColor={prefs.fourColor} highlight={highlight && new Set(anim.result.winners.filter((w) => w.board === 1).flatMap((w) => w.handCards || []))} dim={showdownActive} y={portrait ? -78 : -96} />
                  <BoardRow cards={anim.board2} keys={anim.boardKeys} size={L.boardSize2} fourColor={prefs.fourColor} highlight={highlight && new Set(anim.result.winners.filter((w) => w.board === 2).flatMap((w) => w.handCards || []))} dim={showdownActive} y={0} />
                  <div className="board-tag" style={{ top: portrait ? -52 : -66 }}>{anim.runItTwice ? 'RUN 1' : 'BOARD 1'}</div>
                  <div className="board-tag" style={{ top: portrait ? 26 : 30 }}>{anim.runItTwice ? 'RUN 2' : 'BOARD 2'}</div>
                </>
              ) : (
                <BoardRow cards={anim.board} keys={anim.boardKeys} size={L.boardSize} fourColor={prefs.fourColor} highlight={highlight} dim={showdownActive && !!highlight && highlight.size > 0} y={portrait ? -41 : -56} />
              )}
            </div>
          )}

          {/* Result banner */}
          {anim.result && <div className="banner-wrap" style={{ left: BOARD.x, top: BOARD.y + (anim.board2 ? (portrait ? 80 : 100) : (portrait ? 54 : 68)) }}><ResultBanner result={anim.result} bb={bb} inBB={inBB} seats={state.seats} /></div>}

          {/* Waiting / host prompts */}
          {!hand && (
            <div className="table-msg" style={{ left: BOARD.x, top: BOARD.y - 20 }}>
              {state.paused ? (
                <><div className="table-msg-title">Table paused</div><div className="table-msg-sub">{state.isHost ? 'Resume from the host panel' : 'The host paused the game'}</div></>
              ) : inHandCount < 2 ? (
                <><div className="table-msg-title">Waiting for players</div><div className="table-msg-sub">Share code <b>{state.id}</b> with your friends</div></>
              ) : nextHandIn !== null ? (
                <><div className="table-msg-title">Next hand in {nextHandIn}s</div>{state.nextHandVariant && <div className="table-msg-sub">Next: {state.nextHandVariant}</div>}</>
              ) : state.isHost ? (
                <button className="btn btn-primary btn-lg" onClick={() => send('host:startHand')}>Deal next hand</button>
              ) : (
                <><div className="table-msg-title">Ready</div><div className="table-msg-sub">Waiting for the host to deal</div></>
              )}
            </div>
          )}

          {/* Bets */}
          {Object.entries(anim.bets).map(([seat, amount]) => amount > 0 && (
            <div key={seat} className="bet" style={{ left: betPosition(posOf(Number(seat)), L)[0], top: betPosition(posOf(Number(seat)), L)[1] }}>
              <ChipStack amount={amount} bb={bb} inBB={inBB} size={20} />
            </div>
          ))}

          {/* Dealer button */}
          {hand && dealerPos && <div className="dealer-btn" style={{ left: buttonPosition(dealerPos, L)[0], top: buttonPosition(dealerPos, L)[1] }}>D</div>}

          {/* Seats */}
          {state.seats.map((p) => p && (
            <Seat key={p.id} player={p} pos={posOf(p.seat)} isHero={p.id === state.you}
              isTurn={!!hand && hand.actionSeat === p.seat && !hand.finished}
              deadline={hand?.deadline} actionTime={state.config.actionTime} usingTimeBank={hand?.usingTimeBank} serverOffset={serverOffset.current}
              cards={p.id === state.you ? p.cards : (anim.reveals[p.seat] || p.cards)}
              revealed={!!anim.reveals[p.seat]}
              folded={!!anim.folded[p.seat] || p.folded}
              tag={anim.tags[p.seat]}
              winAmount={winnerSeats[p.seat] || 0}
              isWinner={!!winnerSeats[p.seat]}
              showdownDim={showdownActive && anim.result.showdown && !winnerSeats[p.seat] && !p.folded && p.inHand}
              handName={showdownActive && anim.result.showdown ? (anim.result.reveals.find((r) => r.seat === p.seat)?.hands.map((h) => h.name).filter((v, i, a) => a.indexOf(v) === i).join(' / ') || null) : null}
              fourColor={prefs.fourColor} bb={bb} inBB={inBB}
              dealing={anim.dealing} dealerPos={dealerPos} variant={hand?.variant} compact={portrait}
              highlightCards={highlight} heroHint={p.id === state.you ? heroHint : null} dealt={anim.dealt}
              sittingOutNext={p.sittingOut && p.inHand} />
          ))}

          <Flights flights={anim.flights} bb={bb} inBB={inBB} />

          {/* Bottom-left quick options */}
          {me && (
            <div className="quickopts">
              <label className="chk"><input type="checkbox" checked={!!me.sittingOut} onChange={(e) => send('sitOut', { sitOut: e.target.checked })} /><span>Sit out next hand</span></label>
              <label className="chk"><input type="checkbox" checked={!!me.runItTwice} onChange={(e) => send('prefs', { runItTwice: e.target.checked })} /><span>Run it twice</span></label>
              {me.stack === 0 && !me.inHand && state.config.allowRebuy && (
                <button className="btn btn-gold btn-sm" onClick={() => send('rebuy', { amount: state.config.buyIn })}>Rebuy {fmt(state.config.buyIn)}</button>
              )}
              {me.stack > 0 && me.stack < state.config.buyIn * 0.4 && state.config.allowRebuy && (
                <button className="btn btn-ghost btn-sm" onClick={() => send('rebuy', { amount: state.config.buyIn - me.stack })}>Top up to {fmt(state.config.buyIn)}{me.inHand ? ' (next hand)' : ''}</button>
              )}
            </div>
          )}

          {/* Action bar */}
          {me && hand && !hand.finished && me.inHand && !me.folded && !me.allIn && (
            <ActionBar legal={legal} hand={hand} bb={bb} inBB={inBB} onAct={act} myTurn={myTurn}
              preAction={preAction} setPreAction={setPreAction} canPre={!myTurn && !hand.runningOut} potTotal={hand.potTotal} />
          )}
        </div>
      </div>
    </div>
  );
}
