import { AppState } from 'react-native';
import type { Middleware } from '@reduxjs/toolkit';
import { logDiagnostic } from '../services/diagnosticsLog';
import { checkpoint } from '../services/startupGuard';

// Last few dispatched action types, so a JS-thread stall can be logged with
// what the app was doing right before it — the only clue a freeze leaves.
const RECENT_MAX = 15;
const recent: string[] = [];

export const recentActionsMiddleware: Middleware = () => next => (action) => {
  const type = (action as { type?: unknown }).type;
  if (typeof type === 'string') {
    recent.push(type);
    if (recent.length > RECENT_MAX) recent.shift();
  }
  return next(action);
};

// A timer that should fire every TICK_MS; when it fires much later, the JS
// thread was blocked for that long (a freeze, or a long JSON parse/write).
const TICK_MS = 2000;
const STALL_LOG_MS = 4000;
let watchdogStarted = false;

export function startStallWatchdog(): void {
  if (watchdogStarted) return;
  watchdogStarted = true;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const stalledMs = now - last - TICK_MS;
    last = now;
    // Android pauses/throttles timers while the app is in the background —
    // a late tick then isn't a stall.
    if (AppState.currentState !== 'active') return;
    if (stalledMs < STALL_LOG_MS) return;
    checkpoint(`stall ${stalledMs}ms`);
    logDiagnostic('App was unresponsive (JS thread blocked).', {
      stalledMs,
      recentActions: recent.join(' > '),
    });
  }, TICK_MS);
}
