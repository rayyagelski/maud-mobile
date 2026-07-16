import { useCallback, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { tripsApi } from '../api/endpoints/trips';
import { expensesApi } from '../api/endpoints/expenses';
import { applySyncedTripReward } from '../store/slices/tripSlice';
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
          } else {
            await expensesApi.create(item.vehicleId, item.params);
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
