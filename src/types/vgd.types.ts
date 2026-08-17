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

export interface VgdTripEvent {
  indicator: VgdTripEventIndicator;
  point: VgdPoint & { parameters: VgdPointParameters & { address?: string | null } };
}

export interface VgdTripEventsResponse {
  events: VgdTripEvent[];
  stats: { total: number };
}
