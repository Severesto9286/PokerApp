import React, { useCallback, useEffect, useState } from 'react';
import Lobby, { PendingScreen } from './components/Lobby';
import TableView from './components/TableView';
import SidePanel from './components/SidePanel';
import { useGame } from './lib/useGame';
import { socket, call, loadSession, saveSession } from './lib/socket';
import { audio } from './lib/audio';

const PREFS_KEY = 'ff-poker-prefs';
function loadPrefs() { try { return { fourColor: false, inBB: false, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')) }; } catch { return { fourColor: false, inBB: false }; } }

// Small in-app confirm dialog (no native prompts).
function ConfirmDialog({ dialog, onClose }) {
  if (!dialog) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{dialog.title}</div>
        {dialog.text && <div className="modal-text">{dialog.text}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onClose(); dialog.onConfirm(); }}>{dialog.confirm || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

function Game({ session, onLeave, prefs, setPrefs }) {
  const onSessionLost = useCallback((msg) => onLeave(msg), [onLeave]);
  const game = useGame(session, onSessionLost);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [dialog, setDialog] = useState(null);
  const confirm = useCallback((opts) => setDialog(opts), []);

  // Host: jump to the host tab when a join request arrives.
  useEffect(() => {
    const n = (game.state?.pending.length || 0) + (game.state?.rebuyRequests?.length || 0);
    if (game.state?.isHost && n > 0 && !panelOpen) { setPanelOpen(true); setTab('host'); }
  }, [game.state?.pending.length, game.state?.rebuyRequests?.length, game.state?.isHost]);

  const leave = () => confirm({
    title: 'Leave the table?',
    text: 'Your seat opens up for someone else. You can rejoin with the table code.',
    confirm: 'Leave', danger: true,
    onConfirm: async () => { await call('table:leave'); onLeave(null); },
  });

  if (!game.state) {
    return <div className="loading"><div className="spinner" /><div>Connecting to table {session.tableId}…</div></div>;
  }
  if (game.joinStatus === 'pending') {
    return <PendingScreen session={session} state={game.state} onCancel={async () => { await call('table:leave'); onLeave(null); }} />;
  }
  return (
    <div className={`app ${panelOpen ? 'has-panel' : ''}`}>
      <TableView game={game} prefs={prefs} panelOpen={panelOpen} unread={game.unread} onOpenPanel={() => setPanelOpen((o) => !o)} />
      <SidePanel game={game} prefs={prefs} setPrefs={setPrefs} open={panelOpen} onClose={() => setPanelOpen(false)} tab={tab} setTab={setTab} onLeave={leave} confirm={confirm} />
      {!game.connected && <div className="offline-bar">Reconnecting…</div>}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      <Toasts toasts={game.toasts} />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [connected, setConnected] = useState(socket.connected);
  const [notice, setNotice] = useState('');
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p) => { setPrefsState(p); localStorage.setItem(PREFS_KEY, JSON.stringify(p)); };

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on); socket.on('disconnect', off);
    // Unlock audio on the first interaction anywhere.
    const gestures = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'];
    const unlock = () => { audio.init(); if (audio.ctx && audio.ctx.state === 'running') for (const g of gestures) window.removeEventListener(g, unlock); };
    for (const g of gestures) window.addEventListener(g, unlock, { passive: true });
    return () => { socket.off('connect', on); socket.off('disconnect', off); for (const g of gestures) window.removeEventListener(g, unlock); };
  }, []);

  const enter = (s) => { saveSession(s); setSession(s); setNotice(''); };
  const leave = useCallback((msg) => { saveSession(null); setSession(null); if (msg) setNotice(msg); }, []);

  const params = new URLSearchParams(window.location.search);
  const initialCode = params.get('t') || params.get('table') || '';

  if (!session) return <Lobby onEnter={enter} connected={connected} initialCode={initialCode} notice={notice} />;
  return <Game session={session} onLeave={leave} prefs={prefs} setPrefs={setPrefs} />;
}
