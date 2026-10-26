import { OVERPASS_BASE_URL, OVERPASS_FALLBACK_URL } from '../../utils/constants';
import type { Coordinate } from '../../utils/complianceAlertLogic';
import type { ControlNode } from '../../utils/intersectionControlLogic';

interface OverpassElement {
  type: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

// Box half-size around each turn (~55 m): covers the stop sign up to 40 m
// before the junction. Exact tag matches inside small boxes keep the query
// cheap — Overpass rejected/timed out on radius+regex queries in testing.
const BOX_HALF_DEGREES = 0.0005;
// Part of route guidance: a slow answer is useless, the turn is then simply
// announced without the phrase.
const REQUEST_TIMEOUT_MS = 10_000;
// One request per route; very long routes are capped (later turns then go
// without the phrase rather than sending a huge query).
const MAX_TURNS_PER_QUERY = 80;

function box(p: Coordinate): string {
  return `${p.latitude - BOX_HALF_DEGREES},${p.longitude - BOX_HALF_DEGREES},`
    + `${p.latitude + BOX_HALF_DEGREES},${p.longitude + BOX_HALF_DEGREES}`;
}

async function post(url: string, query: string, signal: AbortSignal): Promise<OverpassElement[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // overpass-api.de answers 406 to clients without one.
      'User-Agent': 'MAUDConnect (route guidance)',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) throw new Error(`Overpass request failed (${response.status})`);
  const data: { elements?: OverpassElement[] } = await response.json();
  return data.elements ?? [];
}

// Traffic lights and stop signs near the given turn positions, from
// OpenStreetMap's public Overpass API (no key). Tries the main server, then
// a mirror; resolves [] if neither answers in time — guidance then works as
// before, just without "At the traffic light, …".
export async function fetchIntersectionControls(turnPoints: Coordinate[], signal?: AbortSignal): Promise<ControlNode[]> {
  const points = turnPoints.slice(0, MAX_TURNS_PER_QUERY);
  if (points.length === 0) return [];
  const query = `[out:json][timeout:8];(`
    + points.map(p => `node[highway=traffic_signals](${box(p)});node[highway=stop](${box(p)});`).join('')
    + ');out body;';

  for (const url of [OVERPASS_BASE_URL, OVERPASS_FALLBACK_URL]) {
    if (signal?.aborted) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const elements = await post(url, query, controller.signal);
      return elements
        .filter(el => el.type === 'node' && (el.tags?.highway === 'traffic_signals' || el.tags?.highway === 'stop'))
        .map(el => ({
          latitude: el.lat,
          longitude: el.lon,
          kind: el.tags?.highway === 'traffic_signals' ? 'traffic_signals' as const : 'stop' as const,
          allWay: el.tags?.stop === 'all',
        }));
    } catch {
      // Next server.
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  return [];
}
