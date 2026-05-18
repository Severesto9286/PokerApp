import React, { useEffect, useState } from 'react';
import Card from './Card.jsx';

export default function HandResult({ result, players, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 9000);
    return () => clearTimeout(t);
  }, []);

  if (!result || !visible) return null;

  const getPlayerName = (id) => players?.find(p => p.id === id)?.name || 'Unknown';

  const isTwoBoards = result.twoBoards;
  const board1Winners = result.winners?.filter(w => w.runout === 'board1' || (!w.runout && !isTwoBoards));
  const board2Winners = result.winners?.filter(w => w.runout === 'board2');

  // For normal run-it-twice
  const run1 = result.winners?.filter(w => w.runout === 'run1' || (!w.runout && !isTwoBoards));
  const run2 = result.winners?.filter(w => w.runout === 'run2');

  const renderCardRow = (cards) => (
    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
      {cards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
    </div>
  );

  const renderWinner = (w, idx) => (
    <div key={idx} style={{ marginBottom: '0.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="result-winner-name" style={{ fontSize: '1.3rem' }}>{getPlayerName(w.playerId)}</span>
        {w.handName && <span className="result-hand-name" style={{ fontSize: '0.85rem' }}>{w.handName}</span>}
        <span className="result-amount" style={{ fontSize: '1.4rem' }}>+${w.amount?.toLocaleString()}</span>
      </div>
      {w.handCards && (
        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', marginTop: '4px' }}>
          {w.handCards.map((c, i) => <Card key={i} card={c} size="sm" highlight animate={false} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="result-overlay">
      <div className="result-card" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {result.isBombPot && <span className="tag tag-bomb">💣 Bomb Pot</span>}
          {isTwoBoards && <span className="tag tag-omaha">Two Boards</span>}
          {result.ranItTwice && <span className="tag tag-omaha">Run It Twice</span>}
        </div>

        {/* TWO BOARDS (PLO Bomb Pot) */}
        {isTwoBoards ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Board 1</div>
              {renderCardRow(result.board)}
              {board1Winners?.map(renderWinner)}
            </div>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Board 2</div>
              {renderCardRow(result.board2)}
              {board2Winners?.map(renderWinner)}
            </div>
          </div>
        ) : result.ranItTwice ? (
          /* RUN IT TWICE */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Run 1</div>
              {renderCardRow(result.board)}
              {run1?.map(renderWinner)}
            </div>
            <div>
              <div className="text-muted text-sm mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Run 2</div>
              {renderCardRow(result.board2)}
              {run2?.map(renderWinner)}
            </div>
          </div>
        ) : (
          /* NORMAL */
          <>
            {result.board?.length > 0 && renderCardRow(result.board)}
            {result.winners?.map(renderWinner)}
          </>
        )}

        {/* All hands at showdown */}
        {result.showdownHands && Object.keys(result.showdownHands).length > 1 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: '1rem' }}>
            <div className="text-muted text-sm mb-1" style={{ textAlign: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {isTwoBoards ? 'Board 1 Hands' : 'All Hands'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              {Object.entries(result.showdownHands).map(([id, hand]) => (
                <div key={id} style={{ textAlign: 'center' }}>
                  <div className="text-sm" style={{ color: 'var(--cream-muted)', marginBottom: '3px' }}>{getPlayerName(id)}</div>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                    {hand.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: '3px' }}>{hand.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Board 2 hands for two-board bomb pot */}
        {isTwoBoards && result.showdownHands2 && Object.keys(result.showdownHands2).length > 1 && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: '1rem' }}>
            <div className="text-muted text-sm mb-1" style={{ textAlign: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Board 2 Hands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
              {Object.entries(result.showdownHands2).map(([id, hand]) => (
                <div key={id} style={{ textAlign: 'center' }}>
                  <div className="text-sm" style={{ color: 'var(--cream-muted)', marginBottom: '3px' }}>{getPlayerName(id)}</div>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                    {hand.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
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
