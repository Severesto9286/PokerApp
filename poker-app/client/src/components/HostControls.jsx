import React, { useState } from 'react';

export default function HostControls({ gameState, onApprove, onDeny, onSetStack, onSetBlinds, onSetBombFreq, onStartHand, onRemovePlayer }) {
  const [editStack, setEditStack] = useState({});
  const [sbInput, setSbInput] = useState(String(gameState?.smallBlind || 10));
  const [bbInput, setBbInput] = useState(String(gameState?.bigBlind || 20));
  const [bombFreq, setBombFreq] = useState(Math.round((gameState?.bombPotFrequency || 0.2) * 100));
  const [pendingStacks, setPendingStacks] = useState({});

  const canStart = gameState?.phase === 'waiting' && (gameState?.players?.filter(p => !p.sitOut && p.stack > 0).length >= 2);

  return (
    <div className="host-panel">
      {/* Start Hand */}
      <div className="host-section">
        <button
          className={`btn btn-gold btn-full btn-lg`}
          disabled={!canStart}
          onClick={onStartHand}
        >
          {gameState?.phase === 'waiting' ? '▶ Deal New Hand' : '⏳ Hand in Progress'}
        </button>
      </div>

      {/* Blind Settings */}
      <div className="host-section">
        <div className="host-section-title">Blinds</div>
        <div className="flex gap-1 mb-1">
          <div style={{ flex: 1 }}>
            <div className="text-sm text-muted mb-1">Small Blind</div>
            <input type="number" value={sbInput} min="1"
              onChange={e => setSbInput(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="text-sm text-muted mb-1">Big Blind</div>
            <input type="number" value={bbInput} min="1"
              onChange={e => setBbInput(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-outline btn-sm btn-full"
          onClick={() => onSetBlinds(parseInt(sbInput), parseInt(bbInput))}>
          Update Blinds
        </button>
      </div>

      {/* Bomb Pot Frequency */}
      <div className="host-section">
        <div className="host-section-title">Bomb Pot (PLO) Frequency</div>
        <div className="flex items-center gap-2 mb-1">
          <input type="range" min="0" max="100" value={bombFreq}
            onChange={e => setBombFreq(parseInt(e.target.value))}
            onMouseUp={() => onSetBombFreq(bombFreq / 100)}
            onTouchEnd={() => onSetBombFreq(bombFreq / 100)} />
          <span className="text-mono text-gold" style={{ minWidth: '40px' }}>{bombFreq}%</span>
        </div>
        <div className="text-sm text-muted">
          {bombFreq === 0 ? 'Never' : bombFreq === 100 ? 'Every hand is a bomb pot' : `~1 in ${Math.round(100/bombFreq)} hands`}
        </div>
      </div>

      {/* Pending Join Requests */}
      {gameState?.pendingJoins?.length > 0 && (
        <div className="host-section">
          <div className="host-section-title">Join Requests ({gameState.pendingJoins.length})</div>
          {gameState.pendingJoins.map(p => (
            <div key={p.id} className="join-request">
              <span className="join-request-name">{p.name}</span>
              <input
                type="number"
                className="join-request-stack"
                placeholder="Stack"
                defaultValue="1000"
                id={`stack-${p.id}`}
                min="1"
              />
              <button className="btn btn-gold btn-sm"
                onClick={() => {
                  const el = document.getElementById(`stack-${p.id}`);
                  onApprove(p.id, parseInt(el?.value) || 1000);
                }}>
                ✓
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => onDeny(p.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Players */}
      <div className="host-section">
        <div className="host-section-title">Players ({gameState?.players?.length || 0}/6)</div>
        {gameState?.players?.map(p => (
          <div key={p.id} className="player-row">
            <div className="player-row-name">
              {p.name}
              {!p.connected && <span className="text-muted text-sm"> (offline)</span>}
            </div>
            <div className="player-row-stack">${p.stack?.toLocaleString()}</div>
            {gameState?.phase === 'waiting' && (
              <div className="flex gap-1">
                <input
                  type="number"
                  style={{ width: '80px', padding: '3px 6px', fontSize: '0.82rem' }}
                  defaultValue={p.stack}
                  id={`edit-stack-${p.id}`}
                  min="0"
                />
                <button className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const el = document.getElementById(`edit-stack-${p.id}`);
                    onSetStack(p.id, parseInt(el?.value));
                  }}>
                  Set
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
