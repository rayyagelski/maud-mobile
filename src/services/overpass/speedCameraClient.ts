import { OVERPASS_BASE_URL } from '../../utils/constants';
import type { SpeedCamera, Coordinate } from '../../utils/complianceAlertLogic';

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// OSM maxspeed tags are usually a bare number (km/h) but sometimes "30 mph" —
// normalise everything to km/h.
export function parseMaxSpeedTag(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  return raw.toLowerCase().includes('mph') ? Math.round(value * 1.60934) : Math.round(value);
}

// Queries OpenStreetMap's Overpass API directly from the client — no backend
// involvement, no API key. Matches highway=speed_camera nodes plus
// enforcement=maxspeed nodes (the two common OSM tagging conventions).
export async function fetchNearbySpeedCameras(position: Coordinate, radiusKm: number): Promise<SpeedCamera[]> {
  const radiusMeters = Math.round(radiusKm * 1000);
  const { latitude, longitude } = position;
  const query =
    `[out:json][timeout:25];` +
    `(` +
    `node["highway"="speed_camera"](around:${radiusMeters},${latitude},${longitude});` +
    `node["enforcement"="maxspeed"](around:${radiusMeters},${latitude},${longitude});` +
    `);` +
    `out body;`;

  const response = await fetch(OVERPASS_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }

  const data: OverpassResponse = await response.json();
  return data.elements
    .filter(el => el.type === 'node')
    .map(el => ({
      id: String(el.id),
      latitude: el.lat,
      longitude: el.lon,
      speedLimitKmh: parseMaxSpeedTag(el.tags?.maxspeed),
    }));
}
