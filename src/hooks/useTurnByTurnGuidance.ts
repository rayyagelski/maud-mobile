import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useVoicePlayback } from './useVoicePlayback';
import { useIsImperialUnits } from './useIsImperialUnits';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { fetchHereRoutes } from '../services/here/hereRoutingClient';
import { fetchIntersectionControls } from '../services/overpass/intersectionControlClient';
import { setPlannedRouteOnActiveTrip } from '../store/slices/tripSlice';
import { logDiagnostic } from '../services/diagnosticsLog';
import { haversineMeters } from '../utils/complianceAlertLogic';
import {
  buildCumulativeRouteDistances, distanceAlongRoute, distanceToRouteMeters, nextManeuverToAnnounce,
  OFF_ROUTE_STREAK_THRESHOLD,
} from '../utils/turnByTurnLogic';
import {
  courseForReroute, createRerouteTracker, firstManeuverToAnnounceAfterReroute, REROUTE_MAX_ACCURACY_METERS,
  REROUTE_OFF_ROUTE_METERS,
} from '../utils/rerouteLogic';
import {
  instructionWithControl, intersectionControlsForManeuvers, isTurnManeuver, pointAtDistance,
  type IntersectionControl,
} from '../utils/intersectionControlLogic';

/**
 * Voice turn-by-turn guidance for a Route-Planner-originated trip. Only runs
 * when the active trip has a plannedRoute (auto-detected trips have none,
 * since there's no selected destination to guide against). Follows the same
 * subscribeGpsFix-in-TripDetectionRunner shape as useComplianceMonitor /
 * useSevereWeatherAlerts rather than opening a second location subscription.
 *
 * - Repositioning: leaving the route (REROUTE_OFF_ROUTE_METERS for a few
 *   fixes) says "Recalculating route." and asks HERE for a new route from
 *   the car's position, heading the way it is driving. The new route replaces
 *   the trip's plannedRoute, so this hook, the speed-zone alerts, the traffic
 *   monitor and the Route Planner map all follow it.
 * - Turns at traffic lights and stop signs are announced as such ("At the
 *   traffic light, turn right onto …"), from OpenStreetMap data fetched once
 *   per route (see intersectionControlLogic.ts).
 */
export function useTurnByTurnGuidance(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const plannedRoute = activeTrip?.plannedRoute;
  const tripId = activeTrip?.id;
  const isImperial = useIsImperialUnits();
  const { speak } = useVoicePlayback();
  // speak() is a fresh closure every render — routed through a ref so this
  // effect's dependency array doesn't churn on unrelated re-renders (same
  // reasoning as useSevereWeatherAlerts).
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const isImperialRef = useRef(isImperial);
  useEffect(() => { isImperialRef.current = isImperial; }, [isImperial]);
  // Survives the effect restarting on each new route, so a recalculation
  // can't be followed by another one sooner than REROUTE_MIN_INTERVAL_MS.
  const lastRerouteAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isTracking || !plannedRoute || !tripId || plannedRoute.coordinates.length === 0) return undefined;

    const coordinates = plannedRoute.coordinates;
    const destination = coordinates[coordinates.length - 1];
    // Built once per planned route — distance is tracked as a projection onto
    // this same polyline (see distanceAlongRoute's doc comment) rather than
    // raw accumulated GPS movement, so it stays in sync with
    // Maneuver.distanceFromStartMeters (computed against this same polyline)
    // regardless of how the actual driven path's length compares.
    const cumulativeRouteDistances = buildCumulativeRouteDistances(coordinates);
    let announcedCount = plannedRoute.recalculatedAt != null
      ? firstManeuverToAnnounceAfterReroute(plannedRoute.maneuvers)
      : 0;
    let offRouteStreak = 0;
    // Anchors distanceAlongRoute's search window to the previous fix's match
    // (see turnByTurnLogic.ts) instead of the whole route — null forces a
    // full-route search, which we want both on the very first fix and right
    // after re-acquiring from off-route (the anchor from before going
    // off-route is no longer trustworthy).
    let lastMatchedIndex: number | null = null;
    let cancelled = false;
    const abort = new AbortController();

    // Traffic lights / stop signs at the turns. Until (or unless) the answer
    // arrives, turns are announced without the phrase.
    let controls: Array<IntersectionControl | null> = [];
    const turnPoints = plannedRoute.maneuvers
      .filter(isTurnManeuver)
      .map(m => pointAtDistance(coordinates, cumulativeRouteDistances, m.distanceFromStartMeters)?.point)
      .filter((p): p is NonNullable<typeof p> => p != null);
    fetchIntersectionControls(turnPoints, abort.signal).then((nodes) => {
      if (cancelled) return;
      controls = intersectionControlsForManeuvers(plannedRoute.maneuvers, coordinates, cumulativeRouteDistances, nodes);
      logDiagnostic('Turn instructions: traffic lights / stop signs looked up.', {
        turns: turnPoints.length,
        atLights: controls.filter(c => c === 'traffic_signals').length,
        atStopSigns: controls.filter(c => c === 'stop' || c === 'all_way_stop').length,
        mapNodesFound: nodes.length,
      });
    });

    const reroute = createRerouteTracker(lastRerouteAtRef.current);
    let rerouting = false;

    const unsubscribe = subscribeGpsFix((speedMs, _timestamp, point) => {
      const offRouteMeters = distanceToRouteMeters(point, coordinates);
      const wasOffRoute = offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD;
      // A fix too inaccurate to tell which road the car is on changes nothing.
      if (point.accuracy == null || point.accuracy <= REROUTE_MAX_ACCURACY_METERS) {
        offRouteStreak = offRouteMeters > REROUTE_OFF_ROUTE_METERS ? offRouteStreak + 1 : 0;
      }
      if (wasOffRoute && offRouteStreak === 0) lastMatchedIndex = null;

      const now = Date.now();
      if (reroute.update({
        distanceToRouteMeters: offRouteMeters,
        distanceToDestinationMeters: haversineMeters(point, destination),
        accuracyMeters: point.accuracy,
        timestampMs: now,
      })) {
        reroute.started(now);
        lastRerouteAtRef.current = now;
        rerouting = true;
        speakRef.current('Recalculating route.', 'critical');
        fetchHereRoutes(
          { latitude: point.latitude, longitude: point.longitude }, destination, 0, isImperialRef.current,
          abort.signal, courseForReroute(speedMs, point.heading),
        )
          .then(([route]) => {
            if (cancelled) return;
            if (!route || route.coordinates.length === 0) throw new Error('no route returned');
            logDiagnostic('Route recalculated after leaving the planned route.', {
              offRouteMeters: Math.round(offRouteMeters),
              newDistanceMeters: Math.round(route.distanceMeters),
              newDurationMin: Math.round(route.durationSeconds / 60),
            });
            // Restarts this effect (and the speed-zone hooks) on the new route.
            dispatch(setPlannedRouteOnActiveTrip({
              coordinates: route.coordinates,
              maneuvers: route.maneuvers,
              speedLimitSpans: route.speedLimitSpans,
              recalculatedAt: Date.now(),
              distanceMeters: route.distanceMeters,
              durationSeconds: route.durationSeconds,
            }));
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            // Tried again after REROUTE_MIN_INTERVAL_MS if still off the route.
            logDiagnostic('Route recalculation failed.', { message: (err as Error)?.message ?? String(err) });
          })
          .finally(() => {
            rerouting = false;
            reroute.finished();
          });
      }

      const { distanceMeters: distanceTraveledMeters, matchedIndex } = distanceAlongRoute(
        point, coordinates, cumulativeRouteDistances, lastMatchedIndex,
      );
      lastMatchedIndex = matchedIndex;

      // Off the route (or a new one is being fetched): the old route's turns
      // no longer apply. Resumes on its own if the driver comes back to it.
      if (rerouting || offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD) return;

      const maneuver = nextManeuverToAnnounce(plannedRoute.maneuvers, distanceTraveledMeters, announcedCount);
      if (maneuver) {
        const control = controls[announcedCount];
        announcedCount += 1;
        // 'critical' — a turn instruction must not be cut off by a lower-
        // priority speed-zone/AI-recommendation announcement firing on the
        // same or a following GPS fix (see useVoicePlayback.ts).
        speakRef.current(instructionWithControl(maneuver.instruction, control), 'critical');
      }
    });

    return () => {
      cancelled = true;
      abort.abort();
      unsubscribe();
    };
  }, [isTracking, plannedRoute, tripId, dispatch]);
}
