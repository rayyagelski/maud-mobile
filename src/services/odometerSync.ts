import { vehiclesApi } from '../api';

/**
 * Adds a finished trip's distance to the vehicle's odometer and returns the
 * new reading.
 *
 * Uses the backend's per-trip increment, which applies each trip exactly
 * once. The previous "read the odometer, add, write it back" lost trips
 * whenever several updates arrived together (real data: three trips'
 * updates fired at once when the phone's network came back, and two of
 * them, 11.7 mi, were lost), and could double-count a trip the server had
 * already added.
 *
 * Falls back to read-add-write only when the backend doesn't have the
 * per-trip endpoint yet (404 on that route), so this build works against
 * either backend version during rollout.
 */
export async function applyTripToOdometer(vehicleId: string, tripId: string, distanceKm: number): Promise<number | null> {
  try {
    const res = await vehiclesApi.applyOdometerTrip(vehicleId, tripId, distanceKm);
    return res.data.odometer;
  } catch (err: unknown) {
    if ((err as { status?: number } | undefined)?.status !== 404) throw err;
  }
  const current = await vehiclesApi.getOdometer(vehicleId);
  const newOdometer = current.data.odometer + distanceKm;
  await vehiclesApi.updateOdometer(vehicleId, newOdometer);
  return newOdometer;
}
