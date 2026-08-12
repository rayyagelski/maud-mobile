import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../../api';
import { decodeJwt } from '../../utils/helpers';
import type { AuthState, JwtClaims } from '../../types/auth.types';

const initialState: AuthState = {
  token: null,
  claims: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await authApi.login(credentials);
      return res.data.token;
    } catch (err: unknown) {
      const e = err as { errStatus?: string; message?: string };
      return rejectWithValue(e.errStatus ?? 'Login failed');
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (
    data: { email: string; password: string; firstName: string; lastName: string },
    { rejectWithValue },
  ) => {
    try {
      const res = await authApi.register(data);
      return res.data.token;
    } catch (err: unknown) {
      const e = err as { errStatus?: string; message?: string };
      return rejectWithValue(e.errStatus ?? 'Registration failed');
    }
  },
);

export const refreshToken = createAsyncThunk(
  'auth/refresh',
  async (expiredToken: string, { rejectWithValue }) => {
    try {
      const res = await authApi.refresh(expiredToken);
      return res.data.token;
    } catch (err: unknown) {
      // client.ts's response interceptor rewrites errors to {status, errStatus,
      // message} — a genuine 401/403 from the server means the refresh token
      // itself is invalid/expired and the user really is logged out. Anything
      // else (no status at all, e.g. a timeout or dropped connection — common
      // mid-drive with patchy cellular signal) is not proof the session is
      // invalid; treat it as transient so the caller doesn't wipe a still-good
      // token over a network blip.
      const status = (err as { status?: number })?.status;
      const isAuthRejection = status === 401 || status === 403;
      return rejectWithValue({ message: 'Session expired', isAuthRejection });
    }
  },
);

export const requestPasswordReset = createAsyncThunk(
  'auth/requestPasswordReset',
  async (email: string, { rejectWithValue }) => {
    try {
      await authApi.requestPasswordResetCode(email);
      return true;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Could not send reset code');
    }
  },
);

export const changePasswordWithCode = createAsyncThunk(
  'auth/changePasswordWithCode',
  async (params: { email: string; code: string; newPassword: string }, { rejectWithValue }) => {
    try {
      await authApi.changePasswordWithCode(params.email, params.code, params.newPassword);
      return true;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'invalid_code');
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
      state.claims = decodeJwt(action.payload) as JwtClaims | null;
      state.isAuthenticated = true;
      state.error = null;
    },
    logout(state) {
      state.token = null;
      state.claims = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const handlePending = (state: AuthState) => {
      state.isLoading = true;
      state.error = null;
    };
    const handleFulfilled = (state: AuthState, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.token = action.payload;
      state.claims = decodeJwt(action.payload) as JwtClaims | null;
      state.isAuthenticated = true;
    };
    const handleRejected = (state: AuthState, action: PayloadAction<unknown>) => {
      state.isLoading = false;
      state.error = action.payload as string;
    };

    builder
      .addCase(login.pending, handlePending)
      .addCase(login.fulfilled, handleFulfilled)
      .addCase(login.rejected, handleRejected)
      .addCase(register.pending, handlePending)
      .addCase(register.fulfilled, handleFulfilled)
      .addCase(register.rejected, handleRejected)
      .addCase(refreshToken.fulfilled, handleFulfilled)
      .addCase(refreshToken.rejected, (state, action) => {
        const payload = action.payload as { isAuthRejection?: boolean } | undefined;
        // Only a confirmed 401/403 means the session is actually invalid — a
        // transient network failure leaves the existing token/claims in place
        // so the interceptor can just retry on the next call, and so trip
        // recording (gated on `claims` in useTripAutoDetection) doesn't get
        // torn down over a temporary connectivity gap mid-drive.
        if (payload?.isAuthRejection) {
          state.token = null;
          state.claims = null;
          state.isAuthenticated = false;
        }
      })
      .addCase(requestPasswordReset.pending, handlePending)
      .addCase(requestPasswordReset.fulfilled, (state) => { state.isLoading = false; })
      .addCase(requestPasswordReset.rejected, handleRejected)
      .addCase(changePasswordWithCode.pending, handlePending)
      .addCase(changePasswordWithCode.fulfilled, (state) => { state.isLoading = false; })
      .addCase(changePasswordWithCode.rejected, handleRejected);
  },
});

export const { setToken, logout, clearError } = authSlice.actions;
export default authSlice.reducer;
