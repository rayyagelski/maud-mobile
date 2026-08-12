import { HERE_API_KEY } from '../../config/env';
import { decodeFlexiblePolyline } from './flexiblePolyline';
import { haversineMeters } from '../../utils/complianceAlertLogic';

export interface LatLng {
  latitude: number;
  longitude: number;
}

// A single spoken turn-by-turn instruction, positioned by how far along the
// route (from its very start) it occurs — not by the raw point-index offset
// HERE returns (see routeFromSections below).
export interface Maneuver {
  instruction: string;
  distanceFromStartMeters: number;
}

export interface HereRouteResult {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  // HERE's historical/no-traffic baseline for this route — only present when
  // requested via `return=typicalDuration`. Comparing this against
  // durationSeconds (which is always traffic-aware) is how live backups are
  // detected (see trafficBackupLogic.ts) without a separate Traffic Flow API
  // integration.
  typicalDurationSeconds?: number;
  maneuvers: Maneuver[];
}

interface HereRoutesResponse {
  routes: Array<{
    sections: Array<{
      polyline: string;
      summary: { length: number; duration: number; typicalDuration?: number };
      actions?: Array<{
        instruction: string;
        // Confirmed via a live request (2026-08-03): this is an index into
        // THIS section's own decoded polyline points, not a distance —
        // e.g. action[0].offset=0 (depart), action[1].offset=3 means the
        // 4th decoded point of this section, not 3 metres/km in.
        offset: number;
      }>;
    }>;
  }>;
}

function routeFromSections(sections: HereRoutesResponse['routes'][number]['sections']): HereRouteResult | null {
  if (sections.length === 0) return null;

  const coordinates: LatLng[] = [];
  const maneuvers: Maneuver[] = [];
  let distanceSoFarMeters = 0;
  // Only meaningful if every section reported one — a partial sum would
  // silently understate the backup delay rather than correctly reporting
  // "unknown".
  let typicalDurationSeconds: number | undefined = 0;

  for (const section of sections) {
    const sectionCoords = decodeFlexiblePolyline(section.polyline).coordinates.map(c => ({
      latitude: c.latitude,
      longitude: c.longitude,
    }));

    for (const action of section.actions ?? []) {
      let offsetDistanceMeters = 0;
      for (let i = 1; i <= action.offset && i < sectionCoords.length; i++) {
        offsetDistanceMeters += haversineMeters(sectionCoords[i - 1], sectionCoords[i]);
      }
      maneuvers.push({
        instruction: action.instruction,
        distanceFromStartMeters: distanceSoFarMeters + offsetDistanceMeters,
      });
    }

    coordinates.push(...sectionCoords);
    distanceSoFarMeters += section.summary.length;
    if (typicalDurationSeconds != null && section.summary.typicalDuration != null) {
      typicalDurationSeconds += section.summary.typicalDuration;
    } else {
      typicalDurationSeconds = undefined;
    }
  }

  const durationSeconds = sections.reduce((sum, s) => sum + s.summary.duration, 0);

  return { coordinates, distanceMeters: distanceSoFarMeters, durationSeconds, typicalDurationSeconds, maneuvers };
}

// HERE Routing API v8 — plain REST/JSON, no native SDK. Coordinates are
// decoded from HERE's flexible-polyline format and fed straight into the
// existing react-native-maps <Polyline>, so no map-library swap is needed.
//
// `alternatives` requests up to N additional routes beyond the optimal one
// (HERE's own documented range is 0–5) — the first entry in the returned
// array is always HERE's optimal route.
export async function fetchHereRoutes(
  origin: LatLng,
  destination: LatLng,
  alternatives = 0,
  isImperial = false,
): Promise<HereRouteResult[]> {
  const params = new URLSearchParams({
    transportMode: 'car',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    return: 'polyline,summary,actions,instructions,typicalDuration',
    alternatives: String(alternatives),
    // HERE embeds distance units directly into actions[].instruction's text
    // (e.g. "Go for 727 m" vs "Go for 0.5 mi") — this is what
    // useTurnByTurnGuidance.ts speaks verbatim, so it must be requested in
    // the right unit system up front rather than reformatted after the fact.
    units: isImperial ? 'imperial' : 'metric',
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://router.hereapi.com/v8/routes?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE routing request failed (${response.status})`);
  }

  const data: HereRoutesResponse = await response.json();
  return data.routes
    .map(route => routeFromSections(route.sections))
    .filter((r): r is HereRouteResult => r !== null);
}

// Back-compat single-route form, kept for call sites that only ever want HERE's optimal route.
export async function fetchHereRoute(origin: LatLng, destination: LatLng): Promise<HereRouteResult | null> {
  const routes = await fetchHereRoutes(origin, destination, 0);
  return routes[0] ?? null;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  position: LatLng;
}

interface HereAutosuggestResponse {
  items: Array<{
    id: string;
    title: string;
    position?: { lat: number; lng: number };
  }>;
}

// HERE Geocoding & Search "Autosuggest" endpoint — as-you-type address
// suggestions for the RoutePlanner "To" field, biased near the given
// location. Items without a resolvable position (category/chain suggestions
// like "coffee near me") are filtered out — only real addresses/places.
export async function suggestAddresses(query: string, near: LatLng, limit = 5): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    at: `${near.latitude},${near.longitude}`,
    limit: String(limit),
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://autosuggest.search.hereapi.com/v1/autosuggest?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE autosuggest request failed (${response.status})`);
  }

  const data: HereAutosuggestResponse = await response.json();
  return data.items
    .filter((item): item is typeof item & { position: { lat: number; lng: number } } => item.position != null)
    .map(item => ({
      id: item.id,
      label: item.title,
      position: { latitude: item.position.lat, longitude: item.position.lng },
    }));
}

interface HereGeocodeResponse {
  items: Array<{ position: { lat: number; lng: number } }>;
}

// HERE Geocoding & Search API — resolves the free-text "To" field into
// coordinates before requesting a route. Same API key as routing.
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const params = new URLSearchParams({ q: query, apiKey: HERE_API_KEY });
  const response = await fetch(`https://geocode.search.hereapi.com/v1/geocode?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE geocoding request failed (${response.status})`);
  }
  const data: HereGeocodeResponse = await response.json();
  const item = data.items[0];
  if (!item) return null;
  return { latitude: item.position.lat, longitude: item.position.lng };
}
