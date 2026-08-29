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

// Matches App\Handler\API\Vehicle\GetVehicleFuelPriceHandler's response
// exactly — one of the two price fields is always null (electric vs fuel),
// never both populated.
export interface FuelPriceResponse {
  fuelPricePerLiter: number | null;
  electricityPricePerKwh: number | null;
  currencyCode: string;
}

export interface TripCostResponse {
  cost: number | null;
  currencyCode: string;
}

// Matches App\Handler\API\Vehicle\GetVehicleOwnershipCostRateHandler's
// response — Insurance/Tax/Leasing/Financing cost and maintenance/repair
// cost, each as a per-minute rate rather than a cost over an elapsed window,
// since a not-yet-driven route has no start/end time. Multiply either by an
// estimated trip duration (minutes) to get that route's estimated cost.
// maintenanceCostPerMinute is a spread of the vehicle's trailing-12-months
// service/repair invoices, so unlike ownershipCostPerMinute it's always a
// real number (0 when there's no service history), never null.
export interface OwnershipCostRateResponse {
  ownershipCostPerMinute: number | null;
  maintenanceCostPerMinute: number;
  currencyCode: string;
}

export interface VehicleState {
  vehicles: Vehicle[];
  selectedVehicle: Vehicle | null;
  isLoading: boolean;
  error: string | null;
}
