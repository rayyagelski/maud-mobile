import { useEffect, useRef, useState } from 'react';
import { vgdApi } from '../api';
import type { Trip } from '../types/trip.types';

export interface VgdBehaviorCounts {
  harshBrakeCount: number;
  harshAccelCount: number;
  harshCornerCount: number;
  isLoading: boolean;
}

const EMPTY_COUNTS = { harshBrakeCount: 0, harshAccelCount: 0, harshCornerCount: 0 };

// Backfills real harsh-event counts from VGD for trips that have no local
// `eventCounters` — i.e. `source: 'vgd'` trips restored by
// syncTripHistoryFromBackend (see tripHistorySync.ts), which were never
// recorded on this device and so never went through useHarshEventTracker.
// Trips that DO have local eventCounters are skipped here (already the
// richer, real-time-sampled source — see trip.types.ts) to avoid double
// counting the same trip from two sources.
//
// Same one-events-call-per-trip approach as useVgdRoadTypeBreakdown, reusing
// its exact indicator vocabulary (hard_braking/acceleration/cornering — see
// VgdTripEventIndicator). VGD has no equivalent for speeding-seconds or
// phone-usage-seconds (no duration concept, no phone-usage point parameter
// at all — see MyTripScreen.tsx's note on this), so those two stay
// local-only/unbackfilled rather than being approximated from something
// that isn't really the same measurement.
export function useVgdBehaviorAggregate(trips: Trip[]): VgdBehaviorCounts {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(false);
  const cancelledRef = useRef(false);

  const vgdOnlyTrips = trips.filter(t => t.vgdTripId && t.vgdTripCreated && !t.eventCounters);
  const key = vgdOnlyTrips.map(t => t.vgdTripId).join(',');

  useEffect(() => {
    cancelledRef.current = false;

    if (vgdOnlyTrips.length === 0) {
      setCounts(EMPTY_COUNTS);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    Promise.allSettled(
      vgdOnlyTrips.map(t => vgdApi.listTripEvents(t.vgdTripId as string, t.vehicleId)),
    ).then((results) => {
      if (cancelledRef.current) return;
      const next = { ...EMPTY_COUNTS };
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        result.value.data.events.forEach((event) => {
          if (event.indicator === 'hard_braking') next.harshBrakeCount += 1;
          else if (event.indicator === 'acceleration') next.harshAccelCount += 1;
          else if (event.indicator === 'cornering') next.harshCornerCount += 1;
        });
      });
      setCounts(next);
      setIsLoading(false);
    });

    return () => { cancelledRef.current = true; };
    // key captures the exact set of vgdTripIds being queried — see
    // useVgdRoadTypeBreakdown for why this replaces trips/vgdOnlyTrips here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...counts, isLoading };
}
