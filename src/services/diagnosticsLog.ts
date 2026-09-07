import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DiagnosticLogEntry {
  timestamp: number;
  message: string;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = 'diagnosticsLog';
// Capped so a long drive with a persistently-blocked gate (logging on every
// qualifying fix) can't grow this unbounded in AsyncStorage.
const MAX_ENTRIES = 100;

let entries: DiagnosticLogEntry[] = [];
const listeners = new Set<(entries: DiagnosticLogEntry[]) => void>();

// Shared by every caller so concurrent logDiagnostic()/subscribeDiagnostics()
// calls before the initial load finishes all wait on the same read rather
// than racing each other and one silently overwriting the other's data.
let loadPromise: Promise<void> | null = null;
function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) entries = JSON.parse(raw) as DiagnosticLogEntry[];
      })
      .catch(() => {
        entries = [];
      });
  }
  return loadPromise;
}

function notify() {
  listeners.forEach((listener) => listener(entries));
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
}

// Lightweight on-device diagnostic trail for troubleshooting trip
// auto-start behavior on standalone/QA builds with no Metro/adb access —
// console.warn alone is invisible there. Persisted to AsyncStorage (survives
// app restarts, so a driver can report an issue after the drive is over)
// and viewable via Settings > Diagnostics (DiagnosticsScreen.tsx).
export function logDiagnostic(message: string, data?: Record<string, unknown>): void {
  console.warn(`[Diagnostics] ${message}`, data);
  ensureLoaded().then(() => {
    entries = [{ timestamp: Date.now(), message, data }, ...entries].slice(0, MAX_ENTRIES);
    persist();
    notify();
  });
}

// Fires immediately with whatever's currently loaded (empty until the async
// load resolves), then again once the real persisted history is in.
export function subscribeDiagnostics(listener: (entries: DiagnosticLogEntry[]) => void): () => void {
  listener(entries);
  ensureLoaded().then(() => listener(entries));
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDiagnostics(): void {
  entries = [];
  persist();
  notify();
}
