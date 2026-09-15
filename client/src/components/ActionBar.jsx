import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fmtAmount, fmt } from '../lib/format';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export default function ActionBar({ legal, hand, bb, inBB, onAct, preAction, setPreAction, myTurn, canPre, potTotal }) {
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [typed, setTyped] = useState('');
  const [armed, setArmed] = useState(false); // ignore taps in the first moments after the buttons appear
  const inputRef = useRef(null);
  useEffect(() => {
    if (!myTurn) { setArmed(false); return undefined; }
    const t = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(t);
  }, [myTurn]);
  const guarded = (fn) => (...args) => { if (armed) fn(...args); };

  const preflop = hand?.phase === 'preflop';
  const step = bb >= 10 ? Math.max(1, Math.round(bb / 2)) : 1;

  useEffect(() => {
    if (legal) { setAmount(legal.minRaiseTo); setTyped(''); }
    if (!myTurn) setRaiseOpen(false);
  }, [legal?.minRaiseTo, legal?.maxRaiseTo, myTurn]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!myTurn || !legal) return undefined;
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (k === 'f') onAct('fold');
      else if (k === 'c') onAct(legal.canCheck ? 'check' : 'call');
      else if (k === 'r' && legal.canRaise) setRaiseOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, legal, onAct]);

  const presets = useMemo(() => {
    if (!legal) return [];
    const { minRaiseTo, maxRaiseTo, currentBet, potTotal: pot, toCall, potLimit } = legal;
    const list = [];
    const potAfterCall = pot + toCall;
    if (minRaiseTo >= maxRaiseTo) return [[potLimit ? 'Max' : 'All in', maxRaiseTo]];
    if (preflop && currentBet <= bb * 1.01 && !hand?.bombPot) {
      list.push(['2x', bb * 2], ['2.5x', bb * 2.5], ['3x', bb * 3], ['4x', bb * 4]);
    } else if (preflop && !hand?.bombPot) {
      list.push(['2.2x', currentBet * 2.2], ['3x', currentBet * 3], ['Pot', currentBet + potAfterCall]);
    } else {
      list.push(['1/3 Pot', currentBet + potAfterCall / 3], ['½ Pot', currentBet + potAfterCall / 2], ['¾ Pot', currentBet + potAfterCall * 0.75], ['Pot', currentBet + potAfterCall]);
    }
    if (!potLimit) list.push(['All in', maxRaiseTo]);
    else list.push(['Max', maxRaiseTo]);
    return list.map(([label, v]) => [label, clamp(Math.round(v), minRaiseTo, maxRaiseTo)]).filter(([, v], i, arr) => arr.findIndex((x) => x[1] === v) === i);
  }, [legal, bb, preflop, hand]);

  if (!legal || !myTurn) {
    if (!canPre) return null;
    // Pre-action checkboxes while waiting for the action to reach us.
    const opts = [
      ['checkfold', 'Check / Fold'],
      ['check', 'Check'],
      ['callany', 'Call any'],
    ];
    return (
      <div className="actionbar is-pre">
        {opts.map(([k, label]) => (
          <button key={k} className={`prebtn ${preAction === k ? 'is-on' : ''}`} onClick={() => setPreAction(preAction === k ? null : k)}>
            <span className="prebox" />{label}
          </button>
        ))}
      </div>
    );
  }

  const { canCheck, canCall, callAmount, callIsAllIn, canRaise, minRaiseTo, maxRaiseTo, currentBet } = legal;
  const raiseLabel = currentBet === 0 ? 'Bet' : 'Raise to';
  const isAllInAmount = amount >= legal.stack + legal.streetBet;

  const commitTyped = () => {
    const v = parseFloat(typed);
    if (!Number.isNaN(v)) setAmount(clamp(Math.round(inBB ? v * bb : v), minRaiseTo, maxRaiseTo));
    setTyped('');
  };

  return (
    <div className="actionbar">
      {canRaise && raiseOpen && (
        <div className="raise-panel">
          <div className="raise-presets">
            {presets.map(([label, v]) => (
              <button key={label} className={`preset ${amount === v ? 'is-on' : ''}`} onClick={() => setAmount(v)}>{label}</button>
            ))}
          </div>
          <div className="raise-slider">
            <button className="stepbtn" onClick={() => setAmount((a) => clamp(a - step, minRaiseTo, maxRaiseTo))}>−</button>
            <input type="range" min={minRaiseTo} max={maxRaiseTo} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <button className="stepbtn" onClick={() => setAmount((a) => clamp(a + step, minRaiseTo, maxRaiseTo))}>+</button>
            <input ref={inputRef} className="raise-input" value={typed !== '' ? typed : (inBB ? (amount / bb).toFixed(amount % bb === 0 ? 0 : 1) : amount)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={commitTyped}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitTyped(); onAct(currentBet === 0 ? 'bet' : 'raise', clamp(Math.round(inBB ? parseFloat(typed || amount / bb) * bb : parseFloat(typed || amount)), minRaiseTo, maxRaiseTo)); } }} />
            {inBB && <span className="raise-unit">BB</span>}
          </div>
          <div className="raise-hint">Min {fmtAmount(minRaiseTo, bb, inBB)} · Max {fmtAmount(maxRaiseTo, bb, inBB)}{legal.potLimit ? ' (pot limit)' : ''}</div>
        </div>
      )}
      <div className="action-buttons">
        <button className="abtn abtn-fold" onClick={guarded(() => onAct('fold'))}>
          <span className="abtn-title">Fold</span>
          <span className="abtn-key">F</span>
        </button>
        {canCheck ? (
          <button className="abtn abtn-check" onClick={guarded(() => onAct('check'))}>
            <span className="abtn-title">Check</span>
            <span className="abtn-key">C</span>
          </button>
        ) : (
          <button className="abtn abtn-call" onClick={guarded(() => onAct('call'))}>
            <span className="abtn-title">{callIsAllIn ? 'All in' : 'Call'}</span>
            <span className="abtn-sub">{fmtAmount(callAmount, bb, inBB)}</span>
            <span className="abtn-key">C</span>
          </button>
        )}
        {canRaise && (
          raiseOpen ? (
            <button className={`abtn abtn-raise ${isAllInAmount ? 'is-allin' : ''}`} onClick={guarded(() => onAct(currentBet === 0 ? 'bet' : 'raise', amount))}>
              <span className="abtn-title">{isAllInAmount ? 'All in' : raiseLabel}</span>
              <span className="abtn-sub">{fmtAmount(amount, bb, inBB)}</span>
            </button>
          ) : (
            <button className="abtn abtn-raise" onClick={() => setRaiseOpen(true)}>
              <span className="abtn-title">{raiseLabel}</span>
              <span className="abtn-sub">{fmtAmount(minRaiseTo, bb, inBB)}</span>
              <span className="abtn-key">R</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
