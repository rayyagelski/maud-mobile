import { useEffect, useRef } from 'react';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { syncTripHistoryFromBackend } from '../store/slices/tripSlice';

/**
 * Backfills trip history from the backend (VGD + trip_reward) once per app
 * session, as soon as a vehicle can actually be resolved — see
 * syncTripHistoryFromBackend in tripSlice.ts for why this exists at all
 * (redux-persist was previously the only copy of trip history the app ever
 * read from, so a reinstall/new device showed a permanently empty history).
 *
 * Deliberately not tied directly to the isAuthenticated transition in
 * AppNavigator: vehicles/claims can still be empty at that exact moment
 * (fetched by a separate effect after login), so this instead waits for
 * vehicleId to actually resolve, same dependency shape
 * useTripAutoDetection.ts already uses for the same reason.
 */
export function useTripHistorySync(): void {
  const dispatch = useAppDispatch();
  const { claims } = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);

  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current || !claims) return;

    const vehicleId = claims.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId) return;

    const driverId = selectedDriver?.id ?? String(claims.userId);

    syncedRef.current = true;
    dispatch(syncTripHistoryFromBackend({ vehicleId, driverId }));
  }, [claims, selectedVehicle, vehicles, selectedDriver, dispatch]);
}
