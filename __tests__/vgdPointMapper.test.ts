import {
  mapDriverRoleToVgd,
  mapTripTypeToVgdPurpose,
  toVgdTimeSeconds,
  mapGpsPointsToVgdPoints,
  mapTelematicsEventsToVgdPoints,
  markTripEnd,
} from '../src/utils/vgdPointMapper';
import type { GpsPoint, TelematicsEvent } from '../src/types/trip.types';

describe('mapDriverRoleToVgd', () => {
  it('maps self to main', () => {
    expect(mapDriverRoleToVgd('self')).toBe('main');
  });

  it('maps family to spouse', () => {
    expect(mapDriverRoleToVgd('family')).toBe('spouse');
  });

  it('maps other to child (closest of the two non-primary VGD slots)', () => {
    expect(mapDriverRoleToVgd('other')).toBe('child');
  });
});

describe('mapTripTypeToVgdPurpose', () => {
  it('maps business to business', () => {
    expect(mapTripTypeToVgdPurpose('business')).toBe('business');
  });

  it('maps private to private', () => {
    expect(mapTripTypeToVgdPurpose('private')).toBe('private');
  });

  it('folds commute to private (VGD has no commute purpose)', () => {
    expect(mapTripTypeToVgdPurpose('commute')).toBe('private');
  });
});

describe('toVgdTimeSeconds', () => {
  it('converts epoch-ms to whole-second unix timestamps', () => {
    expect(toVgdTimeSeconds(1700000000123)).toBe(1700000000);
  });
});

function point(lat: number, lon: number, timestamp: number, extra: Partial<GpsPoint> = {}): GpsPoint {
  return { latitude: lat, longitude: lon, timestamp, ...extra };
}

describe('mapGpsPointsToVgdPoints', () => {
  it('maps GPS fields and carries speed/direction through as VGD parameters', () => {
    const points = [point(52.52, 13.405, 1700000000000, { speed: 10, heading: 90 })];
    const { vgdPoints } = mapGpsPointsToVgdPoints(points, 0);

    expect(vgdPoints).toHaveLength(1);
    expect(vgdPoints[0].gps).toEqual({ lat: 52.52, lon: 13.405 });
    expect(vgdPoints[0].parameters.speed).toBe(10);
    expect(vgdPoints[0].parameters.direction).toBe(90);
  });

  it('accumulates cumulative distance across points as an integer metres value', () => {
    // Two points ~111m apart (0.001 deg latitude ≈ 111m)
    const points = [
      point(52.520, 13.405, 1700000000000),
      point(52.521, 13.405, 1700000010000),
    ];
    const { vgdPoints, endingCumulativeDistanceKm } = mapGpsPointsToVgdPoints(points, 0);

    expect(vgdPoints[0].parameters.distance).toBe(0); // no prior point to diff against
    expect(vgdPoints[1].parameters.distance).toBeGreaterThan(0);
    expect(endingCumulativeDistanceKm).toBeGreaterThan(0);
  });

  it('carries distance correctly across a batch boundary using previousPoint', () => {
    const previousPoint = point(52.520, 13.405, 1700000000000);
    const newBatch = [point(52.521, 13.405, 1700000010000)];

    const { vgdPoints } = mapGpsPointsToVgdPoints(newBatch, 0, previousPoint);

    // Should count the gap from previousPoint, not start the delta at 0.
    expect(vgdPoints[0].parameters.distance).toBeGreaterThan(0);
  });

  it('omits speed/direction parameters when not present on the GPS fix', () => {
    const points = [point(52.52, 13.405, 1700000000000)];
    const { vgdPoints } = mapGpsPointsToVgdPoints(points, 0);

    expect(vgdPoints[0].parameters.speed).toBeUndefined();
    expect(vgdPoints[0].parameters.direction).toBeUndefined();
  });
});

function event(type: TelematicsEvent['type'], value: number | undefined, timestamp: number): TelematicsEvent {
  return {
    id: 'evt-1',
    type,
    timestamp,
    location: point(52.52, 13.405, timestamp),
    value,
  };
}

describe('mapTelematicsEventsToVgdPoints', () => {
  it('maps harsh_brake/harsh_accel events to an acceleration parameter', () => {
    const points = mapTelematicsEventsToVgdPoints([event('harsh_brake', -4, 1700000000000)]);
    expect(points).toHaveLength(1);
    expect(points[0].parameters.acceleration).toBe(-4);
  });

  it('maps harsh_corner events to a cornering parameter', () => {
    const points = mapTelematicsEventsToVgdPoints([event('harsh_corner', 30, 1700000000000)]);
    expect(points[0].parameters.cornering).toBe(30);
  });

  it('drops event types with no matching VGD point parameter (speeding, road_type_change)', () => {
    const points = mapTelematicsEventsToVgdPoints([
      event('speeding', 5, 1700000000000),
      event('road_type_change', undefined, 1700000000000),
    ]);
    expect(points).toHaveLength(0);
  });

  it('drops events with no value', () => {
    const points = mapTelematicsEventsToVgdPoints([event('harsh_brake', undefined, 1700000000000)]);
    expect(points).toHaveLength(0);
  });
});

describe('markTripEnd', () => {
  it('tags the chronologically-last point as trip_end', () => {
    const points = mapGpsPointsToVgdPoints(
      [point(52.520, 13.405, 1700000010000), point(52.521, 13.405, 1700000000000)],
      0,
    ).vgdPoints;

    const marked = markTripEnd(points, 1700000020000);

    expect(marked).toHaveLength(2);
    const tripEndPoint = marked.find(p => p.type === 'trip_end');
    expect(tripEndPoint?.time).toBe(1700000010); // the later of the two timestamps
  });

  it('synthesizes a trip_end point from the fallback GPS fix when the batch is empty', () => {
    const fallback = point(52.52, 13.405, 1700000000000);
    const marked = markTripEnd([], 1700000020000, fallback);

    expect(marked).toHaveLength(1);
    expect(marked[0].type).toBe('trip_end');
    expect(marked[0].gps).toEqual({ lat: 52.52, lon: 13.405 });
  });

  it('returns an empty array (never fabricates coordinates) when the batch is empty and no fallback exists', () => {
    expect(markTripEnd([], 1700000020000)).toEqual([]);
  });
});
