import EncryptedStorage from 'react-native-encrypted-storage';

const TOKEN_KEY = 'maud_auth_token';

export async function saveToken(token: string): Promise<void> {
  try {
    await EncryptedStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Keychain/Keystore write failed — token stays in memory for this
    // session only, user will need to log in again on next cold start.
  }
}

export async function loadToken(): Promise<string | null> {
  try {
    return await EncryptedStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
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
