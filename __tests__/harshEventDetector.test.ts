import {
  classifyLongitudinalEvent,
  classifyCornering,
  createGravityFilter,
  vector3MagnitudeDegPerSec,
} from '../src/utils/harshEventDetector';

describe('classifyLongitudinalEvent (slip filtering)', () => {
  it('classifies harsh braking when GPS deceleration and accelerometer spike agree', () => {
    // Threshold is -0.5g (~-4.9 m/s², see constants.ts) — GPS shows -5 m/s²
    // deceleration, accelerometer corroborates with a matching spike.
    expect(classifyLongitudinalEvent(-5, 5)).toBe('harsh_brake');
  });

  it('classifies harsh acceleration when GPS acceleration and accelerometer spike agree', () => {
    // Threshold is 0.35g (~-3.43 m/s²)
    expect(classifyLongitudinalEvent(4, 4)).toBe('harsh_accel');
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

describe('createGravityFilter', () => {
  it('reports ~0 linear acceleration for a steady, gravity-only signal', () => {
    const filter = createGravityFilter();
    filter.update({ x: 0, y: 0, z: 9.81 });
    for (let i = 0; i < 20; i++) {
      filter.update({ x: 0, y: 0, z: 9.81 });
    }
    const linear = filter.update({ x: 0, y: 0, z: 9.81 });
    expect(linear).toBeLessThan(0.1);
  });

  it('reports a linear-acceleration spike on top of a stable gravity baseline', () => {
    const filter = createGravityFilter();
    for (let i = 0; i < 20; i++) {
      filter.update({ x: 0, y: 0, z: 9.81 });
    }
    const linear = filter.update({ x: 5, y: 0, z: 9.81 });
    expect(linear).toBeGreaterThan(3);
  });
});

describe('vector3MagnitudeDegPerSec', () => {
  it('converts a rad/s vector magnitude to deg/s', () => {
    const degPerSec = vector3MagnitudeDegPerSec({ x: Math.PI, y: 0, z: 0 });
    expect(degPerSec).toBeCloseTo(180, 5);
  });
});
