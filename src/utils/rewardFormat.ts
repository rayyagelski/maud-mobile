import type { MonthlyRewardSummary } from '../types/reward.types';
import { kmToMiles } from './helpers';

// Rewards Summary amounts are reward points, not money (product decision
// 2026-10-26: no $ amounts; rewards are never paid out as cash).
export function formatRewardPoints(points: number | null | undefined): string {
  return points != null ? `${Math.round(points).toLocaleString('en-US')} pts` : '—';
}

// Points are earned only once the month's minimum distance and trips are
// reached (Reward Settings, default 200 km / 10 trips; product rule
// 2026-10-28). Before that the month's points are pending — showing them as
// "earned" next to "Drive 93 more miles to qualify" contradicted itself.
export function earnedPointsThisMonth(m: Pick<MonthlyRewardSummary, 'monthlyPoints' | 'meetsEligibility'>
  & { monthlyPointsEarned?: number | null }): number {
  if (m.monthlyPointsEarned != null) return m.monthlyPointsEarned;
  return m.meetsEligibility ? m.monthlyPoints : 0;
}

// "602 pts pending — earned once you qualify this month", or null.
export function pendingPointsNote(m: Pick<MonthlyRewardSummary, 'monthlyPoints' | 'meetsEligibility'>): string | null {
  if (m.meetsEligibility || !(m.monthlyPoints > 0)) return null;
  return `${formatRewardPoints(m.monthlyPoints)} pending — earned once you qualify this month`;
}

// What's still missing this month, e.g. "Drive 93 more miles and complete 5
// more trips this month to start earning points." Null once qualified.
export function qualifyMessage(
  m: Pick<MonthlyRewardSummary, 'meetsEligibility' | 'eligibilityGap'>,
  isImperial: boolean,
): string | null {
  if (m.meetsEligibility) return null;
  const parts: string[] = [];
  const km = m.eligibilityGap.kmStillNeeded;
  if (km > 0) {
    const remaining = Math.ceil(isImperial ? kmToMiles(km) : km);
    parts.push(`drive ${remaining} more ${isImperial ? 'miles' : 'km'}`);
  }
  const trips = m.eligibilityGap.tripsStillNeeded;
  if (trips > 0) parts.push(`complete ${trips} more trip${trips === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  const text = parts.join(' and ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} this month to start earning points.`;
}
