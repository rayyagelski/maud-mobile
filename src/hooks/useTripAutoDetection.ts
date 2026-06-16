import { useEffect, useRef } from 'react';
import Geolocation from '@react-native-community/geolocation';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { startTrip, endTrip, appendGpsPoint } from '../store/slices/tripSlice';
import { navigationRef } from '../navigation/navigationRef';

// Vehicle is "moving" above this speed; below it counts as stopped.
const SPEED_START_MS = 2.8;  // ~10 km/h — unambiguous vehicle motion
const SPEED_STOP_MS  = 0.5;  // ~1.8 km/h — stationary
// Vehicle must remain below SPEED_STOP_MS for this long before ending the trip.
// 45 s avoids false-ends during traffic lights / slow-moving traffic.
const STILL_MS = 45_000;

export function useTripAutoDetection() {
  const dispatch    = useAppDispatch();
  const { claims }  = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { activeTrip, isTracking }    = useAppSelector(s => s.trips);

  // Mutable refs keep the watchPosition callback always reading current Redux state
  // without restarting the GPS subscription on every state change.
  const isTrackingRef  = useRef(isTracking);
  const activeTripRef  = useRef(activeTrip);
  const endingRef      = useRef(false);   // guards against double-dispatch of endTrip
  const stillSinceRef  = useRef<number | null>(null);

  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);

  useEffect(() => {
    if (!claims) return;

    // Resolve vehicleId: prefer JWT claim, then selected vehicle, then first in list
    const vehicleId = claims.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId) return;

    const driverId = String(claims.userId);

    const watchId = Geolocation.watchPosition(
      ({ coords, timestamp }) => {
        // GPS speed is in m/s; -1 means unavailable (iOS)
        const speedMs = coords.speed != null && coords.speed >= 0 ? coords.speed : 0;

        const gpsPoint = {
          latitude:  coords.latitude,
          longitude: coords.longitude,
          altitude:  coords.altitude  ?? undefined,
          speed:     speedMs,
          heading:   coords.heading   ?? undefined,
          accuracy:  coords.accuracy  ?? undefined,
          timestamp,
        };

        // ── Auto-start ─────────────────────────────────────────────────────
        if (!isTrackingRef.current && !endingRef.current && speedMs >= SPEED_START_MS) {
          stillSinceRef.current = null;
          dispatch(startTrip({
            vehicleId,
            driverId,
            tripType: 'business',
            transportMode: 'car',
          }));
          return;
        }

        // ── Record GPS + auto-end ───────────────────────────────────────────
        if (isTrackingRef.current && activeTripRef.current) {
          dispatch(appendGpsPoint(gpsPoint));

          if (speedMs < SPEED_STOP_MS) {
            if (stillSinceRef.current === null) {
              stillSinceRef.current = Date.now();
            } else if (!endingRef.current && Date.now() - stillSinceRef.current >= STILL_MS) {
              endingRef.current = true;
              const tripId = activeTripRef.current.id;
              dispatch(endTrip(tripId)).then(() => {
                endingRef.current     = false;
                stillSinceRef.current = null;
                if (navigationRef.isReady()) {
                  navigationRef.navigate('TripSummary');
                }
              });
            }
          } else {
            // Vehicle is moving again — reset the stillness timer
            stillSinceRef.current = null;
          }
        }
      },
      (err) => console.warn('[TripAutoDetection]', err.message),
      {
        enableHighAccuracy: true,
        distanceFilter: 5,    // update every 5 metres
        interval: 3000,       // Android: poll interval ms
        fastestInterval: 1000,
      },
    );

    return () => Geolocation.clearWatch(watchId);
  // Re-subscribe only when auth identity or vehicle context changes.
  // isTracking / activeTrip are intentionally read via refs above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, selectedVehicle, vehicles, dispatch]);
}
