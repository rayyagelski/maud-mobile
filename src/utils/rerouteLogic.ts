// Pure logic for recalculating the route when the driver leaves it
// ("repositioning"). Side effects (HERE request, voice, Redux) live in
// useTurnByTurnGuidance.

// Off the route line by more than this, on REROUTE_STREAK_FIXES fixes in a
// row (fixes come every second during a trip), means the driver took another
// road. Well under OFF_ROUTE_DISTANCE_METERS (150 m, where the old guidance
// only went quiet) so a new route is ready before the next junction; the
// streak and the accuracy limit keep GPS jitter from triggering it.
export const REROUTE_OFF_ROUTE_METERS = 50;
export const REROUTE_STREAK_FIXES = 3;
// Fixes less accurate than this say nothing about which road the car is on.
export const REROUTE_MAX_ACCURACY_METERS = 35;
// Never ask HERE again sooner than this (a failed request, or a driver who
// keeps ignoring the new route through a car park).
export const REROUTE_MIN_INTERVAL_MS = 20_000;
// Close to the destination, leaving the route is parking, not a wrong turn.
export const REROUTE_NEAR_DESTINATION_METERS = 150;
// Below this the heading is noise; the route is then requested without one.
export const REROUTE_MIN_SPEED_FOR_COURSE_MS = 3;

export interface RerouteFix {
  distanceToRouteMeters: number;
  distanceToDestinationMeters: number;
  accuracyMeters?: number;
  timestampMs: number;
}

export interface RerouteTracker {
  // True when a new route should be requested now. The caller then calls
  // started(); finished() once the request is over (either way).
  update(fix: RerouteFix): boolean;
  started(timestampMs: number): void;
  finished(): void;
}

export function createRerouteTracker(lastRequestAtMs: number | null = null): RerouteTracker {
  let streak = 0;
  let inFlight = false;
  let lastRequestAt = lastRequestAtMs;

  return {
    update(fix) {
      if (fix.accuracyMeters != null && fix.accuracyMeters > REROUTE_MAX_ACCURACY_METERS) return false;
      if (fix.distanceToDestinationMeters <= REROUTE_NEAR_DESTINATION_METERS) {
        streak = 0;
        return false;
      }
      streak = fix.distanceToRouteMeters > REROUTE_OFF_ROUTE_METERS ? streak + 1 : 0;
      if (streak < REROUTE_STREAK_FIXES || inFlight) return false;
      if (lastRequestAt != null && fix.timestampMs - lastRequestAt < REROUTE_MIN_INTERVAL_MS) return false;
      return true;
    },
    started(timestampMs) {
      inFlight = true;
      lastRequestAt = timestampMs;
    },
    finished() {
      inFlight = false;
      streak = 0;
    },
  };
}

// The car's heading, when it is moving fast enough for the heading to mean
// something (Android reports -1 / undefined without a GPS heading).
export function courseForReroute(speedMs: number, headingDegrees: number | undefined): number | undefined {
  if (headingDegrees == null || headingDegrees < 0 || !Number.isFinite(headingDegrees)) return undefined;
  return speedMs >= REROUTE_MIN_SPEED_FOR_COURSE_MS ? headingDegrees : undefined;
}

// After a recalculation HERE's first action is "Head <direction> …" from the
// car's current position — already being driven, so not worth saying.
export function firstManeuverToAnnounceAfterReroute(maneuvers: Array<{ action?: string }>): number {
  return maneuvers[0]?.action === 'depart' ? 1 : 0;
}
