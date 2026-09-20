import { trimTripsForPersist } from '../src/store/tripsPersistTransform';
import type { GpsPoint, Trip, TripState } from '../src/types/trip.types';

// ~1 point/second of driving is what a real trip records (see
// useTripAutoDetection's location config), so route length is the field that
// actually makes the persisted blob grow without bound.
function route(pointCount: number, startTime = 1_700_000_000_000): GpsPoint[] {
  return Array.from({ length: pointCount }, (_, i) => ({
    latitude: 28.54 + i * 0.001,
    longitude: -81.78,
    speed: 20,
    timestamp: startTime + i * 1000,
  }));
}

function trip(overrides: Partial<Trip> & { id: string }): Trip {
  const points = overrides.route ?? route(50);
  return {
    vehicleId: 'v1',
    driverId: 'd1',
    tripType: 'private',
    transportMode: 'car',
    status: 'completed',
    startTime: points[0]?.timestamp ?? 1_700_000_000_000,
    endTime: points[points.length - 1]?.timestamp ?? 1_700_000_050_000,
    route: points,
    events: [],
    // Fully flushed by default — the trim only ever touches trips whose data
    // is already safely on the server.
    vgdTripCreated: true,
    vgdSentRouteCount: points.length,
    vgdSentEventCount: 0,
    ...overrides,
  };
}

function state(trips: Trip[], activeTrip: Trip | null = null): TripState {
  return { activeTrip, trips, isTracking: false, isLoading: false, error: null, pendingStart: null };
}

describe('trimTripsForPersist', () => {
  it('keeps full point-by-point detail for the most recent trips', () => {
    const trips = Array.from({ length: 5 }, (_, i) => trip({ id: `t${i}` }));

    const trimmed = trimTripsForPersist(state(trips));

    trimmed.trips.forEach((t) => expect(t.route).toHaveLength(50));
  });

  it('strips route/events from older trips once past the full-detail window', () => {
    const trips = Array.from({ length: 14 }, (_, i) => trip({ id: `t${i}` }));

    const trimmed = trimTripsForPersist(state(trips));

    // trips[] is newest-first (unshift), so the first 10 keep detail.
    expect(trimmed.trips[9].route).toHaveLength(50);
    expect(trimmed.trips[10].route).toHaveLength(0);
    expect(trimmed.trips[13].route).toHaveLength(0);
  });

  it('materializes summary stats before dropping the route they come from', () => {
    // Locally-recorded trips never carry summary* on their own (only
    // VGD-backfilled ones do), so without this the stripped trip would read
    // as 0 km everywhere DriverScore/Rewards/EcoScore aggregate distance.
    const trips = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}` }));

    const trimmed = trimTripsForPersist(state(trips));
    const stripped = trimmed.trips[11];

    expect(stripped.route).toHaveLength(0);
    expect(stripped.summaryDistanceKm).toBeGreaterThan(0);
    expect(stripped.summaryDurationSeconds).toBeGreaterThan(0);
    expect(stripped.summaryAvgSpeedKmh).toBeGreaterThan(0);
  });

  it('never strips a trip whose points have not finished uploading to VGD', () => {
    const trips = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}` }));
    // An old trip that's still only half-flushed — dropping its points here
    // would lose data that exists nowhere else.
    trips[11] = trip({ id: 't11', vgdSentRouteCount: 10 });

    const trimmed = trimTripsForPersist(state(trips));

    expect(trimmed.trips[11].route).toHaveLength(50);
  });

  it('never strips a trip that was never created in VGD at all', () => {
    const trips = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}` }));
    trips[11] = trip({ id: 't11', vgdTripCreated: false });

    const trimmed = trimTripsForPersist(state(trips));

    expect(trimmed.trips[11].route).toHaveLength(50);
  });

  it('caps how many trips are persisted at all', () => {
    const trips = Array.from({ length: 250 }, (_, i) => trip({ id: `t${i}` }));

    const trimmed = trimTripsForPersist(state(trips));

    expect(trimmed.trips).toHaveLength(100);
    // Newest kept, oldest dropped (they remain restorable from the backend).
    expect(trimmed.trips[0].id).toBe('t0');
  });

  it('leaves the in-flight active trip completely untouched', () => {
    const active = trip({ id: 'active', status: 'active', vgdSentRouteCount: 0 });
    const trips = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}` }));

    const trimmed = trimTripsForPersist(state(trips, active));

    expect(trimmed.activeTrip?.route).toHaveLength(50);
  });

  it('is stable when applied repeatedly to its own output', () => {
    // Every throttled write re-runs this on already-trimmed state; it must
    // not keep mutating or recomputing summaries off an emptied route.
    const trips = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}` }));

    const once = trimTripsForPersist(state(trips));
    const twice = trimTripsForPersist(once);

    expect(twice.trips[11].summaryDistanceKm).toBe(once.trips[11].summaryDistanceKm);
    expect(twice.trips[11].route).toHaveLength(0);
  });
});
