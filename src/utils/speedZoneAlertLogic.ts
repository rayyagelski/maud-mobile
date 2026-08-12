// Pure, unit-testable logic for reduced-speed-zone voice alerts. Sensor/TTS
// side effects live in useSpeedZoneAlerts.

import type { SpeedLimitSpan } from '../services/here/hereRoutingClient';

// ~500 yards, per real-drive feedback on how far ahead a warning is useful.
export const SPEED_ZONE_ANNOUNCE_DISTANCE_METERS = 457;

export interface SpeedZoneAnnouncement {
  speedLimitMps: number;
  distanceFromStartMeters: number;
  // true = still ahead, spoken as a warning to slow down in time; false =
  // already inside the zone (trip started mid-zone, or a fix was missed and
  // the approach window was never crossed).
  isApproaching: boolean;
}

// The span covering distanceAlongRouteMeters — the last span (spans are
// ordered ascending by distanceFromStartMeters, same convention as
// Maneuver.distanceFromStartMeters) whose start is at or before the current
// position. -1 if the position is before every span (or there are none).
export function currentSpanIndex(spans: SpeedLimitSpan[], distanceAlongRouteMeters: number): number {
  let result = -1;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].distanceFromStartMeters > distanceAlongRouteMeters) break;
    result = i;
  }
  return result;
}

// Decides whether a speed-zone announcement should fire right now. Only
// fires for a REDUCTION in the speed limit — a plain increase (leaving a
// slow zone) isn't the "restricted zone ahead" warning the driver actually
// wants. Each span is identified by its own distanceFromStartMeters, so
// re-entering an earlier-seen limit later on the route (e.g. 35 -> 45 -> 35)
// still announces the second 35 zone — it's a distinct span, not a repeat.
export function nextSpeedZoneToAnnounce(
  spans: SpeedLimitSpan[],
  distanceAlongRouteMeters: number,
  lastAnnouncedSpanStartMeters: number | null,
): SpeedZoneAnnouncement | null {
  const currentIndex = currentSpanIndex(spans, distanceAlongRouteMeters);
  const current = currentIndex >= 0 ? spans[currentIndex] : null;
  const previous = currentIndex >= 1 ? spans[currentIndex - 1] : null;

  // Already inside a zone stricter than the one before it, and not yet
  // announced — covers starting a trip mid-zone or a late/missed GPS fix
  // that skipped the approach window entirely. Requires a genuinely known
  // previous limit — the route's very first span has nothing to compare
  // against and must never be treated as a "reduction" on its own.
  if (
    current?.speedLimitMps != null &&
    previous?.speedLimitMps != null &&
    current.distanceFromStartMeters !== lastAnnouncedSpanStartMeters &&
    current.speedLimitMps < previous.speedLimitMps
  ) {
    return {
      speedLimitMps: current.speedLimitMps,
      distanceFromStartMeters: current.distanceFromStartMeters,
      isApproaching: false,
    };
  }

  // Approaching a stricter upcoming zone within the announce window. Same
  // "must have a known current limit to compare against" requirement — near
  // the very start of the route, before the first span, there's nothing yet
  // to call a reduction relative to.
  const next = spans[currentIndex + 1];
  if (
    next?.speedLimitMps != null &&
    current?.speedLimitMps != null &&
    next.distanceFromStartMeters !== lastAnnouncedSpanStartMeters &&
    next.speedLimitMps < current.speedLimitMps &&
    next.distanceFromStartMeters - distanceAlongRouteMeters <= SPEED_ZONE_ANNOUNCE_DISTANCE_METERS
  ) {
    return {
      speedLimitMps: next.speedLimitMps,
      distanceFromStartMeters: next.distanceFromStartMeters,
      isApproaching: true,
    };
  }

  return null;
}

// Tracks how long/how far it takes the driver to actually slow down after
// entering a stricter zone — the reward system's basis for scoring
// compliance, not just whether an alert was spoken. One watch is active at a
// time; starting a new one implicitly resolves (as compliedWithinZone:false)
// any watch that was still open, e.g. one short reduced-speed zone right
// after another with no compliant fix in between.
export interface SpeedZoneComplianceWatch {
  spanStartMeters: number;
  speedLimitMps: number;
  enteredAtTimestamp: number;
  enteredAtDistanceMeters: number;
  entrySpeedMs: number;
}

export interface SpeedZoneComplianceResult {
  speedLimitMps: number;
  entrySpeedMs: number;
  secondsToComply: number;
  metersToComply: number;
  // false when the driver left the zone (or the fix stream did — e.g. trip
  // ended) before ever slowing to at/under the posted limit.
  compliedWithinZone: boolean;
}

function maybeStartWatch(
  current: SpeedLimitSpan | null,
  previous: SpeedLimitSpan | null,
  distanceTraveledMeters: number,
  speedMs: number,
  timestamp: number,
): SpeedZoneComplianceWatch | null {
  if (
    current?.speedLimitMps != null &&
    previous?.speedLimitMps != null &&
    speedMs > current.speedLimitMps &&
    current.speedLimitMps < previous.speedLimitMps
  ) {
    return {
      spanStartMeters: current.distanceFromStartMeters,
      speedLimitMps: current.speedLimitMps,
      enteredAtTimestamp: timestamp,
      enteredAtDistanceMeters: distanceTraveledMeters,
      entrySpeedMs: speedMs,
    };
  }
  return null;
}

function resolveWatch(
  watch: SpeedZoneComplianceWatch,
  distanceTraveledMeters: number,
  timestamp: number,
  compliedWithinZone: boolean,
): SpeedZoneComplianceResult {
  return {
    speedLimitMps: watch.speedLimitMps,
    entrySpeedMs: watch.entrySpeedMs,
    secondsToComply: (timestamp - watch.enteredAtTimestamp) / 1000,
    metersToComply: distanceTraveledMeters - watch.enteredAtDistanceMeters,
    compliedWithinZone,
  };
}

export function advanceSpeedZoneCompliance(
  watch: SpeedZoneComplianceWatch | null,
  spans: SpeedLimitSpan[],
  distanceTraveledMeters: number,
  speedMs: number,
  timestamp: number,
): { watch: SpeedZoneComplianceWatch | null; result: SpeedZoneComplianceResult | null } {
  const currentIndex = currentSpanIndex(spans, distanceTraveledMeters);
  const current = currentIndex >= 0 ? spans[currentIndex] : null;
  const previous = currentIndex >= 1 ? spans[currentIndex - 1] : null;

  if (watch && current?.distanceFromStartMeters === watch.spanStartMeters) {
    // Still inside the watched zone.
    if (speedMs <= watch.speedLimitMps) {
      return { watch: null, result: resolveWatch(watch, distanceTraveledMeters, timestamp, true) };
    }
    return { watch, result: null };
  }

  if (watch) {
    // Left the watched zone (or the position no longer resolves to it)
    // without ever complying — resolve it, then check whether this same fix
    // also starts a brand new watch for whatever zone comes next.
    const result = resolveWatch(watch, distanceTraveledMeters, timestamp, false);
    return { watch: maybeStartWatch(current, previous, distanceTraveledMeters, speedMs, timestamp), result };
  }

  return { watch: maybeStartWatch(current, previous, distanceTraveledMeters, speedMs, timestamp), result: null };
}
