import {
  currentSpanIndex, nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance, fillMissingSpeedLimits,
  createSpeedZoneAnnouncementMemory, speedingSecondsForFix, speedZoneAnnouncementText,
  SPEED_ZONE_ANNOUNCE_DISTANCE_METERS, SPEED_ZONE_REANNOUNCE_COOLDOWN_MS,
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

describe('one announcement per zone (broken-record fix)', () => {
  // 35 -> 30 at 1000m -> 25 at 1300m: inside the 30 zone with the 25 zone
  // within the approach window — the exact real-drive ping-pong shape.
  const nested: SpeedLimitSpan[] = [
    { distanceFromStartMeters: 0, speedLimitMps: 15.6 },
    { distanceFromStartMeters: 1000, speedLimitMps: 13.4 },
    { distanceFromStartMeters: 1300, speedLimitMps: 11.2 },
  ];

  it('does not alternate between "in 30" and "approaching 25" once each has been announced', () => {
    const memory = createSpeedZoneAnnouncementMemory();
    let lastSpan: number | null = null;
    const spoken: string[] = [];
    // Drive from 1050m to 1290m in 30m steps, exactly as fixes arrive.
    for (let d = 1050, t = 0; d < 1300; d += 30, t += 3000) {
      const a = nextSpeedZoneToAnnounce(nested, d, lastSpan, (limit) => memory.isRecentlyAnnounced(limit, t));
      if (a) {
        lastSpan = a.distanceFromStartMeters;
        memory.markAnnounced(a.speedLimitMps, t);
        spoken.push(`${a.speedLimitMps}:${a.isApproaching ? 'ahead' : 'in'}`);
      }
    }
    expect(spoken).toEqual(['13.4:in', '11.2:ahead']);
  });

  it('allows the same limit value again once the cooldown has passed', () => {
    const memory = createSpeedZoneAnnouncementMemory();
    memory.markAnnounced(11.2, 0);
    expect(memory.isRecentlyAnnounced(11.2, SPEED_ZONE_REANNOUNCE_COOLDOWN_MS - 1)).toBe(true);
    expect(memory.isRecentlyAnnounced(11.2, SPEED_ZONE_REANNOUNCE_COOLDOWN_MS)).toBe(false);
  });

  it('a suppressed in-zone announcement does not mask an approaching one', () => {
    // 30 already announced; 25 has not been — must still get "approaching 25".
    const a = nextSpeedZoneToAnnounce(nested, 1100, null, (limit) => limit === 13.4);
    expect(a).toEqual({ speedLimitMps: 11.2, distanceFromStartMeters: 1300, isApproaching: true });
  });
});

describe('speedingSecondsForFix', () => {
  it('counts the whole interval when over the posted limit of the current span', () => {
    expect(speedingSecondsForFix(spans, 1100, 12, 3)).toBe(3);
  });

  it('counts nothing at or under the limit, or with no known limit', () => {
    expect(speedingSecondsForFix(spans, 1100, 11.2, 3)).toBe(0);
    expect(speedingSecondsForFix(spans, -10, 30, 3)).toBe(0);
    expect(speedingSecondsForFix([{ distanceFromStartMeters: 0, speedLimitMps: null }], 10, 30, 3)).toBe(0);
  });
});

describe('speedZoneAnnouncementText', () => {
  it('uses the requested approaching wording', () => {
    expect(speedZoneAnnouncementText('25 mph', true))
      .toBe('You are approaching a 25 mph speed limit zone straight ahead of you.');
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

describe('fillMissingSpeedLimits', () => {
  it('leaves a fully-populated span list unchanged', () => {
    expect(fillMissingSpeedLimits(spans)).toEqual(spans);
  });

  it('carries the last known limit forward through a null gap', () => {
    // HERE returned a span at 500m with no posted-limit data.
    const withGap: SpeedLimitSpan[] = [
      { distanceFromStartMeters: 0, speedLimitMps: 20.1 },
      { distanceFromStartMeters: 500, speedLimitMps: null },
      { distanceFromStartMeters: 1000, speedLimitMps: 11.2 },
    ];

    const filled = fillMissingSpeedLimits(withGap);

    expect(filled[1].speedLimitMps).toBe(20.1);
    // The real, known reduction is untouched — filling the gap doesn't
    // invent a change, and doesn't obscure the genuine one right after it.
    expect(filled[2].speedLimitMps).toBe(11.2);
  });

  it('fills through consecutive gaps, not just a single one', () => {
    const withGaps: SpeedLimitSpan[] = [
      { distanceFromStartMeters: 0, speedLimitMps: 20.1 },
      { distanceFromStartMeters: 300, speedLimitMps: null },
      { distanceFromStartMeters: 600, speedLimitMps: null },
      { distanceFromStartMeters: 900, speedLimitMps: 13.4 },
    ];

    const filled = fillMissingSpeedLimits(withGaps);

    expect(filled.map(s => s.speedLimitMps)).toEqual([20.1, 20.1, 20.1, 13.4]);
  });

  it('leaves a gap before the first known limit as null — nothing to estimate from yet', () => {
    const leadingGap: SpeedLimitSpan[] = [
      { distanceFromStartMeters: 0, speedLimitMps: null },
      { distanceFromStartMeters: 400, speedLimitMps: 20.1 },
    ];

    expect(fillMissingSpeedLimits(leadingGap)[0].speedLimitMps).toBeNull();
  });

  it('does not mutate the input array', () => {
    const withGap: SpeedLimitSpan[] = [
      { distanceFromStartMeters: 0, speedLimitMps: 20.1 },
      { distanceFromStartMeters: 500, speedLimitMps: null },
    ];

    fillMissingSpeedLimits(withGap);

    expect(withGap[1].speedLimitMps).toBeNull();
  });
});
