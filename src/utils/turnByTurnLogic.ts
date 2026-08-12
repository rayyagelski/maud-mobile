// Pure, unit-testable logic for voice-only turn-by-turn navigation guidance.
// Sensor/network/TTS side effects live in useTurnByTurnGuidance.

import { haversineMeters, type Coordinate } from './complianceAlertLogic';
import type { Maneuver } from '../services/here/hereRoutingClient';

// How far ahead of a maneuver to speak it.
export const TURN_ANNOUNCE_DISTANCE_METERS = 400;
// How far from the planned route counts as "no longer following it" —
// fixed-route v1 has no re-routing, so past this it just stops announcing.
export const OFF_ROUTE_DISTANCE_METERS = 150;

// Cumulative along-route distance (metres) to each coordinate in the planned
// route's own polyline — index-aligned with routeCoordinates. Built once per
// route; the same "index into the route polyline" basis Maneuver.
// distanceFromStartMeters was computed against (see hereRoutingClient.ts).
export function buildCumulativeRouteDistances(routeCoordinates: Coordinate[]): number[] {
  const cumulative: number[] = routeCoordinates.length > 0 ? [0] : [];
  for (let i = 1; i < routeCoordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(routeCoordinates[i - 1], routeCoordinates[i]));
  }
  return cumulative;
}

// Distance traveled, expressed against the *planned route's* geometry rather
// than raw accumulated GPS movement. advanceDistanceTraveled's raw approach
// drifts away from Maneuver.distanceFromStartMeters on any curve, GPS noise,
// or minor path deviation (the actual driven path length between two points
// is essentially never identical to the route polyline's length between the
// same two points) — over a real drive that drift is exactly what makes
// announcements fire early, late, or effectively skipped. Projecting each fix
// onto the nearest point of the same polyline the maneuver distances came
// from keeps the two locked together regardless of that drift.
export function distanceAlongRoute(
  position: Coordinate,
  routeCoordinates: Coordinate[],
  cumulativeDistances: number[],
): number {
  if (routeCoordinates.length === 0) return 0;
  let nearestIndex = 0;
  let nearestMeters = Infinity;
  for (let i = 0; i < routeCoordinates.length; i++) {
    const distance = haversineMeters(position, routeCoordinates[i]);
    if (distance < nearestMeters) {
      nearestMeters = distance;
      nearestIndex = i;
    }
  }
  return cumulativeDistances[nearestIndex] ?? 0;
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
  const previousDistance = announcedCount > 0 ? maneuvers[announcedCount - 1].distanceFromStartMeters : 0;
  // Cap the lookahead to the gap since the previous maneuver — a fixed
  // 400m window means closely-spaced maneuvers (common in cities/junctions)
  // all cross their announce threshold back-to-back while the driver is
  // still nowhere near the first one, so the guidance is already reading
  // out the second or third turn before the first is physically reached.
  // Never announce a maneuver before the driver has actually passed the
  // previous one.
  const announceDistance = Math.min(
    TURN_ANNOUNCE_DISTANCE_METERS,
    maneuver.distanceFromStartMeters - previousDistance,
  );
  if (distanceTraveledMeters >= maneuver.distanceFromStartMeters - announceDistance) {
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
