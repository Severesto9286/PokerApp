import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSettings } from './hooks/useSettings.js';
import SettingsPanel from './components/SettingsPanel.jsx';
import * as Audio from './utils/audio.js';
import Card from './components/Card.jsx';
import PlayerSeat from './components/PlayerSeat.jsx';
import ActionPanel from './components/ActionPanel.jsx';
import HandResult from './components/HandResult.jsx';
import HostControls from './components/HostControls.jsx';
import HandHistory from './components/HandHistory.jsx';
import AllInReveal from './components/AllInReveal.jsx';
import { useSocket } from './hooks/useSocket.js';

const API = import.meta.env.VITE_SERVER_URL || '';

// ─── Best hand name for display ───────────────────────────────────────────────
const RANK_VAL = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
function quickHandName(holeCards, board) {
  if (!holeCards || !board || board.length < 3) return null;
  try {
    const all = [...holeCards, ...board];
    const vals = all.map(c => RANK_VAL[c[0]]).sort((a,b) => b-a);
    const suits = all.map(c => c[1]);
    const counts = {};
    for (const v of vals) counts[v] = (counts[v]||0)+1;
    const freq = Object.values(counts).sort((a,b)=>b-a);
    const unique = [...new Set(vals)].sort((a,b)=>b-a);
    const isFlush = suits.filter(s=>s===suits[0]).length >= 5;
    let isStraight = false;
    for (let i = 0; i <= unique.length-5; i++) {
      if (unique[i]-unique[i+4]===4) { isStraight=true; break; }
    }
    if (unique.includes(14)&&unique.includes(2)&&unique.includes(3)&&unique.includes(4)&&unique.includes(5)) isStraight=true;
    if (isStraight && isFlush) return 'Straight Flush';
    if (freq[0]===4) return 'Four of a Kind';
    if (freq[0]===3&&freq[1]===2) return 'Full House';
    if (isFlush) return 'Flush';
    if (isStraight) return 'Straight';
    if (freq[0]===3) return 'Three of a Kind';
    if (freq[0]===2&&freq[1]===2) return 'Two Pair';
    if (freq[0]===2) return 'One Pair';
    return 'High Card';
  } catch { return null; }
}



// ─── Toast system ─────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name');
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: name.trim() })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      onJoin({ roomId: data.roomId, playerId: data.playerId, isHost: true, playerName: name.trim() });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError('Enter your name');
    if (!roomCode.trim()) return setError('Enter room code');
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/rooms/${roomCode.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name.trim() })
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      onJoin({ roomId: data.roomId, playerId: data.playerId, isHost: false, playerName: name.trim(), pending: true });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1 className="lobby-title">Felt & Friends</h1>
        <p className="lobby-subtitle">Private poker with fake money</p>

        {!mode && (
          <div className="flex flex-col gap-2">
            <button className="btn btn-gold btn-lg btn-full" onClick={() => setMode('create')}>
              🃏 Create a Table
            </button>
            <button className="btn btn-outline btn-lg btn-full" onClick={() => setMode('join')}>
              🔑 Join a Table
            </button>
          </div>
        )}

        {mode && (
          <>
            <div className="form-group">
              <label>Your Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Enter your name" maxLength={20}
                onKeyDown={e => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())} />
            </div>

            {mode === 'join' && (
              <div className="form-group">
                <label>Room Code</label>
                <input type="text" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123" maxLength={8}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()} />
              </div>
            )}

            {error && <p style={{ color: '#e74c3c', fontSize: '0.88rem', marginBottom: '0.75rem' }}>{error}</p>}

            <button
              className="btn btn-gold btn-full"
              disabled={loading}
              onClick={mode === 'create' ? handleCreate : handleJoin}
            >
              {loading ? '...' : mode === 'create' ? 'Create Table' : 'Request to Join'}
            </button>
            <button className="btn btn-ghost btn-full mt-1" onClick={() => { setMode(null); setError(''); }}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Pending approval screen ──────────────────────────────────────────────────
function PendingApproval({ roomId, playerName }) {
  return (
    <div className="lobby">
      <div className="lobby-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <h2 className="lobby-title" style={{ fontSize: '1.8rem' }}>Waiting for Host</h2>
        <p className="text-muted mt-1">The host is reviewing your request to join.</p>
        <div className="divider" />
        <p className="text-sm text-muted">Room: <span className="text-gold text-mono">{roomId}</span></p>
        <p className="text-sm text-muted mt-1">Name: <span className="text-gold">{playerName}</span></p>
      </div>
    </div>
  );
}

// ─── Game Table ────────────────────────────────────────────────────────────────
function GameTable({ session }) {
  const { roomId, playerId, isHost, playerName } = session;
  const [gameState, setGameState] = useState(null);
  const [handResult, setHandResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sidebarTab, setSidebarTab] = useState(isHost ? 'host' : 'chat');
  const [runItTwiceOffer, setRunItTwiceOffer] = useState(null);
  const [myVoteRIT, setMyVoteRIT] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [autoDealCountdown, setAutoDealCountdown] = useState(null);
  const autoDealTimerRef = useRef(null);
  const { toasts, add: addToast } = useToasts();
  const chatBottomRef = useRef(null);
  const timerRef = useRef(null);
  const { settings, update: updateSetting } = useSettings();
  const prevBoardLen = useRef(0);
  const prevPhase = useRef(null);
  const [newCardIndices, setNewCardIndices] = useState(new Set()); // board indices that are 'new' this street
  const [allInRevealPlayers, setAllInRevealPlayers] = useState(null);

  const handleEvent = useCallback(({ type, data }) => {
    switch (type) {
      case 'gameState':
        setGameState(data);
        break;
      case 'handStarted':
        setHandResult(null);
        setRunItTwiceOffer(null);
        setMyVoteRIT(null);
        setAutoDealCountdown(null);
        clearInterval(autoDealTimerRef.current);
        addToast(data.isBombPot ? '💣 Bomb Pot! PLO rules.' : `Hand #${data.handNumber} started`);
        if (settings.sfxEnabled) {
          if (data.isBombPot) Audio.playBombPot();
          else Audio.playCardDeal();
        }
        if (data.board?.length > 0) {
          // Bomb pot: flop already dealt, mark all as new
          setNewCardIndices(new Set([0,1,2,3,4,5,6,7,8,9]));
          setTimeout(() => setNewCardIndices(new Set()), 1200);
        } else {
          setNewCardIndices(new Set());
        }
        prevBoardLen.current = data.board?.length || 0;
        prevPhase.current = data.phase;
        break;
      case 'actionTaken':
        if (settings.sfxEnabled) {
          const a = data?.action;
          if (a === 'fold') Audio.playFold();
          else if (a === 'check') Audio.playCheck();
          else if (a === 'allIn') Audio.playAllIn();
          else if (a === 'raise' || a === 'bet') Audio.playChipRaise();
          else if (a === 'call') Audio.playChipBet();
        }
        // Trigger dramatic reveal when someone goes all-in
        if (data?.action === 'allIn') {
          // Defer slightly so gameState update arrives first
          setTimeout(() => {
            setAllInRevealPlayers('pending');
          }, 300);
        }
        break;
      case 'handComplete':
        setHandResult(data);
        setRunItTwiceOffer(null);
        if (settings.sfxEnabled) Audio.playWin();
        if (settings.sfxEnabled) Audio.playShowdown();
        // Start auto-deal countdown display
        if (gameState?.autoDeal) {
          const delay = gameState.handDelay || 10;
          setAutoDealCountdown(delay);
          clearInterval(autoDealTimerRef.current);
          autoDealTimerRef.current = setInterval(() => {
            setAutoDealCountdown(c => {
              if (c <= 1) { clearInterval(autoDealTimerRef.current); return null; }
              return c - 1;
            });
          }, 1000);
        }
        break;
      case 'runItTwiceOffer':
        setRunItTwiceOffer(data);
        setMyVoteRIT(null);
        break;
      case 'newStreet': {
        setRunItTwiceOffer(null);
        if (settings.sfxEnabled) Audio.playNewStreet();
        const oldLen = prevBoardLen.current;
        const newLen = data?.board?.length || 0;
        const newIdxs = new Set();
        for (let i = oldLen; i < newLen; i++) newIdxs.add(i);
        setNewCardIndices(newIdxs);
        prevBoardLen.current = newLen;
        prevPhase.current = data?.phase;
        // Clear new flags after animation completes
        setTimeout(() => setNewCardIndices(new Set()), 1200);
        break;
      }
      case 'yourTurn':
        if (data.playerId === playerId && settings.sfxEnabled) Audio.playYourTurn();
        if (data.playerId === playerId) {
          setTimeLeft(30);
          clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTimeLeft(t => {
              if (t <= 1) { clearInterval(timerRef.current); return 0; }
              return t - 1;
            });
          }, 1000);
        }
        break;
      case 'joinRequest':
        if (isHost) {
          addToast(`${data.playerName} wants to join`);
          setSidebarTab('host');
        }
        break;
      case 'joinApproved':
        addToast('You\'ve been approved to join!', 'success');
        break;
      case 'blindsChanged':
        addToast(`Blinds: $${data.smallBlind}/$${data.bigBlind}`);
        break;
      case 'error':
        addToast(data.message || 'Error', 'error');
        break;
      case 'kicked':
        window.location.reload();
        break;
      case 'chat':
        setChatMessages(m => [...m, data]);
        break;
      case 'playerConnected':
        addToast(`${data.name} connected`);
        break;
      case 'playerDisconnected':
        // silent
        break;
    }
  }, [playerId, isHost]);

  const { emit } = useSocket({ roomId, playerId, onEvent: handleEvent });

  // Init audio on first mount
  useEffect(() => {
    Audio.setMasterVolume(settings.masterVolume);
    Audio.setMusicVolume(settings.musicVolume);
    Audio.setSfxVolume(settings.sfxVolume);
    if (settings.musicEnabled) Audio.startMusic();
    return () => Audio.stopMusic();
  }, []);

  // Resolve all-in reveal once game state has fresh data
  useEffect(() => {
    if (allInRevealPlayers === 'pending' && gameState) {
      const allInWithCards = gameState.players?.filter(p =>
        p.isAllIn && !p.folded && p.holeCards && p.holeCards.length > 0
      );
      if (allInWithCards && allInWithCards.length >= 1) {
        setAllInRevealPlayers(allInWithCards);
      } else {
        setAllInRevealPlayers(null);
      }
    }
  }, [gameState, allInRevealPlayers]);

  // Sync volume changes
  useEffect(() => { Audio.setMasterVolume(settings.masterVolume); }, [settings.masterVolume]);
  useEffect(() => { Audio.setMusicVolume(settings.musicVolume); }, [settings.musicVolume]);
  useEffect(() => { Audio.setSfxVolume(settings.sfxVolume); }, [settings.sfxVolume]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (gameState?.currentTurn !== playerId) {
      clearInterval(timerRef.current);
      setTimeLeft(null);
    }
  }, [gameState?.currentTurn, playerId]);

  const sendAction = useCallback((action, amount) => {
    emit('action', { action, amount });
  }, [emit]);

  const sendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    emit('chat', { message: chatInput.trim() });
    setChatInput('');
  }, [chatInput, emit]);

  const totalPot = gameState?.pots?.reduce((s, p) => s + p.amount, 0) || 0;
  const me = gameState?.players?.find(p => p.id === playerId);

  // Arrange seats: my seat always at bottom center (pos 0)
  const players = gameState?.players || [];
  const mySeatIndex = me?.seatIndex ?? 0;
  const seatPositions = players.map(p => {
    const offset = (p.seatIndex - mySeatIndex + 6) % 6;
    return { player: p, position: offset };
  });

  return (
    <div className="game-layout">
      {/* Table */}
      <div className="table-area">
        <div className="table-felt">
          {/* Players */}
          {seatPositions.map(({ player, position }) => (
            <PlayerSeat
              key={player.id}
              player={player}
              isCurrentTurn={gameState?.currentTurn === player.id}
              myId={playerId}
              seatPosition={position}
              animationSpeed={settings.animationSpeed}
              animate={settings.animationsEnabled}
            />
          ))}

          {/* Board */}
          <div className="board-area">
            {gameState?.isBombPot && (
              <div className="bomb-pot-banner">💣 Bomb Pot · PLO</div>
            )}
            {gameState?.board?.length > 0 && (
              <>
                <div className="board-label">
                  {gameState.isOmaha ? 'PLO' : "Hold'em"} · {gameState.phase?.toUpperCase()}
                </div>
                <div className="board-cards">
                  {gameState.board.slice(0, 3).map((c, i) => (
                    <Card key={`board-a-${i}`} card={c} size="md"
                      isNew={newCardIndices.has(i)}
                      dealDelay={i * 80}
                      animate={settings.animationsEnabled}
                      animationSpeed={settings.animationSpeed} />
                  ))}
                  {gameState.board.length > 3 && <div className="board-divider" />}
                  {gameState.board.slice(3).map((c, i) => (
                    <Card key={`board-b-${i}`} card={c} size="md"
                      isNew={newCardIndices.has(i + 3)}
                      dealDelay={0}
                      animate={settings.animationsEnabled}
                      animationSpeed={settings.animationSpeed} />
                  ))}
                </div>
                {/* Second board for PLO bomb pots */}
                {gameState.board2 && gameState.isBombPot && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="board-label" style={{ marginBottom: '4px' }}>Board 2</div>
                    <div className="board-cards">
                      {gameState.board2.slice(0, 3).map((c, i) => (
                        <Card key={`board2-a-${i}`} card={c} size="md"
                          isNew={newCardIndices.has(i + 10)}
                          dealDelay={i * 80}
                          animate={settings.animationsEnabled}
                          animationSpeed={settings.animationSpeed} />
                      ))}
                      {gameState.board2.length > 3 && <div className="board-divider" />}
                      {gameState.board2.slice(3).map((c, i) => (
                        <Card key={`board2-b-${i}`} card={c} size="md"
                          isNew={newCardIndices.has(i + 13)}
                          dealDelay={0}
                          animate={settings.animationsEnabled}
                          animationSpeed={settings.animationSpeed} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {(totalPot > 0 || gameState?.phase === 'waiting') && (
              <div className="pot-display">
                {totalPot > 0 && <div className="pot-amount">${totalPot.toLocaleString()}</div>}
                <div className="pot-label">
                  {gameState?.phase === 'waiting'
                    ? isHost ? 'Waiting to deal' : 'Waiting for host'
                    : 'Total Pot'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-deal countdown */}
        {autoDealCountdown !== null && (
          <div style={{
            position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,22,14,0.92)', border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '24px', padding: '0.4rem 1.25rem',
            fontSize: '0.85rem', color: 'var(--text-secondary)',
            zIndex: 25, display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            <span style={{ color: 'var(--gold)', fontFamily: 'DM Mono', fontWeight: '600', fontSize: '1.1rem' }}>
              {autoDealCountdown}
            </span>
            Next hand dealing...
          </div>
        )}

        {/* Hole Card Tray - my cards displayed large at bottom */}
        {me && me.holeCards && me.holeCards.length > 0 && (
          <div className="hole-card-tray">
            <div className="hole-card-tray-label">Your Hand</div>
            <div className="hole-card-tray-cards">
              {me.holeCards.map((c, i) => (
                <Card
                  key={`hole-${i}`}
                  card={c}
                  size="xl"
                  isNew={true}
                  dealDelay={i * 120}
                  animate={settings.animationsEnabled}
                  animationSpeed={settings.animationSpeed}
                />
              ))}
            </div>
            {gameState?.board?.length >= 3 && (
              <div className="hole-card-tray-hand">
                {quickHandName(me.holeCards, gameState.board)}
              </div>
            )}
          </div>
        )}

        {/* All-In Dramatic Reveal */}
        {allInRevealPlayers && allInRevealPlayers !== 'pending' && (
          <AllInReveal
            players={allInRevealPlayers}
            onDone={() => setAllInRevealPlayers(null)}
          />
        )}

        {/* Run It Twice overlay */}
        {runItTwiceOffer && (
          <div className="rit-prompt">
            <div className="rit-title">Run It Twice?</div>
            <p className="text-sm text-muted mb-2">All players must agree</p>
            {myVoteRIT === null ? (
              <div className="flex gap-2">
                <button className="btn btn-gold" onClick={() => { emit('voteRunItTwice', { vote: true }); setMyVoteRIT(true); }}>
                  Yes, Run Twice
                </button>
                <button className="btn btn-ghost" onClick={() => { emit('voteRunItTwice', { vote: false }); setMyVoteRIT(false); }}>
                  Run Once
                </button>
              </div>
            ) : (
              <p className="text-sm text-gold">Voted: {myVoteRIT ? 'Yes' : 'No'} — waiting...</p>
            )}
          </div>
        )}

        {/* Hand Result */}
        {handResult && (
          <HandResult
            result={handResult}
            players={gameState?.players}
            onDismiss={() => setHandResult(null)}
          />
        )}

        {/* Action Panel */}
        {gameState?.phase !== 'waiting' && (
          <ActionPanel
            gameState={gameState}
            myId={playerId}
            onAction={sendAction}
            timeLeft={timeLeft}
          />
        )}

        {/* Sit out toggle for non-host */}
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          {me && (
            <button
              className={`btn btn-sm ${me.sitOut ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => emit('sitOut', { sitOut: !me.sitOut })}
            >
              {me.sitOut ? '▶ Sit In' : '⏸ Sit Out'}
            </button>
          )}
        </div>

        {/* Room code */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="text-sm text-muted">Room</div>
          <div className="text-mono text-gold" style={{ fontSize: '1.1rem', fontWeight: '600', letterSpacing: '0.15em' }}>
            {roomId}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-tabs">
          {isHost && (
            <button className={`sidebar-tab ${sidebarTab === 'host' ? 'active' : ''}`} onClick={() => setSidebarTab('host')}>
              Host {gameState?.pendingJoins?.length > 0 ? `(${gameState.pendingJoins.length})` : ''}
            </button>
          )}
          <button className={`sidebar-tab ${sidebarTab === 'chat' ? 'active' : ''}`} onClick={() => setSidebarTab('chat')}>
            Chat
          </button>
          <button className={`sidebar-tab ${sidebarTab === 'info' ? 'active' : ''}`} onClick={() => setSidebarTab('info')}>
            Info
          </button>
          <button className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`} onClick={() => setSidebarTab('history')}>
            History
          </button>
          <button className={`sidebar-tab ${sidebarTab === 'settings' ? 'active' : ''}`} onClick={() => setSidebarTab('settings')}>
            ⚙
          </button>
        </div>

        {sidebarTab === 'host' && isHost && (
          <div className="sidebar-content">
            <HostControls
              gameState={gameState}
              onApprove={(id, stack) => emit('approveJoin', { playerId: id, stackSize: stack })}
              onDeny={(id) => emit('denyJoin', { playerId: id })}
              onSetStack={(id, amt) => emit('setStack', { targetPlayerId: id, amount: amt })}
              onSetBlinds={(sb, bb) => emit('setBlinds', { smallBlind: sb, bigBlind: bb })}
              onSetBombFreq={(f) => emit('setBombPotFrequency', { frequency: f })}
              onStartHand={() => emit('startHand')}
              onRemovePlayer={(id) => emit('removePlayer', { targetPlayerId: id })}
              onSetAutoDeal={(autoDeal, handDelay) => emit('setAutoDeal', { autoDeal, handDelay })}
            />
          </div>
        )}

        {sidebarTab === 'chat' && (
          <>
            <div className="chat-messages sidebar-content" style={{ flex: 1 }}>
              {chatMessages.length === 0 && (
                <p className="text-sm text-muted text-center" style={{ marginTop: '2rem' }}>
                  No messages yet
                </p>
              )}
              {chatMessages.map(m => (
                <div key={m.id} className="chat-msg">
                  {m.isSystem ? (
                    <span className="chat-msg-system">{m.message}</span>
                  ) : (
                    <>
                      <span className="chat-msg-name">{m.playerName}:</span>
                      {m.message}
                    </>
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Message..."
                maxLength={200}
              />
              <button className="btn btn-outline btn-sm" onClick={sendChat}>Send</button>
            </div>
          </>
        )}

        {sidebarTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 42px)', overflow: 'hidden' }}>
            <HandHistory handHistory={gameState?.handHistory} myId={playerId} />
          </div>
        )}

        {sidebarTab === 'settings' && (
          <div className="sidebar-content">
            <SettingsPanel settings={settings} onUpdate={updateSetting} />
          </div>
        )}

        {sidebarTab === 'info' && (
          <div className="sidebar-content">
            <div className="host-section">
              <div className="host-section-title">Game Info</div>
              <div className="player-row">
                <span className="text-sm text-muted">Blinds</span>
                <span className="text-mono">${gameState?.smallBlind}/${gameState?.bigBlind}</span>
              </div>
              <div className="player-row">
                <span className="text-sm text-muted">Hand</span>
                <span className="text-mono">#{gameState?.handNumber || 0}</span>
              </div>
              <div className="player-row">
                <span className="text-sm text-muted">Variant</span>
                <span>{gameState?.isBombPot ? '💣 PLO Bomb Pot' : "Texas Hold'em"}</span>
              </div>
              <div className="player-row">
                <span className="text-sm text-muted">Bomb Pot %</span>
                <span className="text-mono">{Math.round((gameState?.bombPotFrequency || 0) * 100)}%</span>
              </div>
            </div>

            <div className="host-section">
              <div className="host-section-title">Players</div>
              {players.map(p => (
                <div key={p.id} className="player-row">
                  <span className="player-row-name">
                    {p.name}
                    {p.id === playerId ? ' (You)' : ''}
                    {p.id === gameState?.players?.find(pl => pl.isDealer)?.id ? ' 🎯' : ''}
                  </span>
                  <span className="player-row-stack">${p.stack?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const s = sessionStorage.getItem('poker_session');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });
  const [approved, setApproved] = useState(session && !session.pending);
  const [pendingSession, setPendingSession] = useState(session?.pending ? session : null);

  // If pending, we need a socket to listen for approval
  const handleEvent = useCallback(({ type, data }) => {
    if (type === 'joinApproved') {
      const full = { ...pendingSession, pending: false };
      sessionStorage.setItem('poker_session', JSON.stringify(full));
      setSession(full);
      setPendingSession(null);
      setApproved(true);
    }
  }, [pendingSession]);

  const { emit } = useSocket({
    roomId: pendingSession?.roomId,
    playerId: pendingSession?.playerId,
    onEvent: handleEvent
  });

  const handleJoin = useCallback((sess) => {
    sessionStorage.setItem('poker_session', JSON.stringify(sess));
    setSession(sess);
    if (sess.pending) {
      setPendingSession(sess);
      setApproved(false);
    } else {
      setApproved(true);
    }
  }, []);

  if (!session) return <Lobby onJoin={handleJoin} />;

  if (session.pending && !approved) {
    return <PendingApproval roomId={session.roomId} playerName={session.playerName} />;
  }

  return <GameTable session={session} />;
}
