import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useVoicePlayback } from './useVoicePlayback';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { advanceDistanceTraveled, nextManeuverToAnnounce, isOffRoute } from '../utils/turnByTurnLogic';
import type { GpsPoint } from '../types/trip.types';

// Consecutive off-route fixes required before guidance gives up — absorbs a
// single noisy GPS blip rather than silencing guidance on one bad fix.
const OFF_ROUTE_STREAK_THRESHOLD = 3;

/**
 * Voice-only turn-by-turn guidance for a Route-Planner-originated trip —
 * fixed route only, no live re-routing (see plan). Only runs when the active
 * trip has a plannedRoute (auto-detected trips have none, since there's no
 * selected destination to guide against). Follows the same
 * subscribeGpsFix-in-TripDetectionRunner shape as useComplianceMonitor /
 * useSevereWeatherAlerts rather than opening a second location subscription.
 */
export function useTurnByTurnGuidance(): void {
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const plannedRoute = activeTrip?.plannedRoute;
  const { speak } = useVoicePlayback();
  // speak() is a fresh closure every render — routed through a ref so this
  // effect's dependency array doesn't churn on unrelated re-renders (same
  // reasoning as useSevereWeatherAlerts).
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  useEffect(() => {
    if (!isTracking || !plannedRoute) return;

    let anchor: GpsPoint | undefined;
    let cumulativeMeters = 0;
    let announcedCount = 0;
    let offRouteStreak = 0;

    const unsubscribe = subscribeGpsFix((_speedMs, _timestamp, point) => {
      offRouteStreak = isOffRoute(point, plannedRoute.coordinates) ? offRouteStreak + 1 : 0;

      // Distance-traveled tracking is real-GPS-based, not a projection onto
      // the route polyline, so it stays accurate regardless of route
      // adherence — safe to keep advancing even while off-route.
      const advanced = advanceDistanceTraveled(anchor, point, cumulativeMeters);
      anchor = advanced.anchor;
      cumulativeMeters = advanced.cumulativeMeters;

      // Fixed-route v1: no re-routing, no "recalculating" message — just
      // mute announcements while off-route rather than permanently giving up
      // for the rest of the trip. Resumes automatically once back within
      // OFF_ROUTE_DISTANCE_METERS of the planned route.
      if (offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD) return;

      const maneuver = nextManeuverToAnnounce(plannedRoute.maneuvers, cumulativeMeters, announcedCount);
      if (maneuver) {
        announcedCount += 1;
        speakRef.current(maneuver.instruction);
      }
    });

    return unsubscribe;
  }, [isTracking, plannedRoute]);
}
