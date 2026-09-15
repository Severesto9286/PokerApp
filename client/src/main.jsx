import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/table.css';
import './styles/panel.css';

// Last line of defence: never leave a blank screen if something throws while rendering.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[app] render error', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading">
        <div style={{ fontSize: 40 }}>🃏</div>
        <div>Something went wrong on this screen.</div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload the table</button>
        <pre style={{ color: '#777', fontSize: 11, maxWidth: 600, whiteSpace: 'pre-wrap' }}>{String(this.state.error && this.state.error.stack || this.state.error)}</pre>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);

// Dev hook for poking the audio engine from the console.
if (import.meta.env.DEV) import('./lib/audio').then((m) => { window.__ff = { audio: m.audio }; });
