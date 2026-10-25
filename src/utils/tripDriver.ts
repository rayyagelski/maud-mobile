import type { Trip } from '../types/trip.types';
import type { Driver } from '../types/driver.types';
import type { VgdDriverRole } from '../types/vgd.types';
import { driverSlot } from './driverRoles';

// Which driver slot (main/spouse/child) a trip belongs to:
//  1. the slot stored on the trip (set at recording, corrected from VGD);
//  2. else the slot of the driver who recorded it (older local trips);
//  3. else main — trips from before drivers existed were the account
//     holder's.
export function tripDriverSlot(trip: Pick<Trip, 'driverSlot' | 'driverId'>, drivers: Driver[]): VgdDriverRole {
  if (trip.driverSlot) return trip.driverSlot;
  const driver = drivers.find(d => d.id === trip.driverId);
  return driver ? driverSlot(driver.role) : 'main';
}

export function tripsForDriverSlot<T extends Pick<Trip, 'driverSlot' | 'driverId'>>(
  trips: T[], drivers: Driver[], slot: VgdDriverRole,
): T[] {
  return trips.filter(t => tripDriverSlot(t, drivers) === slot);
}

// The driver profile for a slot, if the account has one.
export function driverForSlot(drivers: Driver[], slot: VgdDriverRole): Driver | undefined {
  return drivers.find(d => driverSlot(d.role) === slot);
}

// The slot being viewed, falling back to main when no driver holds it any
// more (e.g. the viewed family member was removed).
export function effectiveViewedSlot(drivers: Driver[], viewed: VgdDriverRole | undefined): VgdDriverRole {
  if (!viewed || viewed === 'main') return 'main';
  return driverForSlot(drivers, viewed) ? viewed : 'main';
}
