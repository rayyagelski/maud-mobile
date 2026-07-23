import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { VGD_BASE_URL } from '../config/env';
import { AUTH_HEADER } from '../utils/constants';
import { isTokenExpired } from '../utils/helpers';
import { getSharedToken, getRefreshedSharedToken } from './client';

// Separate axios instance for the Vehicle Generated Data ingest API — a
// different service/base URL than the main MAUD backend, but reusing the
// exact same JWT (see getSharedToken) since VGD verifies against the same
// MAUD-API audience/signer.
const vgdClient = axios.create({
  baseURL: VGD_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

vgdClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  let token = getSharedToken();

  if (token && isTokenExpired(token)) {
    token = await getRefreshedSharedToken();
  }

  if (token) {
    config.headers[AUTH_HEADER] = `Bearer ${token}`;
  }

  return config;
});

vgdClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    const status = error?.response?.status;
    const errStatus = error?.response?.data?.status;
    return Promise.reject({ status, errStatus, message: error.message });
  },
);

export default vgdClient;
