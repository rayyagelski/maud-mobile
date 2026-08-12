import {
  currentSpanIndex, nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance,
  SPEED_ZONE_ANNOUNCE_DISTANCE_METERS,
} from '../src/utils/speedZoneAlertLogic';
import type { SpeedLimitSpan } from '../src/services/here/hereRoutingClient';

// A 45 mph (~20.1 m/s) stretch dropping to 25 mph (~11.2 m/s) at 1000m, then
// back up to 45 mph at 1300m — a typical "through a residential zone" shape.
const spans: SpeedLimitSpan[] = [
  { distanceFromStartMeters: 0, speedLimitMps: 20.1 },
  { distanceFromStartMeters: 1000, speedLimitMps: 11.2 },
  { distanceFromStartMeters: 1300, speedLimitMps: 20.1 },
];

describe('currentSpanIndex', () => {
  it('returns -1 before the first span', () => {
    expect(currentSpanIndex(spans, -10)).toBe(-1);
  });

  it('returns the covering span index', () => {
    expect(currentSpanIndex(spans, 500)).toBe(0);
    expect(currentSpanIndex(spans, 1000)).toBe(1);
    expect(currentSpanIndex(spans, 1299)).toBe(1);
    expect(currentSpanIndex(spans, 1300)).toBe(2);
  });
});

describe('nextSpeedZoneToAnnounce', () => {
  it('does not treat the route\'s very first span as a reduction', () => {
    // No prior segment to compare against — must not fire "approaching" or
    // "already in it" purely because the first span exists.
    expect(nextSpeedZoneToAnnounce(spans, 0, null)).toBeNull();
    expect(nextSpeedZoneToAnnounce(spans, 500, null)).toBeNull();
  });

  it('does not announce while outside the approach window', () => {
    const distance = 1000 - SPEED_ZONE_ANNOUNCE_DISTANCE_METERS - 50;
    expect(nextSpeedZoneToAnnounce(spans, distance, null)).toBeNull();
  });

  it('announces "approaching" once within the window of a stricter zone', () => {
    const distance = 1000 - SPEED_ZONE_ANNOUNCE_DISTANCE_METERS + 10;
    const result = nextSpeedZoneToAnnounce(spans, distance, null);
    expect(result).toEqual({ speedLimitMps: 11.2, distanceFromStartMeters: 1000, isApproaching: true });
  });

  it('does not re-announce the same zone once already announced', () => {
    expect(nextSpeedZoneToAnnounce(spans, 1050, 1000)).toBeNull();
  });

  it('announces "already in it" when the trip starts mid-zone', () => {
    const result = nextSpeedZoneToAnnounce(spans, 1100, null);
    expect(result).toEqual({ speedLimitMps: 11.2, distanceFromStartMeters: 1000, isApproaching: false });
  });

  it('does not announce a plain increase in the limit (leaving a slow zone)', () => {
    expect(nextSpeedZoneToAnnounce(spans, 1300, 1000)).toBeNull();
  });
});

describe('advanceSpeedZoneCompliance', () => {
  it('starts a watch on entering a stricter zone above the new limit', () => {
    const { watch, result } = advanceSpeedZoneCompliance(null, spans, 1000, 18, 10_000);
    expect(result).toBeNull();
    expect(watch).toEqual({
      spanStartMeters: 1000, speedLimitMps: 11.2, enteredAtTimestamp: 10_000,
      enteredAtDistanceMeters: 1000, entrySpeedMs: 18,
    });
  });

  it('does not start a watch if already at/under the new limit', () => {
    const { watch } = advanceSpeedZoneCompliance(null, spans, 1000, 10, 10_000);
    expect(watch).toBeNull();
  });

  it('resolves the watch once speed drops to at/under the limit', () => {
    const started = advanceSpeedZoneCompliance(null, spans, 1000, 18, 10_000).watch!;
    const { watch, result } = advanceSpeedZoneCompliance(started, spans, 1120, 11, 15_000);
    expect(watch).toBeNull();
    expect(result).toEqual({
      speedLimitMps: 11.2, entrySpeedMs: 18, secondsToComply: 5, metersToComply: 120, compliedWithinZone: true,
    });
  });

  it('resolves as non-compliant if the zone ends before speed drops', () => {
    const started = advanceSpeedZoneCompliance(null, spans, 1000, 18, 10_000).watch!;
    const { result } = advanceSpeedZoneCompliance(started, spans, 1300, 17, 20_000);
    expect(result).toEqual({
      speedLimitMps: 11.2, entrySpeedMs: 18, secondsToComply: 10, metersToComply: 300, compliedWithinZone: false,
    });
  });
});
