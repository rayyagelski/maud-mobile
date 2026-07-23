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

export async function getRefreshedSharedToken(): Promise<string | null> {
  return tokenRefresher ? tokenRefresher() : null;
}

client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (!tokenGetter) return config;

  let token = tokenGetter();

  if (token && isTokenExpired(token) && tokenRefresher) {
    token = await tokenRefresher();
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
