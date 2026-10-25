import type { VgdDriverRole } from './vgd.types';

export interface Driver {
  id: string;
  name: string;
  // VGD driver slot: self = main, spouse, child. 'family' (= spouse) and
  // 'other' (= child) are legacy values on older drivers — see driverRoles.ts.
  role: 'self' | 'spouse' | 'child' | 'family' | 'other';
  isDefault: boolean;
}

export interface DriverState {
  drivers: Driver[];
  // Who records the next trip.
  selectedDriver: Driver | null;
  // Whose scores and trips the score/trip screens show (tapped on the
  // Drivers screen); unset = the account holder (main). Separate from
  // selectedDriver: looking at Alex's scores must not record your own
  // next drive as Alex's.
  viewedSlot?: VgdDriverRole;
  isLoading: boolean;
  error: string | null;
}
