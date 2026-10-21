jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';

function loadLog(): typeof import('../src/services/diagnosticsLog') {
  let mod: typeof import('../src/services/diagnosticsLog') | undefined;
  jest.isolateModules(() => { mod = require('../src/services/diagnosticsLog'); });
  return mod as typeof import('../src/services/diagnosticsLog');
}

describe('getDiagnosticsReport', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns the log saved by an earlier launch, oldest first', async () => {
    // What a frozen launch leaves behind; the recovery prompt runs in a new
    // process, before anything else has loaded the log.
    await AsyncStorage.setItem('diagnosticsLog', JSON.stringify([
      { timestamp: 2000, message: 'Previous launch never finished starting.', data: { lastStepReached: 'ui rendered' } },
      { timestamp: 1000, message: 'Location library database cleared.' },
    ]));
    const report = await loadLog().getDiagnosticsReport();
    const lines = report.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Location library database cleared.');
    expect(lines[1]).toContain('Previous launch never finished starting. {"lastStepReached":"ui rendered"}');
  });

  it('is empty when nothing was logged', async () => {
    expect(await loadLog().getDiagnosticsReport()).toBe('');
  });
});
