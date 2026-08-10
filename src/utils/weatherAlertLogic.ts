// Pure, unit-testable logic for severe weather voice alerts.
// Sensor/network/TTS side effects live in useSevereWeatherAlerts + hereWeatherClient.

import type { WeatherAlert } from '../services/weather/hereWeatherClient';

// HERE alerts have no stable id — `type`+`description` is the closest thing
// to an identity we can de-dup on.
export function alertSignature(alert: WeatherAlert): string {
  return `${alert.type}:${alert.description}`;
}

// The first alert not already in `seen`, or null if every alert has already
// been announced this trip. HERE's `type` field isn't a documented severity
// ranking, so v1 doesn't try to pick "the worst" — just the first new one.
export function pickNewAlert(alerts: WeatherAlert[], seen: ReadonlySet<string>): WeatherAlert | null {
  return alerts.find(alert => !seen.has(alertSignature(alert))) ?? null;
}
