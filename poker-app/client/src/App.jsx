import React, { useState, useEffect, useRef, useCallback } from 'react';
import Card from './components/Card.jsx';
import PlayerSeat from './components/PlayerSeat.jsx';
import ActionPanel from './components/ActionPanel.jsx';
import HandResult from './components/HandResult.jsx';
import HostControls from './components/HostControls.jsx';
import { useSocket } from './hooks/useSocket.js';

const API = import.meta.env.VITE_SERVER_URL || '';

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
  const { toasts, add: addToast } = useToasts();
  const chatBottomRef = useRef(null);
  const timerRef = useRef(null);

  const handleEvent = useCallback(({ type, data }) => {
    switch (type) {
      case 'gameState':
        setGameState(data);
        break;
      case 'handStarted':
        setHandResult(null);
        setRunItTwiceOffer(null);
        setMyVoteRIT(null);
        addToast(data.isBombPot ? '💣 Bomb Pot! PLO rules.' : `Hand #${data.handNumber} started`);
        break;
      case 'actionTaken':
        // Could show action log
        break;
      case 'handComplete':
        setHandResult(data);
        setRunItTwiceOffer(null);
        break;
      case 'runItTwiceOffer':
        setRunItTwiceOffer(data);
        setMyVoteRIT(null);
        break;
      case 'newStreet':
        setRunItTwiceOffer(null);
        break;
      case 'yourTurn':
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
                    <Card key={`b${i}`} card={c} size="md" isNew />
                  ))}
                  {gameState.board.length > 3 && <div className="board-divider" />}
                  {gameState.board.slice(3).map((c, i) => (
                    <Card key={`t${i}`} card={c} size="md" isNew />
                  ))}
                </div>
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
