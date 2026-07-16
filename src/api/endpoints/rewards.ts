import client from '../client';
import type { MonthlyRewardSummary, RewardStatus } from '../../types/reward.types';

interface MonthlyRewardDto {
  year_month: string;
  total_distance_km: number;
  trip_count: number;
  monthly_reward_score: number;
  monthly_points: number;
  monthly_phone_subscore: number;
  meets_eligibility: boolean;
  eligibility_gap: { km_still_needed: number; trips_still_needed: number };
  status: RewardStatus;
  cash_reward_cents: number;
  gold_streak_months: number;
  streak_bonus_cents: number;
  total_reward_cents: number;
  thresholds: { bronze: number; silver: number; gold: number };
  progress: { next_status: RewardStatus | null; points_to_next: number | null };
  phone_blocks_gold: boolean;
}

function fromDto(dto: MonthlyRewardDto): MonthlyRewardSummary {
  return {
    yearMonth: dto.year_month,
    totalDistanceKm: dto.total_distance_km,
    tripCount: dto.trip_count,
    monthlyRewardScore: dto.monthly_reward_score,
    monthlyPoints: dto.monthly_points,
    monthlyPhoneSubscore: dto.monthly_phone_subscore,
    meetsEligibility: dto.meets_eligibility,
    eligibilityGap: {
      kmStillNeeded: dto.eligibility_gap.km_still_needed,
      tripsStillNeeded: dto.eligibility_gap.trips_still_needed,
    },
    status: dto.status,
    cashRewardCents: dto.cash_reward_cents,
    goldStreakMonths: dto.gold_streak_months,
    streakBonusCents: dto.streak_bonus_cents,
    totalRewardCents: dto.total_reward_cents,
    thresholds: dto.thresholds,
    progress: {
      nextStatus: dto.progress.next_status,
      pointsToNext: dto.progress.points_to_next,
    },
    phoneBlocksGold: dto.phone_blocks_gold,
  };
}

export const rewardsApi = {
  monthly: async (month?: string) => {
    const res = await client.get<MonthlyRewardDto>('/rewards/monthly', {
      params: month ? { month } : undefined,
    });
    return fromDto(res.data);
  },
};
