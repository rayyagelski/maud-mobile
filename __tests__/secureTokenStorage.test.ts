const mockGetItem = jest.fn();
jest.mock('react-native-encrypted-storage', () => ({
  __esModule: true,
  default: { getItem: (...args: unknown[]) => mockGetItem(...args), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('../src/services/diagnosticsLog', () => ({ logDiagnostic: jest.fn() }));

import { loadToken, LOAD_TOKEN_TIMEOUT_MS } from '../src/services/secureTokenStorage';
import { logDiagnostic } from '../src/services/diagnosticsLog';

describe('loadToken', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the saved token', async () => {
    mockGetItem.mockResolvedValueOnce('abc');
    await expect(loadToken()).resolves.toBe('abc');
  });

  it('never leaves the app waiting: a store that does not answer counts as logged out', async () => {
    // The real failure: the Keystore-backed store stopped answering and the
    // app sat at the Welcome screen on every start.
    jest.useFakeTimers();
    mockGetItem.mockReturnValueOnce(new Promise(() => {}));
    const result = loadToken();
    jest.advanceTimersByTime(LOAD_TOKEN_TIMEOUT_MS);
    await expect(result).resolves.toBeNull();
    expect(logDiagnostic).toHaveBeenCalledWith(
      'Saved login could not be read in time — continuing as logged out.', expect.anything(),
    );
  });

  it('treats a read error as logged out', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('AEADBadTagException'));
    await expect(loadToken()).resolves.toBeNull();
  });
});
