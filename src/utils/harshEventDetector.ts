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

function magnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Scalar component of `v` along the gravity axis — i.e. how much of `v`
 * points straight up/down. Returns 0 when gravity isn't known yet or reads
 * as zero (degenerate), so callers fall back to treating everything as
 * horizontal rather than dividing by zero.
 */
export function componentAlongGravity(v: Vector3, gravity: Vector3 | null): number {
  if (!gravity) return 0;
  const gMag = magnitude(gravity);
  if (gMag === 0) return 0;
  return (v.x * gravity.x + v.y * gravity.y + v.z * gravity.z) / gMag;
}

/**
 * Magnitude of `v` within the horizontal plane (everything except the
 * up/down component). Driving forces — braking, accelerating, cornering —
 * are horizontal; road bumps and vibration through a rigid phone mount are
 * mostly vertical, so dropping the vertical part is what separates the two.
 */
export function horizontalMagnitude(v: Vector3, gravity: Vector3 | null): number {
  const total = magnitude(v);
  const vertical = componentAlongGravity(v, gravity);
  // Clamped: floating-point error can make this marginally negative when the
  // vector is almost entirely vertical.
  return Math.sqrt(Math.max(0, total * total - vertical * vertical));
}

export interface LinearAccelSample {
  /** Full 3-axis linear-acceleration magnitude (m/s²), gravity removed. */
  magnitudeMs2: number;
  /** Just the horizontal part of it (m/s²) — see horizontalMagnitude. */
  horizontalMs2: number;
}

/**
 * Exponential-moving-average low-pass filter that separates gravity from the
 * raw (gravity + linear) accelerometer signal react-native-sensors reports.
 *
 * Also exposes the running gravity estimate, because gravity doubles as a
 * reference for "which way is down" — the gyroscope handler needs it to pick
 * real turning out of the raw rotation signal (see yawRateDegPerSec).
 *
 * Stateful by design (each active trip should own one instance) — not a pure
 * function, kept alongside the pure classifiers below because it has no
 * other dependencies.
 */
export function createGravityFilter(alpha = 0.8) {
  let gravity: Vector3 | null = null;

  return {
    update(raw: Vector3): LinearAccelSample {
      if (!gravity) {
        gravity = { ...raw };
        return { magnitudeMs2: 0, horizontalMs2: 0 };
      }
      gravity = {
        x: alpha * gravity.x + (1 - alpha) * raw.x,
        y: alpha * gravity.y + (1 - alpha) * raw.y,
        z: alpha * gravity.z + (1 - alpha) * raw.z,
      };
      const linear: Vector3 = {
        x: raw.x - gravity.x,
        y: raw.y - gravity.y,
        z: raw.z - gravity.z,
      };
      return {
        magnitudeMs2: magnitude(linear),
        horizontalMs2: horizontalMagnitude(linear, gravity),
      };
    },
    getGravity(): Vector3 | null {
      return gravity;
    },
    reset(): void {
      gravity = null;
    },
  };
}

/**
 * Yaw rate (deg/s) — rotation about the vertical axis, which is what
 * actually happens when a vehicle turns.
 *
 * vector3MagnitudeDegPerSec (below) takes the magnitude of all three
 * gyroscope axes together, so it can't tell a turn from a pitch or roll.
 * Real-drive report with the phone rigidly mounted in a holder rather than
 * lying on a charger pad: a 19-minute drive logged 30+ "cornering" events,
 * several within a second or two of each other, because every bump in the
 * road transmitted straight into the mount as pitch/roll and read as
 * turning. Projecting onto gravity keeps only rotation about the vertical
 * axis and discards the rest.
 *
 * Falls back to the full magnitude when gravity isn't known yet (the
 * accelerometer hasn't reported, or isn't available on this device), which
 * is the previous behavior rather than no detection at all.
 */
export function yawRateDegPerSec(gyroRadPerSec: Vector3, gravity: Vector3 | null): number {
  if (!gravity) return vector3MagnitudeDegPerSec(gyroRadPerSec);
  return radPerSecToDegPerSec(Math.abs(componentAlongGravity(gyroRadPerSec, gravity)));
}

export type LongitudinalEvent = 'harsh_brake' | 'harsh_accel' | null;

export interface LongitudinalEventResult {
  type: 'harsh_brake' | 'harsh_accel';
  /** Signed m/s² that was actually compared against the threshold. */
  valueMs2: number;
}

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
 *
 * Severity itself is then judged off that same accelerometer PEAK, not the
 * GPS-average delta — real-drive feedback after the corroboration fix above
 * (2026-09-08) still showed felt hard-brake/accel events missing from VGD.
 * Root cause: gating severity on gpsSpeedDeltaMs2 re-introduces the exact
 * dilution problem the corroboration fix was written to work around. A brake
 * that peaks well past threshold (and correctly corroborates) can still
 * average out under threshold over a multi-second GPS gap, e.g. -3 m/s²
 * average with an 6 m/s² peak — corroborated (6 >= 3 - 1.5), but -3 never
 * crosses HARSH_BRAKE_THRESHOLD (~-4.9), so the old code returned null for a
 * real, felt brake. The peak is what the driver actually experienced; GPS
 * delta is only needed for its sign (accelerometer magnitude alone can't
 * tell brake from accel).
 *
 * `horizontalAccelPeakMs2` is deliberately the HORIZONTAL peak, not the full
 * 3-axis one (see createGravityFilter). Braking and accelerating are
 * horizontal forces; vertical shock from road surface through a rigid phone
 * mount is not, and counting it inflated the peak enough to classify ordinary
 * bumps as harsh events (real-drive report: "hard acceleration" and "hard
 * braking" logged at 0.18-0.24g against 0.35g/0.5g thresholds).
 *
 * Returns the signed value that was actually compared against the threshold,
 * so callers record and display the same number the decision was made on.
 * They previously stored gpsSpeedDeltaMs2 instead, which is why the UI could
 * show an event at 0.20g next to a documented 0.5g threshold.
 */
export function classifyLongitudinalEvent(
  gpsSpeedDeltaMs2: number,
  horizontalAccelPeakMs2: number,
): LongitudinalEventResult | null {
  // Using the accelerometer peak for severity (below) means gpsSpeedDeltaMs2
  // itself no longer implicitly gates out a phone jostle/drop — that used to
  // just fail the old average-based threshold check on its own. A near-zero
  // GPS delta means no real vehicle speed change was observed at all, which
  // is itself evidence against a genuine force event regardless of how hard
  // the phone's accelerometer spiked, so it's rejected explicitly here.
  if (Math.abs(gpsSpeedDeltaMs2) < SLIP_FILTER_TOLERANCE_MS2) return null;

  const corroborated =
    horizontalAccelPeakMs2 >= Math.abs(gpsSpeedDeltaMs2) - SLIP_FILTER_TOLERANCE_MS2;

  if (!corroborated) return null;

  const signedPeak = gpsSpeedDeltaMs2 < 0 ? -horizontalAccelPeakMs2 : horizontalAccelPeakMs2;

  if (signedPeak <= HARSH_BRAKE_THRESHOLD) return { type: 'harsh_brake', valueMs2: signedPeak };
  if (signedPeak >= HARSH_ACCEL_THRESHOLD) return { type: 'harsh_accel', valueMs2: signedPeak };
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

/**
 * Smallest signed angular difference from `fromDeg` to `toDeg`, both in
 * compass degrees [0, 360) — handles the 350°→10° wraparound (a 20° turn,
 * not a 340° one) that a plain subtraction gets wrong.
 */
export function headingDeltaDeg(fromDeg: number, toDeg: number): number {
  const raw = ((toDeg - fromDeg + 540) % 360) - 180;
  return raw;
}

/**
 * GPS-heading-based fallback for classifyCornering, for a device with no
 * gyroscope (real-world case: react-native-sensors' gyroscope observable
 * throwing "Sensor gyroscope is not available" — see
 * useHarshEventTracker.ts). Converts the heading change between two GPS
 * fixes into the same deg/sec yaw-rate magnitude a gyroscope would report,
 * so it can feed the same classifyCornering formula. Coarser than the
 * gyroscope by nature — GPS fixes arrive seconds apart rather than every
 * 100ms, and heading itself is only reliable while actually moving, which
 * classifyCornering's own speed gate already handles — but it's the only
 * signal available at all without a gyroscope, and a quick tight turn's
 * average heading rate over the gap still very plausibly clears the harsh-
 * cornering threshold even if diluted below the turn's true peak.
 */
export function headingYawRateDegPerSec(
  fromHeadingDeg: number,
  toHeadingDeg: number,
  dtSeconds: number,
): number {
  if (dtSeconds <= 0) return 0;
  return Math.abs(headingDeltaDeg(fromHeadingDeg, toHeadingDeg)) / dtSeconds;
}
