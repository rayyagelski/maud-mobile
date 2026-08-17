import { destinationPointFrom } from '../src/services/here/hereRoutingClient';

describe('destinationPointFrom', () => {
  const ORIGIN = { latitude: 40, longitude: -74 };

  it('returns the same point for zero distance', () => {
    const result = destinationPointFrom(ORIGIN, 90, 0);
    expect(result.latitude).toBeCloseTo(ORIGIN.latitude, 6);
    expect(result.longitude).toBeCloseTo(ORIGIN.longitude, 6);
  });

  it('moves north (increasing latitude, ~same longitude) for heading 0', () => {
    const result = destinationPointFrom(ORIGIN, 0, 1000);
    expect(result.latitude).toBeGreaterThan(ORIGIN.latitude);
    expect(result.longitude).toBeCloseTo(ORIGIN.longitude, 3);
  });

  it('moves east (increasing longitude, ~same latitude) for heading 90', () => {
    const result = destinationPointFrom(ORIGIN, 90, 1000);
    expect(result.longitude).toBeGreaterThan(ORIGIN.longitude);
    expect(result.latitude).toBeCloseTo(ORIGIN.latitude, 3);
  });

  it('moves south (decreasing latitude) for heading 180', () => {
    const result = destinationPointFrom(ORIGIN, 180, 1000);
    expect(result.latitude).toBeLessThan(ORIGIN.latitude);
  });

  it('moves west (decreasing longitude) for heading 270', () => {
    const result = destinationPointFrom(ORIGIN, 270, 1000);
    expect(result.longitude).toBeLessThan(ORIGIN.longitude);
  });

  it('travels farther in coordinate-space for a larger distance', () => {
    const near = destinationPointFrom(ORIGIN, 0, 500);
    const far = destinationPointFrom(ORIGIN, 0, 5000);
    const nearDelta = near.latitude - ORIGIN.latitude;
    const farDelta = far.latitude - ORIGIN.latitude;
    expect(farDelta).toBeGreaterThan(nearDelta);
  });
});
