import { io } from 'socket.io-client';

const url = import.meta.env.VITE_SERVER_URL || undefined; // undefined = same origin (Vite proxy in dev)

export const socket = io(url, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

// Promise wrapper around socket.emit with ack.
export function call(event, payload = {}) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ error: 'The server did not respond. Try again.' }); } }, 8000);
    socket.emit(event, payload, (res) => { if (!done) { done = true; clearTimeout(timer); resolve(res || {}); } });
  });
}

// `?p=2` in the URL keeps a separate session/profile per tab (handy for testing with friends on one machine).
const NS = new URLSearchParams(window.location.search).get('p') || '';
const SESSION_KEY = `ff-poker-session${NS}`;
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function saveSession(s) {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

const PROFILE_KEY = `ff-poker-profile${NS}`;
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || {}; } catch { return {}; }
}
export function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
