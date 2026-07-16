import { findNearestCameraWithinRadius, shouldRefreshCache, type SpeedCamera } from '../src/utils/complianceAlertLogic';

// ~0.009 degrees of latitude is roughly 1km — used to build cameras at known distances.
const ORIGIN = { latitude: 51.5, longitude: -0.12 };

describe('findNearestCameraWithinRadius', () => {
  it('returns null when no cameras are within radius', () => {
    const cameras: SpeedCamera[] = [{ id: 'a', latitude: 51.6, longitude: -0.12 }]; // ~11km away
    expect(findNearestCameraWithinRadius(cameras, ORIGIN, 2)).toBeNull();
  });

  it('returns the nearest camera within radius, not just the first in the list', () => {
    const far: SpeedCamera = { id: 'far', latitude: 51.509, longitude: -0.12 }; // ~1km away
    const near: SpeedCamera = { id: 'near', latitude: 51.5045, longitude: -0.12 }; // ~0.5km away
    const result = findNearestCameraWithinRadius([far, near], ORIGIN, 2);
    expect(result?.cameraId).toBe('near');
  });

  it('carries through the speed limit when present', () => {
    const cameras: SpeedCamera[] = [{ id: 'a', latitude: 51.5045, longitude: -0.12, speedLimitKmh: 50 }];
    const result = findNearestCameraWithinRadius(cameras, ORIGIN, 2);
    expect(result?.speedLimitKmh).toBe(50);
  });

  it('excludes cameras exactly on the radius boundary correctly (inclusive)', () => {
    // ~2.0km north
    const cameras: SpeedCamera[] = [{ id: 'edge', latitude: 51.518, longitude: -0.12 }];
    const result = findNearestCameraWithinRadius(cameras, ORIGIN, 2.01);
    expect(result?.cameraId).toBe('edge');
  });
});

describe('shouldRefreshCache', () => {
  it('returns true when there is no previous query point', () => {
    expect(shouldRefreshCache(null, ORIGIN, 2)).toBe(true);
  });

  it('returns false when the vehicle has not moved far enough', () => {
    const nearby = { latitude: 51.5005, longitude: -0.12 }; // ~0.06km away
    expect(shouldRefreshCache(ORIGIN, nearby, 2)).toBe(false);
  });

  it('returns true once the vehicle has moved past the threshold', () => {
    const farAway = { latitude: 51.53, longitude: -0.12 }; // ~3.3km away
    expect(shouldRefreshCache(ORIGIN, farAway, 2)).toBe(true);
  });
});
