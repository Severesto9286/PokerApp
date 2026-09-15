import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/table.css';
import './styles/panel.css';

createRoot(document.getElementById('root')).render(<App />);

// Dev hook for poking the audio engine from the console.
if (import.meta.env.DEV) import('./lib/audio').then((m) => { window.__ff = { audio: m.audio }; });
