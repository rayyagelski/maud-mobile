import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useVoicePlayback } from './useVoicePlayback';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { fetchHereRoutes, type LatLng, type HereRouteResult } from '../services/here/hereRoutingClient';
import { shouldRefreshCache, type Coordinate } from '../utils/complianceAlertLogic';
import { detectTrafficBackup, findBetterAlternative, shouldRenotify } from '../utils/trafficBackupLogic';
import { setRerouteSuggestion, clearRerouteSuggestion } from '../store/slices/trafficSlice';
import { TRAFFIC_MONITOR_REFRESH_DISTANCE_KM } from '../utils/constants';
import { formatDuration } from '../utils/helpers';

// How many extra route options to request once a backup is confirmed on the
// primary (no-backup checks only need one route, to keep routine polling cheap).
const ALTERNATIVES_ON_BACKUP = 2;

/**
 * Live traffic-backup detection + reroute prompts (SRS gap item, HERE
 * Traffic-aware routing). Only runs for a Route-Planner-originated trip
 * (activeTrip.plannedRoute — auto-detected trips have no selected
 * destination to re-route against), reusing the same gpsSpeedBus stream
 * useComplianceMonitor/useSevereWeatherAlerts subscribe to.
 *
 * Detection reuses HERE Routing v8's own traffic-aware `duration` vs
 * historical `typicalDuration` (see trafficBackupLogic.ts) rather than a
 * separate Traffic Flow API integration — the app already re-fetches a route
 * from the current position to the destination periodically, this just reads
 * one more field off that same call.
 */
export function useTrafficMonitor(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const { dismissedDelaySeconds } = useAppSelector(s => s.traffic);
  const { speak } = useVoicePlayback();
  const plannedRoute = activeTrip?.plannedRoute;

  // Routed through refs so the effect below only tears down/restarts on the
  // things that actually change its subscription (isTracking/destination),
  // not on every unrelated re-render — same pattern as useSevereWeatherAlerts.
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const dismissedDelayRef = useRef(dismissedDelaySeconds);
  useEffect(() => { dismissedDelayRef.current = dismissedDelaySeconds; }, [dismissedDelaySeconds]);

  const destination = plannedRoute?.coordinates[plannedRoute.coordinates.length - 1] ?? null;

  useEffect(() => {
    if (!isTracking || !destination) return;

    let lastQueryPoint: Coordinate | null = null;
    let isFetching = false;

    const unsubscribe = subscribeGpsFix((_speedMs, _timestamp, point) => {
      const position: LatLng = { latitude: point.latitude, longitude: point.longitude };

      if (isFetching || !shouldRefreshCache(lastQueryPoint, position, TRAFFIC_MONITOR_REFRESH_DISTANCE_KM)) {
        return;
      }
      isFetching = true;
      lastQueryPoint = position;

      fetchHereRoutes(position, destination, 0)
        .then(async ([primary]: HereRouteResult[]) => {
          if (!primary) return;
          const backup = detectTrafficBackup(primary);
          if (!backup || !shouldRenotify(backup.delaySeconds, dismissedDelayRef.current)) return;

          // Only spend the extra API calls on alternatives once a real
          // backup is confirmed on the route the driver is already on.
          const routes = await fetchHereRoutes(position, destination, ALTERNATIVES_ON_BACKUP);
          const alternatives = routes.slice(1);
          const better = findBetterAlternative(primary.durationSeconds, alternatives);
          if (!better) return;

          dispatch(setRerouteSuggestion({
            delaySeconds: backup.delaySeconds,
            alternativeRoute: { coordinates: better.coordinates, maneuvers: better.maneuvers },
            alternativeDistanceMeters: better.distanceMeters,
            alternativeDurationSeconds: better.durationSeconds,
          }));
          speakRef.current(
            `Traffic backup ahead, adding about ${formatDuration(backup.delaySeconds)}. A faster route is available.`,
          );
        })
        .catch(() => {
          // Fail-soft, same convention as every other auxiliary HERE call in
          // this app — a failed check just means no prompt this cycle.
        })
        .finally(() => {
          isFetching = false;
        });
    });

    return () => {
      unsubscribe();
      dispatch(clearRerouteSuggestion());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, destination?.latitude, destination?.longitude, dispatch]);
}
