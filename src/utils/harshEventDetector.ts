// Pure, unit-testable harsh-event classification (SRS 4.4). No RN/Redux
// dependency — react-native-sensors/GPS feed this via useHarshEventTracker.
import {
  HARSH_BRAKE_THRESHOLD,
  HARSH_ACCEL_THRESHOLD,
  HARSH_CORNER_GYRO_THRESHOLD_DEG_S,
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
 * This is the SRS 4.4 "slip filtering": a phone jostle/drop produces an
 * accelerometer spike with no corresponding GPS speed change (rejected below
 * because gpsSpeedDeltaMs2 won't cross the threshold); GPS noise produces a
 * speed jump with no accelerometer corroboration (rejected because
 * linearAccelMagnitude won't be within tolerance of the GPS-implied magnitude).
 */
export function classifyLongitudinalEvent(
  gpsSpeedDeltaMs2: number,
  linearAccelMagnitude: number,
): LongitudinalEvent {
  const corroborated =
    Math.abs(linearAccelMagnitude - Math.abs(gpsSpeedDeltaMs2)) <= SLIP_FILTER_TOLERANCE_MS2;

  if (!corroborated) return null;

  if (gpsSpeedDeltaMs2 <= HARSH_BRAKE_THRESHOLD) return 'harsh_brake';
  if (gpsSpeedDeltaMs2 >= HARSH_ACCEL_THRESHOLD) return 'harsh_accel';
  return null;
}

/**
 * Classifies cornering from total gyroscope angular-velocity magnitude
 * (deg/s) — gated on GPS speed so a stationary phone being rotated by hand
 * doesn't register. Approximation: without full orientation-fusion, this
 * doesn't distinguish yaw from pitch/roll, so a pothole-induced rotation at
 * speed can register as "cornering" too; acceptable for Phase 1.
 */
export function classifyCornering(gyroMagnitudeDegPerSec: number, gpsSpeedMs: number): boolean {
  if (gpsSpeedMs < SPEED_START_MS) return false;
  return gyroMagnitudeDegPerSec >= HARSH_CORNER_GYRO_THRESHOLD_DEG_S;
}

export function radPerSecToDegPerSec(rad: number): number {
  return rad * (180 / Math.PI);
}

export function vector3MagnitudeDegPerSec(v: Vector3): number {
  return radPerSecToDegPerSec(Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
}
