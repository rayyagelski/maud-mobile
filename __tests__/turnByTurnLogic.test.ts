import {
  advanceDistanceTraveled, nextManeuverToAnnounce, isOffRoute,
  TURN_ANNOUNCE_DISTANCE_METERS, OFF_ROUTE_DISTANCE_METERS,
} from '../src/utils/turnByTurnLogic';
import type { GpsPoint } from '../src/types/trip.types';
import type { Maneuver } from '../src/services/here/hereRoutingClient';

const ORIGIN = { latitude: 51.5, longitude: -0.12 };

function point(latitude: number, longitude: number, timestamp = 0): GpsPoint {
  return { latitude, longitude, timestamp };
}

describe('advanceDistanceTraveled', () => {
  it('sets the anchor without adding distance on the first point', () => {
    const result = advanceDistanceTraveled(undefined, point(51.5, -0.12), 0);
    expect(result.cumulativeMeters).toBe(0);
    expect(result.anchor).toEqual(point(51.5, -0.12));
  });

  it('ignores a segment within the GPS noise floor', () => {
    const anchor = point(51.5, -0.12);
    const jitter = point(51.50001, -0.12); // ~1m
    const result = advanceDistanceTraveled(anchor, jitter, 0);
    expect(result.cumulativeMeters).toBe(0);
    expect(result.anchor).toEqual(anchor); // anchor unchanged — still filtering noise
  });

  it('accumulates distance and advances the anchor once past the noise floor', () => {
    const anchor = point(51.5, -0.12);
    const moved = point(51.509, -0.12); // ~1km north
    const result = advanceDistanceTraveled(anchor, moved, 500);
    expect(result.cumulativeMeters).toBeGreaterThan(500 + 900);
    expect(result.anchor).toEqual(moved);
  });
});

describe('nextManeuverToAnnounce', () => {
  const maneuvers: Maneuver[] = [
    { instruction: 'Turn left onto Main St', distanceFromStartMeters: 1000 },
    { instruction: 'Turn right onto Oak Ave', distanceFromStartMeters: 2000 },
  ];

  it('returns null when not yet within the announce window', () => {
    expect(nextManeuverToAnnounce(maneuvers, 0, 0)).toBeNull();
  });

  it('returns the maneuver once within the announce window', () => {
    const distance = 1000 - TURN_ANNOUNCE_DISTANCE_METERS;
    expect(nextManeuverToAnnounce(maneuvers, distance, 0)).toEqual(maneuvers[0]);
  });

  it('does not re-announce a maneuver already counted as announced', () => {
    expect(nextManeuverToAnnounce(maneuvers, 1500, 1)).toBeNull();
  });

  it('returns null once every maneuver has been announced', () => {
    expect(nextManeuverToAnnounce(maneuvers, 5000, 2)).toBeNull();
  });
});

describe('isOffRoute', () => {
  const route = [ORIGIN, { latitude: 51.501, longitude: -0.12 }];

  it('returns false for an empty route', () => {
    expect(isOffRoute(ORIGIN, [])).toBe(false);
  });

  it('returns false when close to the route', () => {
    expect(isOffRoute({ latitude: 51.5001, longitude: -0.12 }, route)).toBe(false);
  });

  it('returns true once farther than the threshold from every route point', () => {
    const farAway = { latitude: 51.52, longitude: -0.12 }; // ~2.2km from nearest point
    expect(isOffRoute(farAway, route, OFF_ROUTE_DISTANCE_METERS)).toBe(true);
  });
});
