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

export interface RouteMatch {
  distanceMeters: number;
  matchedIndex: number;
}

// Vertex-index window to search around the previously matched point, rather
// than the whole route. Bounds map-matching to a plausible neighborhood of
// the driver's actual progress, so a geometrically-closer vertex belonging to
// a different leg of the route (a parallel street, a nearby cul-de-sac arm, a
// loop's return leg — all common in the dense polylines HERE returns through
// subdivisions/communities) can't hijack the match just because it happens to
// be a few metres nearer than the correct vertex. On open roads this window
// is harmless since the correct vertex is already the unambiguous nearest
// one; it only matters where multiple route legs run close together.
// Forward-biased since driving only advances progress; a little backward
// slack absorbs GPS noise and minor backtracking (missed turn, reversing out
// of a driveway).
const MATCH_BACKWARD_SLACK_INDICES = 5;
const MATCH_FORWARD_WINDOW_INDICES = 80;

// Distance traveled, expressed against the *planned route's* geometry rather
// than raw accumulated GPS movement. advanceDistanceTraveled's raw approach
// drifts away from Maneuver.distanceFromStartMeters on any curve, GPS noise,
// or minor path deviation (the actual driven path length between two points
// is essentially never identical to the route polyline's length between the
// same two points) — over a real drive that drift is exactly what makes
// announcements fire early, late, or effectively skipped. Projecting each fix
// onto the nearest point of the same polyline the maneuver distances came
// from keeps the two locked together regardless of that drift.
//
// lastMatchedIndex anchors the search to a window around the previous fix's
// match (see MATCH_*_INDICES above) instead of searching the entire route on
// every fix — pass null only for the very first fix of a trip (or after
// re-acquiring from off-route), when there's no prior match to anchor to.
export function distanceAlongRoute(
  position: Coordinate,
  routeCoordinates: Coordinate[],
  cumulativeDistances: number[],
  lastMatchedIndex: number | null = null,
): RouteMatch {
  if (routeCoordinates.length === 0) return { distanceMeters: 0, matchedIndex: 0 };

  const searchStart = lastMatchedIndex == null
    ? 0
    : Math.max(0, lastMatchedIndex - MATCH_BACKWARD_SLACK_INDICES);
  const searchEnd = lastMatchedIndex == null
    ? routeCoordinates.length - 1
    : Math.min(routeCoordinates.length - 1, lastMatchedIndex + MATCH_FORWARD_WINDOW_INDICES);

  let nearestIndex = searchStart;
  let nearestMeters = Infinity;
  for (let i = searchStart; i <= searchEnd; i++) {
    const distance = haversineMeters(position, routeCoordinates[i]);
    if (distance < nearestMeters) {
      nearestMeters = distance;
      nearestIndex = i;
    }
  }
  return { distanceMeters: cumulativeDistances[nearestIndex] ?? 0, matchedIndex: nearestIndex };
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
