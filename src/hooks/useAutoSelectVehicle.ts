import { useEffect } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { fetchVehicles, selectVehicle } from '../store/slices/vehicleSlice';

// Lives in the always-mounted TripDetectionRunner (not a specific screen)
// because selecting a vehicle mints the vehicle-scoped JWT (vehicleId claim)
// that every VGD request requires — trip auto-detection can fire from the
// background before the user ever visits the Home screen, so waiting on
// that screen's mount left sessions with no vehicleId claim at all and
// every trip/point silently rejected server-side with missing_vehicle_id.
//
// The re-select below (when selectedVehicle is set but disagrees with the
// token's own vehicleId claim) matters just as much: vgd_app authorizes
// every trip write against the JWT's vehicleId claim, not whatever vehicleId
// the client puts in the request body (see createTripHandler.js). A token
// restored from storage or refreshed independently of vehicle selection can
// carry a stale/absent claim while selectedVehicle already shows a vehicle
// on screen — Route Planner and trip recording would then silently record
// against the wrong vehicle (or fail), even though the UI looks correct.
export function useAutoSelectVehicle() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, claims } = useAppSelector(s => s.auth);
  const { vehicles, selectedVehicle } = useAppSelector(s => s.vehicles);

  useEffect(() => {
    if (isAuthenticated && vehicles.length === 0) {
      dispatch(fetchVehicles());
    }
  }, [isAuthenticated, vehicles.length, dispatch]);

  useEffect(() => {
    if (!isAuthenticated || vehicles.length === 0) return;

    if (!selectedVehicle) {
      dispatch(selectVehicle(vehicles[0].id));
    } else if (claims?.vehicleId !== selectedVehicle.id) {
      dispatch(selectVehicle(selectedVehicle.id));
    }
  }, [isAuthenticated, selectedVehicle, vehicles, claims?.vehicleId, dispatch]);
}
