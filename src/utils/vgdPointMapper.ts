import type { GpsPoint, TelematicsEvent, TripType } from '../types/trip.types';
import type { Driver } from '../types/driver.types';
import type { VgdDriverRole, VgdPoint, VgdTripPurpose } from '../types/vgd.types';
import { haversineDistanceKm } from './helpers';

// VGD's driver field is a fixed 3-slot family enum (main/spouse/child) —
// coarser than mobile's self/family/other model. 'other' has no true
// equivalent, so it folds to 'child' as the closest of the two non-primary
// slots, same lossy-fold precedent as vehicles.ts's ENGINE_TYPE_TO_FUEL_TYPE.
const DRIVER_ROLE_TO_VGD: Record<Driver['role'], VgdDriverRole> = {
  self: 'main',
  family: 'spouse',
  other: 'child',
};

export function mapDriverRoleToVgd(role: Driver['role']): VgdDriverRole {
  return DRIVER_ROLE_TO_VGD[role];
}

// Mobile only distinguishes business/private/commute; VGD has no "commute" —
// folds to 'private' since a commute is not a business trip.
export function mapTripTypeToVgdPurpose(tripType: TripType): VgdTripPurpose {
  return tripType === 'business' ? 'business' : 'private';
}

// VGD's `time` mirrors the old iOS app's whole-second unix timestamp
// convention (`String(Int(Date().timeIntervalSince1970))`); mobile's own
// timestamps are epoch-ms.
export function toVgdTimeSeconds(epochMs: number): number {
  return Math.round(epochMs / 1000);
}

export interface GpsPointMappingResult {
  vgdPoints: VgdPoint[];
  endingCumulativeDistanceKm: number;
}

// Converts a slice of not-yet-sent GPS fixes into VGD points, carrying
// forward cumulative distance (in metres, per the schema) across flush
// batches via startingCumulativeDistanceKm + previousPoint (the last point
// already sent in a prior batch, needed to compute the boundary delta
// correctly rather than under-counting the gap between batches).
export function mapGpsPointsToVgdPoints(
  points: GpsPoint[],
  startingCumulativeDistanceKm: number,
  previousPoint?: GpsPoint,
): GpsPointMappingResult {
  let cumulativeKm = startingCumulativeDistanceKm;
  let prior = previousPoint;

  const vgdPoints: VgdPoint[] = points.map((point) => {
    if (prior) cumulativeKm += haversineDistanceKm(prior, point);
    prior = point;

    return {
      gps: { lat: point.latitude, lon: point.longitude },
      time: toVgdTimeSeconds(point.timestamp),
      parameters: {
        ...(point.speed != null && { speed: point.speed }),
        ...(point.heading != null && { direction: Math.round(point.heading) }),
        distance: Math.round(cumulativeKm * 1000),
      },
    };
  });

  return { vgdPoints, endingCumulativeDistanceKm: cumulativeKm };
}

const EVENT_TYPE_TO_VGD_PARAMETER: Partial<Record<TelematicsEvent['type'], 'acceleration' | 'cornering'>> = {
  harsh_brake: 'acceleration',
  harsh_accel: 'acceleration',
  harsh_corner: 'cornering',
};

// Only harsh-brake/accel/corner events carry a value VGD's schema has a slot
// for (acceleration/cornering). speeding/road_type_change have no matching
// per-point parameter in the real schema, so they're not sent as separate
// VGD points — that data reaches VGD's aggregate `events` block server-side
// via vgd_analytics' own detection, not mobile-sourced per-point flags.
export function mapTelematicsEventsToVgdPoints(events: TelematicsEvent[]): VgdPoint[] {
  return events.reduce<VgdPoint[]>((acc, event) => {
    const parameterKey = EVENT_TYPE_TO_VGD_PARAMETER[event.type];
    if (!parameterKey || event.value == null) return acc;

    acc.push({
      gps: { lat: event.location.latitude, lon: event.location.longitude },
      time: toVgdTimeSeconds(event.timestamp),
      parameters: { [parameterKey]: event.value },
    });
    return acc;
  }, []);
}

// Tags the chronologically-last point of a flush batch as trip_end. If the
// final flush window had no new telemetry, synthesizes one from the last
// known GPS fix (never fabricates coordinates — if there's truly no GPS fix
// to fall back on, returns the batch unchanged and the caller skips the
// PATCH, same "don't fabricate" convention as the rest of this app).
export function markTripEnd(
  points: VgdPoint[],
  endTimeEpochMs: number,
  fallbackGpsPoint?: GpsPoint,
): VgdPoint[] {
  if (points.length === 0) {
    if (!fallbackGpsPoint) return [];
    return [{
      type: 'trip_end',
      gps: { lat: fallbackGpsPoint.latitude, lon: fallbackGpsPoint.longitude },
      time: toVgdTimeSeconds(endTimeEpochMs),
      parameters: {},
    }];
  }

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const last = sorted[sorted.length - 1];
  sorted[sorted.length - 1] = { ...last, type: 'trip_end' };
  return sorted;
}
