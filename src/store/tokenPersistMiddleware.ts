import type { Middleware } from '@reduxjs/toolkit';
import { login, register, refreshToken, logout } from './slices/authSlice';
import { saveToken, clearToken } from '../services/secureTokenStorage';

// Mirrors the auth token to encrypted storage (Keychain/Keystore) whenever it
// changes, keeping the side effect in one place instead of every call site
// that dispatches these actions.
export const tokenPersistMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);

  if (
    login.fulfilled.match(action) ||
    register.fulfilled.match(action) ||
    refreshToken.fulfilled.match(action)
  ) {
    saveToken(action.payload);
  } else if (logout.match(action)) {
    clearToken();
  }

  return result;
};
