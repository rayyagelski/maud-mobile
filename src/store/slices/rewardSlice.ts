import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { rewardsApi } from '../../api';
import type { MonthlyRewardSummary, RewardState } from '../../types/reward.types';

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

export const fetchRewardOverview = createAsyncThunk(
  'rewards/fetchOverview',
  async (_, { rejectWithValue }) => {
    try {
      const [currentMonth, previousMonth] = await Promise.all([
        rewardsApi.monthly(),
        rewardsApi.monthly(previousYearMonth()).catch(() => null),
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
      .addCase(fetchRewardOverview.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchRewardOverview.fulfilled, (state, action: PayloadAction<{
        currentMonth: MonthlyRewardSummary;
        previousMonth: MonthlyRewardSummary | null;
      }>) => {
        state.isLoading = false;
        state.currentMonth = action.payload.currentMonth;
        state.previousMonth = action.payload.previousMonth;
      })
      .addCase(fetchRewardOverview.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearRewardError } = rewardSlice.actions;
export default rewardSlice.reducer;
