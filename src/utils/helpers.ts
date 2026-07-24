import type { GpsPoint } from '../types/trip.types';

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const claims = decodeJwt(token);
  if (!claims || typeof claims.exp !== 'number') return true;
  return Date.now() / 1000 > claims.exp;
}

export function haversineDistanceKm(a: GpsPoint, b: GpsPoint): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
const LITERS_PER_GALLON = 3.785411784;
const GRAMS_PER_LB = 453.59237;

// Conversions match the exact formulas in the reward-model spec doc (mirrors
// the backend's own US/EU unit-handling section), not approximations.
export function kmToMiles(km: number): number {
  return (km * 1000) / METERS_PER_MILE;
}

export function litersToGallons(liters: number): number {
  return liters / LITERS_PER_GALLON;
}

export function gramsToLbs(grams: number): number {
  return grams / GRAMS_PER_LB;
}

// Standard tailpipe combustion emission factors (grams CO2 per litre of fuel
// burned) — widely-cited figures (EPA/DEFRA), used here for a pre-trip
// *estimate* only. Electric/hydrogen are deliberately not covered: EVs have
// no tailpipe CO2 (real figure depends on regional grid intensity, which
// isn't available client-side — see the reward-model spec's own note on
// this), and hydrogen fuel cells are zero-tailpipe too. Omitted rather than
// fabricated, consistent with how the rest of this app handles unavailable data.
const CO2_GRAMS_PER_LITER: Partial<Record<'petrol' | 'diesel' | 'hybrid', number>> = {
  petrol: 2310,
  diesel: 2680,
  hybrid: 2310, // most hybrids burn petrol
};

export function estimateFuelCo2Grams(
  fuelType: string | undefined,
  litersUsed: number,
): number | null {
  const factor = fuelType ? CO2_GRAMS_PER_LITER[fuelType as 'petrol' | 'diesel' | 'hybrid'] : undefined;
  return factor ? litersUsed * factor : null;
}

export function formatDistance(km: number, isImperial = false): string {
  if (isImperial) {
    const miles = kmToMiles(km);
    if (miles < 0.1) return `${Math.round(km * 1000 * FEET_PER_METER)}ft`;
    return `${miles.toFixed(1)}mi`;
  }
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// RFC4122 v4-format UUID, needed specifically for VGD's `id` field
// (Joi `.uuid()`-validated) — generateId()'s format doesn't qualify.
// Math.random() is fine here: this only needs to be practically unique
// (a client-generated idempotency key), not cryptographically random.
export function generateUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
