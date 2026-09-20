import {
  classifyLongitudinalEvent,
  classifyCornering,
  createGravityFilter,
  vector3MagnitudeDegPerSec,
  yawRateDegPerSec,
  headingDeltaDeg,
  headingYawRateDegPerSec,
} from '../src/utils/harshEventDetector';

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

describe('classifyCornering', () => {
  it('detects cornering when derived lateral acceleration exceeds threshold while moving', () => {
    // Threshold is 0.4g (~3.92 m/s², see constants.ts) — 30 deg/s at 10 m/s
    // => ~5.24 m/s² lateral, above threshold
    const result = classifyCornering(30, 10);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(5.236, 2);
  });

  it('does not detect cornering below the derived lateral-acceleration threshold', () => {
    // 10 deg/s at 10 m/s => ~1.75 m/s² lateral, below the ~3.92 m/s² threshold
    expect(classifyCornering(10, 10)).toBeNull();
  });

  it('scales with speed — the same yaw rate is harsher at higher speed', () => {
    // 10 deg/s at 30 m/s => ~5.24 m/s² lateral, now above threshold
    const result = classifyCornering(10, 30);
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(5.236, 2);
  });

  it('ignores gyro rotation while stationary (phone handled by hand, not the car turning)', () => {
    expect(classifyCornering(50, 0)).toBeNull();
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

describe('headingYawRateDegPerSec', () => {
  it('converts a heading change over time into a deg/sec magnitude', () => {
    // 350° -> 10° (20° turn) over 2 seconds => 10 deg/s
    expect(headingYawRateDegPerSec(350, 10, 2)).toBeCloseTo(10, 5);
  });

  it('returns 0 for a non-positive time delta rather than dividing by zero', () => {
    expect(headingYawRateDegPerSec(10, 20, 0)).toBe(0);
    expect(headingYawRateDegPerSec(10, 20, -1)).toBe(0);
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

describe('yawRateDegPerSec', () => {
  const gravityOnZ = { x: 0, y: 0, z: 9.81 };

  it('keeps rotation about the vertical axis (a real turn)', () => {
    // Yaw = spinning about the axis gravity points along.
    expect(yawRateDegPerSec({ x: 0, y: 0, z: Math.PI / 2 }, gravityOnZ)).toBeCloseTo(90, 5);
  });

  it('discards rotation about a horizontal axis (pitch/roll from a bump)', () => {
    // Real-drive report: 30+ "cornering" events in a 19-minute drive with the
    // phone rigidly mounted upright — every bump read as turning because all
    // three gyroscope axes were being summed together.
    expect(yawRateDegPerSec({ x: Math.PI / 2, y: 0, z: 0 }, gravityOnZ)).toBeCloseTo(0, 5);
    expect(yawRateDegPerSec({ x: 0, y: Math.PI / 2, z: 0 }, gravityOnZ)).toBeCloseTo(0, 5);
  });

  it('works regardless of how the phone is oriented', () => {
    // Phone lying on its side: gravity along x, so a turn is rotation about x.
    const gravityOnX = { x: 9.81, y: 0, z: 0 };
    expect(yawRateDegPerSec({ x: Math.PI / 2, y: 0, z: 0 }, gravityOnX)).toBeCloseTo(90, 5);
    expect(yawRateDegPerSec({ x: 0, y: 0, z: Math.PI / 2 }, gravityOnX)).toBeCloseTo(0, 5);
  });

  it('is direction-agnostic (left and right turns are both turns)', () => {
    expect(yawRateDegPerSec({ x: 0, y: 0, z: -Math.PI / 2 }, gravityOnZ)).toBeCloseTo(90, 5);
  });

  it('falls back to the full magnitude when gravity is not known yet', () => {
    // Before the accelerometer has reported (or on a device without one),
    // previous behavior rather than no cornering detection at all.
    expect(yawRateDegPerSec({ x: Math.PI / 2, y: 0, z: 0 }, null)).toBeCloseTo(90, 5);
  });
});

describe('vector3MagnitudeDegPerSec', () => {
  it('converts a rad/s vector magnitude to deg/s', () => {
    const degPerSec = vector3MagnitudeDegPerSec({ x: Math.PI, y: 0, z: 0 });
    expect(degPerSec).toBeCloseTo(180, 5);
  });
});
