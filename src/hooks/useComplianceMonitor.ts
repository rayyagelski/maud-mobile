import { useEffect } from 'react';
import { Vibration } from 'react-native';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { fetchNearbySpeedCameras } from '../services/overpass/speedCameraClient';
import {
  findNearestCameraWithinRadius,
  shouldRefreshCache,
  type SpeedCamera,
  type Coordinate,
} from '../utils/complianceAlertLogic';
import { setActiveAlert, clearActiveAlert } from '../store/slices/complianceSlice';
import { SPEED_ZONE_ALERT_RADIUS_KM } from '../utils/constants';

const QUERY_RADIUS_KM = 5;
const REFRESH_DISTANCE_KM = 2;

/**
 * Real speed-camera/enforcement-zone alerts (SRS 4.5), sourced from OpenStreetMap
 * via Overpass — no backend involvement. Runs only during an active, tracked
 * trip with alerts enabled, reusing the same GPS-fix stream useHarshEventTracker
 * subscribes to (gpsSpeedBus) rather than opening a second location subscription.
 */
export function useComplianceMonitor(): void {
  const dispatch = useAppDispatch();
  const { isTracking } = useAppSelector(s => s.trips);
  const { alertsEnabled } = useAppSelector(s => s.compliance);

  useEffect(() => {
    if (!isTracking || !alertsEnabled) return;

    let cameras: SpeedCamera[] = [];
    let lastQueryPoint: Coordinate | null = null;
    let isFetching = false;
    let wasAlerting = false;

    const unsubscribe = subscribeGpsFix((_speedMs, _timestamp, point) => {
      const position: Coordinate = { latitude: point.latitude, longitude: point.longitude };

      if (!isFetching && shouldRefreshCache(lastQueryPoint, position, REFRESH_DISTANCE_KM)) {
        isFetching = true;
        lastQueryPoint = position;
        fetchNearbySpeedCameras(position, QUERY_RADIUS_KM)
          .then(result => {
            cameras = result;
          })
          .catch(() => {
            // Keep the stale cache on a failed refresh rather than dropping alerts entirely.
          })
          .finally(() => {
            isFetching = false;
          });
      }

      const alert = findNearestCameraWithinRadius(cameras, position, SPEED_ZONE_ALERT_RADIUS_KM);
      if (alert) {
        dispatch(setActiveAlert(alert));
        if (!wasAlerting) Vibration.vibrate();
        wasAlerting = true;
      } else if (wasAlerting) {
        dispatch(clearActiveAlert());
        wasAlerting = false;
      }
    });

    return () => {
      unsubscribe();
      dispatch(clearActiveAlert());
    };
  }, [isTracking, alertsEnabled, dispatch]);
}
