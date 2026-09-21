import client from '../client';
import type {
  ComponentCondition, ComponentConditionStatus, ServicePrediction, ServiceRecord, VehicleComponent,
} from '../../types/serviceRecord.types';

export const serviceRecordsApi = {
  list: async (vehicleId: string) => {
    const res = await client.get<{ serviceRecords: ServiceRecord[] }>(`/vehicles/${vehicleId}/service-records`);
    return res.data.serviceRecords;
  },

  get: async (vehicleId: string, id: string | number) => {
    const res = await client.get<{ serviceRecord: ServiceRecord }>(`/vehicles/${vehicleId}/service-records/${id}`);
    return res.data.serviceRecord;
  },

  // Driver-reported per-component condition — always returns every
  // component (backend defaults unrated ones to 'good').
  getCondition: async (vehicleId: string) => {
    const res = await client.get<{ condition: ComponentCondition[] }>(`/vehicles/${vehicleId}/condition`);
    return res.data.condition;
  },

  setCondition: async (vehicleId: string, component: VehicleComponent, status: ComponentConditionStatus) => {
    const res = await client.put<{ condition: ComponentCondition[] }>(
      `/vehicles/${vehicleId}/condition`, { component, status },
    );
    return res.data.condition;
  },

  // Sorted most-urgent-first by the backend. Distances in km.
  getPredictions: async (vehicleId: string) => {
    const res = await client.get<{ predictions: ServicePrediction[] }>(`/vehicles/${vehicleId}/service-predictions`);
    return res.data.predictions;
  },
};
