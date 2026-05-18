import React from 'react';
import { startMusic, stopMusic, setMasterVolume, setMusicVolume, setSfxVolume, playChipBet, playCardFlip, playWin } from '../utils/audio.js';

export default function SettingsPanel({ settings, onUpdate }) {
  const handleMasterVolume = (v) => {
    onUpdate('masterVolume', v);
    setMasterVolume(v);
  };

  const handleMusicVolume = (v) => {
    onUpdate('musicVolume', v);
    setMusicVolume(v);
  };

  const handleSfxVolume = (v) => {
    onUpdate('sfxVolume', v);
    setSfxVolume(v);
  };

  const handleMusicToggle = () => {
    const next = !settings.musicEnabled;
    onUpdate('musicEnabled', next);
    if (next) startMusic(); else stopMusic();
  };

  const handleSfxToggle = () => {
    const next = !settings.sfxEnabled;
    onUpdate('sfxEnabled', next);
    if (next) playChipBet();
  };

  const handleAnimToggle = () => {
    onUpdate('animationsEnabled', !settings.animationsEnabled);
  };

  const speedLabel = (v) => {
    if (v <= 0.5) return 'Slow';
    if (v <= 0.75) return 'Relaxed';
    if (v <= 1.0) return 'Normal';
    if (v <= 1.5) return 'Fast';
    return 'Instant';
  };

  return (
    <div className="host-panel">
      {/* Music */}
      <div className="host-section">
        <div className="host-section-title">🎵 Music</div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Background music</span>
          <button
            className={`btn btn-sm ${settings.musicEnabled ? 'btn-gold' : 'btn-ghost'}`}
            onClick={handleMusicToggle}
          >
            {settings.musicEnabled ? '● On' : '○ Off'}
          </button>
        </div>
        {settings.musicEnabled && (
          <div>
            <div className="text-sm text-muted mb-1">Music volume</div>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="1" step="0.05" value={settings.musicVolume}
                onChange={e => handleMusicVolume(parseFloat(e.target.value))} />
              <span className="text-mono text-sm" style={{ minWidth: '32px' }}>
                {Math.round(settings.musicVolume * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sound Effects */}
      <div className="host-section">
        <div className="host-section-title">🔊 Sound Effects</div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Cards, chips, actions</span>
          <button
            className={`btn btn-sm ${settings.sfxEnabled ? 'btn-gold' : 'btn-ghost'}`}
            onClick={handleSfxToggle}
          >
            {settings.sfxEnabled ? '● On' : '○ Off'}
          </button>
        </div>
        {settings.sfxEnabled && (
          <div>
            <div className="text-sm text-muted mb-1">SFX volume</div>
            <div className="flex items-center gap-2">
              <input type="range" min="0" max="1" step="0.05" value={settings.sfxVolume}
                onChange={e => handleSfxVolume(parseFloat(e.target.value))} />
              <span className="text-mono text-sm" style={{ minWidth: '32px' }}>
                {Math.round(settings.sfxVolume * 100)}%
              </span>
            </div>
            <div className="flex gap-1 mt-2">
              <button className="btn btn-ghost btn-sm" onClick={() => playCardFlip()}>Test card</button>
              <button className="btn btn-ghost btn-sm" onClick={() => playChipBet()}>Test chips</button>
              <button className="btn btn-ghost btn-sm" onClick={() => playWin()}>Test win</button>
            </div>
          </div>
        )}
      </div>

      {/* Animations */}
      <div className="host-section">
        <div className="host-section-title">✨ Animations</div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Card reveals, transitions</span>
          <button
            className={`btn btn-sm ${settings.animationsEnabled ? 'btn-gold' : 'btn-ghost'}`}
            onClick={handleAnimToggle}
          >
            {settings.animationsEnabled ? '● On' : '○ Off'}
          </button>
        </div>
        {settings.animationsEnabled && (
          <div>
            <div className="text-sm text-muted mb-1">
              Animation speed — <span className="text-gold">{speedLabel(settings.animationSpeed)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="range" min="0.25" max="2" step="0.25" value={settings.animationSpeed}
                onChange={e => onUpdate('animationSpeed', parseFloat(e.target.value))} />
              <span className="text-mono text-sm" style={{ minWidth: '32px' }}>
                {settings.animationSpeed}×
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Master volume */}
      <div className="host-section">
        <div className="host-section-title">Overall Volume</div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1rem' }}>🔇</span>
          <input type="range" min="0" max="1" step="0.05" value={settings.masterVolume}
            onChange={e => handleMasterVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: '1rem' }}>🔊</span>
          <span className="text-mono text-sm" style={{ minWidth: '32px' }}>
            {Math.round(settings.masterVolume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
