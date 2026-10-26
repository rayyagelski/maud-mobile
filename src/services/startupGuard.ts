import AsyncStorage from '@react-native-async-storage/async-storage';
import { logDiagnostic } from './diagnosticsLog';
import { noteForHangReport } from './hangWatchdog';

// Detects launches that never got the app into a usable state — the
// "frozen at the Welcome screen, every restart, until reinstall" failure —
// and records how far each launch got, so that:
//  1. after two failed launches in a row the next one can offer to reset
//     local data instead of the driver having to reinstall (store/index.ts),
//  2. the Diagnostics log says WHERE the failed launches stopped (the
//     reinstall wipes the log, so until now every freeze left no trace).
//
// A launch counts as good once the JS thread has stayed responsive for a few
// seconds after the UI rendered (markStableWhenResponsive). A frozen launch
// never gets there, so its record is still open when the next one starts.

const KEY = 'startupGuard';
// Failed launches in a row before the next launch offers a reset.
export const FAILED_LAUNCHES_BEFORE_RECOVERY = 2;

interface LaunchRecord {
  startedAt: number;
  checkpoints: Array<{ name: string; atMs: number }>;
}

interface GuardState {
  failedInARow: number;
  openLaunch: LaunchRecord | null;
}

let state: GuardState = { failedInARow: 0, openLaunch: null };
let writeChain: Promise<unknown> = Promise.resolve();
let previousLaunchSummary: string | null = null;

// One line saying where the last stuck launch stopped, e.g. "ui rendered,
// 2.4 s after start (launch 0 s > ... > ui rendered 2.4 s)". Shown in the
// recovery prompt itself, so a screenshot is enough even when nothing after
// the prompt works.
export function summarizeLaunch(launch: LaunchRecord): string {
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const last = launch.checkpoints[launch.checkpoints.length - 1];
  const steps = launch.checkpoints.map(c => `${c.name} ${secs(c.atMs)}`).join(' > ');
  return `${last?.name ?? 'launch'}, ${secs(last?.atMs ?? 0)} after start (${steps})`;
}

export function getPreviousLaunchSummary(): string | null {
  return previousLaunchSummary;
}

function save(): void {
  const snapshot = JSON.stringify(state);
  writeChain = writeChain.then(() => AsyncStorage.setItem(KEY, snapshot)).catch(() => {});
}

// Called once per UI launch, before persisted state is loaded. Resolves the
// number of failed launches immediately before this one.
export async function beginLaunch(): Promise<number> {
  let previous: GuardState = { failedInARow: 0, openLaunch: null };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) previous = JSON.parse(raw) as GuardState;
  } catch {
    // Unreadable guard record — treat as a clean start.
  }

  let failedInARow = previous.failedInARow;
  if (previous.openLaunch) {
    failedInARow += 1;
    previousLaunchSummary = summarizeLaunch(previous.openLaunch);
    const last = previous.openLaunch.checkpoints[previous.openLaunch.checkpoints.length - 1];
    logDiagnostic('Previous launch never finished starting.', {
      startedAt: new Date(previous.openLaunch.startedAt).toISOString(),
      lastStepReached: last?.name ?? 'launch',
      steps: previous.openLaunch.checkpoints.map(c => `${c.name}@${c.atMs}ms`).join(', '),
      failedLaunchesInARow: failedInARow,
    });
  }

  state = { failedInARow, openLaunch: { startedAt: Date.now(), checkpoints: [{ name: 'launch', atMs: 0 }] } };
  save();
  return failedInARow;
}

export function checkpoint(name: string): void {
  const launch = state.openLaunch;
  if (!launch) return;
  launch.checkpoints.push({ name, atMs: Date.now() - launch.startedAt });
  noteForHangReport(`step: ${name}`);
  save();
}

export function resetFailureCount(): void {
  state.failedInARow = 0;
  save();
}

let stableScheduled = false;

// Closes this launch as good once a timer set now fires roughly on time —
// i.e. the JS thread is actually free, not just that something rendered.
// 10 s, not less: the reported freeze set in right after the first screen
// appeared (while sign-in and trip detection start up), so a shorter window
// could close a launch as good just before it froze.
export function markStableWhenResponsive(delayMs = 10_000): void {
  if (stableScheduled) return;
  stableScheduled = true;
  const scheduledAt = Date.now();
  setTimeout(() => {
    const lateBy = Date.now() - scheduledAt - delayMs;
    if (state.openLaunch) {
      checkpoint(`responsive (timer late ${lateBy}ms)`);
    }
    state = { failedInARow: 0, openLaunch: null };
    save();
  }, delayMs);
}
