import { useEffect, useRef } from 'react';
import Geolocation from '@react-native-community/geolocation';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { startTrip, endTrip, appendGpsPoint } from '../store/slices/tripSlice';
import { navigationRef } from '../navigation/navigationRef';
import { publishGpsFix } from '../services/gpsSpeedBus';

// Vehicle is "moving" above this speed; below it counts as stopped.
const SPEED_START_MS = 2.8;  // ~10 km/h — unambiguous vehicle motion
const SPEED_STOP_MS  = 0.5;  // ~1.8 km/h — stationary
// Vehicle must remain below SPEED_STOP_MS for this long before ending the trip.
// 45 s avoids false-ends during traffic lights / slow-moving traffic.
const STILL_MS = 45_000;
// A rehydrated in-flight trip whose last GPS activity is older than this is
// treated as stale (app killed mid-trip, reopened much later) and closed out
// immediately instead of resumed.
const STALE_TRIP_GAP_MS = 30 * 60 * 1000; // 30 min

export function useTripAutoDetection() {
  const dispatch    = useAppDispatch();
  const { claims }  = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const { activeTrip, isTracking }    = useAppSelector(s => s.trips);

  // Mutable refs keep the watchPosition callback always reading current Redux state
  // without restarting the GPS subscription on every state change.
  const isTrackingRef  = useRef(isTracking);
  const activeTripRef  = useRef(activeTrip);
  const endingRef      = useRef(false);   // guards against double-dispatch of endTrip
  const stillSinceRef  = useRef<number | null>(null);

  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);

  // Stale-trip guard: redux-persist now persists `trips` (see store/index.ts),
  // so an in-flight activeTrip can be rehydrated after the app was killed
  // mid-trip. If its last known activity is too old to safely resume (app was
  // closed for a while, not just briefly backgrounded), close it out now with
  // whatever data exists rather than silently resuming across a huge GPS gap.
  useEffect(() => {
    if (!isTracking || !activeTrip) return;
    const lastPoint = activeTrip.route[activeTrip.route.length - 1];
    const lastActivityAt = lastPoint?.timestamp ?? activeTrip.startTime;
    if (Date.now() - lastActivityAt > STALE_TRIP_GAP_MS) {
      dispatch(endTrip(activeTrip.id));
    }
    // Only relevant right after rehydration — deliberately runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!claims) return;

    // Resolve vehicleId: prefer JWT claim, then selected vehicle, then first in list
    const vehicleId = claims.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId) return;

    // Prefer the explicitly-selected driver profile; fall back to the account
    // owner for the common single-driver case (no profiles created yet).
    const driverId = selectedDriver?.id ?? String(claims.userId);

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
          publishGpsFix(speedMs, timestamp, gpsPoint);

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
                  navigationRef.navigate('TripSummary', { tripId });
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
  // Re-subscribe only when auth identity, vehicle, or driver context changes.
  // isTracking / activeTrip are intentionally read via refs above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, selectedVehicle, vehicles, selectedDriver, dispatch]);
}
