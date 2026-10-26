jest.mock('../src/api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));

import client from '../src/api/client';
import { rewardsApi } from '../src/api/endpoints/rewards';
import { formatRewardPoints } from '../src/utils/rewardFormat';

const baseDto = {
  year_month: '2026-10', total_distance_km: 400, trip_count: 20, monthly_reward_score: 78, monthly_points: 778,
  monthly_phone_subscore: 90, meets_eligibility: true, eligibility_gap: { km_still_needed: 0, trips_still_needed: 0 },
  status: 'silver', cash_reward_cents: 700, gold_streak_months: 0, streak_bonus_cents: 0, total_reward_cents: 700,
  lifetime_earned_cents: 1400, lifetime_redeemed_cents: 0, balance_cents: 1400,
  thresholds: { bronze: 600, silver: 700, gold: 850 }, progress: { next_status: 'gold', points_to_next: 72 },
  phone_blocks_gold: false,
};

describe('Rewards Summary in points', () => {
  it('formats points, never money', () => {
    expect(formatRewardPoints(778)).toBe('778 pts');
    expect(formatRewardPoints(2231)).toBe('2,231 pts');
    expect(formatRewardPoints(0)).toBe('0 pts');
    expect(formatRewardPoints(null)).toBe('—');
  });

  it('reads the lifetime/redeemed/balance points from the backend', async () => {
    (client.get as jest.Mock).mockResolvedValue({
      data: { ...baseDto, lifetime_earned_points: 2231, lifetime_redeemed_points: 0, balance_points: 2231 },
    });
    const m = await rewardsApi.monthly();
    expect([m.monthlyPoints, m.lifetimeEarnedPoints, m.lifetimeRedeemedPoints, m.balancePoints]).toEqual([778, 2231, 0, 2231]);
  });

  it('shows "—" instead of a wrong number with a backend that does not send them yet', async () => {
    (client.get as jest.Mock).mockResolvedValue({ data: baseDto });
    const m = await rewardsApi.monthly();
    expect(formatRewardPoints(m.balancePoints)).toBe('—');
  });
});
