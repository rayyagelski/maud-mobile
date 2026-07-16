import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { serviceRecordsApi } from '../../api';
import type { ServiceRecord, ServiceRecordState } from '../../types/serviceRecord.types';

const initialState: ServiceRecordState = {
  records: [],
  selectedRecord: null,
  isLoading: false,
  error: null,
};

export const fetchServiceRecords = createAsyncThunk(
  'serviceRecords/fetchAll',
  async (vehicleId: string, { rejectWithValue }) => {
    try {
      return await serviceRecordsApi.list(vehicleId);
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load service records');
    }
  },
);

export const fetchServiceRecord = createAsyncThunk(
  'serviceRecords/fetchOne',
  async (params: { vehicleId: string; id: string | number }, { rejectWithValue }) => {
    try {
      return await serviceRecordsApi.get(params.vehicleId, params.id);
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load service record');
    }
  },
);

const serviceRecordSlice = createSlice({
  name: 'serviceRecords',
  initialState,
  reducers: {
    clearServiceRecordError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchServiceRecords.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchServiceRecords.fulfilled, (state, action: PayloadAction<ServiceRecord[]>) => {
        state.isLoading = false;
        state.records = action.payload;
      })
      .addCase(fetchServiceRecords.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchServiceRecord.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchServiceRecord.fulfilled, (state, action: PayloadAction<ServiceRecord>) => {
        state.isLoading = false;
        state.selectedRecord = action.payload;
        const idx = state.records.findIndex(r => r.id === action.payload.id);
        if (idx >= 0) state.records[idx] = action.payload;
        else state.records.push(action.payload);
      })
      .addCase(fetchServiceRecord.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearServiceRecordError } = serviceRecordSlice.actions;
export default serviceRecordSlice.reducer;
