import {
  courseForReroute, createRerouteTracker, firstManeuverToAnnounceAfterReroute,
  REROUTE_MIN_INTERVAL_MS, type RerouteFix,
} from '../src/utils/rerouteLogic';
import {
  instructionWithControl, intersectionControlsForManeuvers, type ControlNode,
} from '../src/utils/intersectionControlLogic';
import { buildCumulativeRouteDistances, distanceToRouteMeters, isOffRoute } from '../src/utils/turnByTurnLogic';
import type { Maneuver } from '../src/services/here/hereRoutingClient';

const fix = (offMeters: number, t: number, extra: Partial<RerouteFix> = {}): RerouteFix => ({
  distanceToRouteMeters: offMeters, distanceToDestinationMeters: 5000, accuracyMeters: 8, timestampMs: t, ...extra,
});

describe('repositioning (reroute) decisions', () => {
  it('asks for a new route after 3 off-route fixes in a row, not on one GPS jump', () => {
    const r = createRerouteTracker();
    expect(r.update(fix(80, 1000))).toBe(false);
    expect(r.update(fix(10, 2000))).toBe(false); // back on the route: streak reset
    expect(r.update(fix(80, 3000))).toBe(false);
    expect(r.update(fix(80, 4000))).toBe(false);
    expect(r.update(fix(80, 5000))).toBe(true);
  });

  it('ignores inaccurate fixes and anything near the destination', () => {
    const r = createRerouteTracker();
    for (let t = 0; t < 5; t++) expect(r.update(fix(200, t * 1000, { accuracyMeters: 60 }))).toBe(false);
    for (let t = 0; t < 5; t++) expect(r.update(fix(200, t * 1000, { distanceToDestinationMeters: 100 }))).toBe(false);
  });

  it('never has two requests at once, and waits between requests', () => {
    const r = createRerouteTracker();
    r.update(fix(80, 0)); r.update(fix(80, 1000));
    expect(r.update(fix(80, 2000))).toBe(true);
    r.started(2000);
    expect(r.update(fix(80, 3000))).toBe(false); // in flight
    r.finished(); // failed
    for (let t = 4000; t < 2000 + REROUTE_MIN_INTERVAL_MS; t += 1000) expect(r.update(fix(80, t))).toBe(false);
    expect(r.update(fix(80, 2000 + REROUTE_MIN_INTERVAL_MS))).toBe(true);
  });

  it('keeps the wait across a new route (tracker created with the last request time)', () => {
    const r = createRerouteTracker(10_000);
    r.update(fix(80, 11_000)); r.update(fix(80, 12_000));
    expect(r.update(fix(80, 13_000))).toBe(false);
  });

  it('sends the heading only when moving, and skips the "Head north" depart after recalculating', () => {
    expect(courseForReroute(10, 90)).toBe(90);
    expect(courseForReroute(1, 90)).toBeUndefined();
    expect(courseForReroute(10, -1)).toBeUndefined();
    expect(firstManeuverToAnnounceAfterReroute([{ action: 'depart' }, { action: 'turn' }])).toBe(1);
    expect(firstManeuverToAnnounceAfterReroute([{ action: 'turn' }])).toBe(0);
  });
});

describe('off route = distance to the route line', () => {
  // A straight road with vertices 2 km apart (as HERE returns on long straight roads).
  const road = [{ latitude: 28.50, longitude: -81.70 }, { latitude: 28.518, longitude: -81.70 }];
  it('a car on the road midway between far-apart vertices is on the route', () => {
    const midway = { latitude: 28.509, longitude: -81.70 };
    expect(distanceToRouteMeters(midway, road)).toBeLessThan(1);
    expect(isOffRoute(midway, road)).toBe(false);
  });
  it('a car on a parallel road 100 m away is 100 m off', () => {
    const parallel = { latitude: 28.509, longitude: -81.70 + 100 / (111_320 * Math.cos((28.509 * Math.PI) / 180)) };
    expect(distanceToRouteMeters(parallel, road)).toBeGreaterThan(95);
    expect(distanceToRouteMeters(parallel, road)).toBeLessThan(105);
  });
});

describe('turns at traffic lights and stop signs', () => {
  // Route: north 200 m along a road, then turn right (east) 200 m. Vertices every ~10 m.
  const dLat = 10 / 111_320;
  const dLon = 10 / (111_320 * Math.cos((28.5 * Math.PI) / 180));
  const coords = [
    ...Array.from({ length: 21 }, (_, i) => ({ latitude: 28.5 + i * dLat, longitude: -81.7 })),
    ...Array.from({ length: 20 }, (_, i) => ({ latitude: 28.5 + 20 * dLat, longitude: -81.7 + (i + 1) * dLon })),
  ];
  const cumulative = buildCumulativeRouteDistances(coords);
  const turnAt = cumulative[20];
  const maneuvers: Maneuver[] = [
    { instruction: 'Head north on Oak St. Go for 656 ft.', distanceFromStartMeters: 0, action: 'depart' },
    { instruction: 'Turn right onto Main St. Go for 656 ft.', distanceFromStartMeters: turnAt, action: 'turn' },
    { instruction: 'Arrive at your destination.', distanceFromStartMeters: cumulative[40], action: 'arrive' },
  ];
  const junction = coords[20];
  const at = (metersNorth: number, metersEast: number) => ({
    latitude: junction.latitude + metersNorth / 111_320,
    longitude: junction.longitude + metersEast / (111_320 * Math.cos((28.5 * Math.PI) / 180)),
  });

  const controlsWith = (nodes: ControlNode[]) => intersectionControlsForManeuvers(maneuvers, coords, cumulative, nodes);

  it('a traffic light at the junction', () => {
    expect(controlsWith([{ ...at(3, 2), kind: 'traffic_signals' }])).toEqual([null, 'traffic_signals', null]);
  });

  it('a stop sign on our approach (before the turn, on our road)', () => {
    expect(controlsWith([{ ...at(-8, 0), kind: 'stop' }])).toEqual([null, 'stop', null]);
    expect(controlsWith([{ ...at(-8, 0), kind: 'stop', allWay: true }])).toEqual([null, 'all_way_stop', null]);
  });

  it('a stop sign on the cross street does not apply to us', () => {
    // On the cross street west of the junction (the road we turn onto runs east).
    expect(controlsWith([{ ...at(0, -10), kind: 'stop' }])).toEqual([null, null, null]);
  });

  it('nothing nearby, or a light far from the turn', () => {
    expect(controlsWith([])).toEqual([null, null, null]);
    expect(controlsWith([{ ...at(-120, 0), kind: 'traffic_signals' }])).toEqual([null, null, null]);
  });

  it('phrases the instruction like Apple Maps', () => {
    expect(instructionWithControl('Turn right onto Main St. Go for 0.2 mi.', 'traffic_signals'))
      .toBe('At the traffic light, turn right onto Main St. Go for 0.2 mi.');
    expect(instructionWithControl('Turn left onto Oak St.', 'stop')).toBe('At the stop sign, turn left onto Oak St.');
    expect(instructionWithControl('Turn left onto Oak St.', 'all_way_stop')).toBe('At the all-way stop, turn left onto Oak St.');
    expect(instructionWithControl('Turn left onto Oak St.', null)).toBe('Turn left onto Oak St.');
  });
});
