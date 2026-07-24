import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { tripsApi, vehiclesApi, vgdApi, VGD_TRIP_ID_EXISTS_STATUS } from '../../api';
import type { SubmitTripRewardParams } from '../../api/endpoints/trips';
import { generateId, generateUuidV4, haversineDistanceKm } from '../../utils/helpers';
import { getHarshEventCounters } from '../../services/harshEventCounters';
import { FUEL_BASELINE_MULTIPLIER } from '../../utils/constants';
import { enqueueSyncItem } from './syncQueueSlice';
import { updateVehicleOdometer } from './vehicleSlice';
import { isRainingAt } from '../../services/weather/weatherClient';
import {
  mapDriverRoleToVgd,
  mapTripTypeToVgdPurpose,
  mapGpsPointsToVgdPoints,
  mapTelematicsEventsToVgdPoints,
  markTripEnd,
} from '../../utils/vgdPointMapper';
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
import type { Driver } from '../../types/driver.types';
import type { CreateVgdTripParams, VgdPoint } from '../../types/vgd.types';

const initialState: TripState = {
  activeTrip: null,
  trips: [],
  isTracking: false,
  isLoading: false,
  error: null,
};

export const startTrip = createAsyncThunk(
  'trips/start',
  (
    params: {
      vehicleId: string;
      driverId: string;
      tripType: TripType;
      transportMode: TransportMode;
    },
    { dispatch },
  ) => {
    // trip_reward (App\Controller\API\Rewards\TripRewardController) is still
    // a single write-once POST submitted at trip-end (§0.1) — unchanged.
    // Vehicle Generated Data is a separate destination that DOES need a
    // create-trip call up front; fired in the background below so trip start
    // itself never blocks on network.
    const trip: Trip = {
      ...params,
      id: generateId(),
      startTime: Date.now(),
      status: 'active',
      route: [],
      events: [],
      vgdTripId: generateUuidV4(),
    };

    dispatch(submitVgdCreateTrip({ trip, driverId: params.driverId }));

    return trip;
  },
);

// Fired in the background from startTrip — never awaited by trip start
// itself. Fail-soft like every other auxiliary call in this pipeline
// (weather, AI tip, reward submission): a failure here queues a retry
// rather than blocking or losing the trip.
export const submitVgdCreateTrip = createAsyncThunk(
  'trips/vgdCreateTrip',
  async (
    args: { trip: Trip; driverId: string },
    { getState, dispatch },
  ) => {
    const state = getState() as {
      drivers: { drivers: Driver[] };
      vehicles: { vehicles: Vehicle[] };
    };
    const driver = state.drivers.drivers.find(d => d.id === args.driverId);
    const vehicle = state.vehicles.vehicles.find(v => v.id === args.trip.vehicleId);

    // Best-known odometer at trip start — fetched fresh (mirrors
    // OdometerScreen's own call) rather than trusting a possibly-stale
    // cached value, since `vehicle.odometer` isn't populated by the
    // /vehicles list endpoint. Fails soft to whatever's cached, then 0 —
    // VGD requires the field but a slightly-stale reading is better than
    // blocking trip creation on it.
    let odometer = vehicle?.odometer ?? 0;
    try {
      const res = await vehiclesApi.getOdometer(args.trip.vehicleId);
      odometer = res.data.odometer;
    } catch {
      // Fail-soft — keep the fallback above.
    }

    const params: CreateVgdTripParams = {
      id: args.trip.vgdTripId as string,
      driver: mapDriverRoleToVgd(driver?.role ?? 'self'),
      purpose: mapTripTypeToVgdPurpose(args.trip.tripType),
      odometer,
    };

    try {
      await vgdApi.createTrip(params);
      dispatch(markVgdTripCreated(args.trip.id));
    } catch (err: unknown) {
      const e = err as { status?: number; errStatus?: string };
      if (e.errStatus === VGD_TRIP_ID_EXISTS_STATUS) {
        // Already created by an earlier attempt whose response was lost —
        // idempotent success, not a failure.
        dispatch(markVgdTripCreated(args.trip.id));
        return;
      }
      if (e.status === undefined) {
        dispatch(enqueueSyncItem({ kind: 'vgd_create_trip', localTripId: args.trip.id, params }));
      }
    }
  },
);

// Adds the trip's driven distance to the vehicle's odometer, both
// server-side and in local Redux state. Fetches the current value fresh
// (matches OdometerScreen's own approach) rather than trusting a possibly-
// stale cached one. Independent of trip_reward/VGD, fire-and-forget from
// endTrip, fail-soft — an odometer sync must never block trip completion.
export const updateOdometerAfterTrip = createAsyncThunk(
  'trips/updateOdometerAfterTrip',
  async (args: { vehicleId: string; distanceKm: number }, { dispatch }) => {
    try {
      const res = await vehiclesApi.getOdometer(args.vehicleId);
      const newOdometer = res.data.odometer + args.distanceKm;
      await vehiclesApi.updateOdometer(args.vehicleId, newOdometer);
      dispatch(updateVehicleOdometer({ vehicleId: args.vehicleId, odometer: newOdometer }));
    } catch {
      // Fail-soft — odometer sync is best-effort.
    }
  },
);

// Dispatched periodically by useVgdPointFlush while a trip is tracked, and
// once more at trip-end (isTripEnd: true) as the final batch. Reads/advances
// the flush cursor stored on the Trip itself (vgdSentRouteCount etc.) so
// both callers share one cursor instead of each tracking their own — that
// would risk double-sending or dropping points across the two call sites.
export const flushVgdPoints = createAsyncThunk(
  'trips/vgdFlushPoints',
  async (
    args: { tripId: string; isTripEnd: boolean },
    { getState, dispatch },
  ) => {
    const state = getState() as { trips: TripState };
    const trip = state.trips.activeTrip?.id === args.tripId
      ? state.trips.activeTrip
      : state.trips.trips.find(t => t.id === args.tripId);

    if (!trip || !trip.vgdTripId || !trip.vgdTripCreated) return;

    const newRoutePoints = trip.route.slice(trip.vgdSentRouteCount ?? 0);
    const newEvents = trip.events.slice(trip.vgdSentEventCount ?? 0);

    const { vgdPoints: gpsVgdPoints, endingCumulativeDistanceKm } = mapGpsPointsToVgdPoints(
      newRoutePoints,
      trip.vgdCumulativeDistanceKm ?? 0,
      trip.vgdLastSentPoint,
    );
    const eventVgdPoints = mapTelematicsEventsToVgdPoints(newEvents);
    let points = [...gpsVgdPoints, ...eventVgdPoints];

    if (args.isTripEnd) {
      const fallback = newRoutePoints[newRoutePoints.length - 1] ?? trip.vgdLastSentPoint;
      points = markTripEnd(points, trip.endTime ?? Date.now(), fallback);
    }

    if (points.length === 0) return;

    const progress = {
      tripId: args.tripId,
      sentRouteCount: trip.route.length,
      sentEventCount: trip.events.length,
      cumulativeDistanceKm: endingCumulativeDistanceKm,
      lastSentPoint: newRoutePoints[newRoutePoints.length - 1] ?? trip.vgdLastSentPoint,
    };

    try {
      await vgdApi.patchTripPoints(trip.vgdTripId, points);
      dispatch(advanceVgdFlushProgress(progress));
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === undefined) {
        // Advance the cursor regardless — the points are captured in the
        // queued retry payload below, so re-computing the same slice next
        // tick would otherwise resend them once the retry also lands.
        dispatch(advanceVgdFlushProgress(progress));
        dispatch(enqueueSyncItem({ kind: 'vgd_patch_points', vgdTripId: trip.vgdTripId, points }));
      }
      // A real backend rejection (defined status) is dropped, not retried —
      // same convention as trip_reward/expense submissions.
    }
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
      // Still flush a trip_end to VGD even for a too-short-to-score trip —
      // VGD has no equivalent "too short" floor, and this is the only signal
      // that ends the trip server-side (triggers vgd_analytics enrichment).
      dispatch(flushVgdPoints({ tripId, isTripEnd: true }));
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

    // Final VGD flush and odometer update — both independent of trip_reward
    // above, dispatched (not awaited) so neither delays trip completion.
    dispatch(flushVgdPoints({ tripId, isTripEnd: true }));
    dispatch(updateOdometerAfterTrip({ vehicleId: trip.vehicleId, distanceKm }));

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

// Shared by the VGD reducers below — a trip being flushed/created may still
// be the active trip, or may have already moved into the completed `trips`
// array by the time an async VGD call resolves.
function findTripById(state: TripState, tripId: string): Trip | undefined {
  if (state.activeTrip?.id === tripId) return state.activeTrip;
  return state.trips.find(t => t.id === tripId);
}

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
    markVgdTripCreated(state, action: PayloadAction<string>) {
      const trip = findTripById(state, action.payload);
      if (trip) trip.vgdTripCreated = true;
    },
    advanceVgdFlushProgress(
      state,
      action: PayloadAction<{
        tripId: string;
        sentRouteCount: number;
        sentEventCount: number;
        cumulativeDistanceKm: number;
        lastSentPoint?: GpsPoint;
      }>,
    ) {
      const trip = findTripById(state, action.payload.tripId);
      if (!trip) return;
      trip.vgdSentRouteCount = action.payload.sentRouteCount;
      trip.vgdSentEventCount = action.payload.sentEventCount;
      trip.vgdCumulativeDistanceKm = action.payload.cumulativeDistanceKm;
      if (action.payload.lastSentPoint) trip.vgdLastSentPoint = action.payload.lastSentPoint;
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
        // action.payload was built from a snapshot of activeTrip taken at
        // the *start* of endTrip's thunk — any VGD progress reducers
        // (markVgdTripCreated/advanceVgdFlushProgress) that fired on
        // state.activeTrip since then (the final flushVgdPoints dispatch
        // often resolves before endTrip's own reward-submission await does)
        // would otherwise be silently discarded by a blind overwrite here.
        const latestActiveTrip = state.activeTrip;
        const merged: Trip = latestActiveTrip?.id === action.payload.id
          ? {
            ...action.payload,
            vgdTripCreated: latestActiveTrip.vgdTripCreated,
            vgdSentRouteCount: latestActiveTrip.vgdSentRouteCount,
            vgdSentEventCount: latestActiveTrip.vgdSentEventCount,
            vgdCumulativeDistanceKm: latestActiveTrip.vgdCumulativeDistanceKm,
            vgdLastSentPoint: latestActiveTrip.vgdLastSentPoint,
          }
          : action.payload;
        state.activeTrip = null;
        state.isTracking = false;
        const idx = state.trips.findIndex(t => t.id === merged.id);
        if (idx >= 0) {
          state.trips[idx] = merged;
        } else {
          state.trips.unshift(merged);
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

export const {
  appendGpsPoint,
  addTelematicsEvent,
  setTracking,
  clearTripError,
  applySyncedTripReward,
  markVgdTripCreated,
  advanceVgdFlushProgress,
} = tripSlice.actions;
export default tripSlice.reducer;
