import {
  detectTrafficBackup,
  findBetterAlternative,
  shouldRenotify,
  TRAFFIC_BACKUP_MIN_DELAY_SECONDS,
  REROUTE_MIN_IMPROVEMENT_SECONDS,
} from '../src/utils/trafficBackupLogic';

describe('detectTrafficBackup', () => {
  it('returns null when typicalDuration is unknown', () => {
    expect(detectTrafficBackup({ durationSeconds: 2000 })).toBeNull();
  });

  it('returns null when the delay is below the absolute floor', () => {
    // 1000s typical, +200s delay — below TRAFFIC_BACKUP_MIN_DELAY_SECONDS (300)
    expect(detectTrafficBackup({ durationSeconds: 1200, typicalDurationSeconds: 1000 })).toBeNull();
  });

  it('returns null when the delay is above the floor but below the ratio', () => {
    // 10000s typical, +301s delay clears the floor but is only ~3% slower
    expect(detectTrafficBackup({ durationSeconds: 10301, typicalDurationSeconds: 10000 })).toBeNull();
  });

  it('detects a backup that clears both the absolute floor and the ratio', () => {
    // 1000s typical, +400s delay (40% slower, well above the 300s floor)
    const result = detectTrafficBackup({ durationSeconds: 1400, typicalDurationSeconds: 1000 });
    expect(result).toEqual({ delaySeconds: 400 });
  });

  it('is exactly at the absolute floor boundary (inclusive)', () => {
    // typical=1000 keeps the ratio requirement (250s) below the absolute
    // floor (300s), so the floor is the binding constraint being tested.
    const typical = 1000;
    const result = detectTrafficBackup({
      durationSeconds: typical + TRAFFIC_BACKUP_MIN_DELAY_SECONDS,
      typicalDurationSeconds: typical,
    });
    expect(result).toEqual({ delaySeconds: TRAFFIC_BACKUP_MIN_DELAY_SECONDS });
  });
});

describe('findBetterAlternative', () => {
  it('returns null when no alternative beats the current route enough', () => {
    const alternatives = [{ durationSeconds: 1900 }, { durationSeconds: 1850 }];
    expect(findBetterAlternative(2000, alternatives)).toBeNull();
  });

  it('returns the fastest alternative that clears the minimum improvement', () => {
    const alternatives = [
      { durationSeconds: 2000 - REROUTE_MIN_IMPROVEMENT_SECONDS }, // exactly at the floor
      { durationSeconds: 1500 }, // clearly faster
      { durationSeconds: 1900 }, // improvement too small
    ];
    expect(findBetterAlternative(2000, alternatives)).toEqual({ durationSeconds: 1500 });
  });

  it('returns null for an empty alternatives list', () => {
    expect(findBetterAlternative(2000, [])).toBeNull();
  });
});

describe('shouldRenotify', () => {
  it('always allows the first notification (nothing dismissed yet)', () => {
    expect(shouldRenotify(400, 0)).toBe(true);
  });

  it('suppresses a repeat notification for a similar delay', () => {
    expect(shouldRenotify(410, 400)).toBe(false);
  });

  it('allows re-notifying once the delay has grown meaningfully worse', () => {
    expect(shouldRenotify(600, 400)).toBe(true);
  });
});
