// Fair scoring: how far over a posted limit a driver may go before it counts
// against the Driver Score and rewards. Same rules as the backend
// (App\Service\Rewards\SpeedingAllowance); the tables themselves are edited
// in Sonata (Reward Settings, tabs "English (mph)" / "German (km/h)") and
// fetched from /rewards/speeding-allowances, these defaults covering the
// time before the first fetch.
//
// A row is sign -> allowed up to, both in the sign's unit: 25 -> 30 means on
// a 25 sign up to 30 is allowed and only more than 30 counts. A sign not in
// the table gets the margin of the nearest listed sign below it (or of the
// first row, below the first), e.g. 75 mph -> 85 from 70 -> 80.
//
// Trip details are NOT affected: every speeding event is still shown there.

export interface SpeedingAllowanceRow {
  sign: number;
  allowed: number;
}

export interface SpeedingAllowanceTables {
  mph: SpeedingAllowanceRow[];
  kmh: SpeedingAllowanceRow[];
}

// 5 -> 15 is for parking areas; 10-20 are listed so they keep their +5
// instead of taking the 5 sign's +10.
const DEFAULT_ROWS: SpeedingAllowanceRow[] = [
  { sign: 5, allowed: 15 },
  { sign: 10, allowed: 15 },
  { sign: 15, allowed: 20 },
  { sign: 20, allowed: 25 },
  { sign: 25, allowed: 30 },
  { sign: 30, allowed: 35 },
  { sign: 35, allowed: 40 },
  { sign: 40, allowed: 45 },
  { sign: 45, allowed: 50 },
  { sign: 50, allowed: 55 },
  { sign: 55, allowed: 60 },
  { sign: 60, allowed: 65 },
  { sign: 65, allowed: 70 },
  { sign: 70, allowed: 80 },
];

export const DEFAULT_SPEEDING_ALLOWANCES: SpeedingAllowanceTables = { mph: DEFAULT_ROWS, kmh: DEFAULT_ROWS };

const MS_TO_MPH = 1 / 0.44704; // exact: 1 mph = 0.44704 m/s
const MS_TO_KMH = 3.6;
// A speed exactly at the allowance must not count after m/s rounding.
const EPSILON = 1e-6;

// Sorted by sign, one row per sign, only rows with 0 < sign <= allowed.
export function normalizeAllowanceRows(rows: unknown): SpeedingAllowanceRow[] {
  if (!Array.isArray(rows)) return [];
  const bySign = new Map<number, SpeedingAllowanceRow>();
  rows.forEach((row) => {
    const sign = Math.trunc(Number((row as Partial<SpeedingAllowanceRow>)?.sign));
    const allowed = Math.trunc(Number((row as Partial<SpeedingAllowanceRow>)?.allowed));
    if (!Number.isFinite(sign) || !Number.isFinite(allowed) || sign <= 0 || allowed < sign) return;
    bySign.set(sign, { sign, allowed });
  });
  return [...bySign.values()].sort((a, b) => a.sign - b.sign);
}

// Highest speed (in the sign's unit) that does not count as speeding.
export function allowedUpTo(sign: number, rows: SpeedingAllowanceRow[]): number {
  if (rows.length === 0) return sign;
  let margin = rows[0].allowed - rows[0].sign;
  for (const row of rows) {
    if (row.sign === sign) return row.allowed;
    if (row.sign < sign) margin = row.allowed - row.sign;
  }
  return sign + margin;
}

// Whether a speed counts as speeding for the score. Speed and limit in m/s
// (as GPS, HERE and VGD give them); the limit is turned back into the number
// on the sign in the driver's units. Unknown speed or limit counts.
export function countsForScore(
  speedMs: number | null | undefined,
  limitMps: number | null | undefined,
  imperial: boolean,
  rows: SpeedingAllowanceRow[],
): boolean {
  if (speedMs == null || limitMps == null || !(limitMps > 0)) return true;
  const factor = imperial ? MS_TO_MPH : MS_TO_KMH;
  const sign = Math.round(limitMps * factor);
  return speedMs * factor > allowedUpTo(sign, rows) + EPSILON;
}

// The table for the driver's units; falls back to the defaults when the
// stored tables are missing (state saved before this existed) or empty.
export function allowanceRowsFor(
  tables: Partial<SpeedingAllowanceTables> | undefined,
  imperial: boolean,
): SpeedingAllowanceRow[] {
  const rows = normalizeAllowanceRows(imperial ? tables?.mph : tables?.kmh);
  return rows.length > 0 ? rows : DEFAULT_ROWS;
}
