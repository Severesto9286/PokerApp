import React, { useEffect, useState } from 'react';
import { AVATARS, avatarOf } from '../lib/format';
import { call, loadProfile, saveProfile } from '../lib/socket';
import { audio } from '../lib/audio';

const BLIND_PRESETS = [[1, 2], [2, 5], [5, 10], [10, 20], [25, 50], [50, 100]];

export default function Lobby({ onEnter, connected, initialCode, notice }) {
  const profile = loadProfile();
  const [name, setName] = useState(profile.name || '');
  const [avatar, setAvatar] = useState(profile.avatar ?? Math.floor(Math.random() * AVATARS.length));
  const [mode, setMode] = useState(initialCode ? 'join' : 'home');
  const [code, setCode] = useState(initialCode || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blinds, setBlinds] = useState([1, 2]);
  const [buyIn, setBuyIn] = useState(200);
  const [seats, setSeats] = useState(6);
  const [plo, setPlo] = useState(15);
  const [ploMode, setPloMode] = useState('blinds');
  const [autoApprove, setAutoApprove] = useState(false);

  useEffect(() => { saveProfile({ name, avatar }); }, [name, avatar]);
  useEffect(() => { if (notice) setError(notice); }, [notice]);

  const validName = name.trim().length >= 1;

  const create = async () => {
    if (!validName) return setError('Pick a name first.');
    setBusy(true); setError('');
    audio.init();
    const res = await call('table:create', {
      name: name.trim(), avatar,
      config: { smallBlind: blinds[0], bigBlind: blinds[1], buyIn, maxSeats: seats, ploFrequency: plo / 100, ploMode, autoApprove },
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    onEnter({ tableId: res.tableId, playerId: res.playerId, secret: res.secret, pending: false });
  };

  const join = async () => {
    if (!validName) return setError('Pick a name first.');
    if (code.trim().length < 4) return setError('Enter the table code.');
    setBusy(true); setError('');
    audio.init();
    const res = await call('table:join', { tableId: code.trim().toUpperCase(), name: name.trim(), avatar, buyIn });
    setBusy(false);
    if (res.error) return setError(res.error);
    onEnter({ tableId: res.tableId, playerId: res.playerId, secret: res.secret, pending: !!res.pending });
  };

  return (
    <div className="lobby">
      <div className="lobby-bg" />
      <div className="lobby-card">
        <div className="lobby-brand"><span className="brand-mark">♠</span><span>Felt &amp; Friends</span></div>
        <div className="lobby-tag">Private poker for you and your crew. No real money, all the drama.</div>

        <div className="lobby-profile">
          <div className="lobby-avatars">
            {AVATARS.map((a, i) => (
              <button key={i} className={`av ${avatar === i ? 'is-on' : ''}`} style={{ background: a.bg }} onClick={() => setAvatar(i)} title="Pick an avatar">{a.emoji}</button>
            ))}
          </div>
          <input className="lobby-name" value={name} maxLength={16} placeholder="Your name" onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        {mode === 'home' && (
          <div className="lobby-actions">
            <button className="btn btn-primary btn-xl" onClick={() => setMode('create')}>Create a table</button>
            <button className="btn btn-ghost btn-xl" onClick={() => setMode('join')}>Join with a code</button>
          </div>
        )}

        {mode === 'create' && (
          <div className="lobby-form">
            <div className="lf-row">
              <span className="lf-label">Blinds</span>
              <div className="segmented">
                {BLIND_PRESETS.map(([s, b]) => <button key={b} className={blinds[1] === b ? 'is-on' : ''} onClick={() => { setBlinds([s, b]); setBuyIn(b * 100); }}>{s}/{b}</button>)}
              </div>
            </div>
            <div className="lf-row">
              <span className="lf-label">Buy-in</span>
              <div className="segmented">
                {[50, 100, 200, 500].map((m) => <button key={m} className={buyIn === blinds[1] * m ? 'is-on' : ''} onClick={() => setBuyIn(blinds[1] * m)}>{m} BB</button>)}
                <input type="number" value={buyIn} min={1} onChange={(e) => setBuyIn(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="lf-row">
              <span className="lf-label">Seats</span>
              <div className="segmented">{[2, 4, 6, 8, 9].map((n) => <button key={n} className={seats === n ? 'is-on' : ''} onClick={() => setSeats(n)}>{n}</button>)}</div>
            </div>
            <div className="lf-row">
              <span className="lf-label">PLO hands <b>{plo}%</b></span>
              <input type="range" min={0} max={100} value={plo} onChange={(e) => setPlo(Number(e.target.value))} />
            </div>
            {plo > 0 && (
              <div className="lf-row">
                <span className="lf-label">PLO style</span>
                <div className="segmented">
                  <button className={ploMode === 'blinds' ? 'is-on' : ''} onClick={() => setPloMode('blinds')}>Normal blinds</button>
                  <button className={ploMode === 'bomb' ? 'is-on' : ''} onClick={() => setPloMode('bomb')}>Bomb pot</button>
                </div>
              </div>
            )}
            <label className="chk lf-row"><input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} /><span>Let anyone with the code sit down without approval</span></label>
            <div className="lobby-actions">
              <button className="btn btn-ghost" onClick={() => setMode('home')}>Back</button>
              <button className="btn btn-primary btn-xl" disabled={busy || !connected} onClick={create}>{busy ? 'Creating…' : 'Open the table'}</button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="lobby-form">
            <div className="lf-row">
              <span className="lf-label">Table code</span>
              <input className="lobby-code" value={code} maxLength={6} placeholder="ABCDE" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && join()} />
            </div>
            <div className="lf-row">
              <span className="lf-label">Requested buy-in</span>
              <input type="number" value={buyIn} min={1} onChange={(e) => setBuyIn(Number(e.target.value) || 0)} />
            </div>
            <div className="lobby-actions">
              <button className="btn btn-ghost" onClick={() => setMode('home')}>Back</button>
              <button className="btn btn-primary btn-xl" disabled={busy || !connected} onClick={join}>{busy ? 'Joining…' : 'Take a seat'}</button>
            </div>
          </div>
        )}

        {error && <div className={`lobby-error ${error === notice ? 'is-notice' : ''}`}>{error}</div>}
        {!connected && <div className="lobby-conn">Connecting to server…</div>}
      </div>
      <div className="lobby-foot">Made for friends · not for real money</div>
    </div>
  );
}

export function PendingScreen({ session, onCancel, state }) {
  return (
    <div className="lobby">
      <div className="lobby-bg" />
      <div className="lobby-card lobby-pending">
        <div className="lobby-brand"><span className="brand-mark">♠</span><span>Felt &amp; Friends</span></div>
        <div className="spinner" />
        <h2>Waiting for the host</h2>
        <p>You asked to join table <b>{session.tableId}</b>. The host will seat you in a moment.</p>
        {state && <p className="muted">{state.seats.filter(Boolean).length} player{state.seats.filter(Boolean).length === 1 ? '' : 's'} at the table{state.hand ? ` · hand #${state.hand.number} in progress` : ''}</p>}
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
