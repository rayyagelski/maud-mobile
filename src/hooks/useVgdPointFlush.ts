import { useEffect, useRef } from 'react';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { flushVgdPoints } from '../store/slices/tripSlice';
import { VGD_POINT_FLUSH_INTERVAL_MS } from '../utils/constants';
import { persistor } from '../store';

/**
 * Periodically PATCHes not-yet-sent trip points to VGD while a trip is
 * active (SRS §0.2 — mirrors the old native app's timer-driven batch
 * upload), so a killed app / crash mid-trip loses at most one interval's
 * worth of data rather than everything. All the actual point-slicing/mapping
 * happens in flushVgdPoints (tripSlice.ts), which reads its progress cursor
 * from the trip itself — this hook is just the timer.
 */
export function useVgdPointFlush(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);

  const activeTripIdRef = useRef<string | null>(activeTrip?.id ?? null);
  useEffect(() => {
    activeTripIdRef.current = activeTrip?.id ?? null;
  }, [activeTrip?.id]);

  useEffect(() => {
    if (!isTracking) return undefined;

    const interval = setInterval(() => {
      const tripId = activeTripIdRef.current;
      if (!tripId) return;
      // A successful flush advances the progress cursor (vgdSentRouteCount
      // etc. in tripSlice.ts) so the next flush doesn't resend what the
      // server already has — but that cursor only lives in Redux until
      // redux-persist's (now throttled, see throttledAsyncStorage.ts) write
      // actually lands on disk. A force-close in that window loses the
      // cursor advance, and the reopened app resends the same points/events
      // the server already accepted — this is exactly what produced
      // duplicated VGD events after a mid-drive force-close/reopen in real
      // testing. Forcing a flush right after dispatch closes that window
      // down to this single write instead of however long the throttle
      // would otherwise have deferred it.
      dispatch(flushVgdPoints({ tripId, isTripEnd: false })).finally(() => {
        persistor.flush();
      });
    }, VGD_POINT_FLUSH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isTracking, dispatch]);
}
