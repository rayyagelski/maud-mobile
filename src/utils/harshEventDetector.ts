// Pure, unit-testable harsh-event classification (SRS 4.4). No RN/Redux
// dependency — react-native-sensors/GPS feed this via useHarshEventTracker.
import {
  HARSH_BRAKE_THRESHOLD,
  HARSH_ACCEL_THRESHOLD,
  HARSH_CORNER_THRESHOLD_MS2,
  SLIP_FILTER_TOLERANCE_MS2,
} from './constants';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

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
 * Also exposes the running gravity estimate ("which way is down"), which
 * horizontalMagnitude uses to separate driving forces from vertical bumps.
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

// ── Cornering (GPS course-over-ground) ─────────────────────────────────────
//
// Cornering is detected from the vehicle's GPS heading, not the phone's
// gyroscope. Replayed against a real week of drives (14 trips) from the
// stored VGD points, the gyroscope approach recorded 206 "harsh cornering"
// events, including 76 and 80 in single trips whose sharpest actual turn
// per GPS was 0.25g — a phone in a holder reads mount vibration and road
// pitch/roll as rotation, and the gravity estimate it's projected onto
// drifts during every maneuver (createGravityFilter's ~0.45s time constant
// absorbs any sustained force), leaking non-yaw rotation into "yaw". It
// overstated real turns 2-4x (e.g. 0.64g reported where GPS shows 0.15g).
// The same week replayed through this detector yields 1 event, on the one
// trip with a genuinely sharp turn (0.66g peak). GPS course over ground is
// the vehicle's own direction of travel, independent of how the phone is
// mounted.
//
// Robustness, each rule addressing a failure mode of the previous single-
// fix-pair GPS fallback:
//  - Turn rate is measured across a 2-4s WINDOW of fixes (sum of signed
//    heading deltas / elapsed time), not between two consecutive fixes — a
//    single jittery heading, or two fixes a fraction of a second apart,
//    can't produce an extreme rate. A glitch mid-window cancels itself out
//    in the signed sum.
//  - Speed floor of 5 m/s (18 km/h) across the whole window: below that,
//    GPS bearing is unreliable, and the previous 1 mph gate let parking-lot
//    crawls turn heading noise into "harsh" corners.
//  - Must stay above threshold for 2 consecutive fixes: a real harsh corner
//    holds its lateral force for seconds; a one-fix artefact doesn't.
//  - One event per corner: re-arms only after the rate has been back below
//    threshold for CORNERING_RELEASE_MS (the previous GPS path had no
//    hysteresis at all and double-counted every bend 2s apart).
export const CORNER_MIN_SPEED_MS = 5;
export const CORNER_WINDOW_MIN_S = 2;
export const CORNER_WINDOW_MAX_S = 4;
export const CORNER_SUSTAIN_FIXES = 2;
export const CORNERING_RELEASE_MS = 2000;

export interface CorneringFix {
  timestampMs: number;
  headingDeg: number | null;
  speedMs: number;
}

/**
 * Stateful per-trip cornering detector. Feed it every GPS fix in order;
 * `update` returns the lateral acceleration (m/s²) exactly once per harsh
 * corner — on the fix where it's confirmed — and null otherwise.
 */
export function createCorneringDetector() {
  let window: CorneringFix[] = [];
  let aboveCount = 0;
  let active = false;
  let belowSinceMs: number | null = null;

  function noteBelow(nowMs: number) {
    aboveCount = 0;
    if (!active) return;
    if (belowSinceMs === null) belowSinceMs = nowMs;
    else if (nowMs - belowSinceMs >= CORNERING_RELEASE_MS) {
      active = false;
      belowSinceMs = null;
    }
  }

  return {
    update(fix: CorneringFix): number | null {
      if (fix.headingDeg == null || fix.speedMs < CORNER_MIN_SPEED_MS) {
        // A gap in usable heading breaks the window — the turn can't be
        // measured across it.
        window = [];
        noteBelow(fix.timestampMs);
        return null;
      }

      window.push(fix);
      while (window.length > 0 && fix.timestampMs - window[0].timestampMs > CORNER_WINDOW_MAX_S * 1000) {
        window.shift();
      }

      const spanS = (fix.timestampMs - window[0].timestampMs) / 1000;
      let lateralMs2 = 0;
      if (spanS >= CORNER_WINDOW_MIN_S) {
        let turnDeg = 0;
        for (let i = 1; i < window.length; i++) {
          turnDeg += headingDeltaDeg(window[i - 1].headingDeg as number, window[i].headingDeg as number);
        }
        const meanSpeed = window.reduce((sum, f) => sum + f.speedMs, 0) / window.length;
        lateralMs2 = meanSpeed * (Math.abs(turnDeg) / spanS) * (Math.PI / 180);
      }

      if (lateralMs2 < HARSH_CORNER_THRESHOLD_MS2) {
        noteBelow(fix.timestampMs);
        return null;
      }

      aboveCount++;
      belowSinceMs = null;
      if (!active && aboveCount >= CORNER_SUSTAIN_FIXES) {
        active = true;
        return lateralMs2;
      }
      return null;
    },
  };
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

