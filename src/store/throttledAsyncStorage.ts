import AsyncStorage from '@react-native-async-storage/async-storage';
import { logDiagnostic } from '../services/diagnosticsLog';

// redux-persist writes ALL whitelisted slices as one combined JSON blob under
// a single 'persist:root' key (see store/index.ts's persistConfig) — every
// dispatch that touches any whitelisted slice re-serializes and writes the
// whole thing. During active trip tracking, GPS fixes alone dispatch
// appendGpsPoint roughly every 3s (see useTripAutoDetection.ts), each one
// growing trip.route/trip.events a little more; harsh-event detection,
// compliance monitoring, and traffic monitoring add more dispatches on top.
// Write cost scales with how much of the trip has been recorded so far while
// write frequency stays constant, so a real drive stayed fine for the first
// ~15 minutes and then started stalling the JS thread badly enough to freeze
// the whole app. Throttling the actual disk write (not the in-memory Redux
// state, which updates instantly either way) trades a few seconds of
// durability on an abrupt kill for the app staying responsive for a trip's
// entire duration.
const THROTTLE_MS = 5000;

// This app only ever persists through one persistReducer (config.key='root'),
// so a single-slot throttle (not a per-key map) is all that's needed here.
let lastWriteAt = 0;
let pendingKey: string | null = null;
let pendingValue: string | null = null;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolvers: Array<() => void> = [];

// An oversized persisted blob is what makes every launch (parse) and every
// write (stringify) progressively more expensive, and it's invisible from
// inside the app once it's bad enough to freeze the UI. tripsPersistTransform
// is what keeps it bounded; this is purely the tripwire that proves whether
// it's working, on a real device, without needing adb. Rate-limited because
// it rides along with a write that already happens every few seconds.
const SIZE_WARN_BYTES = 1_500_000;
const SIZE_WARN_COOLDOWN_MS = 5 * 60 * 1000;
let lastSizeWarnAt = 0;

function warnIfOversized(value: string): void {
  if (value.length < SIZE_WARN_BYTES) return;
  const now = Date.now();
  if (now - lastSizeWarnAt < SIZE_WARN_COOLDOWN_MS) return;
  lastSizeWarnAt = now;
  // Writes under its own AsyncStorage key, never back through this wrapper,
  // so this can't feed itself.
  logDiagnostic('Persisted state blob is unusually large.', {
    bytes: value.length,
    warnThresholdBytes: SIZE_WARN_BYTES,
  });
}

function flush(): Promise<void> {
  if (pendingKey === null || pendingValue === null) return Promise.resolve();
  const key = pendingKey;
  const value = pendingValue;
  warnIfOversized(value);
  pendingKey = null;
  pendingValue = null;
  lastWriteAt = Date.now();
  const resolvers = pendingResolvers;
  pendingResolvers = [];
  return AsyncStorage.setItem(key, value).then(() => {
    resolvers.forEach(resolve => resolve());
  });
}

export const throttledAsyncStorage = {
  ...AsyncStorage,
  setItem(key: string, value: string): Promise<void> {
    const now = Date.now();
    pendingKey = key;
    pendingValue = value;

    if (now - lastWriteAt >= THROTTLE_MS) {
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
      return flush();
    }

    return new Promise((resolve) => {
      pendingResolvers.push(resolve);
      if (!trailingTimer) {
        const delay = THROTTLE_MS - (now - lastWriteAt);
        trailingTimer = setTimeout(() => {
          trailingTimer = null;
          flush();
        }, delay);
      }
    });
  },
};
