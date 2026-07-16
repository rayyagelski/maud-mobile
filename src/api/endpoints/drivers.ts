import client from '../client';
import type { Driver } from '../../types/driver.types';

interface DriverDto {
  id: number;
  name: string;
  role: Driver['role'];
  isDefault: boolean;
}

function fromDto(dto: DriverDto): Driver {
  return {
    id: String(dto.id),
    name: dto.name,
    role: dto.role,
    isDefault: dto.isDefault,
  };
}

export const driversApi = {
  list: async () => {
    const res = await client.get<{ drivers: DriverDto[] }>('/drivers');
    return { ...res, data: res.data.drivers.map(fromDto) };
  },

  create: async (data: Omit<Driver, 'id'>) => {
    const res = await client.post<{ driver: DriverDto }>('/drivers', {
      name: data.name,
      role: data.role,
      is_default: data.isDefault,
    });
    return { ...res, data: fromDto(res.data.driver) };
  },

  remove: (driverId: string) =>
    client.delete(`/drivers/${driverId}`),
};
