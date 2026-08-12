import {
  buildCumulativeRouteDistances, distanceAlongRoute, nextManeuverToAnnounce, isOffRoute,
  TURN_ANNOUNCE_DISTANCE_METERS, OFF_ROUTE_DISTANCE_METERS,
} from '../src/utils/turnByTurnLogic';
import type { Maneuver } from '../src/services/here/hereRoutingClient';

const ORIGIN = { latitude: 51.5, longitude: -0.12 };

describe('buildCumulativeRouteDistances / distanceAlongRoute', () => {
  // A straight north-south line, ~1.11km per 0.01 degrees of latitude.
  const route = [
    { latitude: 51.50, longitude: -0.12 },
    { latitude: 51.51, longitude: -0.12 },
    { latitude: 51.52, longitude: -0.12 },
  ];

  it('returns 0 for an empty route', () => {
    expect(distanceAlongRoute(ORIGIN, [], [])).toBe(0);
  });

  it('starts cumulative distance at 0 for the first coordinate', () => {
    const cumulative = buildCumulativeRouteDistances(route);
    expect(cumulative[0]).toBe(0);
  });

  it('tracks distance to the nearest route point even off the exact line', () => {
    // Slightly east of the second route point — nearest match is still index 1.
    // This is the property that keeps maneuver timing locked to the route's
    // own geometry regardless of how the actual driven path compares to it.
    const cumulative = buildCumulativeRouteDistances(route);
    const nearby = { latitude: 51.51, longitude: -0.1199 };
    expect(distanceAlongRoute(nearby, route, cumulative)).toBe(cumulative[1]);
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

  it('does not announce a closely-spaced maneuver before the previous one is reached', () => {
    // Two turns only 150m apart — well inside the normal 400m lookahead.
    const closeManeuvers: Maneuver[] = [
      { instruction: 'Turn left onto Main St', distanceFromStartMeters: 1000 },
      { instruction: 'Turn right onto Oak Ave', distanceFromStartMeters: 1150 },
    ];
    // Just before reaching the first maneuver — the second's naive 400m
    // window (1150 - 400 = 750) would already be satisfied here, but it
    // must not fire until the first maneuver has actually been passed.
    expect(nextManeuverToAnnounce(closeManeuvers, 900, 1)).toBeNull();
    // Once past the first maneuver's position, the second is fair game.
    expect(nextManeuverToAnnounce(closeManeuvers, 1000, 1)).toEqual(closeManeuvers[1]);
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
