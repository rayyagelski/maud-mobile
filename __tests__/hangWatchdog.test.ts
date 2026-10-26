import { NativeModules } from 'react-native';

function load(native: unknown) {
  jest.resetModules();
  (NativeModules as Record<string, unknown>).MaudHangWatchdog = native;
  return require('../src/services/hangWatchdog') as typeof import('../src/services/hangWatchdog');
}

afterEach(() => {
  delete (NativeModules as Record<string, unknown>).MaudHangWatchdog;
  jest.useRealTimers();
});

describe('hang watchdog (JS side)', () => {
  it('does nothing without the native module (iOS, tests)', async () => {
    const w = load(undefined);
    expect(() => w.installHangWatchdog()).not.toThrow();
    expect(() => w.noteForHangReport('step: launch')).not.toThrow();
    await expect(w.takeHangReports()).resolves.toBeNull();
  });

  it('passes notes and reports through', async () => {
    const native = { install: jest.fn(), note: jest.fn(), takeReports: jest.fn().mockResolvedValue('=== App froze ===') };
    const w = load(native);
    w.installHangWatchdog();
    w.noteForHangReport('action: persist/REHYDRATE');
    expect(native.install).toHaveBeenCalled();
    expect(native.note).toHaveBeenCalledWith('action: persist/REHYDRATE');
    await expect(w.takeHangReports()).resolves.toBe('=== App froze ===');
  });

  it('never holds startup when the native side does not answer', async () => {
    jest.useFakeTimers();
    const w = load({ install: jest.fn(), note: jest.fn(), takeReports: () => new Promise(() => {}) });
    const result = w.takeHangReports();
    jest.advanceTimersByTime(1500);
    await expect(result).resolves.toBeNull();
  });

  it('swallows native errors', async () => {
    const w = load({
      install: () => { throw new Error('x'); },
      note: () => { throw new Error('x'); },
      takeReports: () => Promise.reject(new Error('x')),
    });
    expect(() => w.installHangWatchdog()).not.toThrow();
    expect(() => w.noteForHangReport('x')).not.toThrow();
    await expect(w.takeHangReports()).resolves.toBeNull();
  });
});
