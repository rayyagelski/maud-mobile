export const API_BASE_URL = 'https://myautodata.com/api/v1';
export const AUTH_HEADER = 'X-Token-Auth';

// Harsh-event thresholds, in m/s² (linear, gravity-removed) — derived from
// vgd_analytics' own canonical g-force thresholds (D:\Projects\MAUD\vgd_analytics
// \src\service\analytics\gForcePointsFilters.js: BRAKING_THRESHOLD=0.5g,
// ACCELERATION_THRESHOLD=0.35g, CORNERING_THRESHOLD=0.4g — the backend's
// server-side re-filter that classifies these points into indicator events).
// Previously mobile used its own, disagreeing thresholds (-3/+3 m/s², both
// equal — roughly 0.31g) which didn't match vgd_analytics at all; since
// mobile only ever sends points already above its own on-device threshold,
// the two systems' disagreement meant vgd_analytics' g-force filter was
// never doing any real filtering. Aligned 2026-08-10 so both sides agree on
// the same real-world threshold.
export const MS2_PER_G = 9.80665;
export const HARSH_BRAKE_THRESHOLD = -0.5 * MS2_PER_G;
export const HARSH_ACCEL_THRESHOLD = 0.35 * MS2_PER_G;
// Cornering severity, expressed in the same unit (m/s², linear) as
// HARSH_BRAKE_THRESHOLD/HARSH_ACCEL_THRESHOLD rather than a raw yaw-rate
// threshold — a fixed deg/s cutoff conflates a sharp turn at parking-lot
// speed with the same yaw rate at highway speed, which are very different
// in severity. Derived via the centripetal-acceleration relation
// a_lateral = speed * yawRate(rad/s), same magnitude bar as the other two
// harsh-event axes.
export const HARSH_CORNER_THRESHOLD_MS2 = 0.4 * MS2_PER_G;
// GPS-speed derivative must corroborate an accelerometer spike within this
// tolerance (SRS 4.4 "slip filtering") — rejects phone jostles (accel spike,
// no GPS change) and GPS noise (GPS jump, no accel corroboration).
export const SLIP_FILTER_TOLERANCE_MS2 = 1.5;
// Minimum backgrounded duration before it's logged as a discrete phone_usage
// TelematicsEvent (with location, for map markers) rather than just adding to
// the phoneTextSeconds aggregate counter — filters out trivial blips (e.g. an
// accidental app-switcher swipe) from cluttering the trip map with markers.
export const MIN_PHONE_USAGE_EVENT_SECONDS = 5;
// Phase 1 approximation: no posted-speed-limit lookup yet (that's compliance-
// phase work) — flat threshold instead.
export const SPEEDING_FLAT_THRESHOLD_KMH = 120;
// Phase 1 approximation for the optional trip "energy" block: no live
// consumption telemetry, so baseline = actual x this multiplier.
export const FUEL_BASELINE_MULTIPLIER = 1.1;
export const TRIP_AUTO_STOP_INACTIVITY_MS = 5 * 60 * 1000; // 5 min
// 1 mph — the single "is this vehicle actually moving" gate shared by both
// auto-detect and manual (Route Planner) trip start. Below this, no
// recording of any kind (points, phone-usage seconds, harsh events) happens,
// so handling the phone before mounting it — or after tapping Start but
// before pulling away — is never misclassified as driving.
export const TRIP_AUTO_START_SPEED_KMH = 1.60934;
// AsyncStorage key the Android headless task (index.js) queues raw
// BackgroundGeolocation location/motionchange events into when Android has
// torn down the JS engine while backgrounded (which it does independently of
// stopOnTerminate:false — native tracking keeps running, but nothing was
// listening on the JS side until this queue existed). useTripAutoDetection
// drains and replays this queue through the same handleLocation logic used
// for live fixes on its next mount, so a real-time-looking gap in tracking
// doesn't actually require the user to force-restart the app to "unstick" it.
export const HEADLESS_LOCATION_QUEUE_KEY = 'headlessLocationQueue';
// Hard cap on the headless queue so an extended stretch without a real app
// launch (e.g. the overnight-idle case from real testing) can't grow it
// unbounded — oldest entries are dropped first once past this.
export const HEADLESS_LOCATION_QUEUE_MAX = 2000;
export const SPEED_ZONE_ALERT_RADIUS_KM = 2;
// Weather doesn't change block-by-block like speed cameras do — re-query
// HERE only after moving this far since the last check, to keep call volume
// (and therefore cost) reasonable.
export const WEATHER_ALERT_REFRESH_DISTANCE_KM = 10;
// Traffic conditions change faster than weather but a fresh HERE routing
// call (with alternatives) costs more than a single-route call — re-check
// this often rather than on every GPS fix.
export const TRAFFIC_MONITOR_REFRESH_DISTANCE_KM = 3;
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
