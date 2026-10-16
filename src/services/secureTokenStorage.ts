import EncryptedStorage from 'react-native-encrypted-storage';
import { logDiagnostic } from './diagnosticsLog';

const TOKEN_KEY = 'maud_auth_token';

export async function saveToken(token: string): Promise<void> {
  try {
    await EncryptedStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Keychain/Keystore write failed — token stays in memory for this
    // session only, user will need to log in again on next cold start.
  }
}

// Reading the saved login must never hold the app at the Welcome screen.
// Real failure: the Keystore-backed store stopped answering, and every start
// waited on it forever (force stop didn't help; only a reinstall did). After
// this long the app goes on as "not logged in" — the user can log in again.
export const LOAD_TOKEN_TIMEOUT_MS = 4000;

export async function loadToken(): Promise<string | null> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), LOAD_TOKEN_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([EncryptedStorage.getItem(TOKEN_KEY), timeout]);
    if (result === 'timeout') {
      logDiagnostic('Saved login could not be read in time — continuing as logged out.', {
        waitedMs: LOAD_TOKEN_TIMEOUT_MS,
      });
      return null;
    }
    const tookMs = Date.now() - startedAt;
    if (tookMs > 1500) logDiagnostic('Saved login was slow to read.', { tookMs });
    return result ?? null;
  } catch (err) {
    logDiagnostic('Saved login could not be read.', { message: (err as Error)?.message ?? String(err) });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function clearToken(): Promise<void> {
  try {
    await EncryptedStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do — worst case a stale token lingers in Keychain/Keystore
    // until the next successful saveToken overwrites it.
  }
}
