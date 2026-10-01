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

// Android's AsyncStorage reads a value with one SQLite cursor, and a cursor
// can't hold a row over ~2 MB (CursorWindow) — getItem on a bigger value
// fails outright, and redux-persist then starts the app from EMPTY state
// (trips, paired car, settings and the unsent sync queue all gone) and
// overwrites the blob. 1-second GPS made route arrays ~3x denser, and a
// failed upload keeps a second copy of the points in syncQueue, so the blob
// can now reach that limit within a few drives. Values are therefore stored
// in chunks well under it: the main key holds CHUNK_MARKER + chunk count,
// the pieces live under `${key}${CHUNK_KEY_INFIX}${i}`. 500k chars stays
// under 2 MB even at 3 bytes per char in UTF-8.
export const CHUNK_CHARS = 500_000;
export const CHUNK_MARKER = '__maud_chunked__:';
const CHUNK_KEY_INFIX = '::chunk:';

function chunkKey(key: string, index: number): string {
  return `${key}${CHUNK_KEY_INFIX}${index}`;
}

async function removeChunksFrom(key: string, fromIndex: number): Promise<void> {
  const prefix = `${key}${CHUNK_KEY_INFIX}`;
  const stale = (await AsyncStorage.getAllKeys())
    .filter(k => k.startsWith(prefix) && Number(k.slice(prefix.length)) >= fromIndex);
  if (stale.length > 0) await AsyncStorage.multiRemove(stale);
}

async function writeValue(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_CHARS) {
    await AsyncStorage.setItem(key, value);
    await removeChunksFrom(key, 0);
    return;
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i * CHUNK_CHARS < value.length; i++) {
    pairs.push([chunkKey(key, i), value.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)]);
  }
  // multiSet is one SQLite transaction on Android — the marker and every
  // chunk land together, so a kill mid-write can't leave a marker pointing
  // at half-written chunks.
  await AsyncStorage.multiSet([...pairs, [key, `${CHUNK_MARKER}${pairs.length}`]]);
  await removeChunksFrom(key, pairs.length);
}

async function readValue(key: string): Promise<string | null> {
  let head: string | null;
  try {
    head = await AsyncStorage.getItem(key);
  } catch (err) {
    // An unchunked blob written before this existed and already past the
    // cursor limit — unreadable. Logged so a "everything reset" report can
    // be told apart from a logout.
    logDiagnostic('Persisted state could not be read.', {
      key, error: (err as Error)?.message ?? String(err),
    });
    throw err;
  }
  if (head === null || !head.startsWith(CHUNK_MARKER)) return head;

  const count = Number(head.slice(CHUNK_MARKER.length));
  const rows = await AsyncStorage.multiGet(Array.from({ length: count }, (_, i) => chunkKey(key, i)));
  if (rows.some(([, chunk]) => chunk === null)) {
    logDiagnostic('Persisted state chunks missing.', { key, count });
    return null;
  }
  return rows.map(([, chunk]) => chunk).join('');
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
  return writeValue(key, value).then(() => {
    resolvers.forEach(resolve => resolve());
  });
}

export const throttledAsyncStorage = {
  ...AsyncStorage,
  getItem(key: string): Promise<string | null> {
    return readValue(key);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await removeChunksFrom(key, 0);
  },
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
