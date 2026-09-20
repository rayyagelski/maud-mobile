import { createTransform } from 'redux-persist';
import { tripDistanceKm, tripDurationSeconds, tripAvgSpeedKmh } from '../utils/helpers';
import type { Trip, TripState } from '../types/trip.types';

// How many of the most recent completed trips keep their full point-by-point
// detail (route/events/plannedRoute) in persisted storage. Everything older
// is reduced to the same summary-only shape a VGD-backfilled trip already
// has (see tripHistorySync.ts) — a shape every consumer in the app already
// handles, because 'vgd'-source trips have always looked like this:
// tripDistanceKm/tripDurationSeconds/tripAvgSpeedKmh all prefer the summary*
// fields (helpers.ts), DriverScore/EcoScore/Rewards aggregate off summary*
// and eventCounters (never off route), and MyTripScreen/TripDetailScreen
// already fall back to VGD's own trip_start/trip_end events for map pins.
const FULL_DETAIL_TRIP_COUNT = 10;

// Hard ceiling on persisted trip count. Older trips aren't lost — they live
// in trip_reward/VGD server-side and come back via useTripHistorySync.
const MAX_PERSISTED_TRIPS = 100;

// redux-persist serializes ALL whitelisted slices into one 'persist:root'
// blob on every (throttled) write and parses that same blob back on every
// launch. `trips` is the only slice that grows without bound — each recorded
// trip keeps a GPS point roughly every second of driving plus its events and,
// for a Route Planner trip, a full HERE route polyline. Left unchecked that
// reaches multiple megabytes within weeks, and the cost lands on the JS
// thread both at launch (parse) and on every write (stringify) — the same
// class of failure throttledAsyncStorage.ts was already added to mitigate
// mid-trip. Throttling made writes less frequent but did nothing about the
// blob's size, so this bounds the size itself.
//
// Deliberately only trims what's already safely on the server: a trip whose
// VGD flush hasn't finished keeps every point, so nothing unsent is ever
// dropped to save space.
function isFullyFlushedToVgd(trip: Trip): boolean {
  if (!trip.vgdTripCreated) return false;
  return (trip.vgdSentRouteCount ?? 0) >= trip.route.length
    && (trip.vgdSentEventCount ?? 0) >= trip.events.length;
}

// Materializes the summary stats BEFORE dropping the arrays they're derived
// from — locally-recorded trips don't carry summary* otherwise (only
// VGD-backfilled ones do), so stripping the route without this would silently
// zero out their distance everywhere it's aggregated.
function toSummaryOnly(trip: Trip): Trip {
  const summaryDistanceKm = trip.summaryDistanceKm ?? tripDistanceKm(trip);
  const summaryDurationSeconds = trip.summaryDurationSeconds ?? tripDurationSeconds(trip);
  const summaryAvgSpeedKmh = trip.summaryAvgSpeedKmh ?? tripAvgSpeedKmh(trip);

  const { plannedRoute: _plannedRoute, ...rest } = trip;

  return {
    ...rest,
    route: [],
    events: [],
    summaryDistanceKm,
    summaryDurationSeconds,
    summaryAvgSpeedKmh,
  };
}

export function trimTripsForPersist(state: TripState): TripState {
  return {
    ...state,
    // activeTrip is deliberately untouched — an in-flight trip's points are
    // the one thing that genuinely can't be recovered from anywhere else if
    // the app is killed mid-drive.
    trips: state.trips
      .slice(0, MAX_PERSISTED_TRIPS)
      .map((trip, index) => (
        index < FULL_DETAIL_TRIP_COUNT || !isFullyFlushedToVgd(trip)
          ? trip
          : toSummaryOnly(trip)
      )),
  };
}

// Inbound only (write side). Rehydration passes straight through: whatever
// was written is already the trimmed shape, and trimming again on read would
// just cost time at launch for no benefit.
export const tripsPersistTransform = createTransform<TripState, TripState>(
  (inboundState) => trimTripsForPersist(inboundState),
  (outboundState) => outboundState,
  { whitelist: ['trips'] },
);
