import {
  allowanceRowsFor, allowedUpTo, countsForScore, DEFAULT_SPEEDING_ALLOWANCES, normalizeAllowanceRows,
} from '../src/utils/speedingAllowance';
import { speedingSecondsForFix } from '../src/utils/speedZoneAlertLogic';
import settingsReducer, { fetchSpeedingAllowances } from '../src/store/slices/settingsSlice';

const MPH = 0.44704; // m/s per mph
const KMH = 1 / 3.6;
const rows = DEFAULT_SPEEDING_ALLOWANCES.mph;

describe('speeding allowance (fair scoring)', () => {
  it('uses the table, and the nearest margin below for other signs', () => {
    expect(allowedUpTo(25, rows)).toBe(30);
    expect(allowedUpTo(65, rows)).toBe(70);
    expect(allowedUpTo(70, rows)).toBe(80);
    expect(allowedUpTo(15, rows)).toBe(20);
    expect(allowedUpTo(75, rows)).toBe(85);
    expect(allowedUpTo(100, rows)).toBe(110);
  });

  it('counts only speeds above the allowance', () => {
    expect(countsForScore(30 * MPH, 25 * MPH, true, rows)).toBe(false);
    expect(countsForScore(31 * MPH, 25 * MPH, true, rows)).toBe(true);
    expect(countsForScore(80 * MPH, 70 * MPH, true, rows)).toBe(false);
    expect(countsForScore(81 * MPH, 70 * MPH, true, rows)).toBe(true);
    expect(countsForScore(55 * KMH, 50 * KMH, false, rows)).toBe(false);
    expect(countsForScore(56 * KMH, 50 * KMH, false, rows)).toBe(true);
    expect(countsForScore(undefined, 25 * MPH, true, rows)).toBe(true);
    expect(countsForScore(30 * MPH, null, true, rows)).toBe(true);
  });

  it('matches the backend on HERE limits that are not exact sign values', () => {
    // HERE gives limits in km/h-derived m/s: 40 km/h ≈ 24.85 mph is read as a 25 sign.
    expect(countsForScore(30 * MPH, 40 * KMH, true, rows)).toBe(false);
    expect(countsForScore(31 * MPH, 40 * KMH, true, rows)).toBe(true);
  });

  it('cleans up server rows and falls back to the defaults', () => {
    expect(normalizeAllowanceRows([{ sign: '35', allowed: '40' }, { sign: 30, allowed: 20 }, { sign: 25, allowed: 30 }, 'x']))
      .toEqual([{ sign: 25, allowed: 30 }, { sign: 35, allowed: 40 }]);
    expect(allowanceRowsFor(undefined, true)).toEqual(rows);
    expect(allowanceRowsFor({ mph: [], kmh: [{ sign: 50, allowed: 60 }] }, true)).toEqual(rows);
    expect(allowanceRowsFor({ mph: [], kmh: [{ sign: 50, allowed: 60 }] }, false)).toEqual([{ sign: 50, allowed: 60 }]);
  });

  it('stores fetched tables, but never replaces them with empty ones', () => {
    const base = settingsReducer(undefined, { type: '@@init' });
    const fetched = { mph: [{ sign: 25, allowed: 32 }], kmh: [] };
    const s1 = settingsReducer(base, { type: fetchSpeedingAllowances.fulfilled.type, payload: fetched });
    expect(s1.speedingAllowances).toEqual(fetched);
    const s2 = settingsReducer(s1, { type: fetchSpeedingAllowances.fulfilled.type, payload: { mph: [], kmh: [] } });
    expect(s2.speedingAllowances).toEqual(fetched);
  });
});

describe('phone speeding counter with the allowance', () => {
  const spans = [{ distanceFromStartMeters: 0, speedLimitMps: 25 * MPH }];
  const allowance = (s: number, limit: number) => countsForScore(s, limit, true, rows);

  it('ignores speeding within the allowance', () => {
    expect(speedingSecondsForFix(spans, 100, 29 * MPH, 1, allowance)).toBe(0);
    expect(speedingSecondsForFix(spans, 100, 31 * MPH, 1, allowance)).toBe(1);
  });

  it('without an allowance still counts any speed above the limit (unchanged)', () => {
    expect(speedingSecondsForFix(spans, 100, 26 * MPH, 1)).toBe(1);
  });
});
