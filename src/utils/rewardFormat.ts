// Rewards Summary amounts are reward points, not money (product decision
// 2026-10-26: no $ amounts; rewards are never paid out as cash).
export function formatRewardPoints(points: number | null | undefined): string {
  return points != null ? `${Math.round(points).toLocaleString('en-US')} pts` : '—';
}
