import { useMemo } from 'react';
import { useAppSelector } from './useAppSelector';
import { driverForSlot, effectiveViewedSlot, tripsForDriverSlot } from '../utils/tripDriver';
import type { Driver } from '../types/driver.types';
import type { Trip } from '../types/trip.types';
import type { VgdDriverRole } from '../types/vgd.types';

/**
 * The trips of the driver currently being viewed (chosen by tapping a
 * driver on the Drivers screen; the account holder by default). The score
 * and trip screens use this instead of all trips, so each family member's
 * Driver Score, Eco Score and Trip History are their own.
 */
export function useViewedDriverTrips(): { trips: Trip[]; slot: VgdDriverRole; driver: Driver | undefined } {
  const allTrips = useAppSelector(s => s.trips.trips);
  const drivers = useAppSelector(s => s.drivers.drivers);
  const viewedSlot = useAppSelector(s => s.drivers.viewedSlot);

  return useMemo(() => {
    const slot = effectiveViewedSlot(drivers, viewedSlot);
    return {
      slot,
      driver: driverForSlot(drivers, slot),
      trips: tripsForDriverSlot(allTrips, drivers, slot),
    };
  }, [allTrips, drivers, viewedSlot]);
}
