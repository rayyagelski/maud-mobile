import { useEffect, useState } from 'react';
import { vehiclesApi } from '../api';
import type { Trip } from '../types/trip.types';
import type { TripCostResponse } from '../types/vehicle.types';

// A finished trip's real cost — Insurance/Tax/Leasing/Financing +
// Repair/Maintenance + Fuel/Electricity over the trip's time window
// (TotalCostCalculator, server-side; the same figure as the web "Vehicle
// Generated Data" page's Trip cost row). Distinct from a reward's "Money
// Saved", which compares against a baseline. Null while loading, for a trip
// still in progress, or if the lookup fails (fail-soft like every other
// auxiliary lookup in this app).
export function useTripCost(trip: Pick<Trip, 'vehicleId' | 'startTime' | 'endTime'> | undefined): TripCostResponse | null {
  const [tripCost, setTripCost] = useState<TripCostResponse | null>(null);
  const vehicleId = trip?.vehicleId;
  const startTime = trip?.startTime;
  const endTime = trip?.endTime;

  useEffect(() => {
    if (!vehicleId || startTime == null || !endTime) {
      setTripCost(null);
      return undefined;
    }
    let cancelled = false;
    vehiclesApi.getTripCost(vehicleId, Math.round(startTime / 1000), Math.round(endTime / 1000))
      .then((res) => { if (!cancelled) setTripCost(res.data); })
      .catch(() => { if (!cancelled) setTripCost(null); });
    return () => { cancelled = true; };
  }, [vehicleId, startTime, endTime]);

  return tripCost;
}

// "12.34 USD", or null when there is no cost to show.
export function formatTripCost(tripCost: TripCostResponse | null): string | null {
  return tripCost?.cost != null ? `${tripCost.cost.toFixed(2)} ${tripCost.currencyCode}`.trim() : null;
}
