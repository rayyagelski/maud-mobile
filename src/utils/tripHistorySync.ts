import type { Trip } from '../types/trip.types';
import type { VgdTripSummary } from '../types/vgd.types';
import type { TripRewardHistoryEntry } from '../api/endpoints/trips';

// Synthesizes a local Trip record from a VGD trip summary — used to backfill
// trip history the app never recorded itself (reinstall/new device; see
// reconcileTripHistory below). VGD has no read-back for the raw
// point-by-point route (only accepts points on write), so route/events stay
// empty; summaryDistanceKm/summaryDurationSeconds/summaryAvgSpeedKmh carry
// what VGD's own aggregate analytics does have, for screens that would
// otherwise compute these from `route`.
//
// driverId is a known approximation: VGD only stores a coarse 3-slot family
// role (main/spouse/child), not a real driverId, and there's no stored
// mapping back from a specific 'spouse'/'child' occurrence to one of
// possibly several local Driver records — every restored trip is
// attributed to fallbackDriverId (the account owner) regardless of VGD's
// role field, same lossy-fold precedent as the forward mapping in
// vgdPointMapper.ts.
export function mapVgdSummaryToTrip(
  summary: VgdTripSummary,
  vehicleId: string,
  fallbackDriverId: string,
): Trip {
  const analytics = summary.analytics;
  const startTimeSec = analytics?.startTime ?? null;
  const endTimeSec = analytics?.endTime ?? null;
  const durationSeconds = startTimeSec != null && endTimeSec != null
    ? endTimeSec - startTimeSec
    : undefined;
  const distanceKm = analytics?.distance != null ? analytics.distance / 1000 : undefined;
  const avgSpeedKmh = durationSeconds != null && durationSeconds > 0 && distanceKm != null
    ? (distanceKm / durationSeconds) * 3600
    : undefined;

  return {
    // Deterministic (not generateId()'d) so re-running the sync never
    // creates a second copy of the same restored trip.
    id: `vgd-${summary.tripId}`,
    vehicleId,
    driverId: fallbackDriverId,
    // VgdTripPurpose ('business'|'private') is a strict subset of TripType
    // ('business'|'private'|'commute') — assignable as-is, no mapper needed.
    tripType: summary.purpose,
    transportMode: 'car',
    status: 'completed',
    startTime: startTimeSec != null ? startTimeSec * 1000 : Date.now(),
    endTime: endTimeSec != null ? endTimeSec * 1000 : undefined,
    route: [],
    events: [],
    source: 'vgd',
    summaryDistanceKm: distanceKm,
    summaryDurationSeconds: durationSeconds,
    summaryAvgSpeedKmh: avgSpeedKmh,
    vgdTripId: summary.tripId,
    vgdTripCreated: true,
  };
}

// Additive-only merge: never touches or removes an existing local trip
// (a locally-recorded trip is strictly richer — full route/events — than
// anything VGD's read-back can reconstruct), only adds a synthesized
// 'vgd'-source Trip for each VGD trip that has no corresponding local trip
// yet (matched by vgdTripId), so re-running this on every login only ever
// backfills gaps rather than duplicating or overwriting.
export function reconcileTripHistory(
  localTrips: Trip[],
  vgdSummaries: VgdTripSummary[],
  rewardEntries: TripRewardHistoryEntry[],
  vehicleId: string,
  fallbackDriverId: string,
): Trip[] {
  const knownVgdTripIds = new Set(
    localTrips.map(t => t.vgdTripId).filter((id): id is string => id != null),
  );
  const rewardsByExternalTripId = new Map(
    rewardEntries
      .filter((e): e is TripRewardHistoryEntry & { externalTripId: string } => e.externalTripId != null)
      .map(e => [e.externalTripId, e.reward]),
  );

  const restored = vgdSummaries
    .filter(summary => !knownVgdTripIds.has(summary.tripId))
    .map((summary) => {
      const trip = mapVgdSummaryToTrip(summary, vehicleId, fallbackDriverId);
      const reward = rewardsByExternalTripId.get(summary.tripId);
      return reward ? { ...trip, reward } : trip;
    });

  return [...localTrips, ...restored];
}
