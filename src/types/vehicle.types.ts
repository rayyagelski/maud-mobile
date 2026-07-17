export type FuelType = 'petrol' | 'diesel' | 'electric' | 'hydrogen' | 'hybrid';
export type VehicleType = 'car' | 'truck' | 'scooter';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year?: number;
  fuelType?: FuelType;
  vehicleType?: VehicleType;
  engineSize?: number;
  vin?: string;
  odometer?: number;
  estimatedConsumption?: number; // L/100km or kWh/100km
  isActive?: boolean;
}

export interface OdometerResponse {
  vehicleId: string;
  odometer: number;
}

export interface VehicleState {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  isLoading: boolean;
  error: string | null;
}
