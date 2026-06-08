export type TripType = 'business' | 'private' | 'commute';
export type TransportMode = 'car' | 'truck' | 'scooter' | 'cycling' | 'walking';
export type TripStatus = 'pending' | 'active' | 'completed' | 'synced';
export type RoadType = 'urban' | 'highway' | 'rural' | 'unknown';

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

export interface TripCost {
  fuelCost: number;
  leaseCost: number;
  insuranceCost: number;
  maintenanceCost: number;
  total: number;
  currency: string;
}

export interface TripAnalytics {
  distanceKm: number;
  durationSeconds: number;
  fuelUsedLiters?: number;
  co2Kg?: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  harshEventCount: number;
  ecoScore?: number;
  cost?: TripCost;
  weatherStart?: string;
  weatherEnd?: string;
  tempStartC?: number;
  tempEndC?: number;
}

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
  analytics?: TripAnalytics;
  syncedAt?: number;
}

export interface TripState {
  activeTrip: Trip | null;
  trips: Trip[];
  isTracking: boolean;
  isLoading: boolean;
  error: string | null;
}
