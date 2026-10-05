jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/diagnosticsLog', () => ({ logDiagnostic: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logDiagnostic } from '../src/services/diagnosticsLog';

// Fresh module per test — the guard keeps per-process state, like a real launch.
function loadGuard(): typeof import('../src/services/startupGuard') {
  let mod: typeof import('../src/services/startupGuard') | undefined;
  jest.isolateModules(() => { mod = require('../src/services/startupGuard'); });
  return mod as typeof import('../src/services/startupGuard');
}

async function flushWrites() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise<void>(r => setImmediate(r));
}

describe('startupGuard', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (logDiagnostic as jest.Mock).mockClear();
  });

  it('counts launches that never became responsive, and logs where they stopped', async () => {
    let guard = loadGuard();
    expect(await guard.beginLaunch()).toBe(0);
    guard.checkpoint('persisted state loaded');
    await flushWrites();

    // "Frozen" launch: never marked stable. Next launch sees it.
    guard = loadGuard();
    expect(await guard.beginLaunch()).toBe(1);
    expect(logDiagnostic).toHaveBeenCalledWith('Previous launch never finished starting.',
      expect.objectContaining({ lastStepReached: 'persisted state loaded', failedLaunchesInARow: 1 }));
    await flushWrites();

    guard = loadGuard();
    expect(await guard.beginLaunch()).toBe(2);
  });

  it('a responsive launch resets the count', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      let guard = loadGuard();
      await guard.beginLaunch();
      await flushWrites();
      guard = loadGuard();
      expect(await guard.beginLaunch()).toBe(1);

      guard.markStableWhenResponsive(10_000);
      jest.advanceTimersByTime(10_000);
      await flushWrites();

      guard = loadGuard();
      expect(await guard.beginLaunch()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resetFailureCount clears the count after recovery was offered', async () => {
    let guard = loadGuard();
    await guard.beginLaunch();
    await flushWrites();
    guard = loadGuard();
    await guard.beginLaunch();
    guard.resetFailureCount();
    await flushWrites();

    // This launch is still open (not yet responsive), so the next one counts
    // only it — not the earlier failures.
    guard = loadGuard();
    expect(await guard.beginLaunch()).toBe(1);
  });
});
