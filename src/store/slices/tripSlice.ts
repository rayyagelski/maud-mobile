import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { tripsApi } from '../../api';
import type { SubmitTripRewardParams } from '../../api/endpoints/trips';
import { generateId, haversineDistanceKm } from '../../utils/helpers';
import { getHarshEventCounters } from '../../services/harshEventCounters';
import { FUEL_BASELINE_MULTIPLIER } from '../../utils/constants';
import { enqueueSyncItem } from './syncQueueSlice';
import { isRainingAt } from '../../services/weather/weatherClient';
import type {
  Trip,
  TripState,
  TripType,
  TransportMode,
  GpsPoint,
  TelematicsEvent,
  TripContext,
  TripEnergy,
  TripRewardResult,
} from '../../types/trip.types';
import type { Vehicle } from '../../types/vehicle.types';

const initialState: TripState = {
  activeTrip: null,
  trips: [],
  isTracking: false,
  isLoading: false,
  error: null,
};

export const startTrip = createAsyncThunk(
  'trips/start',
  (params: {
    vehicleId: string;
    driverId: string;
    tripType: TripType;
    transportMode: TransportMode;
  }) => {
    // No network call at trip start — the backend has no "create trip" concept,
    // only a single write-once POST /trips/reward submitted at trip-end (§0.1).
    const trip: Trip = {
      ...params,
      id: generateId(),
      startTime: Date.now(),
      status: 'active',
      route: [],
      events: [],
    };
    return trip;
  },
);

async function buildContext(trip: Trip): Promise<TripContext> {
  const start = new Date(trip.startTime);
  const hour = start.getHours();
  const highwaySpeedMs = 25; // ~90 km/h — Phase 1 approximation (see constants.ts note on SPEEDING_FLAT_THRESHOLD_KMH)
  const highwayPoints = trip.route.filter(p => (p.speed ?? 0) >= highwaySpeedMs).length;

  // Real weather lookup using the trip's first GPS fix (closest available
  // point to actual trip start). Fail-soft like every other auxiliary
  // enrichment in this pipeline (AI tip, reward submission itself) — a
  // flaky/offline weather call must never block trip completion.
  let isRain = false;
  if (trip.route.length > 0) {
    try {
      isRain = await isRainingAt(trip.route[0]);
    } catch {
      isRain = false;
    }
  }

  return {
    isNight: hour >= 20 || hour < 6,
    isAfterMidnight: hour >= 0 && hour < 4,
    isRain,
    highwayShare: trip.route.length > 0 ? highwayPoints / trip.route.length : 0,
  };
}

function buildEnergy(vehicle: Vehicle | null | undefined, distanceKm: number): TripEnergy | undefined {
  if (!vehicle?.fuelType || !vehicle.estimatedConsumption) return undefined;
  const isElectric = vehicle.fuelType === 'electric';
  const used = (distanceKm / 100) * vehicle.estimatedConsumption;
  const baseline = used * FUEL_BASELINE_MULTIPLIER;
  return {
    fuelType: vehicle.fuelType,
    ...(isElectric
      ? { kwhUsed: used, kwhBaseline: baseline }
      : { fuelUsedLiters: used, fuelBaselineLiters: baseline }),
  };
}

export const endTrip = createAsyncThunk(
  'trips/end',
  async (
    tripId: string,
    { getState, dispatch, rejectWithValue },
  ) => {
    const state = (getState() as { trips: TripState; vehicles: { vehicles: Vehicle[]; selectedVehicle: Vehicle | null } });
    const trip = state.trips.activeTrip;
    if (!trip || trip.id !== tripId) return rejectWithValue('No matching active trip');

    const endTime = Date.now();
    const distanceKm = trip.route.reduce(
      (sum, point, i) => (i === 0 ? 0 : sum + haversineDistanceKm(trip.route[i - 1], point)),
      0,
    );
    const durationSeconds = Math.round((endTime - trip.startTime) / 1000);

    // distance_km must be > 0 for the backend to accept the submission —
    // a trip with too few GPS fixes to compute a route simply isn't scored.
    // Skip building context entirely for these (including the weather API
    // call in buildContext), since none of it would ever be used.
    if (distanceKm <= 0) {
      return { ...trip, endTime, status: 'completed' } as Trip;
    }

    const context = await buildContext(trip);
    const counters = getHarshEventCounters();
    const vehicle = state.vehicles.vehicles.find(v => v.id === trip.vehicleId) ?? state.vehicles.selectedVehicle;
    const energy = buildEnergy(vehicle, distanceKm);

    const completedTrip: Trip = { ...trip, endTime, status: 'completed', context, eventCounters: counters };

    const rewardParams: SubmitTripRewardParams = {
      vehicleUuid: trip.vehicleId,
      externalTripId: trip.id,
      tripDate: new Date(trip.startTime).toISOString().slice(0, 10),
      distanceKm,
      durationSeconds,
      context,
      events: counters,
      energy,
    };

    try {
      const reward = await tripsApi.submitTripReward(rewardParams);
      return { ...completedTrip, reward };
    } catch (err: unknown) {
      // Offline/failed submission — the trip is not lost (persisted locally),
      // just unscored. If this was a genuine network failure (no HTTP
      // response reached — see client.ts's response interceptor), queue it
      // for automatic retry once connectivity returns. A real backend
      // rejection (e.g. 422 on a malformed payload) has a defined `status`
      // and is deliberately NOT queued — retrying it would just fail again.
      const status = (err as { status?: number } | undefined)?.status;
      if (status === undefined) {
        dispatch(enqueueSyncItem({ kind: 'trip_reward', tripId: completedTrip.id, params: rewardParams }));
      }
      return completedTrip;
    }
  },
);

const tripSlice = createSlice({
  name: 'trips',
  initialState,
  reducers: {
    appendGpsPoint(state, action: PayloadAction<GpsPoint>) {
      if (state.activeTrip) {
        state.activeTrip.route.push(action.payload);
      }
    },
    addTelematicsEvent(state, action: PayloadAction<TelematicsEvent>) {
      if (state.activeTrip) {
        state.activeTrip.events.push(action.payload);
      }
    },
    setTracking(state, action: PayloadAction<boolean>) {
      state.isTracking = action.payload;
    },
    clearTripError(state) {
      state.error = null;
    },
    // Backfills the score into an already-saved local trip once a queued
    // trip_reward sync item succeeds in the background (see syncEngine.ts).
    applySyncedTripReward(
      state,
      action: PayloadAction<{ tripId: string; reward: TripRewardResult }>,
    ) {
      const trip = state.trips.find(t => t.id === action.payload.tripId);
      if (trip) {
        trip.reward = action.payload.reward;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startTrip.fulfilled, (state, action: PayloadAction<Trip>) => {
        state.activeTrip = action.payload;
        state.isTracking = true;
      })
      .addCase(endTrip.pending, (state) => { state.isLoading = true; })
      .addCase(endTrip.fulfilled, (state, action: PayloadAction<Trip>) => {
        state.isLoading = false;
        state.activeTrip = null;
        state.isTracking = false;
        const idx = state.trips.findIndex(t => t.id === action.payload.id);
        if (idx >= 0) {
          state.trips[idx] = action.payload;
        } else {
          state.trips.unshift(action.payload);
        }
      })
      .addCase(endTrip.rejected, (state) => {
        // No matching active trip found — just stop tracking, nothing to save.
        state.isLoading = false;
        state.activeTrip = null;
        state.isTracking = false;
      });
  },
});

export const { appendGpsPoint, addTelematicsEvent, setTracking, clearTripError, applySyncedTripReward } = tripSlice.actions;
export default tripSlice.reducer;
