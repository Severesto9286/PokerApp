import React, { useEffect, useState } from 'react';

export default function HandResult({ result, players, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 6000);
    return () => clearTimeout(t);
  }, []);

  if (!result || !visible) return null;

  const getPlayerName = (id) => players?.find(p => p.id === id)?.name || 'Unknown';

  // Collect all winners and sum amounts per player
  const allWinners = result.winners || [];
  const byPlayer = {};
  for (const w of allWinners) {
    if (!byPlayer[w.playerId]) byPlayer[w.playerId] = { ...w, amount: 0 };
    byPlayer[w.playerId].amount += w.amount || 0;
  }

  return (
    <>
      {Object.values(byPlayer).map((w, idx) => (
        <WinnerBadge
          key={w.playerId}
          name={getPlayerName(w.playerId)}
          amount={w.amount}
          handName={w.handName}
          isBombPot={result.isBombPot}
          ranItTwice={result.ranItTwice}
          delay={idx * 200}
        />
      ))}
    </>
  );
}

function WinnerBadge({ name, amount, handName, isBombPot, ranItTwice, delay }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: `translate(-50%, -50%) translateY(${show ? 0 : 12}px)`,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      pointerEvents: 'none',
    }}>
      {/* Tags row */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
        {isBombPot && (
          <span className="tag tag-bomb">💣 Bomb Pot</span>
        )}
        {ranItTwice && (
          <span className="tag tag-omaha">Run It Twice</span>
        )}
      </div>

      {/* Main badge */}
      <div style={{
        background: 'rgba(10,14,18,0.97)',
        border: '1px solid var(--border-teal)',
        borderTop: '2px solid var(--teal)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 20px',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,196,170,0.08)',
        minWidth: '180px',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.05rem',
          fontWeight: 700,
          color: 'var(--teal)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '2px',
        }}>
          {name}
        </div>
        {handName && (
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            {handName}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: '1.3rem',
          fontWeight: 700,
          color: 'var(--amber)',
          textShadow: '0 0 14px rgba(240,168,32,0.5)',
          letterSpacing: '0.02em',
        }}>
          +${amount?.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
