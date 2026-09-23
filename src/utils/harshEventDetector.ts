// Pure, unit-testable harsh-event classification (SRS 4.4). No RN/Redux
// dependency — GPS fixes feed this via useHarshEventTracker.
//
// All three event types (braking, acceleration, cornering) are measured
// from the vehicle's GPS track, not the phone's motion sensors. Both sensor
// approaches were replayed against a real week of drives (stored VGD
// points) and both overstated real driving several-fold:
//  - Gyroscope cornering: 206 events recorded vs 1 real (a phone in a
//    holder reads mount vibration and road pitch/roll as rotation).
//  - Accelerometer braking/acceleration: its gravity-removal filter has a
//    ~0.45s time constant, so it passes bumps and jolts but absorbs any
//    SUSTAINED force — its "peak" measured road texture, not the car. Events
//    it recorded at 0.43-0.55g were 0.17-0.27g by the vehicle's actual
//    speed change.
// GPS speed and course over ground describe the vehicle itself, independent
// of how or where the phone is mounted.
import {
  HARSH_BRAKE_THRESHOLD,
  HARSH_ACCEL_THRESHOLD,
  HARSH_CORNER_THRESHOLD_MS2,
  MS2_PER_G,
} from './constants';

// ── Braking / acceleration (GPS speed) ─────────────────────────────────────
//
// Acceleration = change in GPS (Doppler) speed between consecutive fixes.
//
// Only fixes whose speed came from GPS count. Android reports speed -1 for a
// fix that came from Wi-Fi/cell positioning rather than GPS — 20-30% of
// fixes on real drives — and the app used to record those as 0 m/s. A car
// at 28 mph then "stopped" and "restarted" every few seconds, which is what
// generated 94 of the week's 110 recorded harsh events. Such fixes arrive
// flagged speedEstimated (see useTripAutoDetection) and are skipped here.
//
// Replayed over the same week with those fixes excluded: 110 events -> 6,
// all genuine full-throttle accelerations (e.g. 23->45 mph in 2s); the two
// drives reported as "extremely careful" went from 4 events to 0.
//
// Trade-off, stated plainly: fixes arrive roughly every 3 seconds, so this
// measures the speed change averaged over that interval. A brake that is
// both short (under ~2s) and only just over threshold can average out below
// it; sustained harsh braking or acceleration is caught.
export const LONGITUDINAL_MIN_DT_S = 1;
// Longer gaps (typically around skipped non-GPS fixes) average too much to
// judge a short event fairly — skipped rather than guessed at.
export const LONGITUDINAL_MAX_DT_S = 5;
// No passenger car accelerates or brakes harder than this. A speed change
// implying more is a GPS speed glitch (real data: a single fix reporting
// 132 mph between two ~35 mph fixes), and that fix is discarded.
export const PLAUSIBLE_MAX_ACCEL_MS2 = 1.1 * MS2_PER_G;

export interface SpeedFix {
  timestampMs: number;
  speedMs: number;
  // true = no GPS speed on this fix; speedMs was estimated from position.
  speedEstimated?: boolean;
}

export interface LongitudinalEventResult {
  type: 'harsh_brake' | 'harsh_accel';
  /** Signed m/s² — the value compared against the threshold. */
  valueMs2: number;
}

/**
 * Stateful per-trip braking/acceleration detector. Feed it every fix in
 * order; `update` returns an event once per harsh episode (a long hard
 * acceleration spanning several fixes is one event, not several).
 */
export function createLongitudinalDetector() {
  let anchor: SpeedFix | null = null;
  let activeType: LongitudinalEventResult['type'] | null = null;

  return {
    update(fix: SpeedFix): LongitudinalEventResult | null {
      if (fix.speedEstimated) return null;
      if (!anchor) {
        anchor = fix;
        return null;
      }

      const dtS = (fix.timestampMs - anchor.timestampMs) / 1000;
      if (dtS > LONGITUDINAL_MAX_DT_S) {
        anchor = fix;
        activeType = null;
        return null;
      }
      if (dtS < LONGITUDINAL_MIN_DT_S) return null; // keep the older anchor

      const accelMs2 = (fix.speedMs - anchor.speedMs) / dtS;
      if (Math.abs(accelMs2) > PLAUSIBLE_MAX_ACCEL_MS2) return null; // glitch fix: drop it
      anchor = fix;

      const type = accelMs2 <= HARSH_BRAKE_THRESHOLD ? 'harsh_brake'
        : accelMs2 >= HARSH_ACCEL_THRESHOLD ? 'harsh_accel'
          : null;
      const fired = type !== null && type !== activeType;
      activeType = type;
      return fired ? { type, valueMs2: accelMs2 } : null;
    },
  };
}

// ── Cornering (GPS course over ground) ─────────────────────────────────────
//
// Replayed against the real week: the gyroscope approach recorded 206
// events, including 76 and 80 in single trips whose sharpest actual turn
// was 0.25g; this detector yields 1, on the one trip with a genuinely sharp
// (0.66g) turn.
//
// Robustness, each rule addressing an observed failure mode:
//  - Turn rate is measured across a 2-4s WINDOW of fixes (sum of signed
//    heading deltas / elapsed time), not between two consecutive fixes — a
//    single jittery heading, or two fixes a fraction of a second apart,
//    can't produce an extreme rate. A glitch mid-window cancels itself out
//    in the signed sum.
//  - Fixes without a GPS heading (Wi-Fi/cell fixes, heading -1) are skipped,
//    not treated as a heading — and not as a reason to discard the window.
//  - Speed floor of 5 m/s (18 km/h): below that, GPS bearing is unreliable.
//  - Must stay above threshold for 2 consecutive fixes: a real harsh corner
//    holds its lateral force for seconds; a one-fix artefact doesn't.
//  - One event per corner: re-arms only after the rate has been back below
//    threshold for CORNERING_RELEASE_MS.
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
      // No GPS heading on this fix — nothing to measure; the window's own
      // time bound decides whether the fixes around it still belong together.
      if (fix.headingDeg == null) return null;

      if (fix.speedMs < CORNER_MIN_SPEED_MS) {
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
