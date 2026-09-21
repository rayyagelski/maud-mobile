import reducer, { closeActiveTrip, appendGpsPoint, endTrip, advanceVgdFlushProgress } from '../src/store/slices/tripSlice';
import type { GpsPoint, Trip, TripState } from '../src/types/trip.types';

// Regression coverage for the real-drive failure where a trip stayed
// "active" for the 9 minutes its end-of-trip network calls took on a
// stalled connection: the next drive's points were appended to it, VGD
// merged two trips into one, and auto-start was blocked for the second.

function route(pointCount: number, startTime = 1_700_000_000_000): GpsPoint[] {
  return Array.from({ length: pointCount }, (_, i) => ({
    latitude: 28.54 + i * 0.001, longitude: -81.78, speed: 20, timestamp: startTime + i * 1000,
  }));
}

function trip(overrides: Partial<Trip> & { id: string }): Trip {
  const points = overrides.route ?? route(10);
  return {
    vehicleId: 'v1', driverId: 'd1', tripType: 'private', transportMode: 'car',
    status: 'active', startTime: points[0].timestamp, route: points, events: [],
    ...overrides,
  } as Trip;
}

function stateWithActive(active: Trip): TripState {
  return { activeTrip: active, trips: [], isTracking: true, isLoading: false, error: null, pendingStart: null };
}

describe('closeActiveTrip', () => {
  it('moves the active trip into history as completed and stops tracking', () => {
    const state = reducer(stateWithActive(trip({ id: 'A' })), closeActiveTrip({ tripId: 'A', endTime: 123 }));

    expect(state.activeTrip).toBeNull();
    expect(state.isTracking).toBe(false);
    expect(state.trips).toHaveLength(1);
    expect(state.trips[0]).toMatchObject({ id: 'A', status: 'completed', endTime: 123 });
  });

  it('ignores a close for a trip that is not the active one', () => {
    const before = stateWithActive(trip({ id: 'A' }));
    const state = reducer(before, closeActiveTrip({ tripId: 'B', endTime: 123 }));

    expect(state.activeTrip?.id).toBe('A');
    expect(state.isTracking).toBe(true);
  });

  it('once closed, later GPS fixes no longer land on the closed trip', () => {
    let state = reducer(stateWithActive(trip({ id: 'A' })), closeActiveTrip({ tripId: 'A', endTime: 123 }));
    const pointsAtClose = state.trips[0].route.length;

    state = reducer(state, appendGpsPoint(route(1, 9_999_999_999_999)[0]));

    expect(state.trips[0].route).toHaveLength(pointsAtClose);
  });
});

describe('endTrip lifecycle after the local close', () => {
  const fulfilled = (payload: Trip) =>
    ({ type: endTrip.fulfilled.type, payload, meta: { arg: payload.id, requestId: 'r', requestStatus: 'fulfilled' } }) as ReturnType<typeof endTrip.fulfilled>;
  const rejected = (tripId: string) =>
    ({ type: endTrip.rejected.type, payload: undefined, error: { message: 'x' }, meta: { arg: tripId, requestId: 'r', requestStatus: 'rejected', aborted: false, condition: false } }) as unknown as ReturnType<typeof endTrip.rejected>;

  it('fulfilled merges enrichment onto the stored trip and keeps VGD progress recorded since the close', () => {
    let state = reducer(stateWithActive(trip({ id: 'A' })), closeActiveTrip({ tripId: 'A', endTime: 123 }));
    // The final VGD flush typically lands before the reward submission does.
    state = reducer(state, advanceVgdFlushProgress({
      tripId: 'A', sentRouteCount: 10, sentEventCount: 0, cumulativeDistanceKm: 1.2, lastSentPoint: state.trips[0].route[9],
    }));
    const snapshotFromThunk = { ...trip({ id: 'A' }), endTime: 123, status: 'completed', eventCounters: { harshBrakeCount: 2 } } as unknown as Trip;

    state = reducer(state, fulfilled(snapshotFromThunk));

    expect(state.trips).toHaveLength(1);
    expect(state.trips[0].vgdSentRouteCount).toBe(10);
    expect(state.trips[0].vgdCumulativeDistanceKm).toBe(1.2);
    expect(state.trips[0].eventCounters).toMatchObject({ harshBrakeCount: 2 });
  });

  it('a late fulfilled/rejected outcome for trip A does not disturb a trip B that started meanwhile', () => {
    let state = reducer(stateWithActive(trip({ id: 'A' })), closeActiveTrip({ tripId: 'A', endTime: 123 }));
    // Trip B starts while A's enrichment is still in flight.
    state = { ...state, activeTrip: trip({ id: 'B' }), isTracking: true };

    const afterFulfilled = reducer(state, fulfilled({ ...trip({ id: 'A' }), endTime: 123, status: 'completed' } as Trip));
    expect(afterFulfilled.activeTrip?.id).toBe('B');
    expect(afterFulfilled.isTracking).toBe(true);

    const afterRejected = reducer(state, rejected('A'));
    expect(afterRejected.activeTrip?.id).toBe('B');
    expect(afterRejected.isTracking).toBe(true);
  });
});
