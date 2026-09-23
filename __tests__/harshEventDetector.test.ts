import {
  createCorneringDetector,
  createLongitudinalDetector,
  headingDeltaDeg,
  type CorneringFix,
  type SpeedFix,
} from '../src/utils/harshEventDetector';
import { MS2_PER_G } from '../src/utils/constants';

const MPH = 0.44704;

// Feeds fixes through a fresh detector; `atS` is seconds since trip start.
function runLongitudinal(fixes: Array<{ atS: number; mph: number; estimated?: boolean }>) {
  const detector = createLongitudinalDetector();
  const events: Array<{ type: string; g: number }> = [];
  for (const f of fixes) {
    const fix: SpeedFix = { timestampMs: 1_700_000_000_000 + f.atS * 1000, speedMs: f.mph * MPH, speedEstimated: f.estimated };
    const e = detector.update(fix);
    if (e) events.push({ type: e.type, g: e.valueMs2 / MS2_PER_G });
  }
  return events;
}

describe('createLongitudinalDetector (GPS speed)', () => {
  it('ignores the fake 0 mph of a non-GPS fix between two moving fixes', () => {
    // Real data (09-23 16:51): 28 mph, "0" (Wi-Fi fix, speed -1), 30 mph,
    // "0", 33 mph — the old code read this as repeated hard braking and
    // acceleration. Those fixes are flagged estimated and skipped.
    expect(runLongitudinal([
      { atS: 0, mph: 28 }, { atS: 3, mph: 0, estimated: true }, { atS: 5, mph: 30 },
      { atS: 9, mph: 0, estimated: true }, { atS: 12, mph: 33 },
    ])).toEqual([]);
  });

  it('ignores normal acceleration from a stop', () => {
    // 0 -> 30 mph in 8s = 0.17g.
    expect(runLongitudinal([0, 3, 6, 8].map((atS, i) => ({ atS, mph: [0, 11, 22, 30][i] })))).toEqual([]);
  });

  it('flags a genuinely hard acceleration once', () => {
    // 23 -> 45 mph in 2s = 0.5g (a real full-throttle event from the week).
    const events = runLongitudinal([{ atS: 0, mph: 23 }, { atS: 2, mph: 45 }, { atS: 5, mph: 55 }]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('harsh_accel');
    expect(events[0].g).toBeCloseTo(0.5, 1);
  });

  it('flags a hard brake', () => {
    // 45 -> 10 mph in 3s = 0.53g.
    const events = runLongitudinal([{ atS: 0, mph: 45 }, { atS: 3, mph: 10 }]);
    expect(events).toEqual([{ type: 'harsh_brake', g: expect.closeTo(-0.53, 1) }]);
  });

  it('counts one long hard acceleration as one event, not one per fix', () => {
    const events = runLongitudinal([{ atS: 0, mph: 0 }, { atS: 2, mph: 20 }, { atS: 4, mph: 40 }, { atS: 6, mph: 58 }]);
    expect(events.filter(e => e.type === 'harsh_accel')).toHaveLength(1);
  });

  it('discards a physically impossible speed glitch instead of reporting it', () => {
    // Real data: 35 mph, then one fix reporting 132 mph, then 67 mph — that
    // single bad fix produced both a 1.48g "acceleration" and a -0.74g
    // "brake". It's dropped, so neither appears.
    expect(runLongitudinal([{ atS: 0, mph: 35 }, { atS: 3, mph: 132 }, { atS: 5, mph: 38 }])).toEqual([]);
  });

  it('does not judge across a long gap between GPS fixes', () => {
    // 10 s between GPS speeds: too averaged to say anything about a short event.
    expect(runLongitudinal([{ atS: 0, mph: 50 }, { atS: 10, mph: 0 }])).toEqual([]);
  });
});

// Feeds fixes 1s apart (the real GPS cadence) through a fresh detector and
// returns the lateral values (in g) of every event it fired.
function runCornering(fixes: Array<Omit<CorneringFix, 'timestampMs'>>): number[] {
  const detector = createCorneringDetector();
  const events: number[] = [];
  fixes.forEach((f, i) => {
    const lateral = detector.update({ ...f, timestampMs: 1_700_000_000_000 + i * 1000 });
    if (lateral != null) events.push(lateral / MS2_PER_G);
  });
  return events;
}

// A steady turn: heading advancing `degPerSec` every second at `speedMs`.
function turn(startDeg: number, degPerSec: number, seconds: number, speedMs: number) {
  return Array.from({ length: seconds }, (_, i) => ({
    headingDeg: (startDeg + degPerSec * i + 360) % 360, speedMs,
  }));
}
const straight = (deg: number, seconds: number, speedMs: number) => turn(deg, 0, seconds, speedMs);

describe('createCorneringDetector (GPS course over ground)', () => {
  it('fires once for a genuinely harsh corner', () => {
    // 30°/s at 10 m/s = 0.52 rad/s * 10 = 5.2 m/s² = 0.53g, held 4 seconds.
    const events = runCornering([...straight(0, 3, 10), ...turn(0, 30, 5, 10), ...straight(150, 3, 10)]);
    expect(events).toHaveLength(1);
    expect(events[0]).toBeGreaterThan(0.45);
  });

  it('ignores a normal turn below the 0.4g threshold', () => {
    // A 90° right turn at 12 mph over 5s: 18°/s at 5.4 m/s = 0.17g.
    expect(runCornering([...straight(0, 3, 5.4), ...turn(0, 18, 6, 5.4), ...straight(90, 3, 5.4)])).toHaveLength(0);
  });

  it('ignores a single heading glitch on a straight road', () => {
    // One fix reporting a wildly wrong heading, then back — the old
    // single-pair method turned exactly this into a "harsh corner".
    const fixes = straight(66, 10, 21);
    fixes[5] = { headingDeg: 110, speedMs: 21 };
    expect(runCornering(fixes)).toHaveLength(0);
  });

  it('ignores normal GPS heading jitter at highway speed', () => {
    // ±4° wobble every fix at 47 mph — a real straight road.
    const jitter = [0, 4, -3, 4, -4, 2, -3, 4, 0, -4, 3, -2].map(d => ({ headingDeg: (60 + d + 360) % 360, speedMs: 21 }));
    expect(runCornering(jitter)).toHaveLength(0);
  });

  it('reports one event for one bend, not one per fix — the 2-seconds-apart double count', () => {
    // Real data: 0.43g and 0.48g recorded 2s apart in the same bend.
    const events = runCornering([...straight(180, 3, 12), ...turn(180, -35, 7, 12), ...straight(0, 4, 12)]);
    expect(events).toHaveLength(1);
  });

  it('reports two separate corners when separated by enough straight road', () => {
    const events = runCornering([
      ...straight(0, 3, 10), ...turn(0, 30, 5, 10),
      ...straight(150, 6, 10),
      ...turn(150, 30, 5, 10), ...straight(300, 3, 10),
    ]);
    expect(events).toHaveLength(2);
  });

  it('ignores heading swings at parking-lot speed, where GPS bearing is unreliable', () => {
    // 90°/s "turns" at 3 m/s (7 mph) would compute as 0.48g — below the
    // 5 m/s floor, so not trusted at all.
    expect(runCornering(turn(0, 90, 6, 3))).toHaveLength(0);
  });

  it('handles the 360→0 wraparound as a small turn, not a huge one', () => {
    // Driving straight north with heading hovering around 0/360.
    const fixes = [358, 1, 359, 2, 0, 358, 1].map(h => ({ headingDeg: h, speedMs: 20 }));
    expect(runCornering(fixes)).toHaveLength(0);
  });

  it('skips fixes without a GPS heading instead of treating them as a heading', () => {
    // Wi-Fi/cell fixes carry heading -1 (now null). Passed through as a
    // compass value, -1 among headings of ~60° reads as a 60° swerve.
    const fixes = straight(60, 10, 20).map((f, i) => (i % 3 === 1 ? { headingDeg: null, speedMs: 20 } : f));
    expect(runCornering(fixes)).toHaveLength(0);
  });

  it('still catches a harsh corner when some fixes in it have no heading', () => {
    // 20-30% of fixes lack GPS heading on real drives; a real corner must
    // survive a missing fix in the middle of it.
    const fixes = [...straight(0, 3, 10), ...turn(0, 30, 6, 10), ...straight(180, 3, 10)]
      .map((f, i) => (i === 5 ? { headingDeg: null, speedMs: 10 } : f));
    expect(runCornering(fixes)).toHaveLength(1);
  });
});

describe('headingDeltaDeg', () => {
  it('computes a plain difference when there is no wraparound', () => {
    expect(headingDeltaDeg(10, 30)).toBeCloseTo(20, 5);
    expect(headingDeltaDeg(30, 10)).toBeCloseTo(-20, 5);
  });

  it('takes the short way around the 0/360 wraparound', () => {
    // 350° -> 10° is a 20° turn, not a 340° one.
    expect(headingDeltaDeg(350, 10)).toBeCloseTo(20, 5);
    expect(headingDeltaDeg(10, 350)).toBeCloseTo(-20, 5);
  });

  it('returns 0 for an unchanged heading', () => {
    expect(headingDeltaDeg(90, 90)).toBeCloseTo(0, 5);
  });
});
