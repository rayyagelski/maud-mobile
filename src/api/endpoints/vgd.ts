import vgdClient from '../vgdClient';
import type {
  CreateVgdTripParams,
  VgdPoint,
  VgdTripDetails,
  VgdTripEventsResponse,
} from '../../types/vgd.types';

// Real error status returned by VehicleGeneratedData's createTripHandler.js
// (TripIdExistError, HTTP 409) when a client-supplied `id` was already used —
// callers should treat this as an idempotent success, not a failure.
export const VGD_TRIP_ID_EXISTS_STATUS = 'trip_id_is_already_exist';

export const vgdApi = {
  createTrip: (params: CreateVgdTripParams) =>
    vgdClient.post<{ tripId: string }>('/trips', params),

  patchTripPoints: (tripId: string, points: VgdPoint[]) =>
    vgdClient.patch<{ status: string }>(`/trips/${tripId}`, { points }),

  getTripDetails: (tripId: string, vehicleId: string) =>
    vgdClient.get<{ trip: VgdTripDetails }>(`/trips/${tripId}`, { params: { vehicleId } }),

  listTripEvents: (tripId: string, vehicleId: string) =>
    vgdClient.get<VgdTripEventsResponse>(`/trips/${tripId}/events`, {
      params: { vehicleId, offset: 0, limit: 100 },
    }),
};
