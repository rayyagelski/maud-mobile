import { evaluateActivityGate } from '../src/utils/activityGateLogic';

describe('evaluateActivityGate', () => {
  it('does not block a real drive when the classifier says "still" at driving speed', () => {
    // The exact reading from the real-drive diagnostics log that caused
    // auto-start to never fire for 8 minutes (phone rigidly mounted in a
    // holder gives the classifier no vibration signature to work with).
    const decision = evaluateActivityGate({ type: 'still', confidence: 100 }, 41.112);

    expect(decision.reject).toBe(false);
    expect(decision).toMatchObject({ contradictedBySpeed: true, maxPlausibleKmh: 10 });
  });

  it('still trusts "still" at GPS-jitter speeds around a parked car', () => {
    // Same log, earlier entry — genuinely parked, GPS noise reading 4.1 km/h.
    expect(evaluateActivityGate({ type: 'still', confidence: 100 }, 4.104).reject).toBe(true);
  });

  it('still blocks a trip starting while walking away from the car', () => {
    // The original reason this gate exists.
    expect(evaluateActivityGate({ type: 'walking', confidence: 95 }, 5).reject).toBe(true);
    expect(evaluateActivityGate({ type: 'on_foot', confidence: 90 }, 6.5).reject).toBe(true);
  });

  it('overrides walking/running once the speed makes them impossible', () => {
    expect(evaluateActivityGate({ type: 'walking', confidence: 100 }, 60).reject).toBe(false);
    expect(evaluateActivityGate({ type: 'running', confidence: 100 }, 80).reject).toBe(false);
  });

  it('keeps blocking cycling across realistic cycling speeds', () => {
    // A real transport mode of its own, not a car trip to auto-record.
    expect(evaluateActivityGate({ type: 'on_bicycle', confidence: 90 }, 25).reject).toBe(true);
    expect(evaluateActivityGate({ type: 'on_bicycle', confidence: 90 }, 40).reject).toBe(true);
  });

  it('ignores a low-confidence classification entirely', () => {
    const decision = evaluateActivityGate({ type: 'still', confidence: 40 }, 5);

    expect(decision.reject).toBe(false);
    expect(decision).toMatchObject({ contradictedBySpeed: false });
  });

  it('never blocks when the device reports no activity at all', () => {
    expect(evaluateActivityGate(null, 50).reject).toBe(false);
    expect(evaluateActivityGate(undefined, 0).reject).toBe(false);
  });

  it('never blocks on a vehicle classification', () => {
    expect(evaluateActivityGate({ type: 'in_vehicle', confidence: 100 }, 50).reject).toBe(false);
  });
});
