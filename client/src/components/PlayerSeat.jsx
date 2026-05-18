import React from 'react';
import Card from './Card.jsx';

export default function PlayerSeat({ player, isCurrentTurn, myId, seatPosition, animationSpeed = 1, animate = true }) {
  if (!player) return null;

  const isMe = player.id === myId;
  const initials = player.name.slice(0, 2).toUpperCase();

  const avatarClass = [
    'seat-avatar',
    isCurrentTurn ? 'is-turn' : '',
    player.folded ? 'folded' : '',
    !player.connected ? 'disconnected' : ''
  ].filter(Boolean).join(' ');

  const totalPot = player.currentBet > 0 ? player.currentBet : null;

  return (
    <div className={`seat seat-pos-${seatPosition}`}>
      {/* Cards above avatar for top seats, below for bottom */}
      {seatPosition >= 3 && (
        <div className="seat-cards">
          {player.holeCards && player.holeCards.length > 0
            ? player.holeCards.map((c, i) => <Card key={i} card={c} size="sm" isNew animate={animate} animationSpeed={animationSpeed} />)
            : player.cardCount > 0
              ? Array.from({ length: player.cardCount }).map((_, i) => <Card key={i} faceDown size="sm" />)
              : null
          }
        </div>
      )}

      <div className={avatarClass}>
        {initials}
        {player.isDealer && <div className="dealer-button">D</div>}
      </div>

      <div className="seat-name">{player.name}{isMe ? ' (You)' : ''}</div>
      <div className="seat-stack">${player.stack.toLocaleString()}</div>

      {totalPot !== null && (
        <div className="seat-bet">${totalPot.toLocaleString()}</div>
      )}

      {player.isAllIn && !player.folded && (
        <span className="seat-status-badge badge-allin">All In</span>
      )}
      {player.folded && (
        <span className="seat-status-badge badge-folded">Folded</span>
      )}
      {player.sitOut && !player.folded && (
        <span className="seat-status-badge badge-sitout">Sitting Out</span>
      )}

      {seatPosition < 3 && (
        <div className="seat-cards">
          {player.holeCards && player.holeCards.length > 0
            ? player.holeCards.map((c, i) => <Card key={i} card={c} size="sm" isNew animate={animate} animationSpeed={animationSpeed} />)
            : player.cardCount > 0
              ? Array.from({ length: player.cardCount }).map((_, i) => <Card key={i} faceDown size="sm" />)
              : null
          }
        </div>
      )}
    </div>
  );
}
