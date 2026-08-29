import { useEffect, useRef, useState } from 'react';
import { vgdApi } from '../api';
import type { Trip } from '../types/trip.types';

// HERE reverse-geocoded addresses (see useVgdTripDetails) are typically
// "Street, City, State ZIP, Country" — the city is reliably the second
// segment from the end for both US and most international formats. Not a
// real address parser, just a best-effort label for the Eco Score list.
function cityFromAddress(address: string): string {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? address;
  return parts[parts.length - 2];
}

// Looks up each visible trip's VGD destination city — one getTripDetails
// call per trip (same one-call-per-trip pattern as useVgdRoadTypeBreakdown),
// since listTrips' summary projection doesn't carry far enough to be reused
// here without also fetching per-trip analytics for the CO2 breakdown.
export function useVgdEndAddresses(trips: Trip[]): Record<string, string> {
  const [cities, setCities] = useState<Record<string, string>>({});
  const cancelledRef = useRef(false);

  const vgdTrips = trips.filter(t => t.vgdTripId && t.vgdTripCreated);
  const key = vgdTrips.map(t => t.vgdTripId).join(',');

  useEffect(() => {
    cancelledRef.current = false;

    if (vgdTrips.length === 0) {
      setCities({});
      return undefined;
    }

    Promise.allSettled(
      vgdTrips.map(t => vgdApi.getTripDetails(t.vgdTripId as string, t.vehicleId)),
    ).then((results) => {
      if (cancelledRef.current) return;
      const next: Record<string, string> = {};
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') return;
        const endAddress = result.value.data.trip.analytics?.endAddress;
        if (endAddress) next[vgdTrips[i].id] = cityFromAddress(endAddress);
      });
      setCities(next);
    });

    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return cities;
}
