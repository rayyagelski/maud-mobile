import { isRainingAt as isRainingAtHere } from './hereWeatherClient';
import { isRainingAt as isRainingAtOpenWeather } from './openWeatherClient';
import type { LatLng } from '../here/hereRoutingClient';

// HERE is preferred (same provider as routing/geocoding/discover), but its
// Destination Weather product may not be enabled on the HERE project yet, so
// OpenWeatherMap stays wired in as a live fallback rather than being removed.
// Whichever one actually works starts being used automatically — no manual
// toggle needed. Both failing defaults to "not raining", matching this
// pipeline's existing fail-soft behavior (never blocks trip submission).
export async function isRainingAt(location: LatLng): Promise<boolean> {
  try {
    return await isRainingAtHere(location);
  } catch {
    try {
      return await isRainingAtOpenWeather(location);
    } catch {
      return false;
    }
  }
}
