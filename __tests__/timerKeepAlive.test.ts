jest.mock('../src/hooks/useAppSelector', () => ({ useAppSelector: jest.fn() }));
jest.mock('../src/services/diagnosticsLog', () => ({ logDiagnostic: jest.fn() }));

import { createTimerKeepAlive, KEEP_TIMERS_AFTER_TRIP_MS } from '../src/hooks/useKeepTimersRunningDuringTrips';

function setup() {
  const start = jest.fn(() => Promise.resolve(true));
  const stop = jest.fn();
  return { start, stop, keepAlive: createTimerKeepAlive({ start, stop }) };
}

describe('createTimerKeepAlive', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does nothing while no trip has started', () => {
    const { start, stop, keepAlive } = setup();
    keepAlive.setTracking(false);
    jest.advanceTimersByTime(KEEP_TIMERS_AFTER_TRIP_MS * 2);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('turns on when a trip starts, stays on after it ends long enough for the result, then turns off', () => {
    const { start, stop, keepAlive } = setup();
    keepAlive.setTracking(true);
    expect(start).toHaveBeenCalledTimes(1);

    keepAlive.setTracking(false);
    jest.advanceTimersByTime(KEEP_TIMERS_AFTER_TRIP_MS - 1);
    expect(stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(keepAlive.isActive()).toBe(false);
  });

  it('a new trip within the grace period keeps it on without restarting it', () => {
    const { start, stop, keepAlive } = setup();
    keepAlive.setTracking(true);
    keepAlive.setTracking(false);
    jest.advanceTimersByTime(60_000);
    keepAlive.setTracking(true);
    jest.advanceTimersByTime(KEEP_TIMERS_AFTER_TRIP_MS * 2);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it('turns back on for a trip after it was released', () => {
    const { start, stop, keepAlive } = setup();
    keepAlive.setTracking(true);
    keepAlive.setTracking(false);
    jest.advanceTimersByTime(KEEP_TIMERS_AFTER_TRIP_MS);
    keepAlive.setTracking(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('releases on unmount', () => {
    const { stop, keepAlive } = setup();
    keepAlive.setTracking(true);
    keepAlive.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(KEEP_TIMERS_AFTER_TRIP_MS * 2);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
