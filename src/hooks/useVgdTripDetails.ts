import { useEffect, useRef, useState } from 'react';
import { vgdApi } from '../api';
import type { VgdTripDetails, VgdTripEvent } from '../types/vgd.types';

// vgd_analytics processes a trip asynchronously after trip_end (HERE route
// matching/weather/geocoding calls) — a 404 or missing `analytics` shortly
// after upload is the expected "not processed yet" case, not an error.
// Backs off across a few attempts before settling into a processing state.
const RETRY_DELAYS_MS = [3000, 6000, 12000];

interface UseVgdTripDetailsResult {
  details: VgdTripDetails | null;
  events: VgdTripEvent[];
  isLoading: boolean;
  isProcessing: boolean;
}

export function useVgdTripDetails(
  vgdTripId: string | undefined,
  vehicleId: string,
): UseVgdTripDetailsResult {
  const [details, setDetails] = useState<VgdTripDetails | null>(null);
  const [events, setEvents] = useState<VgdTripEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!vgdTripId) {
      setDetails(null);
      setEvents([]);
      setIsLoading(false);
      setIsProcessing(false);
      return undefined;
    }

    setIsLoading(true);
    setIsProcessing(false);

    let timer: ReturnType<typeof setTimeout> | undefined;

    async function attempt(retryIndex: number) {
      try {
        const [detailsRes, eventsRes] = await Promise.all([
          vgdApi.getTripDetails(vgdTripId as string, vehicleId),
          vgdApi.listTripEvents(vgdTripId as string, vehicleId),
        ]);
        if (cancelledRef.current) return;

        // analytics itself is built (and thus truthy) as soon as vgd_analytics
        // has run at all — startAddress/endAddress are populated by a separate
        // reverse-geocode step inside that same pass and can still be null on
        // the very first successful poll (e.g. HERE geocoding hasn't returned
        // yet). Treating analytics-without-addresses as "still processing"
        // gives that step the same retry budget as the rest of analytics,
        // instead of the hook declaring done the instant analytics exists and
        // permanently showing raw coordinates for a trip whose addresses were
        // simply still in flight.
        const analytics = detailsRes.data.trip.analytics;
        const stillProcessing = !analytics || (!analytics.startAddress && !analytics.endAddress);
        if (stillProcessing && retryIndex < RETRY_DELAYS_MS.length) {
          setIsProcessing(true);
          timer = setTimeout(() => attempt(retryIndex + 1), RETRY_DELAYS_MS[retryIndex]);
          return;
        }

        setDetails(detailsRes.data.trip);
        setEvents(eventsRes.data.events);
        setIsProcessing(stillProcessing);
        setIsLoading(false);
      } catch (err: unknown) {
        if (cancelledRef.current) return;
        const status = (err as { status?: number } | undefined)?.status;
        if (status === 404 && retryIndex < RETRY_DELAYS_MS.length) {
          setIsProcessing(true);
          timer = setTimeout(() => attempt(retryIndex + 1), RETRY_DELAYS_MS[retryIndex]);
          return;
        }
        // Real failure (not the expected not-processed-yet case) — stop
        // retrying, leave details/events empty rather than looping forever.
        setIsLoading(false);
        setIsProcessing(false);
      }
    }

    attempt(0);

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [vgdTripId, vehicleId]);

  return { details, events, isLoading, isProcessing };
}
