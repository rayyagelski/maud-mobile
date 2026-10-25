import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { rewardsApi } from '../../api';
import type { RewardState } from '../../types/reward.types';
import type { VgdDriverRole } from '../../types/vgd.types';

const initialState: RewardState = {
  currentMonth: null,
  previousMonth: null,
  isLoading: false,
  error: null,
};

function previousYearMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// driverSlot = whose rewards (each family member has their own); omitted =
// the account holder.
export const fetchRewardOverview = createAsyncThunk(
  'rewards/fetchOverview',
  async (driverSlot: VgdDriverRole | undefined, { rejectWithValue }) => {
    try {
      const [currentMonth, previousMonth] = await Promise.all([
        rewardsApi.monthly(undefined, driverSlot),
        rewardsApi.monthly(previousYearMonth(), driverSlot).catch(() => null),
      ]);
      return { currentMonth, previousMonth };
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load rewards');
    }
  },
);

const rewardSlice = createSlice({
  name: 'rewards',
  initialState,
  reducers: {
    clearRewardError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRewardOverview.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        state.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchRewardOverview.fulfilled, (state, action) => {
        // An older request (e.g. for another driver) finishing late must
        // not overwrite the months the screen asked for since.
        if (action.meta.requestId !== state.latestRequestId) return;
        state.isLoading = false;
        state.currentMonth = action.payload.currentMonth;
        state.previousMonth = action.payload.previousMonth;
        state.driverSlot = action.meta.arg;
      })
      .addCase(fetchRewardOverview.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestRequestId) return;
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearRewardError } = rewardSlice.actions;
export default rewardSlice.reducer;
