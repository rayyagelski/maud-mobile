import {
  classifyLongitudinalEvent,
  createCorneringDetector,
  createGravityFilter,
  headingDeltaDeg,
  type CorneringFix,
} from '../src/utils/harshEventDetector';
import { MS2_PER_G } from '../src/utils/constants';

describe('classifyLongitudinalEvent (slip filtering)', () => {
  it('classifies harsh braking when GPS deceleration and accelerometer spike agree', () => {
    // Threshold is -0.5g (~-4.9 m/s², see constants.ts) — GPS shows -5 m/s²
    // deceleration, accelerometer corroborates with a matching spike.
    expect(classifyLongitudinalEvent(-5, 5)).toMatchObject({ type: 'harsh_brake' });
  });

  it('classifies harsh acceleration when GPS acceleration and accelerometer spike agree', () => {
    // Threshold is 0.35g (~-3.43 m/s²)
    expect(classifyLongitudinalEvent(4, 4)).toMatchObject({ type: 'harsh_accel' });
  });

  it('rejects an accelerometer spike with no GPS speed corroboration (phone jostle/drop)', () => {
    // Accelerometer spikes hard but GPS shows no meaningful speed change
    expect(classifyLongitudinalEvent(0, 6)).toBeNull();
  });

  it('rejects a GPS speed jump with no accelerometer corroboration (GPS noise)', () => {
    // GPS implies harsh braking but the accelerometer registered nothing
    expect(classifyLongitudinalEvent(-4, 0)).toBeNull();
  });

  it('does not classify mild deceleration/acceleration below threshold', () => {
    expect(classifyLongitudinalEvent(-1, 1)).toBeNull();
    expect(classifyLongitudinalEvent(1, 1)).toBeNull();
  });

  it('classifies harsh braking even when the accelerometer peak exceeds the GPS-average delta', () => {
    // Real-drive bug (2026-09-08): a real hard brake's instantaneous peak
    // routinely exceeds the average deceleration over the (irregular,
    // distance-filtered) GPS gap — that's expected physics, not phone
    // jostle. The old symmetric tolerance check rejected this as
    // "uncorroborated" and silently discarded real driver-felt events.
    expect(classifyLongitudinalEvent(-5, 8)).toMatchObject({ type: 'harsh_brake' });
    expect(classifyLongitudinalEvent(4, 9)).toMatchObject({ type: 'harsh_accel' });
  });

  it('classifies harsh braking off the accelerometer peak even when the GPS average itself never crosses threshold', () => {
    // Real-drive bug (2026-09-09): the corroboration fix above stopped
    // rejecting these as "uncorroborated", but severity was still gated on
    // gpsSpeedDeltaMs2 (the diluted average), so a real brake whose average
    // over a multi-second GPS gap sits under threshold (-3, here) still
    // returned null even though its 6 m/s² peak both corroborates and
    // clears HARSH_BRAKE_THRESHOLD (~-4.9) on its own.
    expect(classifyLongitudinalEvent(-3, 6)).toMatchObject({ type: 'harsh_brake' });
  });

  it('reports the signed peak it actually judged, not the GPS average', () => {
    // Real-drive report: the UI showed "hard braking" at 0.20g beside a 0.5g
    // threshold because the caller stored gpsSpeedDeltaMs2 while the decision
    // was made on the accelerometer peak. The value returned here is the one
    // the threshold comparison used, so what gets recorded can't disagree
    // with what fired.
    expect(classifyLongitudinalEvent(-3, 6)).toEqual({ type: 'harsh_brake', valueMs2: -6 });
    expect(classifyLongitudinalEvent(2, 4)).toEqual({ type: 'harsh_accel', valueMs2: 4 });
  });

  it('still rejects a phone jostle/drop when GPS shows essentially no speed change at all', () => {
    // Guards the case the peak-based severity check above opened up: without
    // this, a near-zero GPS delta trivially "corroborates" any accelerometer
    // spike (the tolerance offsets it below zero), and a jostle's own peak
    // would then clear the threshold on its own.
    expect(classifyLongitudinalEvent(0.1, 8)).toBeNull();
  });
});

// Feeds fixes 1s apart (the real GPS cadence) through a fresh detector and
// returns the lateral values (in g) of every event it fired.
function runCornering(fixes: Array<Omit<CorneringFix, 'timestampMs'>>): number[] {
  const detector = createCorneringDetector();
  const events: number[] = [];
  fixes.forEach((f, i) => {
    const lateral = detector.update({ ...f, timestampMs: 1_700_000_000_000 + i * 1000 });
    if (lateral != null) events.push(lateral / MS2_PER_G);
  });
  return events;
}

// A steady turn: heading advancing `degPerSec` every second at `speedMs`.
function turn(startDeg: number, degPerSec: number, seconds: number, speedMs: number) {
  return Array.from({ length: seconds }, (_, i) => ({
    headingDeg: (startDeg + degPerSec * i + 360) % 360, speedMs,
  }));
}
const straight = (deg: number, seconds: number, speedMs: number) => turn(deg, 0, seconds, speedMs);

describe('createCorneringDetector (GPS course over ground)', () => {
  it('fires once for a genuinely harsh corner', () => {
    // 30°/s at 10 m/s = 0.52 rad/s * 10 = 5.2 m/s² = 0.53g, held 4 seconds.
    const events = runCornering([...straight(0, 3, 10), ...turn(0, 30, 5, 10), ...straight(150, 3, 10)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toBeGreaterThan(0.45);
  });

  it('ignores a normal turn below the 0.4g threshold', () => {
    // A 90° right turn at 12 mph over 5s: 18°/s at 5.4 m/s = 0.17g.
    expect(runCornering([...straight(0, 3, 5.4), ...turn(0, 18, 6, 5.4), ...straight(90, 3, 5.4)])).toHaveLength(0);
  });

  it('ignores a single heading glitch on a straight road', () => {
    // One fix reporting a wildly wrong heading, then back — the old
    // single-pair method turned exactly this into a "harsh corner".
    const fixes = straight(66, 10, 21);
    fixes[5] = { headingDeg: 110, speedMs: 21 };
    expect(runCornering(fixes)).toHaveLength(0);
  });

  it('ignores normal GPS heading jitter at highway speed', () => {
    // ±4° wobble every fix at 47 mph — a real straight road.
    const jitter = [0, 4, -3, 4, -4, 2, -3, 4, 0, -4, 3, -2].map(d => ({ headingDeg: (60 + d + 360) % 360, speedMs: 21 }));
    expect(runCornering(jitter)).toHaveLength(0);
  });

  it('reports one event for one bend, not one per fix — the 2-seconds-apart double count', () => {
    // Real data: 0.43g and 0.48g recorded 2s apart in the same bend.
    const events = runCornering([...straight(180, 3, 12), ...turn(180, -35, 7, 12), ...straight(0, 4, 12)]);
    expect(events).toHaveLength(1);
  });

  it('reports two separate corners when separated by enough straight road', () => {
    const events = runCornering([
      ...straight(0, 3, 10), ...turn(0, 30, 5, 10),
      ...straight(150, 6, 10),
      ...turn(150, 30, 5, 10), ...straight(300, 3, 10),
    ]);
    expect(events).toHaveLength(2);
  });

  it('ignores heading swings at parking-lot speed, where GPS bearing is unreliable', () => {
    // 90°/s "turns" at 3 m/s (7 mph) would compute as 0.48g — below the
    // 5 m/s floor, so not trusted at all.
    expect(runCornering(turn(0, 90, 6, 3))).toHaveLength(0);
  });

  it('handles the 360→0 wraparound as a small turn, not a huge one', () => {
    // Driving straight north with heading hovering around 0/360.
    const fixes = [358, 1, 359, 2, 0, 358, 1].map(h => ({ headingDeg: h, speedMs: 20 }));
    expect(runCornering(fixes)).toHaveLength(0);
  });

  it('resets its window when heading drops out', () => {
    // A turn split by a fix with no heading can't be measured across the gap.
    const fixes = [...turn(0, 30, 2, 10), { headingDeg: null, speedMs: 10 }, ...straight(60, 2, 10)];
    expect(runCornering(fixes)).toHaveLength(0);
  });
});

describe('headingDeltaDeg', () => {
  it('computes a plain difference when there is no wraparound', () => {
    expect(headingDeltaDeg(10, 30)).toBeCloseTo(20, 5);
    expect(headingDeltaDeg(30, 10)).toBeCloseTo(-20, 5);
  });

  it('takes the short way around the 0/360 wraparound', () => {
    // 350° -> 10° is a 20° turn, not a 340° one.
    expect(headingDeltaDeg(350, 10)).toBeCloseTo(20, 5);
    expect(headingDeltaDeg(10, 350)).toBeCloseTo(-20, 5);
  });

  it('returns 0 for an unchanged heading', () => {
    expect(headingDeltaDeg(90, 90)).toBeCloseTo(0, 5);
  });
});

// Settles the filter on a gravity vector so the tests below start from a
// known "which way is down".
function settledFilter(gravity = { x: 0, y: 0, z: 9.81 }) {
  const filter = createGravityFilter();
  for (let i = 0; i < 30; i++) filter.update(gravity);
  return filter;
}

describe('createGravityFilter', () => {
  it('reports ~0 linear acceleration for a steady, gravity-only signal', () => {
    const filter = settledFilter();
    const { magnitudeMs2 } = filter.update({ x: 0, y: 0, z: 9.81 });
    expect(magnitudeMs2).toBeLessThan(0.1);
  });

  it('reports a linear-acceleration spike on top of a stable gravity baseline', () => {
    const filter = settledFilter();
    const { magnitudeMs2 } = filter.update({ x: 5, y: 0, z: 9.81 });
    expect(magnitudeMs2).toBeGreaterThan(3);
  });

  it('exposes its gravity estimate once settled', () => {
    const filter = settledFilter();
    const g = filter.getGravity();
    expect(g).not.toBeNull();
    expect(g!.z).toBeCloseTo(9.81, 1);
  });

  it('keeps a horizontal force in the horizontal component', () => {
    // A brake/accelerate pulse along the phone's x-axis with gravity on z.
    const filter = settledFilter();
    const { horizontalMs2 } = filter.update({ x: 5, y: 0, z: 9.81 });
    expect(horizontalMs2).toBeGreaterThan(3);
  });

  it('drops a purely vertical shock from the horizontal component', () => {
    // A road bump: a spike along the same axis gravity is on. This is exactly
    // what a rigid phone mount transmits, and it used to inflate the peak
    // used for harsh-brake/accel detection (real-drive report: events logged
    // at 0.18-0.24g against 0.35g/0.5g thresholds).
    const filter = settledFilter();
    const { magnitudeMs2, horizontalMs2 } = filter.update({ x: 0, y: 0, z: 9.81 + 6 });
    expect(magnitudeMs2).toBeGreaterThan(3); // the full magnitude still sees it...
    expect(horizontalMs2).toBeLessThan(0.5); // ...the horizontal component doesn't.
  });
});
