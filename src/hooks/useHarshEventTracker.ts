import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { accelerometer, gyroscope, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import {
  resetHarshEventCounters,
  incrementHarshEventCount,
  addSpeedingSeconds,
  addPhoneTextSeconds,
} from '../services/harshEventCounters';
import {
  createGravityFilter,
  classifyLongitudinalEvent,
  classifyCornering,
  vector3MagnitudeDegPerSec,
} from '../utils/harshEventDetector';
import { generateId } from '../utils/helpers';
import { SENSOR_SAMPLE_RATE_MS, SPEEDING_FLAT_THRESHOLD_KMH } from '../utils/constants';
import type { GpsPoint, TelematicsEvent } from '../types/trip.types';

/**
 * Real accelerometer/gyroscope-based harsh-event detection (SRS 2.8/4.4),
 * complementary to useTripAutoDetection (GPS-only start/stop). Subscribes to
 * sensors only while a trip is being tracked, to avoid unnecessary battery
 * drain, and mirrors GPS fixes via gpsSpeedBus rather than opening a second
 * location subscription.
 */
export function useHarshEventTracker(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);

  const activeTripIdRef = useRef<string | null>(activeTrip?.id ?? null);
  useEffect(() => {
    activeTripIdRef.current = activeTrip?.id ?? null;
  }, [activeTrip?.id]);

  useEffect(() => {
    if (!isTracking) return;

    resetHarshEventCounters();

    const gravityFilter = createGravityFilter();
    let peakAccelMagnitude = 0;
    let lastGpsSpeedMs = 0;
    let lastGpsTimestamp: number | null = null;
    let lastGpsPoint: GpsPoint | null = null;
    let lastSpeedingCheckAt = Date.now();

    function emitEvent(type: TelematicsEvent['type'], location: GpsPoint, value: number) {
      if (!activeTripIdRef.current) return;
      dispatch(
        addTelematicsEvent({
          id: generateId(),
          type,
          timestamp: Date.now(),
          location,
          value,
        }),
      );
      if (type === 'harsh_brake') incrementHarshEventCount('harshBrakeCount');
      else if (type === 'harsh_accel') incrementHarshEventCount('harshAccelCount');
      else if (type === 'harsh_corner') incrementHarshEventCount('harshCornerCount');
    }

    setUpdateIntervalForType(SensorTypes.accelerometer, SENSOR_SAMPLE_RATE_MS);
    setUpdateIntervalForType(SensorTypes.gyroscope, SENSOR_SAMPLE_RATE_MS);

    const accelSub = accelerometer.subscribe(({ x, y, z }) => {
      const magnitude = gravityFilter.update({ x, y, z });
      if (magnitude > peakAccelMagnitude) peakAccelMagnitude = magnitude;
    });

    const gyroSub = gyroscope.subscribe(({ x, y, z }) => {
      if (!lastGpsPoint) return;
      const gyroDegPerSec = vector3MagnitudeDegPerSec({ x, y, z });
      if (classifyCornering(gyroDegPerSec, lastGpsSpeedMs)) {
        emitEvent('harsh_corner', lastGpsPoint, gyroDegPerSec);
      }
    });

    const unsubscribeGps = subscribeGpsFix((speedMs, timestamp, point) => {
      if (lastGpsTimestamp != null) {
        const dtSeconds = (timestamp - lastGpsTimestamp) / 1000;
        if (dtSeconds > 0) {
          const gpsSpeedDeltaMs2 = (speedMs - lastGpsSpeedMs) / dtSeconds;
          const event = classifyLongitudinalEvent(gpsSpeedDeltaMs2, peakAccelMagnitude);
          if (event) emitEvent(event, point, gpsSpeedDeltaMs2);
        }
      }
      peakAccelMagnitude = 0;
      lastGpsSpeedMs = speedMs;
      lastGpsTimestamp = timestamp;
      lastGpsPoint = point;

      // Speeding: flat-threshold placeholder — no posted-speed-limit source
      // yet (that's compliance-phase work, see constants.ts).
      const now = Date.now();
      const elapsedSeconds = (now - lastSpeedingCheckAt) / 1000;
      lastSpeedingCheckAt = now;
      if (speedMs * 3.6 > SPEEDING_FLAT_THRESHOLD_KMH) {
        addSpeedingSeconds(Math.round(elapsedSeconds));
      }
    });

    // Phone-usage proxy: time spent with MAUD Connect backgrounded during an
    // active trip (not "app active" — the app itself is likely foregrounded
    // for turn-by-turn use, so that would never fire). Approximates a driver
    // switching away to another app; won't catch in-app-foreground distraction.
    let backgroundedAt: number | null = null;
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        if (backgroundedAt != null) {
          addPhoneTextSeconds(Math.round((Date.now() - backgroundedAt) / 1000));
          backgroundedAt = null;
        }
      } else if (backgroundedAt == null) {
        backgroundedAt = Date.now();
      }
    });

    return () => {
      accelSub.unsubscribe();
      gyroSub.unsubscribe();
      unsubscribeGps();
      appStateSub.remove();
    };
  }, [isTracking, dispatch]);
}
