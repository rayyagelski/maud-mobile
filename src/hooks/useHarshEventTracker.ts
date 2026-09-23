import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import {
  resetHarshEventCounters,
  incrementHarshEventCount,
  addPhoneTextSeconds,
} from '../services/harshEventCounters';
import { createCorneringDetector, createLongitudinalDetector } from '../utils/harshEventDetector';
import { generateId } from '../utils/helpers';
import { MIN_PHONE_USAGE_EVENT_SECONDS, TRIP_AUTO_START_SPEED_KMH } from '../utils/constants';
import { isBluetoothGateSatisfiedWhereEnforceable } from '../utils/bluetoothGateLogic';
import {
  isBluetoothVehicleDetectionAvailable, getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected, subscribeBluetoothDeviceDisconnected,
  isScreenInteractive, subscribeScreenInteractive,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';
import { logDiagnostic } from '../services/diagnosticsLog';
import type { GpsPoint, TelematicsEvent } from '../types/trip.types';

const PHONE_USAGE_MIN_SPEED_MS = TRIP_AUTO_START_SPEED_KMH / 3.6;

/**
 * Harsh-event detection (SRS 2.8/4.4), complementary to useTripAutoDetection:
 * braking, acceleration and cornering, all measured from the vehicle's GPS
 * track (see harshEventDetector.ts for why not the phone's motion sensors).
 * Runs only while a trip is being tracked, and mirrors GPS fixes via
 * gpsSpeedBus rather than opening a second location subscription.
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
  const btPollInFlightRef = useRef(false);
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

    let lastGpsSpeedMs = 0;
    let lastGpsPoint: GpsPoint | null = null;
    const longitudinal = createLongitudinalDetector();
    const cornering = createCorneringDetector();

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

    const unsubscribeGps = subscribeGpsFix((speedMs, timestamp, point) => {
      // Self-corrects connectedBluetoothDeviceRef against the native
      // module's authoritative state — same fix and same reasoning as
      // useTripAutoDetection.ts's copy of this ref (see its comment):
      // event-driven updates alone can get stuck on a misordered HFP/A2DP
      // disconnect broadcast, with no further event to correct it.
      if (!btPollInFlightRef.current) {
        btPollInFlightRef.current = true;
        getConnectedBluetoothDeviceName()
          .then((name) => { connectedBluetoothDeviceRef.current = name; })
          .finally(() => { btPollInFlightRef.current = false; });
      }

      // Braking/acceleration from GPS speed change — see
      // createLongitudinalDetector. Fixes without a GPS speed are skipped.
      const longitudinalEvent = longitudinal.update({
        timestampMs: timestamp,
        speedMs,
        speedEstimated: point.speedEstimated,
      });
      if (longitudinalEvent) emitEvent(longitudinalEvent.type, point, longitudinalEvent.valueMs2);

      // Cornering from GPS course over ground — see createCorneringDetector.
      const lateralAccelMs2 = cornering.update({
        timestampMs: timestamp,
        headingDeg: point.heading ?? null,
        speedMs,
      });
      if (lateralAccelMs2 != null) emitEvent('harsh_corner', point, lateralAccelMs2);

      lastGpsSpeedMs = speedMs;
      lastGpsPoint = point;

      // Speeding seconds are no longer counted here against a flat 120 km/h
      // placeholder (which is why the Driver Score showed "Speeding 0 min"
      // on drives with a dozen VGD speed-limit events) — useSpeedZoneAlerts
      // / useLiveSpeedZoneAlerts count them against the actual posted limit
      // of the span being driven (speedingSecondsForFix).
    });

    // Phone-usage proxy: time spent with MAUD Connect backgrounded during an
    // active trip (not "app active" — the app itself is likely foregrounded
    // for turn-by-turn use, so that would never fire). Approximates a driver
    // switching away to another app; won't catch in-app-foreground distraction.
    //
    // "Backgrounded" alone is not enough on Android: locking the screen
    // also reports the app as 'background', so a whole drive with the phone
    // in a holder, screen off, used to count as phone usage (real-drive:
    // "Phone usage 35 min" on a day with no phone handling at all, and
    // still ticking after the driver had left the car with the phone in a
    // pocket). Usage now means: app not in the foreground AND the screen is
    // on and unlocked — i.e. the driver is in some other app. The screen
    // signal comes from the native module (subscribeScreenInteractive);
    // where it doesn't exist (iOS) it reads as always-interactive and this
    // degrades to the previous AppState-only behaviour.
    let appActive = AppState.currentState === 'active';
    let screenInteractive = true;
    let usageStartedAt: number | null = null;
    let usageStartPoint: GpsPoint | null = null;
    // Whether the usage window actually counts as a potential violation —
    // decided at the moment it begins (not when it ends), since that's when
    // the driver made the choice to touch the phone. Product requirement:
    // only counts if they were actually driving (not stopped/parked) and
    // BT-connected to their paired vehicle where that's enforceable —
    // touching the phone before ever connecting, or while stopped,
    // shouldn't cost reward points.
    let usageWasViolationEligible = false;

    const evaluatePhoneUsage = () => {
      const inUse = !appActive && screenInteractive;
      if (inUse && usageStartedAt == null) {
        usageStartedAt = Date.now();
        usageStartPoint = lastGpsPoint;
        usageWasViolationEligible = lastGpsSpeedMs >= PHONE_USAGE_MIN_SPEED_MS
          && isBluetoothGateSatisfiedWhereEnforceable(
            isBluetoothVehicleDetectionAvailable(), pairingsRef.current, connectedBluetoothDeviceRef.current,
          );
      } else if (!inUse && usageStartedAt != null) {
        const seconds = Math.round((Date.now() - usageStartedAt) / 1000);
        if (usageWasViolationEligible) {
          addPhoneTextSeconds(seconds);
          // Location-tagged event (map markers) needs its own minimum
          // duration — a real distraction event, not every notification-
          // shade pull, which the raw seconds counter above still tallies.
          if (seconds >= MIN_PHONE_USAGE_EVENT_SECONDS && usageStartPoint) {
            emitEvent('phone_usage', usageStartPoint, seconds);
          }
          logDiagnostic('Phone usage recorded.', { seconds, speedKmh: Math.round(lastGpsSpeedMs * 3.6) });
        }
        usageStartedAt = null;
        usageStartPoint = null;
        usageWasViolationEligible = false;
      }
    };

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      appActive = state === 'active';
      evaluatePhoneUsage();
    });
    let screenSubCancelled = false;
    isScreenInteractive().then((interactive) => {
      if (screenSubCancelled) return;
      screenInteractive = interactive;
      evaluatePhoneUsage();
    });
    const unsubscribeScreen = subscribeScreenInteractive((interactive) => {
      screenInteractive = interactive;
      evaluatePhoneUsage();
    });

    return () => {
      unsubscribeGps();
      appStateSub.remove();
      screenSubCancelled = true;
      unsubscribeScreen();
      // Trip ending mid-usage: close the window now rather than losing it.
      appActive = true;
      evaluatePhoneUsage();
    };
  }, [isTracking, dispatch]);
}
