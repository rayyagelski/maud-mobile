// Pure, unit-testable auto-stop decision, split out of useTripAutoDetection
// so it can be verified without a device. Side effects (ending the trip,
// diagnostics) stay in the hook.

// Below this speed the vehicle counts as stationary rather than moving.
export const SPEED_STOP_MS = 0.5; // ~1.8 km/h

// How long it must stay that way before the trip ends — avoids false-ends at
// traffic lights / in slow-moving traffic. 2 min per explicit user-testing
// feedback (was 45s, undocumented to users and shorter than expected).
export const STILL_MS = 2 * 60 * 1000;

// Location updates simply stopping is the other way a parked car shows up,
// and it used to be undetectable. BackgroundGeolocation deliberately stops
// delivering fixes once its own motion detection decides the device is
// stationary — which is precisely when a trip should end. The old watchdog
// only ever looked at `stillSince`, and that was only set by a fix arriving
// below SPEED_STOP_MS, so the sequence when parking was:
//
//   ...fix at 4 km/h (above the threshold -> timer reset to null)
//   ...car stops, plugin goes stationary, no further fixes
//   ...heartbeat fires every 60s, sees stillSince === null, returns
//
// and the trip never ended (real-world report: had to stop recording by
// hand). Treating a long gap in fixes as stillness closes that hole.
//
// Guarded on the last speed actually observed, because a gap in fixes has a
// second, very different cause: losing GPS in a tunnel or parking structure
// at speed. A car that was doing 80 km/h at its last fix hasn't parked; one
// that was already crawling has. Above this, the gap is left to the much
// longer stale-trip watchdog instead of ending a live trip mid-drive.
export const SILENCE_END_MAX_LAST_SPEED_MS = 10 / 3.6; // 10 km/h

export type StillnessEndReason = 'sustained-low-speed' | 'location-updates-stopped';

export interface StillnessInputs {
  isTracking: boolean;
  /** When sub-threshold speed was first observed, or null if not currently still. */
  stillSince: number | null;
  /** When the most recent location fix arrived, or null if none yet. */
  lastFixAt: number | null;
  /** Speed reported by that most recent fix. */
  lastFixSpeedMs: number;
  now: number;
}

/**
 * Returns why the trip should auto-end now, or null if it shouldn't yet.
 */
export function evaluateStillness({
  isTracking,
  stillSince,
  lastFixAt,
  lastFixSpeedMs,
  now,
}: StillnessInputs): StillnessEndReason | null {
  if (!isTracking) return null;

  if (stillSince !== null && now - stillSince >= STILL_MS) {
    return 'sustained-low-speed';
  }

  if (
    lastFixAt !== null
    && now - lastFixAt >= STILL_MS
    && lastFixSpeedMs < SILENCE_END_MAX_LAST_SPEED_MS
  ) {
    return 'location-updates-stopped';
  }

  return null;
}
