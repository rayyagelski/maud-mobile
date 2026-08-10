// Pure, unit-testable logic for voice-only turn-by-turn navigation guidance.
// Sensor/network/TTS side effects live in useTurnByTurnGuidance.

import type { GpsPoint } from '../types/trip.types';
import { haversineDistanceKm, MIN_GPS_SEGMENT_KM } from './helpers';
import { haversineMeters, type Coordinate } from './complianceAlertLogic';
import type { Maneuver } from '../services/here/hereRoutingClient';

// How far ahead of a maneuver to speak it.
export const TURN_ANNOUNCE_DISTANCE_METERS = 400;
// How far from the planned route counts as "no longer following it" —
// fixed-route v1 has no re-routing, so past this it just stops announcing.
export const OFF_ROUTE_DISTANCE_METERS = 150;

// Advances a noise-floor-filtered running distance total, same anchor
// pattern as vgdPointMapper.ts's odometer accumulation — only counts a
// segment once it clears typical GPS positional error, so jitter while
// stationary (e.g. stopped at a light) doesn't creep the cursor forward.
export function advanceDistanceTraveled(
  anchor: GpsPoint | undefined,
  point: GpsPoint,
  cumulativeMeters: number,
): { anchor: GpsPoint; cumulativeMeters: number } {
  if (!anchor) return { anchor: point, cumulativeMeters };
  const segmentKm = haversineDistanceKm(anchor, point);
  if (segmentKm >= MIN_GPS_SEGMENT_KM) {
    return { anchor: point, cumulativeMeters: cumulativeMeters + segmentKm * 1000 };
  }
  return { anchor, cumulativeMeters };
}

// Maneuvers are ordered by increasing distanceFromStartMeters — the next one
// to announce is always the first not-yet-announced maneuver (by count),
// once its start has come within the announce window. Caller increments
// announcedCount itself once it actually speaks the returned maneuver.
export function nextManeuverToAnnounce(
  maneuvers: Maneuver[],
  distanceTraveledMeters: number,
  announcedCount: number,
): Maneuver | null {
  const maneuver = maneuvers[announcedCount];
  if (!maneuver) return null;
  if (distanceTraveledMeters >= maneuver.distanceFromStartMeters - TURN_ANNOUNCE_DISTANCE_METERS) {
    return maneuver;
  }
  return null;
}

// True once the current position is farther than thresholdMeters from every
// point on the planned route.
export function isOffRoute(
  position: Coordinate,
  routeCoordinates: Coordinate[],
  thresholdMeters = OFF_ROUTE_DISTANCE_METERS,
): boolean {
  if (routeCoordinates.length === 0) return false;
  let nearestMeters = Infinity;
  for (const point of routeCoordinates) {
    const distance = haversineMeters(position, point);
    if (distance < nearestMeters) nearestMeters = distance;
  }
  return nearestMeters > thresholdMeters;
}
