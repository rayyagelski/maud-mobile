import vgdClient from '../vgdClient';
import type {
  CreateVgdTripParams,
  VgdPoint,
  VgdTripDetails,
  VgdTripEventsResponse,
  VgdTripListResponse,
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

  // Backs trip-history restore after a reinstall/new device — the app
  // previously never called this, relying solely on local redux-persist
  // state as if it were the only copy of trip history (it isn't; VGD has
  // always had it). Sorted most-recent-first to match how history screens
  // display trips, same convention already used server-side (maud's
  // GetVehicleOdometerHandler sorts the same way for its own single-trip
  // lookup).
  listTrips: (vehicleId: string, offset: number, limit: number) =>
    vgdClient.get<VgdTripListResponse>('/trips', {
      params: {
        vehicleId, offset, limit, sort: 'analytics.startTime', order: 'desc',
      },
    }),
};
