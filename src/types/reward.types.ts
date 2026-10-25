import type { VgdDriverRole } from './vgd.types';

export type RewardStatus = 'none' | 'bronze' | 'silver' | 'gold';

export interface MonthlyRewardSummary {
  yearMonth: string; // YYYY-MM
  totalDistanceKm: number;
  tripCount: number;
  monthlyRewardScore: number;
  monthlyPoints: number;
  monthlyPhoneSubscore: number;
  meetsEligibility: boolean;
  eligibilityGap: { kmStillNeeded: number; tripsStillNeeded: number };
  status: RewardStatus;
  cashRewardCents: number;
  goldStreakMonths: number;
  streakBonusCents: number;
  totalRewardCents: number;
  lifetimeEarnedCents: number;
  lifetimeRedeemedCents: number;
  balanceCents: number;
  thresholds: { bronze: number; silver: number; gold: number };
  progress: { nextStatus: RewardStatus | null; pointsToNext: number | null };
  phoneBlocksGold: boolean;
}

export interface RewardState {
  currentMonth: MonthlyRewardSummary | null;
  previousMonth: MonthlyRewardSummary | null;
  // Whose months these are (rewards are per driver; unset = account holder).
  driverSlot?: VgdDriverRole;
  // Only the latest request's answer is kept (screens can ask for different drivers).
  latestRequestId?: string;
  isLoading: boolean;
  error: string | null;
}
