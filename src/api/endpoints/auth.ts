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

  // Mobile-only 6-digit-code forgot-password flow (the web app uses a
  // separate link-based flow) — both PUBLIC_ACCESS, no auth header needed.
  requestPasswordResetCode: (email: string) =>
    client.post<{ status: string }>('/password-reset/request', { email }),

  changePasswordWithCode: (email: string, code: string, newPassword: string) =>
    client.post<{ status: string }>('/password-reset/change', {
      email,
      code,
      new_password: newPassword,
    }),
};
