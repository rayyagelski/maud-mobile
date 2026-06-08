import client from '../client';
import type { LoginRequest, LoginResponse } from '../../types/auth.types';

export const authApi = {
  login: (data: LoginRequest) =>
    client.post<LoginResponse>('/login', { username: data.email, password: data.password }),

  refresh: (expiredToken: string) =>
    client.post<LoginResponse>('/refresh', null, {
      headers: { 'X-Token-Auth': `Bearer ${expiredToken}` },
    }),

  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    client.post<LoginResponse>('/register', data),
};
