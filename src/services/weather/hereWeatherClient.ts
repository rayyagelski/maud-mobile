import { HERE_API_KEY } from '../../config/env';
import type { LatLng } from '../here/hereRoutingClient';

interface HereWeatherResponse {
  places: Array<{
    observations: Array<{
      description?: string;
      skyDesc?: string;
      rainFall?: number;
      precipitation6H?: number;
    }>;
  }>;
}

// HERE Destination Weather API v3 — a separate product/SKU from HERE's
// Routing/Geocoding/Search APIs, billed and enabled independently even
// though it shares the same apiKey. If the product isn't enabled on the
// HERE project this key belongs to, requests fail (401/403) and the caller
// (weatherClient.ts) falls back to OpenWeatherMap.
//
// Field names/shape verified against a real live response (2026-07-16) —
// `observations` is an array of nearby stations sorted by distance (closest
// first), and there is no `precipitationDesc` field (an earlier, unverified
// assumption); the real numeric signal is `rainFall` (mm), with `description`/
// `skyDesc` text as a fallback for cases where rainFall isn't populated.
const RAIN_KEYWORDS = ['rain', 'drizzle', 'thunderstorm'];

function mentionsRain(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RAIN_KEYWORDS.some(keyword => lower.includes(keyword));
}

export async function isRainingAt(location: LatLng): Promise<boolean> {
  const params = new URLSearchParams({
    products: 'observation',
    location: `${location.latitude},${location.longitude}`,
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://weather.hereapi.com/v3/report?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE weather request failed (${response.status})`);
  }

  const data: HereWeatherResponse = await response.json();
  // Nearest station to the given location — observations are pre-sorted by distance.
  const observation = data.places[0]?.observations[0];
  if (!observation) return false;

  return (observation.rainFall ?? 0) > 0
    || mentionsRain(observation.description)
    || mentionsRain(observation.skyDesc);
}

export interface WeatherAlert {
  type: number;
  description: string;
}

interface HereAlertsResponse {
  places: Array<{
    // Real shape (verified 2026-08-10 against live populated responses, e.g.
    // Mexico City returning an active "Heavy rain anticipated" alert): HERE
    // always returns exactly one entry per place, whether or not there's an
    // active alert. A place with nothing active looks like
    // `{ place, timeSegments: [] }` — no `type`/`description` at all. Only a
    // place with a real active alert has `type`/`description` populated
    // alongside a non-empty `timeSegments`. The original 2026-08-03
    // verification apparently only ever hit the no-alert case, so this
    // "empty shell" shape was never actually seen/handled — every place
    // response was being treated as a real alert.
    alerts?: Array<{ type?: number; description?: string; timeSegments?: unknown[] }>;
  }>;
}

// HERE Destination Weather API v3, `alerts` product — a distinct request from
// the `observation` product above (separate field: `places[].alerts`, not
// `places[].observations`).
export async function getSevereAlerts(location: LatLng): Promise<WeatherAlert[]> {
  const params = new URLSearchParams({
    products: 'alerts',
    location: `${location.latitude},${location.longitude}`,
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://weather.hereapi.com/v3/report?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE weather alerts request failed (${response.status})`);
  }

  const data: HereAlertsResponse = await response.json();
  const rawAlerts = data.places[0]?.alerts ?? [];

  // Drop the "no active alert" shell entries — see the shape note above.
  return rawAlerts.filter(
    (alert): alert is WeatherAlert => Boolean(alert.description) && alert.type != null,
  );
}

// Meteorological "alerts" only cover official severe-weather advisories
// (storm/flood warnings etc.) — genuinely heavy rain during a drive very
// often has no matching official alert at all, which is why real-drive
// testing found the severe-weather voice feature silent during actual heavy
// rain. This is a second, independent trigger source using the same
// `observation` product isRainingAt() already calls, classified against the
// standard meteorological "heavy rain" rate (>7.6mm/hr — WMO/NOAA
// intensity bands: light <2.5, moderate 2.5-7.6, heavy >7.6mm/hr) rather than
// isRainingAt()'s any-rain-at-all (>0mm) threshold, which is appropriate for
// scoring but too sensitive for an audible driving warning.
const HEAVY_RAIN_MM_PER_HOUR = 7.6;

export async function getHeavyRainAlert(location: LatLng): Promise<WeatherAlert | null> {
  const params = new URLSearchParams({
    products: 'observation',
    location: `${location.latitude},${location.longitude}`,
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://weather.hereapi.com/v3/report?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE weather request failed (${response.status})`);
  }

  const data: HereWeatherResponse = await response.json();
  const observation = data.places[0]?.observations[0];
  const rainFall = observation?.rainFall ?? 0;

  if (rainFall <= HEAVY_RAIN_MM_PER_HOUR) return null;

  // Synthetic alert — flows through the same pickNewAlert/alertSignature
  // dedup as real HERE alerts (see weatherAlertLogic.ts) rather than needing
  // a second, parallel dedup mechanism. type -1 can never collide with a
  // real HERE alert type (those are small positive integers).
  return { type: -1, description: 'Heavy rain' };
}
