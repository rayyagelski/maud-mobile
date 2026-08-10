import client from '../client';
import type { Vehicle, FuelType, OdometerResponse, FuelPriceResponse, TripCostResponse } from '../../types/vehicle.types';

// Actual shape of GET /vehicles (App\Serializer\API\VehicleListNormalizer) —
// does not match the mobile Vehicle type 1:1, so it's mapped below.
interface VehicleListItemDto {
  vehicleId: string;
  isActive: boolean;
  vin: string | null;
  vehicleInfo: { brand: string; model: string };
  engineType: string | null;
  averageFuelConsumption: number | null;
}

// Maps App\Entity\Customer\Me\Vehicle\VehicleDetails\EngineType handles to
// the mobile FuelType union. Mobile has no separate "plug-in hybrid" or
// "biodiesel" case, so those fold into the closest match.
const ENGINE_TYPE_TO_FUEL_TYPE: Record<string, FuelType> = {
  GAS: 'petrol',
  DIESEL: 'diesel',
  BIE_DIESEL: 'diesel',
  ALL_ELECTRIC: 'electric',
  HYDROGEN_FUEL_CELL: 'hydrogen',
  HYBRID: 'hybrid',
  PLUG_IN_HYBRID: 'hybrid',
};

function mapVehicleDto(dto: VehicleListItemDto): Vehicle {
  return {
    id: dto.vehicleId,
    make: dto.vehicleInfo.brand,
    model: dto.vehicleInfo.model,
    vin: dto.vin ?? undefined,
    isActive: dto.isActive,
    fuelType: dto.engineType ? ENGINE_TYPE_TO_FUEL_TYPE[dto.engineType] : undefined,
    estimatedConsumption: dto.averageFuelConsumption ?? undefined,
  };
}

export const vehiclesApi = {
  list: async () => {
    const res = await client.get<{ vehicles: VehicleListItemDto[] }>('/vehicles');
    return { ...res, data: res.data.vehicles.map(mapVehicleDto) };
  },

  select: (vehicleId: string) =>
    client.post<{ token: string }>(`/vehicles/${vehicleId}`),

  getOdometer: (vehicleId: string) =>
    client.get<OdometerResponse>(`/vehicles/${vehicleId}/odometer`),

  updateOdometer: (vehicleId: string, odometer: number) =>
    client.post(`/vehicles/${vehicleId}/odometer`, { odometer }),

  getFuelPrice: (vehicleId: string) =>
    client.get<FuelPriceResponse>(`/vehicles/${vehicleId}/fuel-price`),

  // Reuses the same server-side Insurance/Tax/Leasing/Financing + Repair/
  // Maintenance + Fuel/Electricity formula (TotalCostCalculator) the web
  // "Vehicle Generated Data" page already relies on for its Trip cost row —
  // mobile's own VGD trip-detail read goes straight to vgd_query and never
  // gets this otherwise, since that calculation only ever lived PHP-side.
  getTripCost: (vehicleId: string, startTimeUnix: number, endTimeUnix: number) =>
    client.get<TripCostResponse>(`/vehicles/${vehicleId}/trip-cost`, {
      params: { startTime: startTimeUnix, endTime: endTimeUnix },
    }),

  // Vehicle creation is intentionally web-only (Customer\Me\Vehicle flow) —
  // it cascades into insurance/leasing/financing/registration setup that
  // has no mobile equivalent. AddVehicleScreen hands off to the web app
  // instead of calling a (nonexistent) create endpoint.
};
