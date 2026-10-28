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

import { earnedPointsThisMonth, pendingPointsNote, qualifyMessage } from '../src/utils/rewardFormat';

describe('points are earned only once the month qualifies (min miles and trips)', () => {
  // The screenshot case 28 Oct 2026: 602 points, 93 miles and 5 trips short.
  const notQualified = {
    monthlyPoints: 602, meetsEligibility: false,
    eligibilityGap: { kmStillNeeded: 149.3, tripsStillNeeded: 5 },
  };

  it('shows 0 earned and the 602 as pending before qualifying', () => {
    expect(earnedPointsThisMonth(notQualified)).toBe(0);
    expect(earnedPointsThisMonth({ ...notQualified, monthlyPointsEarned: 0 })).toBe(0);
    expect(pendingPointsNote(notQualified)).toBe('602 pts pending — earned once you qualify this month');
  });

  it('counts the points once qualified', () => {
    const qualified = { ...notQualified, meetsEligibility: true, eligibilityGap: { kmStillNeeded: 0, tripsStillNeeded: 0 } };
    expect(earnedPointsThisMonth(qualified)).toBe(602);
    expect(earnedPointsThisMonth({ ...qualified, monthlyPointsEarned: 602 })).toBe(602);
    expect(pendingPointsNote(qualified)).toBeNull();
    expect(qualifyMessage(qualified, true)).toBeNull();
  });

  it('says what is missing, in the driver\'s units', () => {
    expect(qualifyMessage(notQualified, true))
      .toBe('Drive 93 more miles and complete 5 more trips this month to start earning points.');
    expect(qualifyMessage(notQualified, false))
      .toBe('Drive 150 more km and complete 5 more trips this month to start earning points.');
    expect(qualifyMessage({ ...notQualified, eligibilityGap: { kmStillNeeded: 0, tripsStillNeeded: 1 } }, true))
      .toBe('Complete 1 more trip this month to start earning points.');
  });

  it('shows no pending note for a month with no points yet', () => {
    expect(pendingPointsNote({ monthlyPoints: 0, meetsEligibility: false })).toBeNull();
  });
});
