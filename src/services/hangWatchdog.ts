import { NativeModules } from 'react-native';

// JS side of the native freeze watchdog (HangWatchdogModule.kt): while the
// app is on screen it notices when the JS thread or the native-modules thread
// stops answering and writes their stack traces, with the last steps noted
// here, to a file that the next start moves into the Diagnostics log.
// Android only; everything here is a no-op where the module doesn't exist.

interface HangWatchdogNative {
  install(): boolean;
  note(text: string): boolean;
  takeReports(): Promise<string | null>;
}

const native = NativeModules.MaudHangWatchdog as HangWatchdogNative | undefined;

// Reports are collected at startup before anything else loads; a native
// side that doesn't answer must not hold startup.
const TAKE_REPORTS_TIMEOUT_MS = 1500;

export function installHangWatchdog(): void {
  try {
    native?.install();
  } catch {
    // Diagnostics only.
  }
}

// Synchronous and memory-only on the native side, so it is cheap enough for
// every Redux action and still works when the native-modules thread hangs.
export function noteForHangReport(text: string): void {
  if (!native) return;
  try {
    native.note(text);
  } catch {
    // Diagnostics only.
  }
}

export async function takeHangReports(): Promise<string | null> {
  if (!native) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), TAKE_REPORTS_TIMEOUT_MS);
    });
    return await Promise.race([native.takeReports(), timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
