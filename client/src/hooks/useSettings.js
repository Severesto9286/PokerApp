import { useState, useEffect } from 'react';

const DEFAULTS = {
  masterVolume: 0.6,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  musicEnabled: true,
  sfxEnabled: true,
  animationSpeed: 1.0,  // 0.5 = slow, 1 = normal, 2 = fast
  animationsEnabled: true,
};

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('poker_settings');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  useEffect(() => {
    try { localStorage.setItem('poker_settings', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  return { settings, update };
}
