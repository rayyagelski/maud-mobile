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
import {
  SENSOR_SAMPLE_RATE_MS, SPEEDING_FLAT_THRESHOLD_KMH, MIN_PHONE_USAGE_EVENT_SECONDS, TRIP_AUTO_START_SPEED_KMH,
} from '../utils/constants';
import { isBluetoothGateSatisfied } from '../utils/bluetoothGateLogic';
import {
  isBluetoothVehicleDetectionAvailable, getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected, subscribeBluetoothDeviceDisconnected,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';
import type { GpsPoint, TelematicsEvent } from '../types/trip.types';

const PHONE_USAGE_MIN_SPEED_MS = TRIP_AUTO_START_SPEED_KMH / 3.6;

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
  const { pairings } = useAppSelector(s => s.bluetoothPairing);

  const activeTripIdRef = useRef<string | null>(activeTrip?.id ?? null);
  useEffect(() => {
    activeTripIdRef.current = activeTrip?.id ?? null;
  }, [activeTrip?.id]);

  const pairingsRef = useRef(pairings);
  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);

  // Live BT-connected-device name — same purpose/pattern as
  // useTripAutoDetection.ts's own copy (kept separate rather than shared:
  // both are cheap local subscriptions to the same native emitter, and each
  // hook already independently mirrors whatever Redux state it needs via
  // refs, same as the rest of this app's hooks).
  const connectedBluetoothDeviceRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getConnectedBluetoothDeviceName().then((name) => {
      if (!cancelled) connectedBluetoothDeviceRef.current = name;
    });
    const unsubConnect = subscribeBluetoothDeviceConnected((name) => {
      connectedBluetoothDeviceRef.current = name;
    });
    const unsubDisconnect = subscribeBluetoothDeviceDisconnected(() => {
      connectedBluetoothDeviceRef.current = null;
    });
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

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

    // Gyroscope samples arrive every SENSOR_SAMPLE_RATE_MS (100ms) and a real
    // turn stays above the yaw-rate threshold for a second or more, so
    // classifying per-sample would log one turn as 10-20 separate events.
    // corneringActive gates on the rising edge only — a new event fires once
    // per continuous above-threshold episode, not once per sample.
    let corneringActive = false;
    const gyroSub = gyroscope.subscribe(({ x, y, z }) => {
      if (!lastGpsPoint) return;
      const gyroDegPerSec = vector3MagnitudeDegPerSec({ x, y, z });
      const lateralAccelMs2 = classifyCornering(gyroDegPerSec, lastGpsSpeedMs);
      const isCornering = lateralAccelMs2 != null;
      if (isCornering && !corneringActive) {
        emitEvent('harsh_corner', lastGpsPoint, lateralAccelMs2);
      }
      corneringActive = isCornering;
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
    let backgroundedAtPoint: GpsPoint | null = null;
    // Whether backgrounding actually counts as a potential violation —
    // decided at the moment the phone was left (not when it's picked back
    // up), since that's when the driver made the choice to touch/leave the
    // phone. Product requirement: only counts if they were actually driving
    // (not stopped/parked) and BT-connected to their paired vehicle where
    // that's enforceable — touching the phone before ever connecting, or
    // while stopped, shouldn't cost reward points.
    let backgroundedWasViolationEligible = false;
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        if (backgroundedAt != null) {
          const seconds = Math.round((Date.now() - backgroundedAt) / 1000);
          if (backgroundedWasViolationEligible) {
            addPhoneTextSeconds(seconds);
            // Location-tagged event (map markers) needs its own minimum
            // duration — a real distraction event, not every notification-
            // shade pull, which the raw seconds counter above still tallies.
            if (seconds >= MIN_PHONE_USAGE_EVENT_SECONDS && backgroundedAtPoint) {
              emitEvent('phone_usage', backgroundedAtPoint, seconds);
            }
          }
          backgroundedAt = null;
          backgroundedAtPoint = null;
          backgroundedWasViolationEligible = false;
        }
      } else if (backgroundedAt == null) {
        backgroundedAt = Date.now();
        backgroundedAtPoint = lastGpsPoint;
        backgroundedWasViolationEligible = lastGpsSpeedMs >= PHONE_USAGE_MIN_SPEED_MS
          && isBluetoothGateSatisfied(
            isBluetoothVehicleDetectionAvailable(), pairingsRef.current, connectedBluetoothDeviceRef.current,
          );
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
