import { useEffect, useRef } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accelerometer, gyroscope, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import {
  resetHarshEventCounters,
  incrementHarshEventCount,
  addPhoneTextSeconds,
} from '../services/harshEventCounters';
import {
  createGravityFilter,
  classifyLongitudinalEvent,
  classifyCornering,
  yawRateDegPerSec,
  headingYawRateDegPerSec,
} from '../utils/harshEventDetector';
import { generateId } from '../utils/helpers';
import {
  SENSOR_SAMPLE_RATE_MS, MIN_PHONE_USAGE_EVENT_SECONDS, TRIP_AUTO_START_SPEED_KMH,
} from '../utils/constants';
import { isBluetoothGateSatisfiedWhereEnforceable } from '../utils/bluetoothGateLogic';
import {
  isBluetoothVehicleDetectionAvailable, getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected, subscribeBluetoothDeviceDisconnected,
  isScreenInteractive, subscribeScreenInteractive,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';
import { logDiagnostic } from '../services/diagnosticsLog';
import type { GpsPoint, TelematicsEvent } from '../types/trip.types';

const PHONE_USAGE_MIN_SPEED_MS = TRIP_AUTO_START_SPEED_KMH / 3.6;

// How long the yaw rate must stay below the cornering threshold before the
// current corner counts as finished and a new one can be reported. Long
// enough to bridge the flicker that was splitting one corner into several
// events, short enough that two genuinely separate turns (a chicane, or
// turning out of one street straight into another) still register apart.
const CORNERING_RELEASE_MS = 2000;

// A device missing the accelerometer/gyroscope entirely is a hardware fact
// that won't change between trips — showing this Alert every single time a
// trip starts would just be noise. Persisted so a driver sees it exactly
// once (ever, on this device), instead of either never being told at all
// (the original fail-soft-only behavior — real complaint: a client
// wondering why cornering events never show up, with the app never having
// said why) or being interrupted by it on every drive.
const ACCELEROMETER_UNAVAILABLE_NOTICE_KEY = 'accelerometerUnavailableNoticeShown';
const GYROSCOPE_UNAVAILABLE_NOTICE_KEY = 'gyroscopeUnavailableNoticeShown';

async function notifyMissingSensorOnce(storageKey: string, title: string, message: string): Promise<void> {
  try {
    const alreadyShown = await AsyncStorage.getItem(storageKey);
    if (alreadyShown) return;
    await AsyncStorage.setItem(storageKey, '1');
  } catch {
    // If the flag itself can't be persisted, still show the Alert this one
    // time rather than risk silently never telling the driver at all —
    // worst case it repeats on a later trip instead of going missing.
  }
  Alert.alert(title, message);
}

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

    const gravityFilter = createGravityFilter();
    let peakAccelMagnitude = 0;
    let lastGpsSpeedMs = 0;
    let lastGpsTimestamp: number | null = null;
    let lastGpsPoint: GpsPoint | null = null;
    // Flipped false by the gyroscope's own error handler below — read from
    // the GPS-fix callback to decide whether the GPS-heading fallback should
    // even run. Starts optimistic (true) since most devices do have a
    // working gyroscope; only a real "not available" error turns it off.
    let gyroscopeAvailable = true;
    let lastHeadingDeg: number | null = null;

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

    // react-native-sensors' observables throw (not reject a promise) when a
    // device genuinely lacks the sensor — real-world crash: "Sensor
    // gyroscope is not available" on a device with no gyroscope, surfacing
    // as an app-wide FATAL uncaught JS error about a minute into every trip,
    // since .subscribe(nextHandler) alone registers no error handler and
    // RxJS rethrows an unhandled observable error rather than swallowing it.
    // Same risk applies to the accelerometer on some devices, so both get
    // the same fail-soft treatment: log once and lose that one signal for
    // this trip, never crash the app over a missing sensor.
    const accelSub = accelerometer.subscribe({
      next: ({ x, y, z }) => {
        // Horizontal component only — braking/accelerating are horizontal
        // forces, while road shock through a rigid phone mount is mostly
        // vertical and was inflating this peak into false harsh events (see
        // classifyLongitudinalEvent).
        const sample = gravityFilter.update({ x, y, z });
        if (sample.horizontalMs2 > peakAccelMagnitude) peakAccelMagnitude = sample.horizontalMs2;
      },
      error: (err) => {
        logDiagnostic('Accelerometer unavailable — harsh brake/accel detection disabled for this trip.', {
          message: err?.message ?? String(err),
        });
        notifyMissingSensorOnce(
          ACCELEROMETER_UNAVAILABLE_NOTICE_KEY,
          'Harsh Braking/Acceleration Not Available',
          "This phone doesn't have a motion sensor MAUD Connect can use, so harsh braking and acceleration events won't be recorded on this device. Everything else — trip recording, route, speed, and cornering — still works normally.",
        );
      },
    });

    // Gyroscope samples arrive every SENSOR_SAMPLE_RATE_MS (100ms) and a real
    // turn stays above the yaw-rate threshold for a second or more, so
    // classifying per-sample would log one turn as 10-20 separate events.
    // corneringActive gates on the rising edge only — a new event fires once
    // per continuous above-threshold episode, not once per sample.
    //
    // The episode is only considered over once the signal has stayed below
    // threshold for CORNERING_RELEASE_MS, rather than the instant it dips.
    // Without that hold, a signal that flickers across the threshold splits
    // one physical corner into a burst of separate events — real-drive
    // report logged two "cornering" events inside the same second, which no
    // actual corner can produce.
    let corneringActive = false;
    let belowThresholdSince: number | null = null;
    const gyroSub = gyroscope.subscribe({
      next: ({ x, y, z }) => {
        if (!lastGpsPoint) return;
        // Real turning is rotation about the vertical axis. Using all three
        // gyroscope axes together counted pitch/roll from road bumps as
        // cornering — see yawRateDegPerSec.
        const yawDegPerSec = yawRateDegPerSec({ x, y, z }, gravityFilter.getGravity());
        const lateralAccelMs2 = classifyCornering(yawDegPerSec, lastGpsSpeedMs);
        const isCornering = lateralAccelMs2 != null;

        if (isCornering) {
          belowThresholdSince = null;
          if (!corneringActive) {
            corneringActive = true;
            emitEvent('harsh_corner', lastGpsPoint, lateralAccelMs2);
          }
          return;
        }

        if (!corneringActive) return;
        const now = Date.now();
        if (belowThresholdSince === null) belowThresholdSince = now;
        else if (now - belowThresholdSince >= CORNERING_RELEASE_MS) {
          corneringActive = false;
          belowThresholdSince = null;
        }
      },
      error: (err) => {
        gyroscopeAvailable = false;
        logDiagnostic('Gyroscope unavailable — falling back to GPS-heading-based cornering detection.', {
          message: err?.message ?? String(err),
        });
        notifyMissingSensorOnce(
          GYROSCOPE_UNAVAILABLE_NOTICE_KEY,
          'Cornering Detection Using GPS',
          "This phone doesn't have a gyroscope, so MAUD Connect estimates cornering from GPS movement instead — slightly less precise, but cornering events still get recorded. Everything else works normally.",
        );
      },
    });

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

      if (lastGpsTimestamp != null) {
        const dtSeconds = (timestamp - lastGpsTimestamp) / 1000;
        if (dtSeconds > 0) {
          const gpsSpeedDeltaMs2 = (speedMs - lastGpsSpeedMs) / dtSeconds;
          const event = classifyLongitudinalEvent(gpsSpeedDeltaMs2, peakAccelMagnitude);
          // Records the value the classification was actually made on, not
          // the GPS-derived average — those disagree, and storing the average
          // is why the UI could show a "hard braking" event at 0.20g next to
          // a 0.5g threshold.
          if (event) emitEvent(event.type, point, event.valueMs2);

          // GPS-heading fallback for cornering — only runs once the
          // gyroscope has actually errored (see its subscribe() above), not
          // as a second, redundant detector alongside a working gyroscope.
          // Coarser by nature (GPS fixes arrive seconds apart, not every
          // 100ms — see headingYawRateDegPerSec's own doc comment), but it's
          // the only signal available at all without a gyroscope.
          if (!gyroscopeAvailable && lastHeadingDeg != null && point.heading != null) {
            const headingRateDegPerSec = headingYawRateDegPerSec(lastHeadingDeg, point.heading, dtSeconds);
            const lateralAccelMs2 = classifyCornering(headingRateDegPerSec, speedMs);
            const isCornering = lateralAccelMs2 != null;
            if (isCornering && !corneringActive) {
              emitEvent('harsh_corner', point, lateralAccelMs2);
            }
            corneringActive = isCornering;
          }
        }
      }
      if (point.heading != null) lastHeadingDeg = point.heading;
      peakAccelMagnitude = 0;
      lastGpsSpeedMs = speedMs;
      lastGpsTimestamp = timestamp;
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
      accelSub.unsubscribe();
      gyroSub.unsubscribe();
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
