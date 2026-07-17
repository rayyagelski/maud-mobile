import { OPENWEATHER_API_KEY } from '../../config/env';
import { OPENWEATHER_BASE_URL } from '../../utils/constants';
import type { LatLng } from '../here/hereRoutingClient';

interface OpenWeatherResponse {
  weather: Array<{ main: string }>;
}

// OpenWeatherMap "Current Weather Data" endpoint, queried once at trip end
// using the trip's first GPS fix (closest available point to actual trip
// start). Classifies rain from the response's condition group — "Rain",
// "Drizzle", and "Thunderstorm" all involve precipitation and feed the
// backend's SafetyScoreCalculator rain-penalty multiplier; "Snow" is
// deliberately excluded since the flag is specifically isRain, not a general
// adverse-weather flag.
const RAIN_CONDITIONS = new Set(['Rain', 'Drizzle', 'Thunderstorm']);

export async function isRainingAt(location: LatLng): Promise<boolean> {
  const params = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    appid: OPENWEATHER_API_KEY,
  });

  const response = await fetch(`${OPENWEATHER_BASE_URL}/weather?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenWeatherMap request failed (${response.status})`);
  }

  const data: OpenWeatherResponse = await response.json();
  return data.weather.some(w => RAIN_CONDITIONS.has(w.main));
}
