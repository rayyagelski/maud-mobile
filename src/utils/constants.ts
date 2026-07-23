export const API_BASE_URL = 'https://myautodata.com/api/v1';
export const AUTH_HEADER = 'X-Token-Auth';

export const HARSH_BRAKE_THRESHOLD = -3; // m/s² (linear, gravity-removed)
export const HARSH_ACCEL_THRESHOLD = 3;  // m/s² (linear, gravity-removed)
export const HARSH_CORNER_GYRO_THRESHOLD_DEG_S = 25; // yaw rate
// GPS-speed derivative must corroborate an accelerometer spike within this
// tolerance (SRS 4.4 "slip filtering") — rejects phone jostles (accel spike,
// no GPS change) and GPS noise (GPS jump, no accel corroboration).
export const SLIP_FILTER_TOLERANCE_MS2 = 1.5;
// Phase 1 approximation: no posted-speed-limit lookup yet (that's compliance-
// phase work) — flat threshold instead.
export const SPEEDING_FLAT_THRESHOLD_KMH = 120;
// Phase 1 approximation for the optional trip "energy" block: no live
// consumption telemetry, so baseline = actual x this multiplier.
export const FUEL_BASELINE_MULTIPLIER = 1.1;
export const TRIP_AUTO_STOP_INACTIVITY_MS = 5 * 60 * 1000; // 5 min
export const TRIP_AUTO_START_SPEED_KMH = 5;
export const SPEED_ZONE_ALERT_RADIUS_KM = 2;
export const GPS_LOCATION_INTERVAL_MS = 3000;
export const SENSOR_SAMPLE_RATE_MS = 100;

export const FUEL_PRICE_CACHE_TTL_MS = 36 * 60 * 60 * 1000; // 36 hours
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
export const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

// How often accumulated trip points get PATCHed to VGD while a trip is in
// progress (mirrors the old native app's timer-driven batch upload, so a
// killed app / crash mid-trip loses at most one interval's worth of data).
export const VGD_POINT_FLUSH_INTERVAL_MS = 30 * 1000;
