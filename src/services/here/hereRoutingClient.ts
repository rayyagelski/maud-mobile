import { HERE_API_KEY } from '../../config/env';
import { decodeFlexiblePolyline } from './flexiblePolyline';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface HereRouteResult {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

interface HereRoutesResponse {
  routes: Array<{
    sections: Array<{
      polyline: string;
      summary: { length: number; duration: number };
    }>;
  }>;
}

// HERE Routing API v8 — plain REST/JSON, no native SDK. Coordinates are
// decoded from HERE's flexible-polyline format and fed straight into the
// existing react-native-maps <Polyline>, so no map-library swap is needed.
export async function fetchHereRoute(origin: LatLng, destination: LatLng): Promise<HereRouteResult | null> {
  const params = new URLSearchParams({
    transportMode: 'car',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    return: 'polyline,summary',
    apiKey: HERE_API_KEY,
  });

  const response = await fetch(`https://router.hereapi.com/v8/routes?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HERE routing request failed (${response.status})`);
  }

  const data: HereRoutesResponse = await response.json();
  const sections = data.routes[0]?.sections ?? [];
  if (sections.length === 0) return null;

  const coordinates = sections.flatMap(section =>
    decodeFlexiblePolyline(section.polyline).coordinates.map(c => ({
      latitude: c.latitude,
      longitude: c.longitude,
    })),
  );
  const distanceMeters = sections.reduce((sum, s) => sum + s.summary.length, 0);
  const durationSeconds = sections.reduce((sum, s) => sum + s.summary.duration, 0);

  return { coordinates, distanceMeters, durationSeconds };
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
