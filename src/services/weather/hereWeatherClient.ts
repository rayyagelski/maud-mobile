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
