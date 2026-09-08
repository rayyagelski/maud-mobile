// Pure, unit-testable harsh-event classification (SRS 4.4). No RN/Redux
// dependency — react-native-sensors/GPS feed this via useHarshEventTracker.
import {
  HARSH_BRAKE_THRESHOLD,
  HARSH_ACCEL_THRESHOLD,
  HARSH_CORNER_THRESHOLD_MS2,
  SLIP_FILTER_TOLERANCE_MS2,
  TRIP_AUTO_START_SPEED_KMH,
} from './constants';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

const SPEED_START_MS = TRIP_AUTO_START_SPEED_KMH / 3.6;

/**
 * Exponential-moving-average low-pass filter that separates gravity from the
 * raw (gravity + linear) accelerometer signal react-native-sensors reports,
 * and returns the linear-acceleration magnitude (m/s²).
 *
 * Stateful by design (each active trip should own one instance) — not a pure
 * function, kept alongside the pure classifiers below because it has no
 * other dependencies.
 */
export function createGravityFilter(alpha = 0.8) {
  let gravity: Vector3 | null = null;

  return {
    update(raw: Vector3): number {
      if (!gravity) {
        gravity = { ...raw };
        return 0;
      }
      gravity = {
        x: alpha * gravity.x + (1 - alpha) * raw.x,
        y: alpha * gravity.y + (1 - alpha) * raw.y,
        z: alpha * gravity.z + (1 - alpha) * raw.z,
      };
      const lx = raw.x - gravity.x;
      const ly = raw.y - gravity.y;
      const lz = raw.z - gravity.z;
      return Math.sqrt(lx * lx + ly * ly + lz * lz);
    },
    reset(): void {
      gravity = null;
    },
  };
}

export type LongitudinalEvent = 'harsh_brake' | 'harsh_accel' | null;

/**
 * Classifies a harsh braking/acceleration event from the GPS-speed derivative
 * (signed — this is what actually tells us direction, since a phone's mounting
 * orientation relative to the direction of travel is unknown) corroborated by
 * the accelerometer's linear-acceleration magnitude (gravity removed).
 *
 * This is the SRS 4.4 "slip filtering": GPS noise producing a fake speed jump
 * with no real physical force behind it is rejected because
 * linearAccelMagnitude comes in well below what the GPS delta implies. A
 * phone jostle/drop is independently rejected below by the plain threshold
 * check, since it produces an accelerometer spike with no corresponding GPS
 * speed change at all (gpsSpeedDeltaMs2 stays near zero either way).
 *
 * Deliberately NOT a symmetric "close to each other" check (that was the bug
 * fixed here, 2026-09-08): `linearAccelMagnitude` is the accelerometer's PEAK
 * over the gap between two GPS fixes (GPS fixes arrive on a distance filter,
 * not a fixed interval — see useHarshEventTracker.ts), while
 * `gpsSpeedDeltaMs2` is the AVERAGE deceleration/acceleration over that same,
 * often multi-second gap. A real hard brake is rarely uniform — its peak
 * force routinely exceeds the window's average by more than a couple of
 * m/s², especially when the GPS gap is longer than the brake itself. Real-
 * drive feedback confirmed this: multiple genuinely felt harsh-brake/accel
 * events during a real drive never appeared in VGD, silently discarded here
 * because the peak legitimately (and correctly) didn't match the average.
 * Only a peak meaningfully SMALLER than the GPS-implied delta (i.e. GPS
 * shows a speed change with no real corroborating force) is now treated as
 * uncorroborated.
 */
export function classifyLongitudinalEvent(
  gpsSpeedDeltaMs2: number,
  linearAccelMagnitude: number,
): LongitudinalEvent {
  const corroborated =
    linearAccelMagnitude >= Math.abs(gpsSpeedDeltaMs2) - SLIP_FILTER_TOLERANCE_MS2;

  if (!corroborated) return null;

  if (gpsSpeedDeltaMs2 <= HARSH_BRAKE_THRESHOLD) return 'harsh_brake';
  if (gpsSpeedDeltaMs2 >= HARSH_ACCEL_THRESHOLD) return 'harsh_accel';
  return null;
}

/**
 * Classifies cornering from centripetal (lateral) acceleration, derived from
 * gyroscope yaw rate and GPS speed (a_lateral = speed * yawRate(rad/s)) —
 * gated on GPS speed so a stationary phone being rotated by hand doesn't
 * register, and so the same yaw rate isn't judged equally "harsh" at parking-
 * lot speed as at highway speed. Returns the lateral acceleration in m/s²
 * (same unit as classifyLongitudinalEvent's value) when it crosses the harsh
 * threshold, else null. Approximation: without full orientation-fusion, this
 * doesn't distinguish yaw from pitch/roll, so a pothole-induced rotation at
 * speed can register as "cornering" too; acceptable for Phase 1.
 */
export function classifyCornering(gyroMagnitudeDegPerSec: number, gpsSpeedMs: number): number | null {
  if (gpsSpeedMs < SPEED_START_MS) return null;
  const yawRateRadPerSec = gyroMagnitudeDegPerSec * (Math.PI / 180);
  const lateralAccelMs2 = gpsSpeedMs * yawRateRadPerSec;
  return lateralAccelMs2 >= HARSH_CORNER_THRESHOLD_MS2 ? lateralAccelMs2 : null;
}

export function radPerSecToDegPerSec(rad: number): number {
  return rad * (180 / Math.PI);
}

export function vector3MagnitudeDegPerSec(v: Vector3): number {
  return radPerSecToDegPerSec(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
}
