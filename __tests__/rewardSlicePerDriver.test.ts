import rewardReducer, { fetchRewardOverview } from '../src/store/slices/rewardSlice';
import type { MonthlyRewardSummary, RewardState } from '../src/types/reward.types';

const month = (points: number) => ({ monthlyPoints: points } as unknown as MonthlyRewardSummary);
const initial: RewardState = { currentMonth: null, previousMonth: null, isLoading: false, error: null };

function pending(state: RewardState, requestId: string, slot?: 'main' | 'spouse' | 'child') {
  return rewardReducer(state, { type: fetchRewardOverview.pending.type, meta: { requestId, arg: slot } });
}
function fulfilled(state: RewardState, requestId: string, slot: 'main' | 'spouse' | 'child' | undefined, points: number) {
  return rewardReducer(state, {
    type: fetchRewardOverview.fulfilled.type,
    meta: { requestId, arg: slot },
    payload: { currentMonth: month(points), previousMonth: null },
  });
}

describe('rewards per driver', () => {
  it('remembers whose months were loaded', () => {
    let s = pending(initial, 'r1', 'child');
    s = fulfilled(s, 'r1', 'child', 640);
    expect(s.driverSlot).toBe('child');
    expect(s.currentMonth?.monthlyPoints).toBe(640);
  });

  it('a slower, older request for another driver does not overwrite the newer one', () => {
    let s = pending(initial, 'old', 'main');
    s = pending(s, 'new', 'child');
    s = fulfilled(s, 'new', 'child', 640);
    s = fulfilled(s, 'old', 'main', 900);
    expect(s.driverSlot).toBe('child');
    expect(s.currentMonth?.monthlyPoints).toBe(640);
  });
});
