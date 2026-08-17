import { tripDistanceKm, tripDurationSeconds, tripAvgSpeedKmh } from '../src/utils/helpers';
import type { Trip } from '../src/types/trip.types';

function makeLocalTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'local-1',
    vehicleId: 'vehicle-1',
    driverId: 'driver-1',
    tripType: 'private',
    transportMode: 'car',
    status: 'completed',
    startTime: 1700000000000,
    endTime: 1700001800000, // +1800s = 30 min
    route: [
      { latitude: 40.0, longitude: -74.0, timestamp: 1700000000000 },
      { latitude: 40.1, longitude: -74.0, timestamp: 1700001800000 }, // ~11.1km north
    ],
    events: [],
    ...overrides,
  };
}

describe('tripDistanceKm', () => {
  it('derives distance from route for a local trip with no summary field', () => {
    const trip = makeLocalTrip();
    expect(tripDistanceKm(trip)).toBeGreaterThan(10);
    expect(tripDistanceKm(trip)).toBeLessThan(12);
  });

  it('prefers summaryDistanceKm when present, ignoring route entirely', () => {
    const trip = makeLocalTrip({ summaryDistanceKm: 42 });
    expect(tripDistanceKm(trip)).toBe(42);
  });

  it('returns 0 for a source:vgd trip with empty route and no summary', () => {
    const trip = makeLocalTrip({ route: [] });
    expect(tripDistanceKm(trip)).toBe(0);
  });
});

describe('tripDurationSeconds', () => {
  it('derives duration from startTime/endTime for a local trip', () => {
    expect(tripDurationSeconds(makeLocalTrip())).toBe(1800);
  });

  it('prefers summaryDurationSeconds when present', () => {
    const trip = makeLocalTrip({ summaryDurationSeconds: 900 });
    expect(tripDurationSeconds(trip)).toBe(900);
  });

  it('returns 0 for a trip with no endTime and no summary', () => {
    const trip = makeLocalTrip({ endTime: undefined });
    expect(tripDurationSeconds(trip)).toBe(0);
  });
});

describe('tripAvgSpeedKmh', () => {
  it('derives average speed from distance/duration for a local trip', () => {
    const trip = makeLocalTrip();
    // ~11.1km in 0.5h ≈ 22.2 km/h
    expect(tripAvgSpeedKmh(trip)).toBeGreaterThan(20);
    expect(tripAvgSpeedKmh(trip)).toBeLessThan(24);
  });

  it('prefers summaryAvgSpeedKmh when present, ignoring route/duration entirely', () => {
    const trip = makeLocalTrip({ summaryAvgSpeedKmh: 55, route: [] });
    expect(tripAvgSpeedKmh(trip)).toBe(55);
  });

  it('returns 0 when duration is 0 to avoid dividing by zero', () => {
    const trip = makeLocalTrip({ endTime: undefined });
    expect(tripAvgSpeedKmh(trip)).toBe(0);
  });
});
