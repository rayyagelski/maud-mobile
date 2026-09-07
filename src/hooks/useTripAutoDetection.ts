import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { startTrip, endTrip, appendGpsPoint, clearPendingStart, setTracking } from '../store/slices/tripSlice';
import { navigationRef } from '../navigation/navigationRef';
import { publishGpsFix } from '../services/gpsSpeedBus';
import { TRIP_AUTO_START_SPEED_KMH, HEADLESS_LOCATION_QUEUE_KEY } from '../utils/constants';
import { haversineMeters } from '../utils/complianceAlertLogic';
import { isBluetoothGateSatisfied } from '../utils/bluetoothGateLogic';
import {
  isBluetoothVehicleDetectionAvailable, getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected, subscribeBluetoothDeviceDisconnected,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';
import { logDiagnostic } from '../services/diagnosticsLog';

// Vehicle is "moving" above this speed; below it counts as stopped. Shared
// with a manual Route Planner start (see pendingStart below) and with
// harshEventDetector's cornering gate — one number for "is this actually
// driving", not a separate threshold per feature.
const SPEED_START_MS = TRIP_AUTO_START_SPEED_KMH / 3.6;
const SPEED_STOP_MS  = 0.5;  // ~1.8 km/h — stationary
// A single fix at/above SPEED_START_MS is not enough to auto-start a trip —
// the first fixes after BackgroundGeolocation.start() are frequently a
// low-accuracy or cached location, and their reported speed can jitter above
// this (already low, ~1mph) threshold while the phone is sitting still, e.g.
// on the dashboard right after cold-starting the app. Require the qualifying
// speed to hold for this long, mirroring STILL_MS's symmetric role on the
// auto-end side, before actually starting the trip.
const MOVING_CONFIRM_MS = 5 * 1000; // 5 sec
// Fixes worse than this (meters) are ignored for the auto-start decision —
// same "first fix after starting is unreliable" reasoning as above. Doesn't
// gate auto-end/recording once already tracking, only the initial decision.
const MAX_START_ACCURACY_M = 20;
// A brisk walk (~3 mph) easily clears SPEED_START_MS (~1 mph) on its own —
// real-drive feedback: walking away from a parked car with the phone in hand
// repeatedly auto-started a trip after only a few yards. BackgroundGeolocation
// ships its own on-device activity classifier (Location.activity) that speed
// alone can't provide; gate auto-start on it when confident, rather than
// raising SPEED_START_MS itself (which is also relied on for the symmetric
// stop-detection side and for a car crawling out of a driveway).
const NON_VEHICLE_ACTIVITIES = new Set(['still', 'walking', 'on_foot', 'running', 'on_bicycle']);
// Below this confidence the classifier itself isn't sure — fall back to the
// existing speed-only behavior rather than risk blocking a real drive start
// on a low-confidence "walking" guess (e.g. stop-and-go traffic confusing it).
const MIN_ACTIVITY_CONFIDENCE = 75;
// Vehicle must remain below SPEED_STOP_MS for this long before ending the
// trip — avoids false-ends during traffic lights / slow-moving traffic.
// 2 min per explicit user-testing feedback (was 45s, undocumented to users
// and shorter than expected).
const STILL_MS = 2 * 60 * 1000;
// A rehydrated in-flight trip whose last GPS activity is older than this is
// treated as stale (app killed mid-trip, reopened much later) and closed out
// immediately instead of resumed.
const STALE_TRIP_GAP_MS = 30 * 60 * 1000; // 30 min
// A manually-armed start (Route Planner "Start" tapped, car never moved) is
// dropped after this long rather than honored on some unrelated later motion
// — e.g. the app was killed before pulling away and reopened hours after.
const STALE_PENDING_START_MS = 30 * 60 * 1000; // 30 min
// A manually-armed start carries the Route Planner's origin coordinate
// (plannedRoute.coordinates[0] — the address the trip was actually planned
// from). The live GPS fix that finally crosses SPEED_START_MS can already
// be meaningfully past that point (walk to the car, idle before pulling
// away, GPS drift near buildings/parking structures), which showed up as
// the recorded trip "not starting at the actual address". Snap the start
// point back to the planned origin when the two are still close enough to
// plausibly be the same real-world start — beyond this, trust the live fix
// instead (the driver likely armed the start somewhere other than where
// they actually began driving).
const PLANNED_ORIGIN_MAX_DRIFT_M = 300;
// How often the stale-trip watchdog re-checks while a trip is tracking. Must
// be much more frequent than STALE_TRIP_GAP_MS itself — this only needs to
// run often enough to notice a trip has gone stale without the app having
// been killed/restarted (e.g. GPS silently stopped delivering fixes because
// permission was revoked mid-drive, or the OS background-killed just the
// location updates while the JS process stayed alive).
const STALE_TRIP_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
// A qualifying auto-start point captured while waiting on the BT gate (see
// pendingBluetoothStartRef below) is dropped after this long without BT
// actually connecting — real-world BT reconnection to a car head unit can
// legitimately take a couple of minutes, but shouldn't be held onto
// indefinitely if it's having an off day. Once dropped, the next qualifying
// streak starts fresh (still gated on BT — this is a staleness bound, not a
// fallback to speed-only).
const PENDING_BLUETOOTH_START_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

export function useTripAutoDetection() {
  const dispatch    = useAppDispatch();
  const { claims }  = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const { activeTrip, isTracking, pendingStart } = useAppSelector(s => s.trips);
  const { pairings } = useAppSelector(s => s.bluetoothPairing);

  // Mutable refs keep the watchPosition callback always reading current Redux state
  // without restarting the GPS subscription on every state change.
  const isTrackingRef  = useRef(isTracking);
  const activeTripRef  = useRef(activeTrip);
  const pendingStartRef = useRef(pendingStart);
  const pairingsRef     = useRef(pairings);
  const endingRef      = useRef(false);   // guards against double-dispatch of endTrip
  const stillSinceRef  = useRef<number | null>(null);
  const movingSinceRef = useRef<number | null>(null);
  // Live BT-connected-device name, independent of useBluetoothVehicleDetection
  // (that hook only cares about the connect *event*, for vehicle
  // auto-selection) — this needs to reflect current connection state at any
  // moment, including "already connected before this hook mounted".
  const connectedBluetoothDeviceRef = useRef<string | null>(null);
  // A qualifying auto-start point (speed+activity+accuracy+confirm-timer all
  // satisfied) captured while the BT gate wasn't — real-world BT
  // reconnection to a car head unit can lag well behind these other checks
  // (up to a couple of minutes), and dispatching startTrip using whatever
  // fix happens to be current once BT *finally* connects meant the recorded
  // trip started from wherever the car had already driven to by then, not
  // the true departure point — wrecking duration/distance/cost/CO2 for the
  // whole trip. Held here and dispatched the moment BT catches up instead.
  const pendingBluetoothStartRef = useRef<{ capturedAt: number; dispatchStart: () => void } | null>(null);

  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);
  useEffect(() => { pendingStartRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);

  // Tracks live BT connection state for the recording-gate check below —
  // separate effect so it doesn't need to be part of the main location-
  // subscription effect's dependency array. Subscribes once for the app's
  // lifetime; getConnectedBluetoothDeviceName() covers "already connected
  // before this mounted" (e.g. cold-started while already in the car).
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
      // BT connection to the paired vehicle is a hard requirement for
      // recording (see bluetoothGateLogic.ts) — losing it means the gate is
      // no longer satisfied, so the trip ends now rather than waiting on the
      // STILL_MS watchdog. Previously this only nudged the stillness timer
      // (to tolerate a driver's phone call stealing the audio route without
      // actually having stopped), but that left recording running—and able
      // to re-announce out loud—well past the point BT was gone. Explicit
      // product decision after a real incident: BT out of reach means
      // recording stops, full stop.
      if (isTrackingRef.current) {
        endTripDueToStillness();
      }
    });
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  // Shared by the per-fix STILL_MS check inside handleLocation and the
  // wall-clock stillness watchdog below — both just need to know "stillness
  // has been sustained long enough, end the trip now."
  function endTripDueToStillness() {
    if (!activeTripRef.current || endingRef.current) return;
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

  // Stale-trip watchdog: redux-persist now persists `trips` (see
  // store/index.ts), so an in-flight activeTrip can be rehydrated after the
  // app was killed mid-trip. If its last known activity is too old to safely
  // resume (app was closed for a while, or GPS silently stopped delivering
  // fixes mid-drive without the app itself being restarted), close it out
  // now with whatever data exists rather than leaving the user permanently
  // stuck on "Trip in progress". Runs on mount (covers the killed-and-
  // reopened case) and on a recurring interval thereafter (covers GPS
  // silently dying while the app stays open) — a one-shot mount-only check
  // previously left a trip stuck forever if the app was never restarted
  // after GPS stopped flowing.
  useEffect(() => {
    const checkStaleTrip = () => {
      if (!isTrackingRef.current) return;
      const trip = activeTripRef.current;
      if (!trip) {
        // isTracking true with no activeTrip is an invalid, unrecoverable
        // state (e.g. a torn persisted-state write) — the End Trip button
        // requires both to be set, so without this the user has no way to
        // clear it themselves. Reset defensively.
        dispatch(setTracking(false));
        return;
      }
      const lastPoint = trip.route[trip.route.length - 1];
      const lastActivityAt = lastPoint?.timestamp ?? trip.startTime;
      if (Date.now() - lastActivityAt > STALE_TRIP_GAP_MS) {
        dispatch(endTrip(trip.id));
      }
    };

    checkStaleTrip();
    const interval = setInterval(checkStaleTrip, STALE_TRIP_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dispatch]);

  // Stillness watchdog: mirrors the STILL_MS check inside handleLocation
  // below, but runs independent of a new GPS fix arriving — see
  // heartbeatInterval in the .ready() config below.
  //
  // A plain JS setInterval used to drive this, but real-drive feedback
  // ("recording in process" banner stuck for 20 minutes after BT
  // disconnected in a covered garage, only clearing once the screen was
  // touched) showed that doesn't actually fire reliably once Android has
  // backgrounded/throttled the JS thread — nothing was left to wake it up
  // again, since BT had already disconnected and no more GPS fixes were
  // arriving either. BackgroundGeolocation's onHeartbeat is backed by the
  // plugin's own native scheduler (same foreground-service machinery that
  // already keeps onLocation delivering in the background), so it keeps
  // firing in exactly the scenario the JS timer couldn't — see
  // heartbeatInterval in the .ready() config below.
  useEffect(() => {
    const checkStillness = () => {
      if (!isTrackingRef.current || stillSinceRef.current === null) return;
      if (Date.now() - stillSinceRef.current < STILL_MS) return;
      endTripDueToStillness();
    };

    const subscription = BackgroundGeolocation.onHeartbeat(checkStillness);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (!claims) return;

    // Resolve vehicleId: prefer JWT claim, then selected vehicle, then first in list
    const vehicleId = claims.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId) return;

    // Prefer the explicitly-selected driver profile; fall back to the account
    // owner for the common single-driver case (no profiles created yet).
    const driverId = selectedDriver?.id ?? String(claims.userId);

    // react-native-background-geolocation replaces the old
    // @react-native-community/geolocation watchPosition here specifically
    // because plain watchPosition stops delivering updates the moment the
    // app is backgrounded/screen locks — which silently discarded almost an
    // entire real drive's worth of GPS data (see Phase 3 notes). This SDK's
    // own motion-detection handles the battery-conscious "reduce polling
    // while stationary" behaviour natively; our own speed-threshold state
    // machine below is unchanged and just now receives real continuous fixes.
    let removeLocationListener: (() => void) | undefined;
    let cancelled = false;

    // Dispatches immediately if the BT gate is already satisfied; otherwise
    // holds this point/dispatcher until it is (see pendingBluetoothStartRef
    // above), rather than starting the trip from wherever the car has driven
    // to by the time BT finally connects.
    function startOnceBluetoothReady(dispatchStart: () => void) {
      const moduleAvailable = isBluetoothVehicleDetectionAvailable();
      const connectedDevice = connectedBluetoothDeviceRef.current;
      if (isBluetoothGateSatisfied(moduleAvailable, pairingsRef.current, connectedDevice)) {
        pendingBluetoothStartRef.current = null;
        dispatchStart();
        return;
      }
      if (!pendingBluetoothStartRef.current) {
        // Diagnostic only, not user-facing — logged once per new hold (not
        // per GPS fix) specifically so a "speed qualified but never started"
        // report can be traced to the exact blocking condition (module not
        // linked, no pairing saved at all, or a real connected-device-name
        // mismatch against the saved pairing) instead of guessing again.
        logDiagnostic(
          'Speed qualified but BT gate not satisfied — holding start.',
          { moduleAvailable, pairingsCount: pairingsRef.current.length, connectedDevice },
        );
        pendingBluetoothStartRef.current = { capturedAt: Date.now(), dispatchStart };
      }
    }

    const handleLocation = (location: Location) => {
      const { coords } = location;
      // GPS speed is in m/s; missing/negative means unavailable
      const speedMs = coords.speed != null && coords.speed >= 0 ? coords.speed : 0;
      const timestamp = typeof location.timestamp === 'string'
        ? new Date(location.timestamp).getTime()
        : location.timestamp;

      const gpsPoint = {
        latitude:  coords.latitude,
        longitude: coords.longitude,
        altitude:  coords.altitude  ?? undefined,
        speed:     speedMs,
        heading:   coords.heading   ?? undefined,
        accuracy:  coords.accuracy  ?? undefined,
        timestamp,
      };

        // A qualifying point may already be captured and just waiting on BT
        // to catch up — checked on every fix regardless of current speed,
        // since BT can finish connecting while the vehicle is idling before
        // pulling away, not only while already moving.
        if (!isTrackingRef.current && pendingBluetoothStartRef.current) {
          const pendingBt = pendingBluetoothStartRef.current;
          if (Date.now() - pendingBt.capturedAt > PENDING_BLUETOOTH_START_TIMEOUT_MS) {
            logDiagnostic('BT wait timed out — dropped the held start point.', {
              waitedMs: Date.now() - pendingBt.capturedAt,
            });
            pendingBluetoothStartRef.current = null;
          } else if (isBluetoothGateSatisfied(
            isBluetoothVehicleDetectionAvailable(), pairingsRef.current, connectedBluetoothDeviceRef.current,
          )) {
            logDiagnostic('BT caught up — resuming held auto-start.', {
              waitedMs: Date.now() - pendingBt.capturedAt,
            });
            pendingBluetoothStartRef.current = null;
            pendingBt.dispatchStart();
            return;
          }
        }

        // ── Auto-start ─────────────────────────────────────────────────────
        // Deliberately NOT also gated on `!pendingBluetoothStartRef.current`
        // here — that ref only tracks an ambient/passive auto-detect attempt
        // waiting on BT (see above), a completely different flow from a
        // manually-armed Route Planner start below. Nesting the pending-start
        // branch inside that guard used to mean a stray ambient BT-wait left
        // over from earlier in the same drive (e.g. the car started moving
        // once before BT finished connecting) silently blocked the explicit
        // "Start Trip" tap from ever firing too — real-world symptom: driver
        // taps Start Trip, drives the actual route, and the screen sits on
        // "Waiting for movement…" indefinitely despite genuinely driving.
        if (!isTrackingRef.current && !endingRef.current) {
          if (speedMs >= SPEED_START_MS) {
            // A pending start means the user already tapped "Start Trip" in
            // Route Planner — real intent, not ambient motion the app is
            // guessing about. MOVING_CONFIRM_MS's whole purpose is to filter
            // out stationary GPS jitter *guessing* a drive has begun; that
            // doesn't apply here, and waiting the full hold anyway before
            // recording starts was losing the first 50-100 yards of every
            // manually-started trip (real-drive feedback) for no benefit.
            const pending = pendingStartRef.current;
            if (pending && Date.now() - pending.armedAt > STALE_PENDING_START_MS) {
              dispatch(clearPendingStart());
            } else if (pending) {
              stillSinceRef.current = null;
              movingSinceRef.current = null;
              // Any stray ambient BT-wait is irrelevant now — explicit intent
              // supersedes it, and leaving it set would incorrectly gate the
              // *next* auto-detect fix after this trip ends.
              pendingBluetoothStartRef.current = null;
              const plannedOrigin = pending.plannedRoute?.coordinates[0];
              const initialPoint = plannedOrigin
                && haversineMeters(plannedOrigin, gpsPoint) <= PLANNED_ORIGIN_MAX_DRIFT_M
                ? { ...gpsPoint, latitude: plannedOrigin.latitude, longitude: plannedOrigin.longitude }
                : gpsPoint;
              // Deliberately bypasses the BT gate (unlike the pure
              // auto-detect path below) — the BT requirement exists to stop
              // ambient/passive detection from silently recording (and once
              // announcing "Recording in process" in public) with no real
              // signal the driver is actually in a car. Tapping "Start Trip"
              // in Route Planner is explicit, unambiguous intent; holding it
              // hostage to a BT connection the driver may not even have set
              // up left navigation, speed-zone alerts, and GPS/VGD
              // transmission silently dead in the water (stuck on "Waiting
              // for movement…" forever) for any driver without one — a real
              // regression discovered after the BT-gate fix shipped.
              dispatch(startTrip({ ...pending, initialPoint }));
              return;
            }

            // Everything below is pure ambient/passive auto-detection —
            // skipped while an earlier ambient attempt is still waiting on
            // BT (pendingBluetoothStartRef), unlike the manual path above.
            if (pendingBluetoothStartRef.current) return;

            // Reject a confident non-vehicle activity outright — walking,
            // running, or cycling at qualifying speed shouldn't even start
            // the confirm clock. Only gates pure auto-detection: a pending
            // Route Planner start already represents explicit user intent
            // and returned above before reaching here.
            const activity = location.activity;
            if (activity && activity.confidence >= MIN_ACTIVITY_CONFIDENCE
              && NON_VEHICLE_ACTIVITIES.has(activity.type)) {
              // Diagnostic only — traces "speed qualified but auto-start
              // never fired" reports to a misclassified activity (e.g. smooth
              // highway driving occasionally read as "still"/"walking" by
              // BackgroundGeolocation's on-device classifier) rather than BT.
              logDiagnostic(
                'Speed qualified but activity rejected as non-vehicle.',
                { type: activity.type, confidence: activity.confidence, speedKmh: speedMs * 3.6 },
              );
              movingSinceRef.current = null;
              return;
            }

            // Start the confirm clock on the first qualifying-speed fix
            // regardless of its accuracy — the first fixes after a cold GPS
            // lock are frequently low-accuracy, and gating the clock itself
            // on accuracy meant it often couldn't start ticking until well
            // after the car had already pulled away (accuracy only improves
            // a few seconds into a drive). Accuracy is instead checked below,
            // as a gate on the fix that actually finalizes the start.
            if (movingSinceRef.current === null) {
              movingSinceRef.current = Date.now();
            }

            const accurateEnough = coords.accuracy == null || coords.accuracy <= MAX_START_ACCURACY_M;

            if (!accurateEnough || Date.now() - movingSinceRef.current < MOVING_CONFIRM_MS) {
              // Speed has qualified but hasn't held long enough yet, or this
              // particular fix isn't accurate enough to trust as the trip's
              // starting point — wait for more fixes rather than starting
              // off an unreliable reading.
              if (!accurateEnough && Date.now() - movingSinceRef.current >= MOVING_CONFIRM_MS) {
                // Diagnostic only — the confirm window has already elapsed,
                // so this fix is genuinely stuck on GPS accuracy alone, not
                // just still within the normal brief hold.
                logDiagnostic(
                  'Speed qualified and confirm window elapsed, but GPS accuracy too poor to finalize start.',
                  { accuracyMeters: coords.accuracy, maxAllowed: MAX_START_ACCURACY_M },
                );
              }
              return;
            }

            stillSinceRef.current = null;
            movingSinceRef.current = null;

            startOnceBluetoothReady(() => dispatch(startTrip({
              vehicleId,
              driverId,
              // Default to private — auto-detection has no way to know intent,
              // and defaulting to business risked mis-classifying and
              // mis-costing personal trips. Driver can change per-trip; a
              // per-driver default is a separate, larger follow-up (needs a
              // new backend Driver field, not just a client-side default).
              tripType: 'private',
              transportMode: 'car',
              initialPoint: gpsPoint,
            })));
            return;
          }

          // Speed dropped back below threshold — reset the confirmation
          // window so the next qualifying streak has to hold for the full
          // duration again, same as a single noisy fix never counting on
          // its own.
          movingSinceRef.current = null;
          return;
        }

        // ── Record GPS + auto-end ───────────────────────────────────────────
        if (isTrackingRef.current && activeTripRef.current) {
          dispatch(appendGpsPoint(gpsPoint));
          publishGpsFix(speedMs, timestamp, gpsPoint);

          if (speedMs < SPEED_STOP_MS) {
            if (stillSinceRef.current === null) {
              stillSinceRef.current = Date.now();
            } else if (Date.now() - stillSinceRef.current >= STILL_MS) {
              endTripDueToStillness();
            }
          } else {
            // Vehicle is moving again — reset the stillness timer
            stillSinceRef.current = null;
          }
        }
      };

    const subscription = BackgroundGeolocation.onLocation(
      handleLocation,
      (err) => console.warn('[TripAutoDetection]', err),
    );
    removeLocationListener = () => subscription.remove();

    // Replay whatever index.js's headless task queued while this hook wasn't
    // mounted with a live JS listener (see enableHeadless above) — in
    // chronological order, through the exact same handleLocation logic a
    // live fix would go through, so trip start/stop and appended points
    // reconcile themselves instead of requiring the user to force-restart
    // the app to "unstick" tracking.
    AsyncStorage.getItem(HEADLESS_LOCATION_QUEUE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      AsyncStorage.removeItem(HEADLESS_LOCATION_QUEUE_KEY);
      try {
        const queued = JSON.parse(raw) as Location[];
        queued.forEach(handleLocation);
      } catch {
        // Malformed queue — nothing recoverable, drop it rather than loop
        // forever failing to parse it.
      }
    });

    BackgroundGeolocation.ready({
      reset: true,
      geolocation: {
        desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
        distanceFilter: 5,        // update every 5 metres, matches prior config
        locationUpdateInterval: 3000,
        fastestLocationUpdateInterval: 1000,
        // Deliberately not using stopOnStationary/disableStopDetection — the
        // SDK's own motion-detection already reduces polling while parked;
        // our own SPEED_STOP_MS/STILL_MS state machine above still needs
        // occasional fixes to notice the vehicle has stopped/resumed.
      },
      app: {
        stopOnTerminate: false, // keep tracking if the app is swiped away mid-trip
        startOnBoot: true,      // resume tracking after a device reboot
        // Android-only: lets the plugin invoke index.js's registered
        // headless task directly when the JS engine has been torn down
        // while backgrounded, instead of silently dropping events until a
        // full app restart brings a JS listener back — see index.js and the
        // queue-drain below for the other half of this.
        enableHeadless: true,
        // Drives the onHeartbeat-based stillness watchdog above — native
        // scheduler, not a JS timer, so it keeps firing even once Android
        // has throttled the JS thread in the background. 60s is Android's
        // own enforced minimum for this value; the watchdog's own STILL_MS
        // (2 min) threshold is unaffected, this only controls how often
        // it's checked.
        heartbeatInterval: 60,
        notification: {
          title: 'MAUD Connect',
          text: 'Tracking your trip',
        },
      },
    }).then((state) => {
      if (cancelled) return;
      // Diagnostic only — confirms this whole hook actually mounted and
      // reached BackgroundGeolocation setup at all. This effect only runs
      // once locationGranted && locationOnboardingComplete are both true
      // (see AppNavigator.tsx's TripDetectionRunner gating) — if a "drove
      // and nothing happened" report shows none of this file's other
      // diagnostic logs either, checking for the *absence* of this line is
      // how to tell "auto-detection never started at all" apart from
      // "started but a specific gate blocked it."
      logDiagnostic('Mounted, BackgroundGeolocation ready.', { alreadyEnabled: state.enabled });
      if (!state.enabled) BackgroundGeolocation.start();
    });

    return () => {
      cancelled = true;
      removeLocationListener?.();
    };
  // Re-subscribe only when auth identity, vehicle, or driver context changes.
  // isTracking / activeTrip are intentionally read via refs above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, selectedVehicle, vehicles, selectedDriver, dispatch]);
}
