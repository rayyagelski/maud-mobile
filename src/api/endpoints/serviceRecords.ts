import client from '../client';
import type { ServiceRecord } from '../../types/serviceRecord.types';

export const serviceRecordsApi = {
  list: async (vehicleId: string) => {
    const res = await client.get<{ serviceRecords: ServiceRecord[] }>(`/vehicles/${vehicleId}/service-records`);
    return res.data.serviceRecords;
  },

  get: async (vehicleId: string, id: string | number) => {
    const res = await client.get<{ serviceRecord: ServiceRecord }>(`/vehicles/${vehicleId}/service-records/${id}`);
    return res.data.serviceRecord;
  },
};
