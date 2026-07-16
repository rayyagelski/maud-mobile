import {
  classifyLongitudinalEvent,
  classifyCornering,
  createGravityFilter,
  vector3MagnitudeDegPerSec,
} from '../src/utils/harshEventDetector';

describe('classifyLongitudinalEvent (slip filtering)', () => {
  it('classifies harsh braking when GPS deceleration and accelerometer spike agree', () => {
    // GPS shows -4 m/s² deceleration, accelerometer corroborates with a matching spike
    expect(classifyLongitudinalEvent(-4, 4)).toBe('harsh_brake');
  });

  it('classifies harsh acceleration when GPS acceleration and accelerometer spike agree', () => {
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
  it('detects cornering when gyro yaw rate exceeds threshold while moving', () => {
    expect(classifyCornering(30, 10)).toBe(true);
  });

  it('does not detect cornering below the gyro threshold', () => {
    expect(classifyCornering(10, 10)).toBe(false);
  });

  it('ignores gyro rotation while stationary (phone handled by hand, not the car turning)', () => {
    expect(classifyCornering(50, 0)).toBe(false);
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
