import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
import type { GpsPoint } from '../types/trip.types';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { startTrip, endTrip, appendGpsPoint, clearPendingStart, setTracking } from '../store/slices/tripSlice';
import { navigationRef } from '../navigation/navigationRef';
import { publishGpsFix } from '../services/gpsSpeedBus';
import { TRIP_AUTO_START_SPEED_KMH, HEADLESS_LOCATION_QUEUE_KEY, REPLAY_LOCATION_QUEUE_MAX } from '../utils/constants';
import { haversineMeters } from '../utils/complianceAlertLogic';
import { isBluetoothGateSatisfied } from '../utils/bluetoothGateLogic';
import { evaluateActivityGate } from '../utils/activityGateLogic';
import { evaluateStillness, SPEED_STOP_MS, STILL_MS } from '../utils/stillnessLogic';
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
// A single fix at/above SPEED_START_MS is not enough to auto-start a trip —
// the first fixes after BackgroundGeolocation.start() are frequently a
// low-accuracy or cached location, and their reported speed can jitter above
// this (already low, ~1mph) threshold while the phone is sitting still, e.g.
// on the dashboard right after cold-starting the app. Require the qualifying
// speed to hold for this long, mirroring STILL_MS's symmetric role on the
// auto-end side, before actually starting the trip.
//
// 2s, down from 5s — product requirement is recording within 2 seconds of
// driving. The jitter this guards against is further covered by the
// displacement floor and the parking-radius check below, and the recorded
// start POINT is the streak's earliest fix regardless of how long the
// confirm takes — this only decides how soon recording (and its
// announcement) begins.
const MOVING_CONFIRM_MS = 2 * 1000; // 2 sec
// Fixes worse than this (meters) are ignored for the auto-start decision —
// same "first fix after starting is unreliable" reasoning as above. Doesn't
// gate auto-end/recording once already tracking, only the initial decision.
const MAX_START_ACCURACY_M = 20;
// Real-world false-start: parked, ended the trip manually, walked ~10 feet
// indoors — BT was still connected (cars/phones commonly stay linked for a
// while after engine-off) and, a few seconds later, auto-start fired anyway
// with the driver standing still. The instantaneous GPS speed field can read
// spuriously nonzero from noise alone while genuinely stationary (worse
// indoors/near buildings — multipath), and BackgroundGeolocation's on-device
// activity classifier has known lag transitioning off "automotive" for a
// short while after actually exiting the vehicle, so neither the speed nor
// the activity gate alone reliably catches this. Real net displacement
// between positions is a much harder signal to fake than one noisy
// instantaneous speed reading — jitter while stationary wanders back and
// forth rather than accumulating consistent one-directional distance. Kept
// deliberately small: even the slowest realistic driveway crawl covers this
// well within MOVING_CONFIRM_MS, so it only ever blocks a start with
// essentially zero real movement behind it, never a genuine departure —
// this is exactly why it's a displacement floor and not a speed-threshold
// increase, which would also raise SPEED_START_MS's own deliberately-low bar
// for a slow pull-out.
const MIN_REAL_MOVEMENT_METERS = 5;
// The 5m displacement floor above turned out to be beatable by GPS drift
// alone. Real-world: trip ended manually while parked at home, and within
// seconds a new "trip" auto-started at "2 mph" and recorded 71 ft (~22 m) of
// "distance" before being stopped by hand — start and end address identical.
// Stationary GPS next to a building wanders well past 5 m; it does not,
// however, wander 75 m from where the car actually is. So on top of the
// streak-displacement check, a start after a previous trip has ended also
// requires the current position to be this far from where that trip ended.
// Anchored to a known parked location rather than a drifting streak start,
// which is what makes it robust where the floor above wasn't. A genuine
// departure crosses this within seconds of actually driving off, and the
// recorded start point still comes from the streak's earliest accurate fix
// (near the parking spot), so the trip itself isn't shortened — only the
// decision to start is held until there's real evidence of leaving.
const MIN_DISTANCE_FROM_LAST_TRIP_END_M = 75;
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
// The earliest position seen in ANY qualifying streak since the last trip
// end is remembered for this long as the departure point, surviving the
// streak resets a stop-and-go parking-lot exit causes. Real-drive log: a
// streak began at 5.9 km/h inside the parking radius, the car paused for a
// stop (speed dropped below SPEED_START_MS — silent streak reset), and the
// trip then started from the NEXT streak's first fix, already at 14 km/h
// and a minute down the road — the true departure point was seen and then
// thrown away. A candidate older than this is stale (driver sat parked,
// the car jittered a fix, then left much later) and gets replaced.
const DEPARTURE_CANDIDATE_TTL_MS = 3 * 60 * 1000; // 3 min
// How long after a candidate is captured an accurate fix may still replace
// an inaccurate one (a few fixes' worth — the car has barely moved).
const DEPARTURE_CANDIDATE_UPGRADE_WINDOW_MS = 10 * 1000;

export function useTripAutoDetection() {
  const dispatch    = useAppDispatch();
  const { claims }  = useAppSelector(s => s.auth);
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const { activeTrip, isTracking, pendingStart } = useAppSelector(s => s.trips);
  const { pairings } = useAppSelector(s => s.bluetoothPairing);
  const { defaultTripType } = useAppSelector(s => s.settings);
  // Read via ref inside the location callback — same reason as the others.
  const defaultTripTypeRef = useRef(defaultTripType);
  useEffect(() => { defaultTripTypeRef.current = defaultTripType; }, [defaultTripType]);

  // Mutable refs keep the watchPosition callback always reading current Redux state
  // without restarting the GPS subscription on every state change.
  const isTrackingRef  = useRef(isTracking);
  const activeTripRef  = useRef(activeTrip);
  const pendingStartRef = useRef(pendingStart);
  const pairingsRef     = useRef(pairings);
  const endingRef      = useRef(false);   // guards against double-dispatch of endTrip
  const stillSinceRef  = useRef<number | null>(null);
  // When the last location fix arrived, and how fast it said we were going.
  // Location updates going quiet is itself a stillness signal — see
  // stillnessLogic.ts — but only when the last thing we saw was already slow.
  const lastFixAtRef = useRef<number | null>(null);
  const lastFixSpeedMsRef = useRef(0);
  const movingSinceRef = useRef<number | null>(null);
  // Position at the moment movingSinceRef's streak began — compared against
  // the current fix at commit time to enforce MIN_REAL_MOVEMENT_METERS (see
  // its own doc comment). Reset in lockstep with movingSinceRef everywhere.
  const movingSinceStartPointRef = useRef<GpsPoint | null>(null);
  // Where the most recent trip ended — see MIN_DISTANCE_FROM_LAST_TRIP_END_M.
  // Captured below from the isTracking true->false transition rather than
  // inside endTripDueToStillness, so a manual Stop (dispatched from the UI,
  // never through this hook) is covered too — that manual path is exactly
  // the one the false start was reported on.
  const lastTripEndPointRef = useRef<GpsPoint | null>(null);
  // Own copy of the previous render's activeTrip. activeTripRef is updated
  // by its own effect and may already hold the post-end value (null) by the
  // time the transition effect below runs, so it can't be read for the
  // outgoing trip's last point.
  const previousActiveTripRef = useRef(activeTrip);
  // The first fix in the current qualifying-speed streak that was ALSO
  // already accurate enough — captured separately from whichever fix
  // happens to be current when MOVING_CONFIRM_MS finally elapses. Real-world
  // feedback: using the elapsed-time fix as the trip's start point recorded
  // the driver already several seconds/meters down the road (having held
  // qualifying speed the whole time), which a reverse-geocode then resolves
  // to a real but wrong neighboring address instead of the actual departure
  // point. This still requires at least one accurate-enough fix (same
  // guarantee MAX_START_ACCURACY_M was added for) — it just doesn't have to
  // be the LAST one in the streak.
  const earliestAccurateStartPointRef = useRef<GpsPoint | null>(null);
  // Live BT-connected-device name, independent of useBluetoothVehicleDetection
  // (that hook only cares about the connect *event*, for vehicle
  // auto-selection) — this needs to reflect current connection state at any
  // moment, including "already connected before this hook mounted".
  const connectedBluetoothDeviceRef = useRef<string | null>(null);
  // Guards the self-correcting poll below against overlapping calls if GPS
  // fixes arrive faster than a poll can resolve.
  const btPollInFlightRef = useRef(false);
  // A qualifying auto-start point (speed+activity+accuracy+confirm-timer all
  // satisfied) captured while the BT gate wasn't — real-world BT
  // reconnection to a car head unit can lag well behind these other checks
  // (up to a couple of minutes), and dispatching startTrip using whatever
  // fix happens to be current once BT *finally* connects meant the recorded
  // trip started from wherever the car had already driven to by then, not
  // the true departure point — wrecking duration/distance/cost/CO2 for the
  // whole trip. Held here and dispatched the moment BT catches up instead.
  const pendingBluetoothStartRef = useRef<{ capturedAt: number; dispatchStart: () => void } | null>(null);
  // Identity of the last fix handleLocation processed, for dropping repeat
  // deliveries of the same fix. Real-drive VGD data showed every GPS point
  // stored 2-3x with identical timestamp/coordinates/cumulative distance
  // (and the same diagnostic line logged 2-3x per fix) — each duplicate ran
  // the full ambient path again: another native BT poll, another Redux
  // dispatch, another VGD point.
  const lastFixIdentityRef = useRef<string | null>(null);
  // Previous fix's position, for estimating speed on a fix that has no GPS
  // speed — see handleLocation.
  const lastPositionRef = useRef<GpsPoint | null>(null);
  // See DEPARTURE_CANDIDATE_TTL_MS.
  const departureCandidateRef = useRef<{ point: GpsPoint; at: number } | null>(null);
  const duplicateFixCountRef = useRef(0);
  // Whether this hook has forced the SDK into its "moving" state on the
  // strength of the car's Bluetooth connection — see forceGpsOnForCar below.
  const forcedMovingRef = useRef(false);

  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);
  useEffect(() => { activeTripRef.current = activeTrip; }, [activeTrip]);
  useEffect(() => {
    const previous = previousActiveTripRef.current;
    if (previous && !isTracking) {
      const last = previous.route[previous.route.length - 1];
      if (last) lastTripEndPointRef.current = last;
      departureCandidateRef.current = null;
      // The one place every kind of trip end passes through — manual Stop
      // from the banner/Route Planner, stillness, BT disconnect, stale
      // watchdog — so this is where "the trip ended" gets logged
      // regardless of who ended it (the specific reason is logged by each
      // of those call sites). Real-drive logs previously had no record of
      // a trip ending at all, which made "recording never started for the
      // next trip" impossible to tell apart from "the previous one never
      // actually ended".
      const first = previous.route[0];
      logDiagnostic('Trip ended.', {
        tripId: previous.id,
        points: previous.route.length,
        durationMin: Math.round((Date.now() - previous.startTime) / 60000),
        endSpeedKmh: last?.speed != null ? Math.round(last.speed * 3.6) : null,
        endPoint: last ? { lat: last.latitude, lon: last.longitude } : null,
        metersFromStart: first && last ? Math.round(haversineMeters(first, last)) : null,
        harshEvents: previous.events.filter(e => e.type.startsWith('harsh_')).length,
        // Fixes that came from Wi-Fi/cell positioning (no GPS speed/heading).
        nonGpsFixes: previous.route.filter(p => p.speedEstimated).length,
      });
    }
    previousActiveTripRef.current = activeTrip;
  }, [activeTrip, isTracking]);
  useEffect(() => { pendingStartRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);

  // Tracks live BT connection state for the recording-gate check below —
  // separate effect so it doesn't need to be part of the main location-
  // subscription effect's dependency array. Subscribes once for the app's
  // lifetime; getConnectedBluetoothDeviceName() covers "already connected
  // before this mounted" (e.g. cold-started while already in the car).
  // Forces the SDK out of its stationary state (GPS off, waiting on Android's
  // activity recognition to say "in vehicle") the moment the paired car's
  // Bluetooth connects — and keeps re-asserting it from the heartbeat for as
  // long as the car stays connected without a trip running.
  //
  // Root cause of every "recording started late" / "never started" report
  // on auto-detected trips: while parked, BackgroundGeolocation turns GPS
  // off entirely and only turns it back on once Android's activity
  // recognition reports movement. Real-drive diagnostics show that API
  // reporting "still" at 100% confidence while already doing 40 km/h — so
  // by the time the SDK finally decided to enable GPS and the first fix
  // reached handleLocation at all, the car had covered 100-300 yards; that
  // first fix is the earliest possible start point, hence the wrong start
  // address. Worse, a second trip that began where the first one ended
  // (car parked briefly, BT never dropped) produced no fixes and no
  // diagnostics whatsoever: the SDK had gone stationary after the stop and
  // the activity API never woke it again. Route Planner trips don't show
  // this because their start point snaps to the planned origin, not
  // because GPS was any faster.
  //
  // The car's Bluetooth is a far stronger "about to drive" signal than the
  // activity classifier, and it's already the hard requirement for
  // recording (bluetoothGateLogic.ts). Cost: GPS runs while sitting in the
  // car with the engine on but not yet moving — bounded by BT dropping when
  // the car is turned off, at which point the SDK is released back to its
  // own stationary detection (changePace(false) below).
  function forceGpsOnForCar(trigger: 'bt-connected' | 'heartbeat' | 'mount' | 'ready' | 'sdk-stationary') {
    if (isTrackingRef.current) return;
    const connected = connectedBluetoothDeviceRef.current;
    if (!isBluetoothGateSatisfied(isBluetoothVehicleDetectionAvailable(), pairingsRef.current, connected)) return;
    BackgroundGeolocation.getState().then((state) => {
      if (!state.enabled || isTrackingRef.current) return;
      // On the connect event itself, don't trust isMoving — real-drive log:
      // the connect event produced no forcing at all and it took the next
      // heartbeat, 49 seconds later, to actually turn GPS on. changePace is
      // idempotent, so asserting it on connect costs nothing.
      if (state.isMoving && trigger !== 'bt-connected') return;
      forcedMovingRef.current = true;
      logDiagnostic('Forcing GPS on — paired car is connected but SDK was stationary.', {
        trigger, connectedDevice: connected,
      });
      return BackgroundGeolocation.changePace(true);
    }).catch((err: unknown) => {
      logDiagnostic('Failed to force GPS on.', { message: err instanceof Error ? err.message : String(err) });
    });
  }

  useEffect(() => {
    let cancelled = false;
    getConnectedBluetoothDeviceName().then((name) => {
      if (!cancelled) {
        connectedBluetoothDeviceRef.current = name;
        forceGpsOnForCar('mount');
      }
    });
    const unsubConnect = subscribeBluetoothDeviceConnected((name) => {
      connectedBluetoothDeviceRef.current = name;
      logDiagnostic('Bluetooth device connected.', { name });
      forceGpsOnForCar('bt-connected');
    });
    const unsubDisconnect = subscribeBluetoothDeviceDisconnected(() => {
      logDiagnostic('Bluetooth device disconnected.', { wasTracking: isTrackingRef.current });
      connectedBluetoothDeviceRef.current = null;
      if (forcedMovingRef.current && !isTrackingRef.current) {
        // Car's off — hand the SDK back to its own stationary detection
        // rather than leaving GPS forced on indefinitely.
        forcedMovingRef.current = false;
        BackgroundGeolocation.changePace(false).catch(() => {});
      }
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
        logDiagnostic('Ending trip — Bluetooth disconnected while recording.');
        endTripDueToStillness();
      }
    });
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared by the per-fix STILL_MS check inside handleLocation and the
  // wall-clock stillness watchdog below — both just need to know "stillness
  // has been sustained long enough, end the trip now."
  function endTripDueToStillness() {
    if (!activeTripRef.current || endingRef.current) return;
    endingRef.current = true;
    const tripId = activeTripRef.current.id;
    const ending = dispatch(endTrip(tripId));
    // endTrip closes the trip locally synchronously (closeActiveTrip runs
    // before its first await), so by here recording has already stopped
    // and a new trip may legitimately start. Release the guard NOW — it
    // only exists to stop a second endTrip being dispatched for the same
    // trip from the BT/heartbeat/per-fix paths racing each other. Holding
    // it until the thunk settled blocked auto-start for as long as the
    // enrichment network calls took: 9 minutes on a real stalled drive,
    // during which the next trip never started.
    endingRef.current     = false;
    stillSinceRef.current = null;
    ending.then(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('TripSummary', { tripId });
      }
    }).catch(() => {});
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
        logDiagnostic('Ending trip — stale, no GPS activity for too long.', {
          minutesSinceLastActivity: Math.round((Date.now() - lastActivityAt) / 60000),
        });
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
      // Not tracking: the heartbeat's only job is to make sure GPS is on
      // whenever the paired car is connected — covers the car having been
      // connected since before a previous trip ended (no fresh connect
      // event will ever arrive), and the SDK having gone stationary in the
      // meantime. See forceGpsOnForCar.
      if (!isTrackingRef.current) {
        forceGpsOnForCar('heartbeat');
        return;
      }
      const reason = evaluateStillness({
        isTracking: isTrackingRef.current,
        stillSince: stillSinceRef.current,
        lastFixAt: lastFixAtRef.current,
        lastFixSpeedMs: lastFixSpeedMsRef.current,
        now: Date.now(),
      });
      if (!reason) return;
      logDiagnostic('Auto-ending trip — vehicle has been stationary.', {
        reason,
        secondsSinceLastFix: lastFixAtRef.current === null
          ? null
          : Math.round((Date.now() - lastFixAtRef.current) / 1000),
        lastFixSpeedKmh: Math.round(lastFixSpeedMsRef.current * 3.6),
      });
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
    //
    // Re-checks getConnectedBluetoothDeviceName() fresh here rather than
    // trusting connectedBluetoothDeviceRef alone, even though the poll below
    // (in handleLocation) keeps that ref self-correcting between fixes —
    // this is the single moment an ambient auto-start actually commits, and
    // that poll is fired asynchronously from the very same GPS-fix callback
    // that leads here, so it can still not have resolved yet on the one fix
    // where speed/activity/accuracy/BT all happen to line up together. A
    // trip only starts once per drive, so the extra native round-trip here
    // costs nothing that matters. This is on top of, not instead of, the
    // native-side staleness fix (BluetoothVehicleDetectionModule.kt) — that
    // fix is what makes a fresh call here trustworthy in the first place;
    // this just makes sure the freshest possible read is the one a start
    // decision is actually made from.
    async function startOnceBluetoothReady(dispatchStart: () => void) {
      const moduleAvailable = isBluetoothVehicleDetectionAvailable();
      const connectedDevice = moduleAvailable ? await getConnectedBluetoothDeviceName() : null;
      connectedBluetoothDeviceRef.current = connectedDevice;

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
      const timestamp = typeof location.timestamp === 'string'
        ? new Date(location.timestamp).getTime()
        : location.timestamp;

      // Speed and heading are "only present when location came from GPS,
      // -1 otherwise" (plugin docs) — Wi-Fi/cell fixes, 20-30% of fixes on
      // real drives. Speed used to be coerced to 0 here, so a car doing
      // 28 mph "stopped" and "restarted" every few seconds: that manufactured
      // most recorded harsh braking/acceleration events, stored fake zero
      // speeds in VGD (never counted as speeding), and reset the auto-start
      // streak. Heading was passed through as -1, a bogus compass heading.
      // For a non-GPS fix, speed is instead estimated from the distance to
      // the previous fix and flagged speedEstimated — usable for "is the car
      // moving", but excluded from anything that measures acceleration.
      const hasGpsSpeed = coords.speed != null && coords.speed >= 0;
      const heading = coords.heading != null && coords.heading >= 0 ? coords.heading : undefined;
      let speedMs: number;
      if (hasGpsSpeed) {
        speedMs = coords.speed as number;
      } else {
        speedMs = 0;
        const prev = lastPositionRef.current;
        const dtS = prev ? (timestamp - prev.timestamp) / 1000 : 0;
        if (prev && dtS > 0 && dtS <= 15) {
          const meters = haversineMeters(prev, { latitude: coords.latitude, longitude: coords.longitude });
          // Below combined position uncertainty the "movement" is just
          // noise between two fixes — no evidence of speed either way.
          const noiseM = Math.max(10, (coords.accuracy ?? 0) + (prev.accuracy ?? 0));
          if (meters > noiseM) speedMs = meters / dtS;
        }
      }

      // See lastFixIdentityRef — drop repeat deliveries of the same fix.
      // Keyed on timestamp+coords rather than the SDK's uuid: the stored
      // duplicates were identical in time and position, and a re-sampled
      // copy under a fresh uuid would slip past a uuid check.
      const fixIdentity = `${timestamp}:${coords.latitude}:${coords.longitude}`;
      if (fixIdentity === lastFixIdentityRef.current) {
        duplicateFixCountRef.current += 1;
        // Logged on the first one and then sparsely — enough to confirm
        // from a real-drive log whether the SDK is still delivering
        // duplicates (and roughly how many) without flooding it.
        if (duplicateFixCountRef.current === 1 || duplicateFixCountRef.current % 200 === 0) {
          logDiagnostic('Dropped duplicate delivery of the same GPS fix.', {
            duplicatesSoFar: duplicateFixCountRef.current, speedKmh: Math.round(speedMs * 3.6),
          });
        }
        return;
      }
      lastFixIdentityRef.current = fixIdentity;

      const gpsPoint: GpsPoint = {
        latitude:  coords.latitude,
        longitude: coords.longitude,
        altitude:  coords.altitude  ?? undefined,
        speed:     speedMs,
        heading,
        accuracy:  coords.accuracy  ?? undefined,
        timestamp,
        ...(!hasGpsSpeed && { speedEstimated: true }),
      };
      lastPositionRef.current = gpsPoint;

        // Self-corrects connectedBluetoothDeviceRef against the native
        // module's own authoritative state on every fix while not yet
        // tracking — event-driven updates alone (connect/disconnect
        // broadcasts) proved unreliable across a reconnect: a car's
        // hands-free connects via two independent Bluetooth profiles (HFP
        // + A2DP) that negotiate separately and aren't guaranteed to report
        // in a consistent order, so a late/reordered disconnect broadcast
        // for one profile could null this ref out again right after a
        // connect event for the other profile had correctly set it — with
        // no further event ever arriving to correct it, permanently
        // blocking auto-start for the rest of the session until a fresh,
        // forceful reconnect (e.g. via the phone's OS Bluetooth settings,
        // which produces a brand-new connect broadcast) happened to unstick
        // it. Real-world symptom this fixes: BT auto-start worked the first
        // time, then silently never fired again on any later drive despite
        // the home screen correctly showing "Car connected" throughout
        // (that badge polls fresh on its own mount, this ref didn't).
        // Polling here is cheap and fixes arrive every few seconds while
        // waiting to drive anyway, so this self-heals within moments
        // instead of staying stuck indefinitely on one missed/misordered
        // event.
        if (!isTrackingRef.current && !btPollInFlightRef.current) {
          btPollInFlightRef.current = true;
          getConnectedBluetoothDeviceName()
            .then((name) => {
              if (name !== connectedBluetoothDeviceRef.current) {
                // Diagnostic only — confirms (or rules out) the exact
                // event-vs-truth desync this poll exists to correct. If
                // this never appears in a real drive's log, the event-driven
                // updates were keeping up fine on their own and the actual
                // cause of a reported "worked once, never again" lies
                // elsewhere.
                logDiagnostic('BT ref corrected by poll — event-driven value was stale.', {
                  staleValue: connectedBluetoothDeviceRef.current,
                  actualValue: name,
                });
              }
              connectedBluetoothDeviceRef.current = name;
            })
            .finally(() => { btPollInFlightRef.current = false; });
        }

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
            // The ref looks satisfied, but route through the same fresh
            // re-check startOnceBluetoothReady does before any ambient
            // start actually commits (see its doc comment) rather than
            // dispatching straight off the ref here — if the fresh check
            // disagrees, pendingBluetoothStartRef.current (still the
            // original, untouched entry at this point) just keeps waiting
            // out its original timeout instead of firing on a stale read.
            logDiagnostic('BT caught up — confirming before resuming held auto-start.', {
              waitedMs: Date.now() - pendingBt.capturedAt,
            });
            startOnceBluetoothReady(pendingBt.dispatchStart);
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
        //
        // A fix with no GPS speed plays no part in starting a trip: it can't
        // start a moving streak (a Wi-Fi/cell position jump while parked
        // would read as motion), and it can't break one either — the fake
        // 0 m/s such fixes used to carry kept resetting the streak mid-drive.
        if (!isTrackingRef.current && gpsPoint.speedEstimated) return;
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
              movingSinceStartPointRef.current = null;
              earliestAccurateStartPointRef.current = null;
              departureCandidateRef.current = null;
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
              logDiagnostic('Trip started.', {
                mode: 'route-planner',
                snappedToPlannedOrigin: initialPoint !== gpsPoint,
                speedKmh: Math.round(speedMs * 3.6),
                accuracyM: coords.accuracy ?? null,
                startPoint: { lat: initialPoint.latitude, lon: initialPoint.longitude },
              });
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
            const speedKmh = speedMs * 3.6;
            // The activity classifier only gets a vote when the paired car's
            // Bluetooth ISN'T the evidence of being in a vehicle. Real-drive
            // log, GPS already forced on: the car rolled at 3-7 km/h for 30
            // seconds with the classifier insisting "still" at 100% (the
            // same classifier that reported "still" at 40 km/h), and every
            // one of those fixes was rejected here — resetting the streak
            // and its start point each time — until the car passed 10 km/h.
            // That 30 seconds was the entire remaining start delay. With
            // the car connected, walking/cycling misclassification can't
            // produce a phantom trip anyway (the BT gate already requires
            // the car), so the classifier is pure downside here.
            const carConnected = isBluetoothGateSatisfied(
              isBluetoothVehicleDetectionAvailable(), pairingsRef.current, connectedBluetoothDeviceRef.current,
            ) && connectedBluetoothDeviceRef.current != null;
            const activityGate = carConnected
              ? { reject: false as const, contradictedBySpeed: false, maxPlausibleKmh: undefined }
              : evaluateActivityGate(activity, speedKmh);

            if (activityGate.reject) {
              // Diagnostic only — traces "speed qualified but auto-start
              // never fired" reports to a misclassified activity rather
              // than BT.
              logDiagnostic(
                'Speed qualified but activity rejected as non-vehicle.',
                { type: activity?.type, confidence: activity?.confidence, speedKmh },
              );
              movingSinceRef.current = null;
              movingSinceStartPointRef.current = null;
              earliestAccurateStartPointRef.current = null;
              return;
            }

            if (activityGate.contradictedBySpeed) {
              // Logged rather than silently ignored so a future "why did it
              // start while I was walking" report stays traceable to exactly
              // this override — see activityGateLogic.ts.
              logDiagnostic(
                'Activity classified non-vehicle but GPS speed contradicts it — trusting GPS.',
                {
                  type: activity?.type,
                  confidence: activity?.confidence,
                  speedKmh,
                  maxPlausibleKmh: activityGate.maxPlausibleKmh,
                },
              );
            }

            // Start the confirm clock on the first qualifying-speed fix
            // regardless of its accuracy — the first fixes after a cold GPS
            // lock are frequently low-accuracy, and gating the clock itself
            // on accuracy meant it often couldn't start ticking until well
            // after the car had already pulled away (accuracy only improves
            // a few seconds into a drive). Accuracy is checked below, but
            // only to choose the best available start POINT — see startPoint
            // further down — never to gate whether the trip starts at all.
            if (movingSinceRef.current === null) {
              movingSinceRef.current = Date.now();
              movingSinceStartPointRef.current = gpsPoint;
              const candidate = departureCandidateRef.current;
              if (!candidate || Date.now() - candidate.at > DEPARTURE_CANDIDATE_TTL_MS) {
                departureCandidateRef.current = { point: gpsPoint, at: Date.now() };
              }
            }

            // An unreported accuracy is treated as poor, not as accurate —
            // it's unknown, and a fix with no accuracy estimate is exactly
            // what a weak/indoor/just-acquiring signal tends to produce.
            const accurateEnough = coords.accuracy != null && coords.accuracy <= MAX_START_ACCURACY_M;

            // Remember the earliest fix in this streak that already met the
            // accuracy bar — see earliestAccurateStartPointRef's doc comment.
            // Only ever set once per streak (first qualifying one wins).
            if (accurateEnough && earliestAccurateStartPointRef.current === null) {
              earliestAccurateStartPointRef.current = gpsPoint;
            }
            // An inaccurate departure candidate is upgraded to the first
            // accurate fix that follows within a few seconds — same "prefer
            // an accurate start address" preference the ref above encodes,
            // without losing the candidate's earlier-is-better position.
            const departure = departureCandidateRef.current;
            if (
              accurateEnough && departure
              && (departure.point.accuracy == null || departure.point.accuracy > MAX_START_ACCURACY_M)
              && Date.now() - departure.at <= DEPARTURE_CANDIDATE_UPGRADE_WINDOW_MS
            ) {
              departure.point = gpsPoint;
            }

            // Deliberately NOT gated on accurateEnough. It used to be —
            // real-world regression: mounted upright in a phone holder, GPS
            // accuracy took long enough to resolve to <=20m that the whole
            // start decision was held the entire time (every fix bounced off
            // this check), and by the time an accurate fix finally arrived
            // the car was ~300 yards down the road — which is also where the
            // trip then recorded as having started, because the fallback
            // below was gpsPoint: whichever fix happened to be current at
            // that moment, not an early one. Route Planner's manual start
            // never had this problem at all, because it doesn't wait for an
            // accurate fix to begin with — it snaps to the already-known
            // planned-route origin (see the `pending` branch above), so
            // there was nothing to compare this against until now.
            //
            // Accuracy is still exactly what decides WHICH point gets used
            // as the recorded start (see startPoint below) — it just no
            // longer decides WHETHER the trip starts at all. Those are
            // different questions: one is "is this address trustworthy",
            // the other is "did the car actually leave".
            if (Date.now() - movingSinceRef.current < MOVING_CONFIRM_MS) {
              return;
            }

            // See MIN_REAL_MOVEMENT_METERS's doc comment — real-world false
            // start: parked, ended the trip, walked a few feet indoors, and
            // a spurious sustained-nonzero speed reading (worse near
            // buildings) plus the activity classifier's own lag off
            // "automotive" cleared every other gate with zero real movement
            // behind it. Keeps waiting rather than resetting the streak —
            // a genuine departure clears this within moments regardless.
            const realMovementMeters = movingSinceStartPointRef.current
              ? haversineMeters(movingSinceStartPointRef.current, gpsPoint)
              : 0;
            if (realMovementMeters < MIN_REAL_MOVEMENT_METERS) {
              if (Date.now() - movingSinceRef.current >= MOVING_CONFIRM_MS) {
                logDiagnostic(
                  'Speed and accuracy qualified but real displacement too small — holding, likely stationary.',
                  { realMovementMeters, required: MIN_REAL_MOVEMENT_METERS },
                );
              }
              return;
            }

            // See MIN_DISTANCE_FROM_LAST_TRIP_END_M — the displacement check
            // above is beatable by stationary GPS drift; this one isn't.
            // Only applies once a trip has ended this session (a fresh
            // launch has nothing to anchor to). Holds rather than resets,
            // same as the checks above: the moment the car is genuinely
            // driving away this clears on its own.
            const lastEnd = lastTripEndPointRef.current;
            if (lastEnd) {
              const metersFromLastTripEnd = haversineMeters(lastEnd, gpsPoint);
              if (metersFromLastTripEnd < MIN_DISTANCE_FROM_LAST_TRIP_END_M) {
                if (Date.now() - movingSinceRef.current >= MOVING_CONFIRM_MS) {
                  logDiagnostic(
                    'Start gates passed but still within parking radius of last trip end — holding.',
                    { metersFromLastTripEnd, required: MIN_DISTANCE_FROM_LAST_TRIP_END_M, speedKmh },
                  );
                }
                return;
              }
            }

            // Captured before resetting the refs below. Preference order:
            // 1. The earliest fix in this streak that was ALSO accurate
            //    enough — the ideal case, already accuracy-verified.
            // 2. The streak's very first fix, regardless of its accuracy —
            //    far closer to the true departure point than the current
            //    fix could be, since it's whatever position the car was at
            //    the moment qualifying speed was first seen, before
            //    MOVING_CONFIRM_MS or any accuracy wait elapsed.
            // 3. The current fix, only if somehow neither of the above was
            //    ever captured (shouldn't happen in practice — 2 is set in
            //    the same tick movingSinceRef is).
            // 0. The departure candidate — the earliest position of any
            //    streak since the last trip end, if still fresh (see
            //    DEPARTURE_CANDIDATE_TTL_MS). Beats the current streak's own
            //    points whenever an earlier streak was reset by a pause.
            const candidate = departureCandidateRef.current;
            const freshCandidate = candidate && Date.now() - candidate.at <= DEPARTURE_CANDIDATE_TTL_MS
              ? candidate : null;
            const startPoint =
              freshCandidate?.point
              ?? earliestAccurateStartPointRef.current
              ?? movingSinceStartPointRef.current
              ?? gpsPoint;
            const startPointSource = freshCandidate
              ? 'departure-candidate'
              : earliestAccurateStartPointRef.current
                ? 'earliest-accurate-fix'
                : movingSinceStartPointRef.current ? 'streak-first-fix' : 'current-fix';

            if (!earliestAccurateStartPointRef.current) {
              logDiagnostic(
                'Starting trip without ever getting an accurate GPS fix — used the streak\'s earliest position instead.',
                {
                  usedMovingSinceStartPoint: movingSinceStartPointRef.current != null,
                  lastAccuracyMeters: coords.accuracy ?? null,
                },
              );
            }

            // Everything a "started late / at the wrong address" report
            // needs to be traced without guessing: which fix became the
            // start point and why, how long the streak had run, how fast
            // the car already was at the streak's very first fix (a high
            // number here means GPS only came on well after the car had
            // left — see forceGpsOnForCar), and what the activity
            // classifier was saying at the time.
            const streakStart = movingSinceStartPointRef.current;
            const startDetails = {
              mode: 'auto' as const,
              startPointSource,
              streakMs: movingSinceRef.current === null ? null : Date.now() - movingSinceRef.current,
              streakFirstFixSpeedKmh: streakStart?.speed != null ? Math.round(streakStart.speed * 3.6) : null,
              departureCandidateAgeMs: freshCandidate ? Date.now() - freshCandidate.at : null,
              departureCandidateSpeedKmh: freshCandidate?.point.speed != null
                ? Math.round(freshCandidate.point.speed * 3.6) : null,
              speedKmh: Math.round(speedMs * 3.6),
              accuracyM: coords.accuracy ?? null,
              activity: activity ? `${activity.type}@${activity.confidence}` : null,
              startPoint: { lat: startPoint.latitude, lon: startPoint.longitude },
              metersFromStartPointNow: Math.round(haversineMeters(startPoint, gpsPoint)),
            };

            stillSinceRef.current = null;
            movingSinceRef.current = null;
            movingSinceStartPointRef.current = null;
            earliestAccurateStartPointRef.current = null;
            departureCandidateRef.current = null;

            startOnceBluetoothReady(() => {
              // The fresh BT read above is async; a second streak can
              // complete and reach here while the first is still awaiting.
              if (isTrackingRef.current) return;
              logDiagnostic('Trip started.', {
                ...startDetails, connectedDevice: connectedBluetoothDeviceRef.current,
              });
              dispatch(startTrip({
                vehicleId,
                driverId,
                // Settings > "Default trip type" — the same default Route
                // Planner already applies. This used to be hard-coded to
                // 'private', which is what VGD then stores permanently: its
                // purpose is fixed at trip creation and the web's "change
                // purpose" only edits a free-text note, so a driver whose
                // trips are all business had every auto-detected trip filed
                // wrong with no way to correct it.
                tripType: defaultTripTypeRef.current,
                transportMode: 'car',
                initialPoint: startPoint,
              }));
            });
            return;
          }

          // Speed dropped back below threshold — reset the confirmation
          // window so the next qualifying streak has to hold for the full
          // duration again, same as a single noisy fix never counting on
          // its own.
          movingSinceRef.current = null;
          movingSinceStartPointRef.current = null;
          earliestAccurateStartPointRef.current = null;
          return;
        }

        // Recorded for every fix regardless of state — the heartbeat
        // watchdog reads these to notice when fixes stop arriving at all
        // (see stillnessLogic.ts), which is how a parked car presents once
        // BackgroundGeolocation's own motion detection goes stationary.
        lastFixAtRef.current = Date.now();
        // Only a GPS speed is trusted as "how fast were we going" for the
        // silence-based end check.
        if (!gpsPoint.speedEstimated) lastFixSpeedMsRef.current = speedMs;

        // ── Record GPS + auto-end ───────────────────────────────────────────
        if (isTrackingRef.current && activeTripRef.current) {
          // Every fix goes into the route; the speedEstimated flag travels
          // with it so consumers can tell a GPS speed from an estimate.
          dispatch(appendGpsPoint(gpsPoint));
          publishGpsFix(speedMs, timestamp, gpsPoint);

          // Stillness is judged on GPS speeds only — neither started by a
          // missing speed nor reset by a position-noise estimate.
          if (!gpsPoint.speedEstimated) {
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
        }
      };

    const subscription = BackgroundGeolocation.onLocation(
      handleLocation,
      (err) => console.warn('[TripAutoDetection]', err),
    );
    // Diagnostic only — the SDK's moving/stationary transitions are exactly
    // when GPS gets turned on/off, which is the thing real-drive logs could
    // never show before: a late start reads as a long gap between the car
    // leaving and the first fix, and this line is what dates the moment
    // the SDK finally noticed (or was forced — see forceGpsOnForCar).
    const motionSubscription = BackgroundGeolocation.onMotionChange((event) => {
      logDiagnostic(event.isMoving ? 'SDK motion: moving — GPS on.' : 'SDK motion: stationary — GPS off.', {
        speedKmh: Math.round(Math.max(0, event.location?.coords?.speed ?? 0) * 3.6),
        activity: event.location?.activity
          ? `${event.location.activity.type}@${event.location.activity.confidence}` : null,
        isTracking: isTrackingRef.current,
      });
      // The SDK's stop-detection times a forced "moving" state out again
      // after a few stationary minutes (its stopTimeout). While the paired
      // car is still connected that's exactly the state a late/missed
      // start comes from, so re-assert right away rather than leaving a
      // gap until the next heartbeat.
      if (!event.isMoving) forceGpsOnForCar('sdk-stationary');
    });
    removeLocationListener = () => {
      subscription.remove();
      motionSubscription.remove();
    };

    // Replay whatever index.js's headless task queued while this hook wasn't
    // mounted with a live JS listener (see enableHeadless above) — in
    // chronological order, through the exact same handleLocation logic a
    // live fix would go through, so trip start/stop and appended points
    // reconcile themselves instead of requiring the user to force-restart
    // the app to "unstick" tracking.
    //
    // Only the most recent REPLAY_LOCATION_QUEUE_MAX entries actually get
    // replayed — real-world crash: an overnight-idle stretch queued up to
    // the old 2000-entry cap, and replaying all of them fired ~2000
    // back-to-back native Bluetooth bridge calls and Redux dispatches in one
    // synchronous loop the moment the app was reopened, freezing the whole
    // UI (needed two taps to "wake up", then hung outright). The replay only
    // exists to catch a recent motion event from just before reopening —
    // MOVING_CONFIRM_MS's 5-second confirm window — so anything older than
    // the last handful of fixes is discarded outright here, before it ever
    // reaches handleLocation (no dispatch, no diagnostic log, no BT poll for
    // the discarded entries).
    AsyncStorage.getItem(HEADLESS_LOCATION_QUEUE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      AsyncStorage.removeItem(HEADLESS_LOCATION_QUEUE_KEY);
      try {
        const queued = (JSON.parse(raw) as Location[]).slice(-REPLAY_LOCATION_QUEUE_MAX);
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
      if (!state.enabled) {
        BackgroundGeolocation.start().then(() => forceGpsOnForCar('ready')).catch(() => {});
      } else {
        // The mount-time check in the BT effect can run before this
        // resolves (getState().enabled still false then) — re-check now.
        forceGpsOnForCar('ready');
      }
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
