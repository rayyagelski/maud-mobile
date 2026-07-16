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
      return rejectWithValue('Session expired');
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
      .addCase(refreshToken.rejected, (state) => {
        state.token = null;
        state.claims = null;
        state.isAuthenticated = false;
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
