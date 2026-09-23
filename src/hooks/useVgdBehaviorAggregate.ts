import { useEffect, useRef, useState } from 'react';
import { vgdApi } from '../api';
import type { Trip } from '../types/trip.types';
import type { VgdTripEvent } from '../types/vgd.types';

export interface VgdBehaviorCounts {
  harshBrakeCount: number;
  harshAccelCount: number;
  harshCornerCount: number;
  // Minutes over the posted limit per VGD trip id — see below. Present for
  // every trip in the period that has a VGD record, not only VGD-only ones.
  speedingMinutesByVgdTripId: Record<string, number>;
  isLoading: boolean;
}

const EMPTY: Omit<VgdBehaviorCounts, 'isLoading'> = {
  harshBrakeCount: 0, harshAccelCount: 0, harshCornerCount: 0, speedingMinutesByVgdTripId: {},
};

// The events endpoint pages; a trip with many events (the pre-fix gyroscope
// logged up to 80 cornering events in a single trip) pushed its later
// speed_limit events past a fixed first page of 100. Walks every page
// using the response's own total, with a hard cap as a safety net.
const EVENTS_PAGE_SIZE = 100;
const MAX_EVENT_PAGES = 10;

async function listAllTripEvents(vgdTripId: string, vehicleId: string): Promise<VgdTripEvent[]> {
  const all: VgdTripEvent[] = [];
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const res = await vgdApi.listTripEvents(vgdTripId, vehicleId, page * EVENTS_PAGE_SIZE, EVENTS_PAGE_SIZE);
    all.push(...res.data.events);
    const total = res.data.stats?.total ?? all.length;
    if (res.data.events.length < EVENTS_PAGE_SIZE || all.length >= total) break;
  }
  return all;
}

// Two things from VGD's per-trip events:
//
// 1. Speeding minutes, for EVERY trip with a VGD record. vgd_analytics
//    computes speed_limit events server-side after each trip ends — HERE
//    map-matching of the uploaded route, then every stretch driven above the
//    posted limit, with its duration in `minutes` (speedLimitPointsFilter.js).
//    That's the authoritative measure: it's the same data behind the
//    speeding events shown in Trip Details and on the web, and it doesn't
//    depend on the phone having had network while driving. The on-device
//    counter it replaces needed a live HERE response mid-drive, which real
//    drives showed the OS blocks for a backgrounded app — so it read
//    "Speeding 0 min" beside a trip list full of speeding events.
//
// 2. Harsh-event counts, only for trips with no local `eventCounters`
//    (`source: 'vgd'` trips restored from the backend, never recorded on
//    this device). Trips that DO have local counters are skipped for these,
//    to avoid counting the same trip from two sources.
//
// Phone usage has no VGD equivalent (no point parameter for it), so it
// stays local-only.
export function useVgdBehaviorAggregate(trips: Trip[]): VgdBehaviorCounts {
  const [result, setResult] = useState(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const cancelledRef = useRef(false);

  const vgdTrips = trips.filter(t => t.vgdTripId && t.vgdTripCreated);
  const key = vgdTrips.map(t => `${t.vgdTripId}:${t.eventCounters ? 'l' : 'v'}`).join(',');

  useEffect(() => {
    cancelledRef.current = false;

    if (vgdTrips.length === 0) {
      setResult(EMPTY);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    Promise.allSettled(
      vgdTrips.map(t => listAllTripEvents(t.vgdTripId as string, t.vehicleId).then(events => ({ trip: t, events }))),
    ).then((settled) => {
      if (cancelledRef.current) return;
      const next: Omit<VgdBehaviorCounts, 'isLoading'> = {
        harshBrakeCount: 0, harshAccelCount: 0, harshCornerCount: 0, speedingMinutesByVgdTripId: {},
      };
      settled.forEach((s) => {
        if (s.status !== 'fulfilled') return;
        const { trip, events } = s.value;
        let speedingMinutes = 0;
        events.forEach((event) => {
          if (event.indicator === 'speed_limit') {
            speedingMinutes += Number(event.parameters.minutes ?? 0);
          }
          if (trip.eventCounters) return; // local counters own harsh events
          if (event.indicator === 'hard_braking') next.harshBrakeCount += 1;
          else if (event.indicator === 'acceleration') next.harshAccelCount += 1;
          else if (event.indicator === 'cornering') next.harshCornerCount += 1;
        });
        next.speedingMinutesByVgdTripId[trip.vgdTripId as string] = speedingMinutes;
      });
      setResult(next);
      setIsLoading(false);
    });

    return () => { cancelledRef.current = true; };
    // key captures the exact set of vgdTripIds (and which own their harsh
    // counts locally) — see useVgdRoadTypeBreakdown for why it replaces
    // trips/vgdTrips here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...result, isLoading };
}
