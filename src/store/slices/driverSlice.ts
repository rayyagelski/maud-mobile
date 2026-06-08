import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { driversApi } from '../../api';
import type { Driver, DriverState } from '../../types/driver.types';

const initialState: DriverState = {
  drivers: [],
  selectedDriver: null,
  isLoading: false,
  error: null,
};

export const fetchDrivers = createAsyncThunk(
  'drivers/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await driversApi.list();
      return res.data;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load drivers');
    }
  },
);

export const createDriver = createAsyncThunk(
  'drivers/create',
  async (data: Omit<Driver, 'id'>, { rejectWithValue }) => {
    try {
      const res = await driversApi.create(data);
      return res.data;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to add driver');
    }
  },
);

export const removeDriver = createAsyncThunk(
  'drivers/remove',
  async (driverId: string, { rejectWithValue }) => {
    try {
      await driversApi.remove(driverId);
      return driverId;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to remove driver');
    }
  },
);

const driverSlice = createSlice({
  name: 'drivers',
  initialState,
  reducers: {
    selectDriver(state, action: PayloadAction<Driver | null>) {
      state.selectedDriver = action.payload;
    },
    clearDriverError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDrivers.pending, (state) => { state.isLoading = true; })
      .addCase(fetchDrivers.fulfilled, (state, action: PayloadAction<Driver[]>) => {
        state.isLoading = false;
        state.drivers = action.payload;
        if (!state.selectedDriver && action.payload.length > 0) {
          state.selectedDriver = action.payload.find(d => d.isDefault) ?? action.payload[0];
        }
      })
      .addCase(fetchDrivers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(createDriver.fulfilled, (state, action: PayloadAction<Driver>) => {
        state.drivers.push(action.payload);
      })
      .addCase(removeDriver.fulfilled, (state, action: PayloadAction<string>) => {
        state.drivers = state.drivers.filter(d => d.id !== action.payload);
        if (state.selectedDriver?.id === action.payload) {
          state.selectedDriver = state.drivers[0] ?? null;
        }
      });
  },
});

export const { selectDriver, clearDriverError } = driverSlice.actions;
export default driverSlice.reducer;
