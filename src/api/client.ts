import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { API_BASE_URL, AUTH_HEADER } from '../utils/constants';
import { isTokenExpired } from '../utils/helpers';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

let tokenGetter: (() => string | null) | null = null;
let tokenRefresher: (() => Promise<string | null>) | null = null;

export function configureClient(
  getToken: () => string | null,
  refreshToken: () => Promise<string | null>,
) {
  tokenGetter = getToken;
  tokenRefresher = refreshToken;
}

// Exposes the same token source to other axios instances (e.g. vgdClient.ts)
// that need the identical vehicle-scoped JWT this client already carries —
// VGD verifies against the same MAUD-API signer, so there's no separate
// token to fetch.
export function getSharedToken(): string | null {
  return tokenGetter ? tokenGetter() : null;
}

// One refresh at a time: at startup with an expired token every screen's
// first request needs one, and they all wait for the same answer instead of
// each sending its own /refresh.
let refreshInFlight: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  if (!tokenRefresher) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = tokenRefresher().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function getRefreshedSharedToken(): Promise<string | null> {
  return refreshOnce();
}

// The /refresh request itself carries the expired token on purpose (see
// endpoints/auth.ts) and must go out as it is. Sent through the expiry check
// below, it asked for a refresh, whose request asked for a refresh, and so on
// forever without ever reaching the network — all promise callbacks, so the
// JS thread never got a moment for anything else. Real failure: the first
// start more than a day (the token's lifetime) after logging in froze right
// after the Welcome screen, every time; "Reset local data" kept the login, so
// only a reinstall (= logging in again) helped.
export const SKIP_TOKEN_REFRESH_HEADER = 'X-Maud-Skip-Token-Refresh';

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.headers.has(SKIP_TOKEN_REFRESH_HEADER)) {
    config.headers.delete(SKIP_TOKEN_REFRESH_HEADER);
    return config;
  }
  if (!tokenGetter) return config;

  let token = tokenGetter();

  if (token && isTokenExpired(token) && tokenRefresher) {
    token = await refreshOnce();
  }

  if (token) {
    config.headers[AUTH_HEADER] = `Bearer ${token}`;
  }

  return config;
});

client.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const status = error?.response?.status;
    const errStatus = error?.response?.data?.status;
    return Promise.reject({ status, errStatus, message: error.message });
  },
);

export default client;
