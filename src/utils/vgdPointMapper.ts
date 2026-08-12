import type { GpsPoint, TelematicsEvent, TripType } from '../types/trip.types';
import type { Driver } from '../types/driver.types';
import type { VgdDriverRole, VgdPoint, VgdTripPurpose } from '../types/vgd.types';
import { haversineDistanceKm, MIN_GPS_SEGMENT_KM } from './helpers';
import { MS2_PER_G } from './constants';

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
  let anchor = previousPoint;

  const vgdPoints: VgdPoint[] = points.map((point) => {
    if (anchor) {
      const segmentKm = haversineDistanceKm(anchor, point);
      if (segmentKm >= MIN_GPS_SEGMENT_KM) {
        cumulativeKm += segmentKm;
        anchor = point;
      }
      // else: within GPS noise floor — anchor stays put, no distance added.
    } else {
      anchor = point;
    }

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
//
// event.location is the same GpsPoint captured at classification time (see
// useHarshEventTracker.ts), so speed/direction are real readings, not
// fabricated — including them here is what makes a cornering event's detail
// card carry the same context (speed, heading) as a braking/acceleration
// event's, instead of only the single metric value. Distance/odometer are
// deliberately still omitted: unlike speed/direction, cumulative distance
// isn't available at this call site (only mapGpsPointsToVgdPoints tracks
// it), and approximating it here risks a wrong number being worse than none.
//
// event.value is computed on-device in m/s² (harshEventDetector.ts), but
// VGD's acceleration/cornering parameters are g-force ("gs" per the old iOS
// app's Metric, which fed CoreMotion's already-g-scaled CMAcceleration
// straight through) — the same unit vgd_analytics' gForcePointsFilters.js
// thresholds (0.5g/0.35g/0.4g) are written against. Divide by MS2_PER_G here
// so the value actually stored/displayed as "g-force" is one, instead of a
// raw m/s² number ~9.8x too large.
export function mapTelematicsEventsToVgdPoints(events: TelematicsEvent[]): VgdPoint[] {
  return events.reduce<VgdPoint[]>((acc, event) => {
    const parameterKey = EVENT_TYPE_TO_VGD_PARAMETER[event.type];
    if (!parameterKey || event.value == null) return acc;

    acc.push({
      gps: { lat: event.location.latitude, lon: event.location.longitude },
      time: toVgdTimeSeconds(event.timestamp),
      parameters: {
        [parameterKey]: event.value / MS2_PER_G,
        ...(event.location.speed != null && { speed: event.location.speed }),
        ...(event.location.heading != null && { direction: Math.round(event.location.heading) }),
      },
    });
    return acc;
  }, []);
}

// Tags the chronologically-first point of the trip's first-ever flush batch
// as trip_start — vgd_analytics' tripAnalytics.js requires exactly one such
// point to compute anything at all (analyzeTrip crashes outright without
// one, since it reads startPoint.time unconditionally). Caller only invokes
// this on the very first flush (vgdSentRouteCount is still 0), since that's
// the only batch that can contain the trip's true first point.
export function markTripStart(points: VgdPoint[]): VgdPoint[] {
  if (points.length === 0) return points;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  sorted[0] = { ...sorted[0], type: 'trip_start' };
  return sorted;
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
