import client from '../client';
import type { MonthlyRewardSummary, RewardStatus } from '../../types/reward.types';
import type { VgdDriverRole } from '../../types/vgd.types';
import { normalizeAllowanceRows, type SpeedingAllowanceTables } from '../../utils/speedingAllowance';

interface MonthlyRewardDto {
  year_month: string;
  total_distance_km: number;
  trip_count: number;
  monthly_reward_score: number;
  monthly_points: number;
  monthly_points_earned?: number;
  monthly_phone_subscore: number;
  meets_eligibility: boolean;
  eligibility_gap: { km_still_needed: number; trips_still_needed: number };
  status: RewardStatus;
  cash_reward_cents: number;
  gold_streak_months: number;
  streak_bonus_cents: number;
  total_reward_cents: number;
  lifetime_earned_cents: number;
  lifetime_redeemed_cents: number;
  balance_cents: number;
  lifetime_earned_points?: number;
  lifetime_redeemed_points?: number;
  balance_points?: number;
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
    monthlyPointsEarned: dto.monthly_points_earned ?? null,
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
    lifetimeEarnedCents: dto.lifetime_earned_cents,
    lifetimeRedeemedCents: dto.lifetime_redeemed_cents,
    balanceCents: dto.balance_cents,
    lifetimeEarnedPoints: dto.lifetime_earned_points ?? null,
    lifetimeRedeemedPoints: dto.lifetime_redeemed_points ?? null,
    balancePoints: dto.balance_points ?? null,
    thresholds: dto.thresholds,
    progress: {
      nextStatus: dto.progress.next_status,
      pointsToNext: dto.progress.points_to_next,
    },
    phoneBlocksGold: dto.phone_blocks_gold,
  };
}

export const rewardsApi = {
  // driver = whose rewards (VGD slot); the backend defaults to the account holder.
  monthly: async (month?: string, driver?: VgdDriverRole) => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    if (driver) params.driver = driver;
    const res = await client.get<MonthlyRewardDto>('/rewards/monthly', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return fromDto(res.data);
  },

  // Fair-scoring tables (Sonata: Reward Settings) — see speedingAllowance.ts.
  speedingAllowances: async (): Promise<SpeedingAllowanceTables> => {
    const res = await client.get<Partial<SpeedingAllowanceTables>>('/rewards/speeding-allowances');
    return {
      mph: normalizeAllowanceRows(res.data.mph),
      kmh: normalizeAllowanceRows(res.data.kmh),
    };
  },
};
