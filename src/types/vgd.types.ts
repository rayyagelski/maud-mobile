// Shapes mirror App\Controller (Node) `VehicleGeneratedData` service's real
// schema exactly (src/schema/createTripRequestSchema.js, storeTripRequestSchema.js) —
// verified against the actual source, not inferred from docs.

export type VgdDriverRole = 'main' | 'spouse' | 'child';
export type VgdTripPurpose = 'business' | 'private';
export type VgdPointType = 'trip_start' | 'trip_end';

export interface VgdPointParameters {
  speed?: number;
  acceleration?: number;
  cornering?: number;
  distance?: number; // metres, integer
  direction?: number; // degrees, integer
  airTemperature?: number;
  co2emissions?: number;
  fuel?: number;
  batteryState?: number;
  battery?: number;
  // HERE `functionalClass` (1-5), only populated server-side by
  // vgd_analytics' HERE route-matching enrichment on `road_type`/`speed_limit`
  // indicator events — see App\Service\VehicleGeneratedData\Renderer\
  // RoadTypeRenderer.php for the backend's own 1-5 -> description mapping.
  roadType?: number | null;
  speedLimit?: number | null; // m/s
  // Only present on speed_limit-indicator events — total time spent above
  // the posted limit for the whole violation, computed server-side
  // (vgd_analytics' speedLimitPointsFilter.js), not sent by the mobile app.
  // Mirrors App\DTO\VehicleGeneratedData\TripEventParameters::$minutes.
  minutes?: number | null;
}

export interface VgdPoint {
  type?: VgdPointType;
  gps: { lat: number; lon: number };
  time: number; // whole-second unix timestamp, matches the old app's convention
  parameters: VgdPointParameters;
}

export interface CreateVgdTripParams {
  id: string; // client-generated UUID v4 — same one used for retries/idempotency
  driver: VgdDriverRole;
  purpose: VgdTripPurpose;
  odometer: number;
}

// Read-side shapes — verified against `maud_vgd_query`'s actual storage
// layer (MongoDBStorage.js's getTripDetails/listTripEvents projections) and
// vgd_analytics' actual analyzeTrip() output, not guessed from docs.

export interface VgdWeatherSnapshot {
  skyInfo?: string;
  temperatureDesc?: string;
  precipitationDesc?: string;
  airInfo?: string;
  temperature?: string;
  visibility?: string;
  windDirection?: string;
  windSpeed?: string;
}

export interface VgdTripAnalytics {
  startTime: number | null;
  endTime: number | null;
  startAddress: string | null;
  endAddress: string | null;
  endBatteryState: number | null;
  numberOfEvents: number;
  numberOfDangerousDrivingEvents: number;
  distance: number; // metres
  duration: number | null; // seconds
  averageSpeed: number | null; // km/h
  fuelConsumption: number | null; // % — always null unless mobile sends fuel point parameters (it doesn't yet)
  electricityConsumption: number | null; // % — same caveat, via battery parameters
  co2emissions: number; // grams/km
  startWeather?: VgdWeatherSnapshot | null; // only present if the trip ended within the last ~6h
  endWeather?: VgdWeatherSnapshot | null;
  startOdometer?: number;
  endOdometer?: number;
}

export interface VgdTripDetails {
  tripId: string;
  userId: number;
  vehicleId: string;
  driver: VgdDriverRole;
  purpose: VgdTripPurpose;
  note?: string;
  analytics?: VgdTripAnalytics; // absent until vgd_analytics has processed the trip
}

// GET /trips (list) returns a narrower analytics projection than GET
// /trips/:tripId — verified against maud_vgd_query's MongoDBStorage.js
// listTrips() aggregation $project (startTime/endTime/startAddress/
// endAddress/startOdometer/endOdometer/distance only — no duration,
// averageSpeed, co2emissions, or weather). Full detail is fetched lazily per
// trip via getTripDetails/useVgdTripDetails when the user opens it, same as
// already happens today.
export interface VgdTripSummaryAnalytics {
  startTime: number | null;
  endTime: number | null;
  startAddress: string | null;
  endAddress: string | null;
  startOdometer?: number;
  endOdometer?: number;
  distance: number; // metres
}

export interface VgdTripSummary {
  tripId: string;
  vehicleId: string;
  driver: VgdDriverRole;
  purpose: VgdTripPurpose;
  note?: string;
  isReadonly?: boolean;
  analytics?: VgdTripSummaryAnalytics;
}

export interface VgdTripListResponse {
  trips: VgdTripSummary[];
  stats: { total: number };
}

// Real indicator vocabulary confirmed from vgd_analytics' filter source
// (gForcePointsFilters.js, speedLimitPointsFilter.js, roadTypePointsFilter.js,
// tripAnalytics.js's findBorderEvents). speed_limit/road_type come from HERE
// Route Matching enrichment server-side — mobile never computes these itself.
export type VgdTripEventIndicator =
  | 'hard_braking'
  | 'acceleration'
  | 'cornering'
  | 'speed_limit'
  | 'road_type'
  | 'trip_start'
  | 'trip_end';

// Flat shape, verified directly against vgd_query's real HTTP response
// (GET /v1/trips/{id}/events, curled straight off the running prod
// container, 2026-08-30) — gps/time/parameters sit at the top level
// alongside `indicator`, there is no nested `point` wrapper. An earlier
// version of this type (and every hook/screen built against it) assumed a
// `point: {gps, time, parameters}` shape that never actually existed in the
// API response, which silently zeroed out every reader of it (Road Type
// Changes, trip waypoint pins, speed-limit/phone-usage map markers) since
// `event.point` was always undefined — see useVgdRoadTypeBreakdown and
// friends for the fix.
export interface VgdTripEvent {
  indicator: VgdTripEventIndicator;
  gps: { lat: number; lon: number };
  time: number; // whole-second unix timestamp
  parameters: VgdPointParameters & { address?: string | null };
  tripId: string;
}

export interface VgdTripEventsResponse {
  events: VgdTripEvent[];
  stats: { total: number };
}
