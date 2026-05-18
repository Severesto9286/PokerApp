import React, { useEffect, useState } from 'react';
import Card from './Card.jsx';

// Shows all hole cards dramatically when players are all-in
export default function AllInReveal({ players, onDone }) {
  const [phase, setPhase] = useState('title'); // 'title' → 'cards' → 'done'

  // Sequence: title flashes in (0.6s), then cards reveal one by one, then auto-dismiss
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('cards'), 700);
    // Auto-dismiss after all cards are revealed + pause
    const totalCards = players.reduce((s, p) => s + (p.holeCards?.length || 0), 0);
    const revealTime = 700 + totalCards * 280 + 2200;
    const t2 = setTimeout(() => { setPhase('done'); onDone(); }, revealTime);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className="allin-reveal-overlay" onClick={onDone}>
      <div className="allin-reveal-title">All In</div>

      {phase === 'cards' && (
        <div className="allin-reveal-players">
          {players.map((player, pi) => (
            <div key={player.id} className="allin-reveal-player">
              <div className="allin-reveal-name">{player.name}</div>
              <div className="allin-reveal-cards">
                {player.holeCards?.map((card, ci) => {
                  // Stagger: each card gets a longer delay for drama
                  const cardIdx = players.slice(0, pi).reduce((s, p) => s + (p.holeCards?.length || 0), 0) + ci;
                  const delayMs = cardIdx * 280 + 100;
                  return (
                    <div
                      key={ci}
                      className="allin-card-wrapper"
                      style={{ '--delay': `${delayMs}ms`, animationDelay: `${delayMs}ms` }}
                    >
                      <Card card={card} size="lg" animate={false} />
                    </div>
                  );
                })}
              </div>
              {player.stack !== undefined && (
                <div style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}>
                  ${player.stack?.toLocaleString()} behind
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginTop: '1rem' }}>
        click to skip
      </div>
    </div>
  );
}
