import type { LatLng, Maneuver, SpeedLimitSpan } from '../services/here/hereRoutingClient';

export type TripType = 'business' | 'private' | 'commute';
export type TransportMode = 'car' | 'truck' | 'scooter' | 'cycling' | 'walking';
export type TripStatus = 'active' | 'completed';

export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number; // m/s
  heading?: number; // degrees
  accuracy?: number;
  timestamp: number;
}

export interface TelematicsEvent {
  id: string;
  type: 'harsh_brake' | 'harsh_accel' | 'harsh_corner' | 'speeding' | 'road_type_change' | 'phone_usage';
  timestamp: number;
  location: GpsPoint;
  value?: number;
  metadata?: Record<string, unknown>;
}

// Context flags submitted alongside a trip — mirrors TripRewardController's
// "context" block (App\Controller\API\Rewards\TripRewardController).
export interface TripContext {
  isNight: boolean;
  isAfterMidnight: boolean;
  isRain: boolean;
  highwayShare: number; // 0.0–1.0
}

// Aggregate event counters submitted at trip-end — mirrors TripRewardController's
// "events" block. Individual TelematicsEvents (above) are the source these are derived from.
export interface TripEventCounters {
  speedingSeconds: number;
  harshBrakeCount: number;
  harshAccelCount: number;
  harshCornerCount: number;
  phoneTextSeconds: number;
}

// Optional energy block — only sent when the active vehicle has a known
// fuel type + estimated consumption. Mirrors TripRewardController's "energy" block.
export interface TripEnergy {
  fuelType: string;
  fuelUsedLiters?: number;
  fuelBaselineLiters?: number;
  kwhUsed?: number;
  kwhBaseline?: number;
  fuelPricePerLiter?: number;
  electricityPricePerKwh?: number;
  currencyCode?: string;
}

// The Route-Planner-selected route, carried onto a trip so voice-only
// turn-by-turn guidance (useTurnByTurnGuidance) can read it after
// RoutePlannerScreen unmounts — its own fetched route otherwise lives only
// in local component state and is discarded once tracking begins.
export interface PlannedRoute {
  coordinates: LatLng[];
  maneuvers: Maneuver[];
  // Optional purely for older persisted trips rehydrated from redux-persist
  // that predate this field — speed-zone alerts (useSpeedZoneAlerts.ts) just
  // see no spans for those rather than crashing.
  speedLimitSpans?: SpeedLimitSpan[];
}

export interface TripVoicePayload {
  script: string;
  summaryKey: string;
  highlights: string[];
  tips: string[];
}

// Shape of a successful POST /trips/reward response (camelCased on the client).
export interface TripRewardResult {
  tripRewardId: number;
  safetyScore: number;
  ecoScore: number;
  tripRewardScore: number;
  tripPointsEarned: number;
  phoneSubscore: number;
  distanceKm: number;
  co2AvoidedGrams: number | null;
  moneySavedCents: number | null;
  currencyCode: string | null;
  voicePayload: TripVoicePayload;
  aiNarrativeTip: string | null;
}

// Locally-persisted trip record. Most trips are `source: 'local'` — fully
// recorded on-device, kept in redux-persist. A trip can also be `source:
// 'vgd'` — backfilled from VGD's trip-history read-back (see
// syncTripHistoryFromBackend in this file) after a reinstall/new device,
// where the local recording never happened. VGD has no read-back for the
// raw point-by-point route (only accepts points on write), so a 'vgd'-source
// trip always has empty route/events and instead carries summaryDistanceKm/
// summaryDurationSeconds/summaryAvgSpeedKmh computed from VGD's own
// aggregate analytics — screens should prefer these over deriving from
// `route` when present. `reward` is populated once submitTripReward succeeds
// for a local trip, or backfilled from the trip_reward history endpoint
// (joined by vgdTripId === externalTripId) for a 'vgd'-source one.
export interface Trip {
  id: string;
  vehicleId: string;
  driverId: string;
  tripType: TripType;
  transportMode: TransportMode;
  status: TripStatus;
  startTime: number;
  endTime?: number;
  route: GpsPoint[];
  events: TelematicsEvent[];
  // Absent (undefined) on any trip recorded before this field existed —
  // treat as 'local' wherever the distinction matters, same as the optional
  // vgd* fields below already do for older persisted trips.
  source?: 'local' | 'vgd';
  summaryDistanceKm?: number;
  summaryDurationSeconds?: number;
  summaryAvgSpeedKmh?: number;
  context?: TripContext;
  // Snapshot of the aggregate counters submitted in the request (speeding
  // seconds, phone-usage seconds, harsh-event counts) — kept locally so
  // DriverScore/EcoScore can aggregate across history without depending on
  // the backend (which only returns computed scores, not the raw counters).
  eventCounters?: TripEventCounters;
  reward?: TripRewardResult;
  // Vehicle Generated Data write-path state (separate from `reward` above —
  // VGD and trip_reward are two independent backend destinations for the
  // same trip). `vgdTripId` is the client-generated UUID sent as VGD's `id`
  // on createTrip, reused unchanged across retries/offline replay. The
  // `vgdSent*`/`vgdCumulativeDistanceKm`/`vgdLastSentPoint` fields track flush
  // progress in one place so both the periodic flush hook and endTrip's final
  // flush read/advance the same cursor rather than duplicating or dropping points.
  vgdTripId?: string;
  vgdTripCreated?: boolean;
  vgdSentRouteCount?: number;
  vgdSentEventCount?: number;
  vgdCumulativeDistanceKm?: number;
  vgdLastSentPoint?: GpsPoint;
  // Only present for a Route-Planner-originated trip — plain auto-detected
  // trips have no selected destination/route to guide against.
  plannedRoute?: PlannedRoute;
}

// Set by a manual Route Planner "Start" tap — recording doesn't actually
// begin (isTracking/activeTrip) until useTripAutoDetection sees real motion
// past TRIP_AUTO_START_SPEED_KMH, so handling the phone before pulling away
// is never recorded as part of the trip.
export interface PendingTripStart {
  vehicleId: string;
  driverId: string;
  tripType: TripType;
  transportMode: TransportMode;
  armedAt: number;
  plannedRoute?: PlannedRoute;
}

export interface TripState {
  activeTrip: Trip | null;
  trips: Trip[];
  isTracking: boolean;
  isLoading: boolean;
  error: string | null;
  pendingStart: PendingTripStart | null;
}
