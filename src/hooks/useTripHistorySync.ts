import { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { syncTripHistoryFromBackend, backfillVgdTripReward } from '../store/slices/tripSlice';

// Same backoff budget/shape as useVgdTripDetails.ts's RETRY_DELAYS_MS — a
// failed attempt here is most often the same kind of transient thing that
// justifies retrying there (a momentary backend hiccup, or the auth-token-
// configuration race noted below), not a reason to give up on trip history
// for the rest of the session after a single bad request.
const RETRY_DELAYS_MS = [3000, 6000, 12000];

/**
 * Backfills trip history from the backend (VGD + trip_reward) once per app
 * session, as soon as a vehicle can actually be resolved — see
 * syncTripHistoryFromBackend in tripSlice.ts for why this exists at all
 * (redux-persist was previously the only copy of trip history the app ever
 * read from, so a reinstall/new device showed a permanently empty history).
 *
 * Deliberately not tied directly to the isAuthenticated transition in
 * AppNavigator: vehicles/claims can still be empty at that exact moment
 * (fetched by a separate effect after login), so this instead waits for
 * vehicleId to actually resolve, same dependency shape
 * useTripAutoDetection.ts already uses for the same reason.
 */
export function useTripHistorySync(): void {
  const dispatch = useAppDispatch();
  const { claims } = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const trips = useAppSelector(s => s.trips.trips);

  // 'done' only once a fetch actually succeeds — a rejected attempt (see
  // syncTripHistoryFromBackend's rejectWithValue) retries with backoff
  // instead, since real-world testing found a single early request racing
  // the HTTP client's auth-token setup (right after a fresh login, same
  // race submitVgdCreateTrip already retries around) permanently blocked
  // trip history for the whole session under the previous fire-once logic.
  const syncStateRef = useRef<'pending' | 'done'>('pending');
  const retryIndexRef = useRef(0);
  // Mirrors syncStateRef into render-visible state purely to re-trigger the
  // reward-backfill effect below once history sync actually completes —
  // the sync effect itself still gates on the ref, unaffected by this.
  const [historySynced, setHistorySynced] = useState(false);

  useEffect(() => {
    if (syncStateRef.current === 'done' || !claims) return;

    const vehicleId = claims.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId) return;

    const driverId = selectedDriver?.id ?? String(claims.userId);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function attempt() {
      const result = await dispatch(syncTripHistoryFromBackend({ vehicleId: vehicleId as string, driverId }));
      if (cancelled) return;

      if (syncTripHistoryFromBackend.fulfilled.match(result)) {
        syncStateRef.current = 'done';
        setHistorySynced(true);
        return;
      }

      const retryIndex = retryIndexRef.current;
      if (retryIndex >= RETRY_DELAYS_MS.length) {
        // Retry budget exhausted — same as useVgdTripDetails, stop trying
        // rather than looping forever against a genuinely failing backend.
        syncStateRef.current = 'done';
        return;
      }
      retryIndexRef.current += 1;
      timer = setTimeout(attempt, RETRY_DELAYS_MS[retryIndex]);
    }

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [claims, selectedVehicle, vehicles, selectedDriver, dispatch]);

  // Second pass, once per trip per session: backfill a real score (see
  // backfillVgdTripReward) for every VGD-restored trip that came back from
  // the sync above with no `.reward` — a trip that exists in VGD but was
  // never submitted through the normal reward flow (dongle/older-app trips,
  // backend-seeded test data). attemptedRef prevents re-dispatching for a
  // trip whose backfill genuinely came back empty (425 "not processed yet")
  // — that trip just stays unscored for the rest of this session, a later
  // session's sync retries it fresh instead of hammering the endpoint.
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!historySynced) return;
    trips
      .filter(t => t.vgdTripId && t.vgdTripCreated && !t.reward && !attemptedRef.current.has(t.id))
      .forEach((t) => {
        attemptedRef.current.add(t.id);
        dispatch(backfillVgdTripReward({
          localTripId: t.id,
          vehicleUuid: t.vehicleId,
          vgdTripId: t.vgdTripId as string,
        }));
      });
  }, [historySynced, trips, dispatch]);
}
