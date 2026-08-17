import { mapVgdSummaryToTrip, reconcileTripHistory } from '../src/utils/tripHistorySync';
import type { Trip } from '../src/types/trip.types';
import type { VgdTripSummary } from '../src/types/vgd.types';
import type { TripRewardHistoryEntry } from '../src/api/endpoints/trips';
import type { TripRewardResult } from '../src/types/trip.types';

const VEHICLE_ID = 'vehicle-1';
const DRIVER_ID = 'driver-1';

function makeSummary(overrides: Partial<VgdTripSummary> = {}): VgdTripSummary {
  return {
    tripId: 'vgd-trip-1',
    vehicleId: VEHICLE_ID,
    driver: 'main',
    purpose: 'private',
    analytics: {
      startTime: 1700000000,
      endTime: 1700001800, // +1800s = 30 min
      startAddress: '123 Main St',
      endAddress: '456 Oak Ave',
      distance: 15000, // 15km
    },
    ...overrides,
  };
}

function makeLocalTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'local-1',
    vehicleId: VEHICLE_ID,
    driverId: DRIVER_ID,
    tripType: 'private',
    transportMode: 'car',
    status: 'completed',
    startTime: 1700000000000,
    endTime: 1700001800000,
    route: [{ latitude: 1, longitude: 1, timestamp: 1700000000000 }],
    events: [],
    source: 'local',
    ...overrides,
  };
}

function makeReward(): TripRewardResult {
  return {
    tripRewardId: 1,
    safetyScore: 90,
    ecoScore: 85,
    tripRewardScore: 88,
    tripPointsEarned: 18,
    phoneSubscore: 100,
    distanceKm: 15,
    co2AvoidedGrams: 500,
    moneySavedCents: 250,
    currencyCode: 'USD',
    voicePayload: { script: 'Great drive!', summaryKey: 'good_drive', highlights: [], tips: [] },
    aiNarrativeTip: null,
  };
}

describe('mapVgdSummaryToTrip', () => {
  it('derives summary distance/duration/avgSpeed from analytics', () => {
    const trip = mapVgdSummaryToTrip(makeSummary(), VEHICLE_ID, DRIVER_ID);
    expect(trip.summaryDistanceKm).toBe(15);
    expect(trip.summaryDurationSeconds).toBe(1800);
    expect(trip.summaryAvgSpeedKmh).toBeCloseTo(30, 5); // 15km in 0.5h = 30km/h
  });

  it('marks the trip as source vgd with empty route/events', () => {
    const trip = mapVgdSummaryToTrip(makeSummary(), VEHICLE_ID, DRIVER_ID);
    expect(trip.source).toBe('vgd');
    expect(trip.route).toEqual([]);
    expect(trip.events).toEqual([]);
    expect(trip.status).toBe('completed');
  });

  it('produces a deterministic id from the VGD tripId', () => {
    const trip = mapVgdSummaryToTrip(makeSummary({ tripId: 'abc-123' }), VEHICLE_ID, DRIVER_ID);
    expect(trip.id).toBe('vgd-abc-123');
  });

  it('carries the vgdTripId through so future syncs recognize it as already-known', () => {
    const trip = mapVgdSummaryToTrip(makeSummary({ tripId: 'abc-123' }), VEHICLE_ID, DRIVER_ID);
    expect(trip.vgdTripId).toBe('abc-123');
    expect(trip.vgdTripCreated).toBe(true);
  });

  it('attributes every restored trip to the fallback driverId regardless of VGD role', () => {
    const spouseTrip = mapVgdSummaryToTrip(makeSummary({ driver: 'spouse' }), VEHICLE_ID, DRIVER_ID);
    expect(spouseTrip.driverId).toBe(DRIVER_ID);
  });

  it('falls back gracefully when analytics is missing entirely', () => {
    const trip = mapVgdSummaryToTrip(makeSummary({ analytics: undefined }), VEHICLE_ID, DRIVER_ID);
    expect(trip.summaryDistanceKm).toBeUndefined();
    expect(trip.summaryDurationSeconds).toBeUndefined();
    expect(trip.summaryAvgSpeedKmh).toBeUndefined();
  });
});

describe('reconcileTripHistory', () => {
  it('adds a restored trip for a VGD trip with no matching local trip', () => {
    const result = reconcileTripHistory([], [makeSummary()], [], VEHICLE_ID, DRIVER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('vgd');
    expect(result[0].vgdTripId).toBe('vgd-trip-1');
  });

  it('never duplicates a VGD trip that already exists locally (matched by vgdTripId)', () => {
    const local = makeLocalTrip({ vgdTripId: 'vgd-trip-1' });
    const result = reconcileTripHistory([local], [makeSummary()], [], VEHICLE_ID, DRIVER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(local); // untouched, not replaced
  });

  it('leaves other local trips completely untouched', () => {
    const local = makeLocalTrip({ id: 'local-2', vgdTripId: 'some-other-trip' });
    const result = reconcileTripHistory([local], [makeSummary()], [], VEHICLE_ID, DRIVER_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(local);
  });

  it('joins a reward record onto its matching VGD trip by externalTripId', () => {
    const reward = makeReward();
    const entries: TripRewardHistoryEntry[] = [{ externalTripId: 'vgd-trip-1', reward }];
    const result = reconcileTripHistory([], [makeSummary()], entries, VEHICLE_ID, DRIVER_ID);
    expect(result[0].reward).toBe(reward);
  });

  it('does not attach a reward with no matching externalTripId', () => {
    const entries: TripRewardHistoryEntry[] = [{ externalTripId: 'unrelated-trip', reward: makeReward() }];
    const result = reconcileTripHistory([], [makeSummary()], entries, VEHICLE_ID, DRIVER_ID);
    expect(result[0].reward).toBeUndefined();
  });

  it('ignores reward entries with a null externalTripId', () => {
    const entries: TripRewardHistoryEntry[] = [{ externalTripId: null, reward: makeReward() }];
    const result = reconcileTripHistory([], [makeSummary()], entries, VEHICLE_ID, DRIVER_ID);
    expect(result[0].reward).toBeUndefined();
  });

  it('is idempotent across repeated syncs (restoring twice does not duplicate)', () => {
    const firstPass = reconcileTripHistory([], [makeSummary()], [], VEHICLE_ID, DRIVER_ID);
    const secondPass = reconcileTripHistory(firstPass, [makeSummary()], [], VEHICLE_ID, DRIVER_ID);
    expect(secondPass).toHaveLength(1);
  });

  it('restores multiple distinct VGD trips in one pass', () => {
    const summaries = [makeSummary({ tripId: 'trip-a' }), makeSummary({ tripId: 'trip-b' })];
    const result = reconcileTripHistory([], summaries, [], VEHICLE_ID, DRIVER_ID);
    expect(result.map(t => t.vgdTripId).sort()).toEqual(['trip-a', 'trip-b']);
  });
});
