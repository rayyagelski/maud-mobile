import { useEffect, useRef } from 'react';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { flushVgdPoints } from '../store/slices/tripSlice';
import { VGD_POINT_FLUSH_INTERVAL_MS } from '../utils/constants';

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
      dispatch(flushVgdPoints({ tripId, isTripEnd: false }));
    }, VGD_POINT_FLUSH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isTracking, dispatch]);
}
