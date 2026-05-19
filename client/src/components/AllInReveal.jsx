import React, { useEffect, useState } from 'react';
import Card from './Card.jsx';

// Shows all hole cards when players are all-in — no animation, just appear
export default function AllInReveal({ players, onDone }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Brief pause so the "ALL IN" label reads, then show cards
    const t1 = setTimeout(() => setShow(true), 400);
    // Auto-dismiss after a fixed pause
    const t2 = setTimeout(() => { onDone(); }, 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="allin-reveal-overlay" onClick={onDone}>
      <div className="allin-reveal-title">All In</div>

      {show && (
        <div className="allin-reveal-players">
          {players.map((player) => (
            <div key={player.id} className="allin-reveal-player">
              <div className="allin-reveal-name">{player.name}</div>
              <div className="allin-reveal-cards">
                {player.holeCards?.map((card, ci) => (
                  <div key={ci} className="allin-card-wrapper">
                    <Card card={card} size="lg" animate={false} />
                  </div>
                ))}
              </div>
              {player.stack !== undefined && (
                <div style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.02em',
                }}>
                  ${player.stack?.toLocaleString()} behind
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', marginTop: '0.5rem', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>
        Click to skip
      </div>
    </div>
  );
}
