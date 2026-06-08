import client from '../client';
import type { Vehicle, OdometerResponse } from '../../types/vehicle.types';

export const vehiclesApi = {
  list: () =>
    client.get<Vehicle[]>('/vehicles'),

  select: (vehicleId: string) =>
    client.post<{ token: string }>(`/vehicles/${vehicleId}`),

  getOdometer: (vehicleId: string) =>
    client.get<OdometerResponse>(`/vehicles/${vehicleId}/odometer`),

  updateOdometer: (vehicleId: string, odometer: number) =>
    client.post(`/vehicles/${vehicleId}/odometer`, { odometer }),

  create: (data: Omit<Vehicle, 'id'>) =>
    client.post<Vehicle>('/vehicles', data),
};
