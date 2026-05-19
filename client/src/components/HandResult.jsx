import React, { useEffect, useState } from 'react';

// Maps seat position (0-5) to approximate coordinates within the table-area
// so the badge appears near the actual player seat.
const SEAT_COORDS = {
  0: { left: '50%', top: '80%'  }, // bottom centre (you)
  1: { left: '18%', top: '72%'  }, // bottom left
  2: { left: '12%', top: '28%'  }, // top left
  3: { left: '50%', top: '12%'  }, // top centre
  4: { left: '88%', top: '28%'  }, // top right
  5: { left: '82%', top: '72%'  }, // bottom right
};

export default function HandResult({ result, players, seatPositions, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  if (!result || !visible) return null;

  const getPlayerName = (id) => players?.find(p => p.id === id)?.name || 'Unknown';
  const getPlayerSeatPos = (id) => seatPositions?.find(s => s.player.id === id)?.position ?? 0;

  // Sum amounts per player across all winner entries
  const allWinners = result.winners || [];
  const byPlayer = {};
  for (const w of allWinners) {
    if (!byPlayer[w.playerId]) byPlayer[w.playerId] = { ...w, amount: 0 };
    byPlayer[w.playerId].amount += w.amount || 0;
  }

  return (
    <>
      {/* Bomb pot / run it twice tags — float near centre */}
      {(result.isBombPot || result.ranItTwice) && (
        <div style={{
          position: 'absolute',
          top: '44%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          gap: '6px',
          zIndex: 31,
          pointerEvents: 'none',
        }}>
          {result.isBombPot && <span className="tag tag-bomb">💣 Bomb Pot</span>}
          {result.ranItTwice && <span className="tag tag-omaha">Run It Twice</span>}
        </div>
      )}

      {Object.values(byPlayer).map((w, idx) => {
        const seatPos = getPlayerSeatPos(w.playerId);
        const coords = SEAT_COORDS[seatPos] || SEAT_COORDS[0];
        return (
          <WinnerBadge
            key={w.playerId}
            name={getPlayerName(w.playerId)}
            amount={w.amount}
            handName={w.handName}
            coords={coords}
            delay={idx * 150}
          />
        );
      })}
    </>
  );
}

function WinnerBadge({ name, amount, handName, coords, delay }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay + 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: 'absolute',
      left: coords.left,
      top: coords.top,
      transform: `translate(-50%, -50%) translateY(${show ? 0 : 10}px)`,
      opacity: show ? 1 : 0,
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      zIndex: 32,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    }}>
      {/* Chips dropping in above badge */}
      <ChipStack show={show} />

      {/* Badge */}
      <div style={{
        background: 'rgba(8,11,14,0.98)',
        border: '1px solid var(--border-teal)',
        borderTop: '2px solid var(--teal)',
        borderRadius: 'var(--radius-md)',
        padding: '7px 14px',
        textAlign: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,196,170,0.06)',
        minWidth: '130px',
        maxWidth: '170px',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.88rem',
          fontWeight: 700,
          color: 'var(--teal)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1.2,
          marginBottom: '2px',
        }}>
          {name}
        </div>
        {handName && (
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '3px',
          }}>
            {handName}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: '1.1rem',
          fontWeight: 700,
          color: 'var(--amber)',
          textShadow: '0 0 12px rgba(240,168,32,0.5)',
          letterSpacing: '0.02em',
        }}>
          +${amount?.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// Small chip dots that "drop in" above the badge
function ChipStack({ show }) {
  const chips = ['var(--teal)', 'var(--amber)', 'var(--teal)', '#666'];
  return (
    <div style={{
      display: 'flex',
      gap: '3px',
      marginBottom: '2px',
    }}>
      {chips.map((color, i) => (
        <div key={i} style={{
          width: '13px',
          height: '13px',
          borderRadius: '50%',
          background: color,
          border: '1.5px solid rgba(255,255,255,0.18)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
          opacity: show ? 1 : 0,
          transform: `translateY(${show ? 0 : -8 - i * 4}px)`,
          transition: `opacity 0.3s ease ${0.08 + i * 0.07}s, transform 0.35s ease ${0.08 + i * 0.07}s`,
        }} />
      ))}
    </div>
  );
}
