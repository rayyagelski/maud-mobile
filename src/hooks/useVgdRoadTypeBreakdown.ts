import { useEffect, useRef, useState } from 'react';
import { vgdApi } from '../api';
import type { Trip } from '../types/trip.types';

export type RoadTypeCategory = 'highway' | 'majorRoad' | 'urban' | 'residential';

// Collapses HERE's 5-tier `functionalClass` (as returned on VGD's `road_type`
// events, see VgdPointParameters.roadType) into MAUD-facing road categories —
// standard HERE FRC convention: 1-2 = motorway/primary controlled-access
// roads, 3 = secondary/arterial, 4 = local connector, 5 = residential street.
// A true "Rural" bucket (per product's 5-category design) needs more than
// functional class alone — road environment + speed limit + location context
// to disambiguate rural from urban at the same FRC — not available from this
// event alone, so it's intentionally omitted here rather than faked.
function categoryForFunctionalClass(fc: number): RoadTypeCategory | null {
  if (fc === 1 || fc === 2) return 'highway';
  if (fc === 3) return 'majorRoad';
  if (fc === 4) return 'urban';
  if (fc === 5) return 'residential';
  return null;
}

export interface VgdRoadTypeBreakdown {
  highway: number;
  majorRoad: number;
  urban: number;
  residential: number;
  isLoading: boolean;
  // True once at least one trip in range has an id VGD can be queried for —
  // lets the caller distinguish "zero real events" from "nothing to query".
  hasVgdTrips: boolean;
}

const EMPTY_COUNTS = {
  highway: 0, majorRoad: 0, urban: 0, residential: 0,
};

// Aggregates real `road_type` change events (VGD's own HERE route-matching
// enrichment, see [[maud-vgd-architecture]]) across every VGD-synced trip in
// the given list — one events call per trip, since vgd_query only exposes
// events per-trip, not as a cross-trip aggregate. Trips never synced to VGD
// (no vgdTripId/vgdTripCreated — e.g. recorded before VGD write-through
// existed, or still offline) are silently skipped rather than counted as zero.
export function useVgdRoadTypeBreakdown(trips: Trip[]): VgdRoadTypeBreakdown {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [isLoading, setIsLoading] = useState(false);
  const cancelledRef = useRef(false);

  const vgdTrips = trips.filter(t => t.vgdTripId && t.vgdTripCreated);
  const key = vgdTrips.map(t => t.vgdTripId).join(',');

  useEffect(() => {
    cancelledRef.current = false;

    if (vgdTrips.length === 0) {
      setCounts(EMPTY_COUNTS);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    Promise.allSettled(
      vgdTrips.map(t => vgdApi.listTripEvents(t.vgdTripId as string, t.vehicleId)),
    ).then((results) => {
      if (cancelledRef.current) return;
      const next = { ...EMPTY_COUNTS };
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        result.value.data.events.forEach((event) => {
          if (event.indicator !== 'road_type') return;
          const fc = event.parameters?.roadType;
          if (fc == null) return;
          const category = categoryForFunctionalClass(fc);
          if (category) next[category] += 1;
        });
      });
      setCounts(next);
      setIsLoading(false);
    });

    return () => { cancelledRef.current = true; };
    // key captures the exact set of vgdTripIds being queried — re-running
    // per-trip-array-identity-change would refetch on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...counts, isLoading, hasVgdTrips: vgdTrips.length > 0 };
}
