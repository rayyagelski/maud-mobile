import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { vehiclesApi } from '../../api';
import { setToken } from './authSlice';
import type { Vehicle, VehicleState } from '../../types/vehicle.types';

const initialState: VehicleState = {
  vehicles: [],
  selectedVehicle: null,
  isLoading: false,
  error: null,
};

export const fetchVehicles = createAsyncThunk(
  'vehicles/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await vehiclesApi.list();
      return res.data;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load vehicles');
    }
  },
);

export const selectVehicle = createAsyncThunk(
  'vehicles/select',
  async (vehicleId: string, { dispatch, rejectWithValue }) => {
    try {
      const res = await vehiclesApi.select(vehicleId);
      dispatch(setToken(res.data.token));
      return vehicleId;
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to select vehicle');
    }
  },
);

const vehicleSlice = createSlice({
  name: 'vehicles',
  initialState,
  reducers: {
    clearVehicleError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVehicles.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchVehicles.fulfilled, (state, action: PayloadAction<Vehicle[]>) => {
        state.isLoading = false;
        state.vehicles = action.payload;
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(selectVehicle.fulfilled, (state, action: PayloadAction<string>) => {
        state.selectedVehicle = state.vehicles.find(v => v.id === action.payload) ?? null;
      });
  },
});

export const { clearVehicleError } = vehicleSlice.actions;
export default vehicleSlice.reducer;
