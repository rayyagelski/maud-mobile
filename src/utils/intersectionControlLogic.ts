// Turn instructions at traffic lights and stop signs ("At the traffic light,
// turn right onto …"), like Apple Maps. HERE's routing response has no
// traffic-light/stop-sign data (checked against the v8 API spec), so they
// come from OpenStreetMap (intersectionControlClient.ts): nodes tagged
// highway=traffic_signals / highway=stop. Pure logic here.

import { haversineMeters, type Coordinate } from './complianceAlertLogic';
import type { Maneuver } from '../services/here/hereRoutingClient';

export type IntersectionControl = 'traffic_signals' | 'stop' | 'all_way_stop';

export interface ControlNode {
  latitude: number;
  longitude: number;
  kind: 'traffic_signals' | 'stop';
  allWay?: boolean;
}

// Only real turns at a junction get the phrase — not depart/arrive, ramps,
// "keep left", roundabouts or "continue".
const TURN_ACTIONS = new Set(['turn', 'uTurn']);

// A traffic light is mapped on the junction node itself (or on each
// approach, a few metres before it).
export const SIGNAL_MAX_METERS_FROM_TURN = 30;
// A stop sign is mapped on the approaching road, before the junction. It
// must be on OUR approach (on the route, before the turn) — a stop sign on
// the cross street means the other traffic stops, not us.
export const STOP_MAX_METERS_BEFORE_TURN = 40;
// Stop signs are mapped on the road line itself; a few metres covers GPS-
// grade mapping. The junction point belongs to every road through it, so a
// sign must be clearly before it on our approach (not projected onto the
// junction from a cross street).
export const STOP_MAX_METERS_FROM_ROUTE = 6;
export const STOP_MIN_METERS_BEFORE_TURN = 2;

export function isTurnManeuver(maneuver: Maneuver): boolean {
  return maneuver.action != null && TURN_ACTIONS.has(maneuver.action);
}

// The route position at a distance along it (nearest vertex at or after it).
export function pointAtDistance(
  coordinates: Coordinate[],
  cumulativeDistances: number[],
  distanceMeters: number,
): { point: Coordinate; index: number } | null {
  if (coordinates.length === 0) return null;
  let index = cumulativeDistances.findIndex(d => d >= distanceMeters);
  if (index < 0) index = coordinates.length - 1;
  return { point: coordinates[index], index };
}

// Where on the route (distance along it) a node lies, projected onto the
// route segments between vertex fromIndex and toIndex — null if it is more
// than maxFromRouteMeters from that stretch of the route line.
function alongRouteDistance(
  node: Coordinate,
  coordinates: Coordinate[],
  cumulativeDistances: number[],
  fromIndex: number,
  toIndex: number,
  maxFromRouteMeters: number,
): number | null {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((node.latitude * Math.PI) / 180);
  let best: { meters: number; along: number } | null = null;
  for (let i = Math.max(1, fromIndex); i <= Math.min(coordinates.length - 1, toIndex); i++) {
    const a = coordinates[i - 1];
    const b = coordinates[i];
    const ax = (a.longitude - node.longitude) * metersPerDegLon;
    const ay = (a.latitude - node.latitude) * metersPerDegLat;
    const dx = (b.longitude - a.longitude) * metersPerDegLon;
    const dy = (b.latitude - a.latitude) * metersPerDegLat;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0;
    const meters = Math.hypot(ax + t * dx, ay + t * dy);
    if (meters <= maxFromRouteMeters && (!best || meters < best.meters)) {
      const segmentMeters = cumulativeDistances[i] - cumulativeDistances[i - 1];
      best = { meters, along: cumulativeDistances[i - 1] + t * segmentMeters };
    }
  }
  return best ? best.along : null;
}

// Per maneuver (same order), the traffic control at the turn, or null.
export function intersectionControlsForManeuvers(
  maneuvers: Maneuver[],
  coordinates: Coordinate[],
  cumulativeDistances: number[],
  nodes: ControlNode[],
): Array<IntersectionControl | null> {
  return maneuvers.map((maneuver) => {
    if (!isTurnManeuver(maneuver)) return null;
    const at = pointAtDistance(coordinates, cumulativeDistances, maneuver.distanceFromStartMeters);
    if (!at) return null;

    const nearby = nodes.filter(n => haversineMeters(n, at.point) <= Math.max(SIGNAL_MAX_METERS_FROM_TURN, STOP_MAX_METERS_BEFORE_TURN));
    if (nearby.some(n => n.kind === 'traffic_signals' && haversineMeters(n, at.point) <= SIGNAL_MAX_METERS_FROM_TURN)) {
      return 'traffic_signals';
    }

    // Only the approach: the route segments from 40 m before the turn up to
    // the turn vertex (not the road we turn onto).
    const firstApproachIndex = cumulativeDistances.findIndex(
      d => d >= maneuver.distanceFromStartMeters - STOP_MAX_METERS_BEFORE_TURN,
    );
    for (const node of nearby) {
      if (node.kind !== 'stop') continue;
      const along = alongRouteDistance(
        node, coordinates, cumulativeDistances, Math.max(1, firstApproachIndex), at.index, STOP_MAX_METERS_FROM_ROUTE,
      );
      if (along == null) continue;
      const beforeTurn = cumulativeDistances[at.index] - along;
      if (beforeTurn >= STOP_MIN_METERS_BEFORE_TURN && beforeTurn <= STOP_MAX_METERS_BEFORE_TURN) {
        return node.allWay ? 'all_way_stop' : 'stop';
      }
    }
    return null;
  });
}

const PHRASE: Record<IntersectionControl, string> = {
  traffic_signals: 'At the traffic light',
  stop: 'At the stop sign',
  all_way_stop: 'At the all-way stop',
};

// "Turn right onto Main St. Go for 0.2 mi." -> "At the traffic light, turn
// right onto Main St. Go for 0.2 mi."
export function instructionWithControl(instruction: string, control: IntersectionControl | null | undefined): string {
  if (!control || !instruction) return instruction;
  return `${PHRASE[control]}, ${instruction.charAt(0).toLowerCase()}${instruction.slice(1)}`;
}
