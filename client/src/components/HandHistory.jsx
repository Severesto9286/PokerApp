import React, { useState } from 'react';
import Card from './Card.jsx';

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function HandSummaryRow({ hand, myId, onClick, isSelected }) {
  const myWin = hand.winners?.find(w => w.playerId === myId);
  const totalPot = hand.winners?.reduce((s, w) => s + (w.amount || 0), 0) || 0;
  const iWon = !!myWin;
  const mySnap = hand.playerSnapshots?.find(p => p.id === myId);
  const winnerNames = hand.winners?.map(w => {
    const snap = hand.playerSnapshots?.find(p => p.id === w.playerId);
    return snap?.name || 'Unknown';
  }).filter((v, i, a) => a.indexOf(v) === i).join(', ');

  return (
    <div
      onClick={onClick}
      style={{
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(201,168,76,0.08)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--gold)' : '2px solid transparent',
        transition: '0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
          Hand #{hand.handNumber}
          {hand.isBombPot && <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: '#e74c3c' }}>💣</span>}
          {hand.isOmaha && !hand.isBombPot && <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: '#5dade2' }}>PLO</span>}
          {hand.ranItTwice && <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: 'var(--gold)' }}>2x</span>}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{timeAgo(hand.timestamp)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
          {hand.winners?.[0]?.uncontested ? `${winnerNames} wins (uncontested)` : `${winnerNames} wins`}
        </span>
        <span style={{
          fontSize: '0.82rem',
          fontFamily: 'DM Mono, monospace',
          fontWeight: '600',
          color: iWon ? '#58d68d' : '#e74c3c'
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

  const renderBoard = (board, label) => (
    <div style={{ marginBottom: '0.75rem' }}>
      {label && <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {board?.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
        {(!board || board.length === 0) && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No board (uncontested)</span>}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '1rem', borderTop: '1px solid rgba(201,168,76,0.15)' }}>
      {/* Header */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.1rem', color: 'var(--gold)' }}>
          Hand #{hand.handNumber}
        </span>
        {hand.isBombPot && <span className="tag tag-bomb">💣 Bomb Pot</span>}
        {hand.isOmaha && !hand.isBombPot && <span className="tag tag-omaha">PLO</span>}
        {hand.ranItTwice && <span className="tag tag-omaha">Run Twice</span>}
      </div>

      {/* Board(s) */}
      {hand.ranItTwice ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {renderBoard(hand.board, 'Run 1')}
          {renderBoard(hand.board2, 'Run 2')}
        </div>
      ) : renderBoard(hand.board, 'Board')}

      {/* Winners */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>Result</div>
        {hand.winners?.map((w, i) => {
          const snap = getPlayer(w.playerId);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: w.playerId === myId ? 'var(--gold)' : 'var(--text-primary)' }}>
                {snap?.name || 'Unknown'}
              </span>
              {w.runout && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({w.runout})</span>}
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.82rem', color: '#58d68d', marginLeft: 'auto' }}>
                +${w.amount?.toLocaleString()}
              </span>
              {w.handName && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.handName}</span>}
            </div>
          );
        })}
      </div>

      {/* All player hands */}
      {Object.keys(hand.showdownHands || {}).length > 0 && (
        <div>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Showdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {hand.playerSnapshots?.filter(p => !p.folded && p.holeCards?.length > 0).map(snap => {
              const handInfo = hand.showdownHands?.[snap.id];
              const isWinner = hand.winners?.some(w => w.playerId === snap.id);
              return (
                <div key={snap.id} style={{
                  background: isWinner ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  border: `1px solid ${isWinner ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: snap.id === myId ? 'var(--gold)' : 'var(--text-primary)' }}>
                      {snap.name}{snap.id === myId ? ' (You)' : ''}
                      {isWinner && ' 🏆'}
                    </span>
                    {handInfo?.name && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{handInfo.name}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {snap.holeCards.map((c, i) => <Card key={i} card={c} size="sm" animate={false} />)}
                  </div>
                </div>
              );
            })}
            {/* Folded players */}
            {hand.playerSnapshots?.filter(p => p.folded && p.holeCards?.length > 0).map(snap => (
              <div key={snap.id} style={{
                background: 'rgba(255,255,255,0.015)',
                borderRadius: '6px',
                padding: '0.5rem',
                border: '1px solid rgba(255,255,255,0.04)',
                opacity: 0.6
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
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
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedHand(null)}>
              ← Back to list
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <HandDetail hand={selected} myId={myId} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {handHistory.length} hand{handHistory.length !== 1 ? 's' : ''} — click to review
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
