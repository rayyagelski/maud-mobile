import { useCallback, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { tripsApi } from '../api/endpoints/trips';
import { expensesApi } from '../api/endpoints/expenses';
import { vgdApi, VGD_TRIP_ID_EXISTS_STATUS } from '../api/endpoints/vgd';
import { applySyncedTripReward, markVgdTripCreated } from '../store/slices/tripSlice';
import { dequeueSyncItem } from '../store/slices/syncQueueSlice';

// Subscribes to connectivity changes and, whenever the device comes back
// online, replays queued trip/expense submissions that failed while offline.
export function useSyncEngine() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(s => s.syncQueue.items);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isFlushing = useRef(false);

  const flush = useCallback(async () => {
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      for (const item of itemsRef.current) {
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
          } else {
            // vgd_patch_points — the payload was already fully computed
            // (and the trip's flush cursor already advanced) at enqueue
            // time, so retrying here is just a resend of the exact bytes.
            await vgdApi.patchTripPoints(item.vgdTripId, item.points);
          }
          dispatch(dequeueSyncItem(item.id));
        } catch {
          // Still offline or still failing — stop this pass rather than
          // hammering the rest of the queue; the next connectivity event
          // (or app restart) will try again.
          break;
        }
      }
    } finally {
      isFlushing.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        flush();
      }
    });
    return unsubscribe;
  }, [flush]);
}
