export const API_BASE_URL = 'https://myautodata.com/api/v1';
export const AUTH_HEADER = 'X-Token-Auth';

export const HARSH_BRAKE_THRESHOLD = -3; // m/s²
export const HARSH_ACCEL_THRESHOLD = 3;  // m/s²
export const TRIP_AUTO_STOP_INACTIVITY_MS = 5 * 60 * 1000; // 5 min
export const TRIP_AUTO_START_SPEED_KMH = 5;
export const SPEED_ZONE_ALERT_RADIUS_KM = 2;
export const GPS_LOCATION_INTERVAL_MS = 3000;
export const SENSOR_SAMPLE_RATE_MS = 100;

export const FUEL_PRICE_CACHE_TTL_MS = 36 * 60 * 60 * 1000; // 36 hours
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
export const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';
