import React, { useState, useEffect } from 'react';

export default function ActionPanel({ gameState, myId, onAction, timeLeft }) {
  const [raiseAmount, setRaiseAmount] = useState('');
  const [showRaise, setShowRaise] = useState(false);

  const isMyTurn = gameState?.currentTurn === myId;
  const me = gameState?.players?.find(p => p.id === myId);

  useEffect(() => {
    if (isMyTurn && gameState) {
      const min = (gameState.currentBet || 0) + (gameState.minRaise || gameState.bigBlind || 20);
      setRaiseAmount(String(min));
    }
  }, [isMyTurn, gameState?.currentTurn]);

  if (!isMyTurn || !me || me.folded || me.isAllIn) return null;
  if (!gameState || gameState.phase === 'waiting' || gameState.phase === 'showdown') return null;

  const currentBet = gameState.currentBet || 0;
  const myBet = me.currentBet || 0;
  const toCall = currentBet - myBet;
  const canCheck = toCall <= 0;
  const myStack = me.stack;
  const pot = gameState.pots?.reduce((s, p) => s + p.amount, 0) || 0;
  const minRaise = gameState.minRaise || gameState.bigBlind || 20;
  const minTotal = currentBet + minRaise;

  const presets = [
    { label: '½ Pot', value: Math.max(minTotal, Math.floor(pot / 2)) },
    { label: '¾ Pot', value: Math.max(minTotal, Math.floor(pot * 0.75)) },
    { label: 'Pot', value: Math.max(minTotal, pot) },
    { label: '2× Pot', value: Math.max(minTotal, pot * 2) },
  ].map(p => ({ ...p, value: Math.min(p.value, myStack + myBet) }));

  const handleRaise = () => {
    const amount = parseInt(raiseAmount);
    if (isNaN(amount)) return;
    if (amount >= myStack + myBet) {
      onAction('allIn', myStack + myBet);
    } else {
      onAction(currentBet > 0 ? 'raise' : 'bet', amount);
    }
    setShowRaise(false);
  };

  const timerPct = timeLeft != null ? (timeLeft / 30) * 100 : 100;

  return (
    <div className="action-panel">
      {timeLeft !== null && (
        <div className="turn-timer">
          <div className="turn-timer-bar" style={{ width: `${timerPct}%`, background: timerPct < 25 ? '#e74c3c' : 'var(--gold)' }} />
        </div>
      )}

      {showRaise && (
        <div className="raise-controls">
          <div className="raise-presets">
            {presets.map(p => (
              <button key={p.label} className="raise-preset-btn" onClick={() => setRaiseAmount(String(p.value))}>
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            className=""
            value={raiseAmount}
            min={minTotal}
            max={myStack + myBet}
            step={gameState.bigBlind || 20}
            onChange={e => setRaiseAmount(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRaise()}
          />
          <button className="btn btn-gold btn-sm" onClick={handleRaise}>
            {parseInt(raiseAmount) >= myStack + myBet ? 'All In' : currentBet > 0 ? 'Raise' : 'Bet'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRaise(false)}>✕</button>
        </div>
      )}

      <div className="action-buttons">
        <button className="btn btn-danger" onClick={() => onAction('fold')}>
          Fold
        </button>

        {canCheck ? (
          <button className="btn btn-outline" onClick={() => onAction('check')}>
            Check
          </button>
        ) : (
          <button className="btn btn-outline" onClick={() => onAction('call')}>
            Call ${toCall.toLocaleString()}
          </button>
        )}

        <button className="btn btn-ghost" onClick={() => setShowRaise(s => !s)}>
          {currentBet > 0 ? 'Raise' : 'Bet'} ↑
        </button>

        <button
          className="btn btn-gold"
          onClick={() => onAction('allIn', myStack + myBet)}
        >
          All In ${(myStack + myBet).toLocaleString()}
        </button>
      </div>
    </div>
  );
}
