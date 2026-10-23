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
  selectedDriver: Driver | null;
  isLoading: boolean;
  error: string | null;
}
