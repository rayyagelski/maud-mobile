import type { Driver } from '../types/driver.types';
import type { VgdDriverRole } from '../types/vgd.types';

// A driver's role is one of VGD's three driver slots: main (the account
// holder), spouse, child, one driver per slot. 'family' and 'other' are the
// pre-slot values still stored on older drivers: they were uploaded as
// spouse and child respectively, and keep meaning exactly that.
const SLOT_BY_ROLE: Record<Driver['role'], VgdDriverRole> = {
  self: 'main',
  spouse: 'spouse',
  child: 'child',
  family: 'spouse',
  other: 'child',
};

// Unknown role (a newer backend value this build doesn't know): upload as
// main rather than send VGD a driver it rejects, which would lose the trip.
export function driverSlot(role: string): VgdDriverRole {
  return SLOT_BY_ROLE[role as Driver['role']] ?? 'main';
}

const SLOT_LABEL: Record<VgdDriverRole, string> = { main: 'Main', spouse: 'Spouse', child: 'Child' };

export function driverRoleLabel(role: string): string {
  return SLOT_LABEL[driverSlot(role)];
}

// The roles offered when adding a driver, in display order.
export const SELECTABLE_DRIVER_ROLES: Array<{ role: Driver['role']; slot: VgdDriverRole }> = [
  { role: 'self', slot: 'main' },
  { role: 'spouse', slot: 'spouse' },
  { role: 'child', slot: 'child' },
];

export function takenDriverSlots(drivers: Array<Pick<Driver, 'role'>>): Set<VgdDriverRole> {
  return new Set(drivers.map(d => driverSlot(d.role)));
}
