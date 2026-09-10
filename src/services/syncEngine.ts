import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { tripsApi } from '../api/endpoints/trips';
import { expensesApi } from '../api/endpoints/expenses';
import { vehiclesApi } from '../api/endpoints/vehicles';
import { vgdApi, VGD_TRIP_ID_EXISTS_STATUS } from '../api/endpoints/vgd';
import { applySyncedTripReward, markVgdTripCreated } from '../store/slices/tripSlice';
import { updateVehicleOdometer } from '../store/slices/vehicleSlice';
import { dequeueSyncItem, syncStarted, syncFinished } from '../store/slices/syncQueueSlice';
import type { RootState } from '../store';

// Replays queued trip/expense submissions that failed while offline (see
// sync.types.ts for why an item ends up queued at all). Shared by the
// automatic connectivity/foreground triggers below, the home screen's manual
// "Sync Now" button, and the logout flow (flush the outgoing user's data
// before resetting the queue for the next login) — one implementation so
// none of those call sites can drift out of sync with each other.
//
// `condition` skips a second run entirely (no pending/fulfilled dispatched)
// if one is already in flight, rather than letting two overlapping flushes
// race to submit the same queued item twice.
export const flushSyncQueue = createAsyncThunk<
  void, void, { state: RootState }
>(
  'syncQueue/flush',
  async (_, { dispatch, getState }) => {
    dispatch(syncStarted());
    try {
      for (const item of getState().syncQueue.items) {
        try {
          if (item.kind === 'trip_reward') {
            const reward = await tripsApi.submitTripReward(item.params);
            dispatch(applySyncedTripReward({ tripId: item.tripId, reward }));
          } else if (item.kind === 'expense_create') {
            await expensesApi.create(item.vehicleId, item.params);
          } else if (item.kind === 'vgd_create_trip') {
            try {
              await vgdApi.createTrip(item.params);
            } catch (err: unknown) {
              // Already created by an earlier attempt whose response was
              // lost — idempotent success, not a failure (see
              // submitVgdCreateTrip in tripSlice.ts for the same check).
              const errStatus = (err as { errStatus?: string } | undefined)?.errStatus;
              if (errStatus !== VGD_TRIP_ID_EXISTS_STATUS) throw err;
            }
            dispatch(markVgdTripCreated(item.localTripId));
          } else if (item.kind === 'vgd_patch_points') {
            // the payload was already fully computed (and the trip's flush
            // cursor already advanced) at enqueue time, so retrying here is
            // just a resend of the exact bytes.
            await vgdApi.patchTripPoints(item.vgdTripId, item.points);
          } else {
            // odometer_update — the read-modify-write happens here, now that
            // connectivity is actually back, rather than trusting a value
            // computed while offline (see tripSlice.ts's
            // updateOdometerAfterTrip for why only distanceKm is stored).
            const res = await vehiclesApi.getOdometer(item.vehicleId);
            const newOdometer = res.data.odometer + item.distanceKm;
            await vehiclesApi.updateOdometer(item.vehicleId, newOdometer);
            dispatch(updateVehicleOdometer({ vehicleId: item.vehicleId, odometer: newOdometer }));
          }
          dispatch(dequeueSyncItem(item.id));
        } catch (err: unknown) {
          // client.ts's response interceptor normalizes every axios error to
          // {status, errStatus, message} — status===undefined means the
          // request never got a real response at all (offline, timeout,
          // dropped connection), the same "worth retrying" signal tripSlice's
          // own retry checks use (see endTrip/submitVgdCreateTrip). A defined
          // status is a genuine backend rejection (e.g. 422 malformed
          // payload) that will just fail identically forever — drop it
          // rather than retry, same convention as those call sites. Note this
          // still can't tell a real network failure apart from an unexpected
          // JS exception with no `status` at all (e.g. a parsing bug) — both
          // fall into the "retry later" branch below and could get stuck
          // looping forever the same way fromResponseDto's voice_payload
          // access above once did. Keep response-parsing code defensive
          // rather than relying on this catch to paper over it.
          const status = (err as { status?: number } | undefined)?.status;
          if (status === undefined) {
            // Still offline or still failing — stop this pass rather than
            // hammering the rest of the queue; the next connectivity event
            // (or app restart/manual tap) will try again.
            break;
          }
          dispatch(dequeueSyncItem(item.id));
        }
      }
    } finally {
      dispatch(syncFinished());
    }
  },
  {
    condition: (_, { getState }) => !getState().syncQueue.isSyncing,
  },
);

// How often the periodic safety-net retry below runs. Not aggressive — this
// exists purely to catch the gap the two event-driven triggers below can't
// cover, not to be the primary/fast path (that's still the NetInfo listener,
// which fires within moments of a real connectivity change).
const PERIODIC_FLUSH_INTERVAL_MS = 2 * 60 * 1000; // 2 min

// Subscribes to connectivity/foreground changes and triggers flushSyncQueue.
export function useSyncEngine() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        dispatch(flushSyncQueue());
      }
    });
    return unsubscribe;
  }, [dispatch]);

  // A queued item (e.g. a createTrip that failed while Doze-throttled
  // network access in the background) previously only retried on a genuine
  // NetInfo connectivity *transition* — if the connection technically never
  // dropped (just got deprioritized while backgrounded), nothing ever
  // re-triggered a flush, so trips could sit unsent indefinitely even after
  // the user reopened the app. Foregrounding is a much more reliable signal
  // that it's worth trying again right now.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') dispatch(flushSyncQueue());
    });
    return () => subscription.remove();
  }, [dispatch]);

  // Real-world gap in the two triggers above (both are pure transitions):
  // if an item gets queued while the phone is already on stable, good
  // connectivity (e.g. a brief backend timeout, not an actual outage) and
  // the user just keeps using the app without ever switching networks or
  // backgrounding it, NEITHER trigger fires again — nothing retries until a
  // manual tap. Client-reported concern: "if people forget to sync manually
  // all data in VGD is meaningless." This periodic tick is a safety net
  // that doesn't depend on catching a transition — flushSyncQueue's own
  // `condition` already no-ops cheaply when the queue is empty or a flush
  // is already in flight, so ticking unconditionally is safe.
  useEffect(() => {
    const interval = setInterval(() => dispatch(flushSyncQueue()), PERIODIC_FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dispatch]);
}
