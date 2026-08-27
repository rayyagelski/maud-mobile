import {
  isRainingAt as isRainingAtHere, getTemperatureAt as getTemperatureAtHere,
  getConditionsAt as getConditionsAtHere, type WeatherConditions,
} from './hereWeatherClient';
import {
  isRainingAt as isRainingAtOpenWeather, getTemperatureAt as getTemperatureAtOpenWeather,
  getConditionsAt as getConditionsAtOpenWeather,
} from './openWeatherClient';
import type { LatLng } from '../here/hereRoutingClient';

export type { WeatherConditions };

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

// Same HERE-preferred/OpenWeatherMap-fallback pattern as isRainingAt() above.
// Returns null (rather than throwing) if both providers fail — callers treat
// that as "unknown ambient conditions", not an error worth blocking on.
export async function getTemperatureAt(location: LatLng): Promise<number | null> {
  try {
    return await getTemperatureAtHere(location);
  } catch {
    try {
      return await getTemperatureAtOpenWeather(location);
    } catch {
      return null;
    }
  }
}

// Same HERE-preferred/OpenWeatherMap-fallback pattern, for callers (e.g.
// destination-weather display) that want temperature + condition together.
export async function getConditionsAt(location: LatLng): Promise<WeatherConditions | null> {
  try {
    return await getConditionsAtHere(location);
  } catch {
    try {
      return await getConditionsAtOpenWeather(location);
    } catch {
      return null;
    }
  }
}
