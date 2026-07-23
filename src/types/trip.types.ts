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
  type: 'harsh_brake' | 'harsh_accel' | 'harsh_corner' | 'speeding' | 'road_type_change';
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

// Locally-persisted trip record. The backend has no trip read-back endpoint —
// TripReward only stores aggregate scoring fields, not GPS route/waypoints/weather —
// so this local record (kept in redux-persist) is the sole source for trip
// history/detail/map screens. `reward` is populated once submitTripReward succeeds.
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
}

export interface TripState {
  activeTrip: Trip | null;
  trips: Trip[];
  isTracking: boolean;
  isLoading: boolean;
  error: string | null;
}
