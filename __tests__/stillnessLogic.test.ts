import { evaluateStillness, STILL_MS } from '../src/utils/stillnessLogic';

const NOW = 1_700_000_000_000;

function inputs(overrides: Partial<Parameters<typeof evaluateStillness>[0]> = {}) {
  return {
    isTracking: true,
    stillSince: null,
    lastFixAt: NOW,
    lastFixSpeedMs: 0,
    now: NOW,
    ...overrides,
  };
}

describe('evaluateStillness', () => {
  it('ends the trip after sustained sub-threshold speed', () => {
    expect(evaluateStillness(inputs({ stillSince: NOW - STILL_MS })))
      .toBe('sustained-low-speed');
  });

  it('waits out the full window before ending on low speed', () => {
    expect(evaluateStillness(inputs({ stillSince: NOW - (STILL_MS - 1000) })))
      .toBeNull();
  });

  it('ends the trip when location updates stop arriving after a slow last fix', () => {
    // The real-world parking case: the last fix landed while still rolling
    // above the stop threshold (so stillSince was reset to null), then the
    // plugin went stationary and stopped delivering fixes entirely.
    const reason = evaluateStillness(inputs({
      stillSince: null,
      lastFixAt: NOW - STILL_MS,
      lastFixSpeedMs: 1.2, // ~4 km/h, rolling to a stop
    }));

    expect(reason).toBe('location-updates-stopped');
  });

  it('does not end a trip when fixes stop while still travelling fast', () => {
    // Lost GPS in a tunnel or parking structure at speed — not a parked car.
    // Left to the much longer stale-trip watchdog instead.
    expect(evaluateStillness(inputs({
      stillSince: null,
      lastFixAt: NOW - STILL_MS,
      lastFixSpeedMs: 22, // ~80 km/h
    }))).toBeNull();
  });

  it('does not end on a brief gap in fixes', () => {
    expect(evaluateStillness(inputs({
      lastFixAt: NOW - 30_000,
      lastFixSpeedMs: 0,
    }))).toBeNull();
  });

  it('never ends a trip that is not being tracked', () => {
    expect(evaluateStillness(inputs({
      isTracking: false,
      stillSince: NOW - STILL_MS * 5,
      lastFixAt: NOW - STILL_MS * 5,
    }))).toBeNull();
  });

  it('handles having seen no fixes at all without ending the trip', () => {
    expect(evaluateStillness(inputs({ lastFixAt: null }))).toBeNull();
  });

  it('prefers the low-speed reason when both conditions are satisfied', () => {
    expect(evaluateStillness(inputs({
      stillSince: NOW - STILL_MS,
      lastFixAt: NOW - STILL_MS,
      lastFixSpeedMs: 0,
    }))).toBe('sustained-low-speed');
  });
});
