import React, { useState } from 'react';
import Card from './Card.jsx';

function HandSummaryRow({ hand, myId, onClick, isSelected }) {
  const mySnap = hand.playerSnapshots?.find(p => p.id === myId);
  const myWin = hand.winners?.find(w => w.playerId === myId);
  const iWon = !!myWin;
  const winnerNames = [...new Set(hand.winners?.map(w => {
    const snap = hand.playerSnapshots?.find(p => p.id === w.playerId);
    return snap?.name || 'Unknown';
  }))].join(', ');

  return (
    <div
      onClick={onClick}
      style={{
        padding: '0.55rem 0.75rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(0,196,170,0.06)' : 'transparent',
        transition: '0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(0,196,170,0.06)' : 'transparent'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
            #{hand.handNumber}
          </span>
          {hand.isBombPot && <span className="tag tag-bomb" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>💣</span>}
          {hand.ranItTwice && <span className="tag tag-omaha" style={{ fontSize: '0.55rem', padding: '1px 4px' }}>RIT</span>}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
            {hand.winners?.[0]?.uncontested ? `${winnerNames} wins (uncontested)` : `${winnerNames} wins`}
          </span>
        </span>
        <span style={{
          fontSize: '0.82rem', fontFamily: 'var(--font-data)', fontWeight: 600,
          color: iWon ? 'var(--green)' : 'var(--red)',
        }}>
          {iWon ? `+$${myWin.amount?.toLocaleString()}` : mySnap?.totalBet > 0 ? `-$${mySnap.totalBet?.toLocaleString()}` : '—'}
        </span>
      </div>
    </div>
  );
}

function HandDetail({ hand, myId }) {
  if (!hand) return null;

  const getPlayer = (id) => hand.playerSnapshots?.find(p => p.id === id);
  const isTwoBoards = hand.twoBoards;
  const isRanItTwice = hand.ranItTwice;

  const renderBoard = (board, label) => (
    <div style={{ marginBottom: '0.65rem' }}>
      {label && (
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {board?.length > 0
          ? board.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)
          : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No board (uncontested)</span>
        }
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--teal)', fontWeight: 700, letterSpacing: '0.06em' }}>
          Hand #{hand.handNumber}
        </span>
        {hand.isBombPot && <span className="tag tag-bomb">💣 Bomb Pot</span>}
        {hand.isOmaha && !hand.isBombPot && <span className="tag tag-omaha">PLO</span>}
        {isRanItTwice && <span className="tag tag-omaha">Run Twice</span>}
        {isTwoBoards && <span className="tag tag-omaha">Two Boards</span>}
      </div>

      {/* Board(s) */}
      {isTwoBoards ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>{renderBoard(hand.board, 'Board 1')}</div>
          <div>{renderBoard(hand.board2, 'Board 2')}</div>
        </div>
      ) : isRanItTwice ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>{renderBoard(hand.board, 'Run 1')}</div>
          <div>{renderBoard(hand.board2, 'Run 2')}</div>
        </div>
      ) : (
        renderBoard(hand.board, null)
      )}

      {/* Winners */}
      <div style={{ marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
          Result
        </div>
        {hand.winners?.map((w, i) => {
          const snap = getPlayer(w.playerId);
          const boardLabel = w.runout === 'board1' ? ' (B1)' : w.runout === 'board2' ? ' (B2)' : w.runout === 'run1' ? ' (R1)' : w.runout === 'run2' ? ' (R2)' : '';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-ui)', color: w.playerId === myId ? 'var(--teal)' : 'var(--text-primary)' }}>
                {snap?.name || 'Unknown'}{boardLabel}
              </span>
              {w.handName && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {w.handName}
                </span>
              )}
              <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-data)', fontWeight: 700, color: 'var(--amber)', marginLeft: 'auto' }}>
                +${w.amount?.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Showdown hands — board 1 / main */}
      {hand.showdownHands && Object.keys(hand.showdownHands).length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
            {isTwoBoards ? 'Board 1 Hands' : isRanItTwice ? 'Run 1 Hands' : 'Showdown Hands'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {Object.entries(hand.showdownHands).map(([id, h]) => {
              const snap = getPlayer(id);
              const isWinner = hand.winners?.some(w => w.playerId === id && (!w.runout || w.runout === 'board1' || w.runout === 'run1'));
              return (
                <div key={id} style={{
                  background: isWinner ? 'rgba(0,196,170,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isWinner ? 'rgba(0,196,170,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '0.45rem 0.6rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-ui)', color: id === myId ? 'var(--teal)' : 'var(--text-primary)' }}>
                      {snap?.name || 'Unknown'}{isWinner ? ' 🏆' : ''}
                    </span>
                    {h.name && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{h.name}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {h.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Showdown hands — board 2 */}
      {isTwoBoards && hand.showdownHands2 && Object.keys(hand.showdownHands2).length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
            Board 2 Hands
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {Object.entries(hand.showdownHands2).map(([id, h]) => {
              const snap = getPlayer(id);
              const isWinner = hand.winners?.some(w => w.playerId === id && w.runout === 'board2');
              return (
                <div key={id} style={{
                  background: isWinner ? 'rgba(0,196,170,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isWinner ? 'rgba(0,196,170,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 'var(--radius)',
                  padding: '0.45rem 0.6rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-ui)', color: id === myId ? 'var(--teal)' : 'var(--text-primary)' }}>
                      {snap?.name || 'Unknown'}{isWinner ? ' 🏆' : ''}
                    </span>
                    {h.name && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{h.name}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {h.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Run 2 hands for RIT */}
      {isRanItTwice && hand.showdownHands2 && Object.keys(hand.showdownHands2).length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '6px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
            Run 2 Hands
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {Object.entries(hand.showdownHands2).map(([id, h]) => {
              const snap = getPlayer(id);
              return (
                <div key={id} style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 'var(--radius)',
                  padding: '0.45rem 0.6rem',
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'var(--font-ui)', color: id === myId ? 'var(--teal)' : 'var(--text-primary)', marginBottom: '5px' }}>
                    {snap?.name || 'Unknown'}
                  </div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {h.holeCards?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Folded players */}
      {hand.playerSnapshots?.filter(p => p.folded && p.holeCards?.length > 0).length > 0 && (
        <div>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
            Folded
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {hand.playerSnapshots.filter(p => p.folded && p.holeCards?.length > 0).map(snap => (
              <div key={snap.id} style={{ opacity: 0.55, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 'var(--radius)', padding: '0.45rem 0.6rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px', fontFamily: 'var(--font-ui)' }}>
                  {snap.name} (folded)
                </div>
                <div style={{ display: 'flex', gap: '3px' }}>
                  {snap.holeCards.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HandHistory({ handHistory, myId }) {
  const [selectedHand, setSelectedHand] = useState(null);

  if (!handHistory || handHistory.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🃏</div>
        <p className="text-sm text-muted">No hands played yet</p>
      </div>
    );
  }

  const selected = handHistory.find(h => h.handNumber === selectedHand);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {selected ? (
        <>
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedHand(null)}>
              ← Back
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <HandDetail hand={selected} myId={myId} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
              {handHistory.length} hand{handHistory.length !== 1 ? 's' : ''} — tap to review
            </span>
          </div>
          {handHistory.map(hand => (
            <HandSummaryRow
              key={hand.handNumber}
              hand={hand}
              myId={myId}
              onClick={() => setSelectedHand(hand.handNumber)}
              isSelected={selectedHand === hand.handNumber}
            />
          ))}
        </div>
      )}
    </div>
  );
}
