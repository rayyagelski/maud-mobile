import client from '../client';
import type { Driver } from '../../types/driver.types';

export const driversApi = {
  list: () =>
    client.get<Driver[]>('/drivers'),

  create: (data: Omit<Driver, 'id'>) =>
    client.post<Driver>('/drivers', data),

  remove: (driverId: string) =>
    client.delete(`/drivers/${driverId}`),
};
