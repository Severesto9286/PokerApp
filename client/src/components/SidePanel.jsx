import React, { useEffect, useRef, useState } from 'react';
import Card from './Card';
import { audio } from '../lib/audio';
import { avatarOf, fmt, ACTION_LABEL } from '../lib/format';

const EMOJIS = ['😂', '😭', '🔥', '🤝', '🙈', '😤', '🍀', '💀', '👏', '🤡'];

function Chat({ chat, sendChat, you }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.length]);
  const submit = (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; sendChat(t); setText(''); };
  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <div className="chat-empty">Say hi to the table 👋</div>}
        {chat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.playerId === you ? 'is-me' : ''}`}>
            <span className="chat-avatar" style={{ background: avatarOf(m.avatar).bg }}>{avatarOf(m.avatar).emoji}</span>
            <div className="chat-body"><span className="chat-name">{m.name}</span><span className="chat-text">{m.text}</span></div>
          </div>
        ))}
      </div>
      <div className="chat-emojis">{EMOJIS.map((e) => <button key={e} onClick={() => sendChat(e)}>{e}</button>)}</div>
      <form className="chat-form" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" maxLength={240} />
        <button className="btn btn-primary btn-sm" type="submit">Send</button>
      </form>
    </div>
  );
}

function NumField({ label, value, onCommit, min = 0, step = 1, suffix }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Number(v); if (Number.isFinite(n) && n !== value) onCommit(n); else setV(String(value)); };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input"><input type="number" min={min} step={step} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />{suffix && <em>{suffix}</em>}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="toggle">
      <span><span className="toggle-label">{label}</span>{hint && <span className="toggle-hint">{hint}</span>}</span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span className="toggle-ui" />
    </label>
  );
}

function HostPanel({ state, send, toast, confirm }) {
  const c = state.config;
  const patch = (p) => send('host:config', { patch: p });
  const [buyIns, setBuyIns] = useState({});
  const [stackEdits, setStackEdits] = useState({});
  const inHand = !!state.hand;
  return (
    <div className="host">
      {state.pending.length > 0 && (
        <section className="hsec hsec-pending">
          <h4>Join requests</h4>
          {state.pending.map((r) => (
            <div key={r.id} className="pending">
              <span className="pending-av" style={{ background: avatarOf(r.avatar).bg }}>{avatarOf(r.avatar).emoji}</span>
              <span className="pending-name">{r.name}</span>
              <input type="number" className="pending-buyin" value={buyIns[r.id] ?? r.buyIn} onChange={(e) => setBuyIns({ ...buyIns, [r.id]: e.target.value })} />
              <button className="btn btn-primary btn-sm" onClick={() => send('host:approve', { playerId: r.id, buyIn: Number(buyIns[r.id] ?? r.buyIn) })}>Seat</button>
              <button className="btn btn-ghost btn-sm" onClick={() => send('host:deny', { playerId: r.id })}>✕</button>
            </div>
          ))}
        </section>
      )}

      <section className="hsec">
        <h4>Game</h4>
        <div className="hrow">
          {!inHand && <button className="btn btn-primary" onClick={() => send('host:startHand')}>Deal now</button>}
          {!inHand && <button className="btn btn-ghost" onClick={() => send('host:startHand', { variant: 'PLO' })}>Deal a PLO hand</button>}
          <button className={`btn ${state.paused ? 'btn-gold' : 'btn-ghost'}`} onClick={() => send('host:pause', { paused: !state.paused })}>{state.paused ? 'Resume table' : 'Pause after this hand'}</button>
        </div>
        <Toggle label="Auto-deal next hand" checked={c.autoDeal} onChange={(v) => patch({ autoDeal: v })} />
        {c.autoDeal && <NumField label="Delay between hands" value={c.autoDealDelay} min={2} onCommit={(v) => patch({ autoDealDelay: v })} suffix="s" />}
        <div className="hrow">
          <span className="field-label">Force next hand</span>
          <div className="segmented">
            {[['', 'Random'], ['NLH', 'NLH'], ['PLO', 'PLO']].map(([v, l]) => (
              <button key={v} className={(state.nextHandVariant || '') === v ? 'is-on' : ''} onClick={() => send('host:nextVariant', { variant: v || null })}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="hsec">
        <h4>Blinds &amp; stacks</h4>
        <div className="hgrid">
          <NumField label="Small blind" value={c.smallBlind} min={1} onCommit={(v) => patch({ smallBlind: v })} />
          <NumField label="Big blind" value={c.bigBlind} min={1} onCommit={(v) => patch({ bigBlind: v })} />
          <NumField label="Ante" value={c.ante} min={0} onCommit={(v) => patch({ ante: v })} />
          <NumField label="Default buy-in" value={c.buyIn} min={1} onCommit={(v) => patch({ buyIn: v })} />
        </div>
        <Toggle label="Players can rebuy" checked={c.allowRebuy} onChange={(v) => patch({ allowRebuy: v })} />
        <p className="hint">Blind changes apply from the next hand.</p>
      </section>

      <section className="hsec">
        <h4>PLO pots</h4>
        <label className="field">
          <span className="field-label">PLO frequency <b>{Math.round(c.ploFrequency * 100)}%</b></span>
          <input type="range" min={0} max={100} value={Math.round(c.ploFrequency * 100)} onChange={(e) => patch({ ploFrequency: Number(e.target.value) / 100 })} />
        </label>
        <div className="hrow">
          <span className="field-label">PLO style</span>
          <div className="segmented">
            <button className={c.ploMode === 'blinds' ? 'is-on' : ''} onClick={() => patch({ ploMode: 'blinds' })}>Normal blinds</button>
            <button className={c.ploMode === 'bomb' ? 'is-on' : ''} onClick={() => patch({ ploMode: 'bomb' })}>Bomb pot</button>
          </div>
        </div>
        {c.ploMode === 'bomb' && (
          <>
            <NumField label="Bomb pot ante" value={c.bombAnteBB} min={0.5} step={0.5} onCommit={(v) => patch({ bombAnteBB: v })} suffix="BB each" />
            <Toggle label="Double board" hint="Two boards, pot split between them" checked={c.doubleBoard} onChange={(v) => patch({ doubleBoard: v })} />
          </>
        )}
        <p className="hint">Bomb pots: everyone antes, no preflop action, straight to the flop. Pot-limit betting on every PLO hand.</p>
      </section>

      <section className="hsec">
        <h4>Timing &amp; rules</h4>
        <div className="hgrid">
          <NumField label="Time to act" value={c.actionTime} min={5} onCommit={(v) => patch({ actionTime: v })} suffix="s" />
          <NumField label="Time bank" value={c.timeBank} min={0} onCommit={(v) => patch({ timeBank: v })} suffix="s" />
        </div>
        <Toggle label="Run it twice" hint="When everyone at the table has it on" checked={c.runItTwice} onChange={(v) => patch({ runItTwice: v })} />
        <Toggle label="Auto-approve joins" checked={c.autoApprove} onChange={(v) => patch({ autoApprove: v })} />
      </section>

      <section className="hsec">
        <h4>Players</h4>
        {state.seats.filter(Boolean).map((p) => (
          <div key={p.id} className="hplayer">
            <span className="pending-av" style={{ background: avatarOf(p.avatar).bg }}>{avatarOf(p.avatar).emoji}</span>
            <span className="hplayer-name">{p.name}{p.id === state.hostId ? ' (host)' : ''}{!p.connected ? ' · offline' : ''}</span>
            <input type="number" className="pending-buyin" value={stackEdits[p.id] ?? p.stack} onChange={(e) => setStackEdits({ ...stackEdits, [p.id]: e.target.value })}
              onBlur={() => { const v = Number(stackEdits[p.id]); if (Number.isFinite(v) && v !== p.stack) send('host:setStack', { playerId: p.id, amount: v }).then((r) => { if (r?.error) setStackEdits((s) => ({ ...s, [p.id]: p.stack })); }); }} />
            <button className="btn btn-ghost btn-sm" title="Add a buy-in" onClick={() => send('host:addChips', { playerId: p.id, amount: c.buyIn })}>+{fmt(c.buyIn)}</button>
            {p.id !== state.hostId && <button className="btn btn-danger btn-sm" title="Remove from table" onClick={() => confirm({ title: `Remove ${p.name}?`, text: 'They will be folded out of the current hand and lose their seat.', confirm: 'Remove', danger: true, onConfirm: () => send('host:kick', { playerId: p.id }) })}>✕</button>}
          </div>
        ))}
        <p className="hint">Stack edits apply between hands; chips added during a hand arrive at the next one.</p>
      </section>
    </div>
  );
}

function HistoryPanel({ history, state, fourColor }) {
  const [open, setOpen] = useState(null);
  if (!history.length) return <div className="empty">No hands yet.</div>;
  return (
    <div className="history">
      {history.map((h) => {
        const isOpen = open === h.handNumber;
        const winners = {};
        for (const w of h.winners) winners[w.name] = (winners[w.name] || 0) + w.amount;
        return (
          <div key={h.handNumber} className={`hist ${isOpen ? 'is-open' : ''}`}>
            <button className="hist-head" onClick={() => setOpen(isOpen ? null : h.handNumber)}>
              <span className="hist-num">#{h.handNumber}</span>
              <span className={`hist-variant ${h.variant === 'PLO' ? 'is-plo' : ''}`}>{h.bombPot ? '💣 PLO' : h.variant}</span>
              <span className="hist-board">{h.board.map((c) => <Card key={c} card={c} size="xs" fourColor={fourColor} />)}</span>
              <span className="hist-winners">{Object.entries(winners).map(([n, a]) => `${n} +${fmt(a)}`).join(', ')}</span>
            </button>
            {isOpen && (
              <div className="hist-body">
                {h.board2 && <div className="hist-row"><span className="hist-label">{h.runItTwice ? 'Run 2' : 'Board 2'}</span><span className="hist-board">{h.board2.map((c) => <Card key={c} card={c} size="xs" fourColor={fourColor} />)}</span></div>}
                {h.players.map((p) => (
                  <div key={p.playerId} className={`hist-row ${p.folded ? 'is-folded' : ''}`}>
                    <span className="hist-label">{p.name}</span>
                    <span className="hist-board">{p.cards ? p.cards.map((c) => <Card key={c} card={c} size="xs" fourColor={fourColor} />) : <em>mucked</em>}</span>
                    <span className="hist-net">{p.stackAfter - (p.stackAfter - p.net) === 0 ? '' : ''}{p.net >= 0 ? '+' : ''}{fmt(p.net)}</span>
                  </div>
                ))}
                {h.winners.map((w, i) => <div key={i} className="hist-win">{w.name} wins {fmt(w.amount)}{w.handName ? ` — ${w.handName}` : ' (uncontested)'}{h.board2 ? ` · ${h.runItTwice ? 'run' : 'board'} ${w.board}` : ''}</div>)}
                <div className="hist-log">
                  {h.log.map((l, i) => {
                    const p = h.players.find((x) => x.seat === l.seat);
                    return <span key={i} className={`log log-${l.action}`}>{p?.name || '?'} {ACTION_LABEL[l.action] || l.action}{l.amount ? ` ${fmt(l.amount)}` : ''}</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ prefs, setPrefs, onLeave }) {
  const [a, setA] = useState(audio.settings);
  useEffect(() => audio.onChange(setA), []);
  const up = (p) => audio.update(p);
  return (
    <div className="settings">
      <section className="hsec">
        <h4>Sound</h4>
        <Toggle label="Music" checked={a.musicOn} onChange={(v) => up({ musicOn: v })} />
        <label className="field"><span className="field-label">Music volume</span><input type="range" min={0} max={100} value={Math.round(a.music * 100)} onChange={(e) => up({ music: Number(e.target.value) / 100 })} /></label>
        <Toggle label="Sound effects" checked={a.sfxOn} onChange={(v) => { up({ sfxOn: v }); if (v) audio.chips(100); }} />
        <label className="field"><span className="field-label">Effects volume</span><input type="range" min={0} max={100} value={Math.round(a.sfx * 100)} onChange={(e) => up({ sfx: Number(e.target.value) / 100 })} /></label>
      </section>
      <section className="hsec">
        <h4>Table</h4>
        <Toggle label="Four-colour deck" checked={prefs.fourColor} onChange={(v) => setPrefs({ ...prefs, fourColor: v })} />
        <Toggle label="Show amounts in big blinds" checked={prefs.inBB} onChange={(v) => setPrefs({ ...prefs, inBB: v })} />
      </section>
      <section className="hsec">
        <h4>Shortcuts</h4>
        <p className="hint"><kbd>F</kbd> fold · <kbd>C</kbd> check / call · <kbd>R</kbd> raise panel</p>
      </section>
      <section className="hsec">
        <button className="btn btn-danger" onClick={onLeave}>Leave table</button>
      </section>
    </div>
  );
}

export default function SidePanel({ game, prefs, setPrefs, onLeave, open, onClose, tab, setTab, confirm }) {
  const { state, chat, sendChat, history, unread, setChatOpen, send, toast } = game;
  useEffect(() => { setChatOpen(open && tab === 'chat'); }, [open, tab, setChatOpen]);
  const tabs = [['chat', 'Chat'], ['history', 'Hands'], ['settings', 'Settings']];
  if (state.isHost) tabs.splice(1, 0, ['host', 'Host']);
  return (
    <aside className={`panel ${open ? 'is-open' : ''}`}>
      <div className="panel-tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            {l}
            {k === 'chat' && unread > 0 && tab !== 'chat' && <span className="tab-badge">{unread}</span>}
            {k === 'host' && state.pending.length > 0 && <span className="tab-badge is-host">{state.pending.length}</span>}
          </button>
        ))}
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {tab === 'chat' && <Chat chat={chat} sendChat={sendChat} you={state.you} />}
        {tab === 'host' && state.isHost && <HostPanel state={state} send={send} toast={toast} confirm={confirm} />}
        {tab === 'history' && <HistoryPanel history={history} state={state} fourColor={prefs.fourColor} />}
        {tab === 'settings' && <SettingsPanel prefs={prefs} setPrefs={setPrefs} onLeave={onLeave} />}
      </div>
    </aside>
  );
}
