export interface Driver {
  id: string;
  name: string;
  role: 'self' | 'family' | 'other';
  isDefault: boolean;
}

export interface DriverState {
  drivers: Driver[];
  selectedDriver: Driver | null;
  isLoading: boolean;
  error: string | null;
}
