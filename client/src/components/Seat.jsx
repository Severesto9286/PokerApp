import React, { useEffect, useRef, useState } from 'react';
import Card from './Card';
import { avatarOf, fmtAmount, ACTION_LABEL } from '../lib/format';
import { audio } from '../lib/audio';

function TimerRing({ deadline, total, serverOffset, radius = 40, isHero }) {
  const [frac, setFrac] = useState(1);
  const tickedRef = useRef(-1);
  useEffect(() => {
    let raf;
    const loop = () => {
      const now = Date.now() + serverOffset;
      const left = Math.max(0, deadline - now);
      const f = Math.min(1, left / total);
      setFrac(f);
      const sec = Math.ceil(left / 1000);
      if (isHero && sec <= 5 && sec > 0 && tickedRef.current !== sec) { tickedRef.current = sec; audio.tick(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deadline, total, serverOffset, isHero]);
  const c = 2 * Math.PI * radius;
  const color = frac > 0.5 ? '#3ddc84' : frac > 0.25 ? '#ffb020' : '#ff3b3b';
  return (
    <svg className="seat-ring" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="6" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" style={{ transition: 'stroke .3s' }} />
    </svg>
  );
}

export default function Seat({
  player, pos, isHero, isTurn, deadline, actionTime, usingTimeBank, serverOffset,
  cards, folded, tag, winAmount, showdownDim, handName, fourColor, bb, inBB,
  dealing, dealerPos, isWinner, revealed, variant, onClick, sittingOutNext,
}) {
  const av = avatarOf(player.avatar);
  const [x, y] = pos;
  const cardCount = player.cardCount || 0;
  const showTag = tag && Date.now() - tag.at < 1800;
  const [, force] = useState(0);
  useEffect(() => {
    if (!tag) return undefined;
    const t = setTimeout(() => force((n) => n + 1), 1850);
    return () => clearTimeout(t);
  }, [tag]);

  const inHand = player.inHand && cardCount > 0;
  const hasFolded = folded || player.folded;
  const faceUp = !!cards && cards.length > 0;
  const dealFrom = dealing && dealerPos ? [dealerPos[0] - x, dealerPos[1] - y - 60] : null;
  const dealIdxBase = dealing ? dealing.seats.indexOf(player.seat) : -1;
  const isDealing = dealing && dealIdxBase >= 0 && Date.now() - dealing.at < 2500;
  const total = usingTimeBank ? Math.max(1, player.timeBank) * 1000 : actionTime * 1000;

  const tagClass = tag ? (tag.action === 'fold' ? 'tag-fold' : tag.action === 'check' ? 'tag-check' : tag.action === 'call' ? 'tag-call' : tag.allIn ? 'tag-allin' : 'tag-raise') : '';
  const tagText = tag ? (tag.allIn ? 'ALL IN' : ACTION_LABEL[tag.action]) : '';

  const cardSize = isHero ? 'lg' : faceUp ? 'sm' : 'xs';
  const nCards = faceUp ? cards.length : cardCount;

  return (
    <div className={`seat ${isHero ? 'is-hero' : ''} ${isTurn ? 'is-turn' : ''} ${hasFolded ? 'is-folded' : ''} ${!player.connected ? 'is-offline' : ''} ${player.sittingOut ? 'is-sitout' : ''} ${isWinner ? 'is-winner' : ''} ${showdownDim ? 'is-dim' : ''} ${player.allIn && inHand && !hasFolded ? 'is-allin' : ''}`}
      style={{ left: x, top: y }} onClick={onClick}>
      {inHand && !hasFolded && nCards > 0 && (
        <div className={`seat-cards n-${nCards} ${faceUp ? 'is-up' : ''} ${isHero ? 'hero-cards' : ''}`}>
          {Array.from({ length: nCards }).map((_, i) => (
            <Card key={`${player.seat}-${i}-${faceUp ? cards[i] : 'b'}`} card={faceUp ? cards[i] : null} size={cardSize}
              faceDown={!faceUp} fourColor={fourColor}
              flipDelay={isHero && isDealing ? 420 + i * 90 + dealIdxBase * 60 : (!isHero && faceUp && revealed ? 60 + i * 120 : 0)}
              dealFrom={isDealing ? dealFrom : null}
              dealIndex={isDealing ? dealIdxBase + i * dealing.seats.length : null}
              dim={showdownDim} />
          ))}
        </div>
      )}
      {inHand && hasFolded && nCards > 0 && !isHero && (
        <div className="seat-cards is-folding n-2">
          <Card card={null} faceDown size="xs" /><Card card={null} faceDown size="xs" />
        </div>
      )}
      <div className="seat-avatar" style={{ background: av.bg }}>
        <span className="seat-emoji">{av.emoji}</span>
        {isTurn && deadline && <TimerRing deadline={deadline} total={total} serverOffset={serverOffset} isHero={isHero} />}
        {player.allIn && inHand && !hasFolded && <div className="seat-badge badge-allin">ALL IN</div>}
        {!player.connected && <div className="seat-badge badge-offline">OFFLINE</div>}
        {player.sittingOut && player.connected && !inHand && <div className="seat-badge badge-sitout">SITTING OUT</div>}
        {isTurn && usingTimeBank && <div className="seat-badge badge-timebank">TIME BANK</div>}
      </div>
      <div className={`seat-pill ${showTag ? `has-tag ${tagClass}` : ''}`}>
        {showTag ? (
          <div className="seat-tag">{tagText}{tag.amount > 0 && tag.action !== 'fold' && tag.action !== 'check' ? <span className="seat-tag-amt">{fmtAmount(tag.amount, bb, inBB)}</span> : null}</div>
        ) : (
          <>
            {winAmount > 0 ? <div className="seat-won">+{fmtAmount(winAmount, bb, inBB)}</div> : <div className="seat-name" title={player.name}>{player.name}</div>}
            <div className="seat-stack">{player.stack === 0 && inHand ? 'All-in' : fmtAmount(player.stack, bb, inBB)}</div>
          </>
        )}
      </div>
      {handName && <div className="seat-handname">{handName}</div>}
      {sittingOutNext && <div className="seat-note">Sitting out next hand</div>}
    </div>
  );
}
