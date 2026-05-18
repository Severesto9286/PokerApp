import React, { useEffect, useState } from 'react';
import Card from './Card.jsx';

export default function HandResult({ result, players, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 7000);
    return () => clearTimeout(t);
  }, []);

  if (!result || !visible) return null;

  const getPlayerName = (id) => players?.find(p => p.id === id)?.name || 'Unknown';

  // Group winners by runout if ran twice
  const run1 = result.winners?.filter(w => w.runout === 'run1' || !w.runout);
  const run2 = result.winners?.filter(w => w.runout === 'run2');

  const renderWinner = (w, idx) => (
    <div key={idx} style={{ marginBottom: '0.5rem' }}>
      <div className="result-winner-name">{getPlayerName(w.playerId)}</div>
      {w.handName && <div className="result-hand-name">{w.handName}</div>}
      <div className="result-amount">+${w.amount.toLocaleString()}</div>
      {w.handCards && (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginTop: '0.5rem' }}>
          {w.handCards.map((c, i) => <Card key={i} card={c} size="sm" highlight />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="result-overlay">
      <div className="result-card">
        {result.isBombPot && (
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="tag tag-bomb">💣 Bomb Pot</span>
          </div>
        )}

        {result.ranItTwice && (
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="tag tag-omaha">Run It Twice</span>
          </div>
        )}

        {result.ranItTwice ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Run 1</div>
              {result.board && (
                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  {result.board.map((c, i) => <Card key={i} card={c} size="sm" />)}
                </div>
              )}
              {run1.map(renderWinner)}
            </div>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Run 2</div>
              {result.board2 && (
                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  {result.board2.map((c, i) => <Card key={i} card={c} size="sm" />)}
                </div>
              )}
              {run2.map(renderWinner)}
            </div>
          </div>
        ) : (
          <>
            {result.board && (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '1rem' }}>
                {result.board.map((c, i) => <Card key={i} card={c} size="sm" />)}
              </div>
            )}
            {run1.map(renderWinner)}
          </>
        )}

        {/* Show all hands at showdown */}
        {result.showdownHands && Object.keys(result.showdownHands).length > 1 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: '1rem' }}>
            <div className="text-muted text-sm mb-1" style={{ textAlign: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>All Hands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              {Object.entries(result.showdownHands).map(([id, hand]) => (
                <div key={id} style={{ textAlign: 'center' }}>
                  <div className="text-sm" style={{ color: 'var(--cream-muted)', marginBottom: '3px' }}>{getPlayerName(id)}</div>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                    {hand.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" />)}
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: '3px' }}>{hand.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-ghost btn-sm" style={{ marginTop: '1rem' }} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
