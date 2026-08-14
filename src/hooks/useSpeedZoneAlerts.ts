import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useVoicePlayback } from './useVoicePlayback';
import { useIsImperialUnits } from './useIsImperialUnits';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import { buildCumulativeRouteDistances, distanceAlongRoute } from '../utils/turnByTurnLogic';
import {
  nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance, type SpeedZoneComplianceWatch,
} from '../utils/speedZoneAlertLogic';
import { formatSpeed, generateId } from '../utils/helpers';

/**
 * Voice-only reduced-speed-zone warnings for a Route-Planner-originated trip
 * — real-drive feedback was that the app never warned about an upcoming (or
 * already-entered) lower speed limit. Same fixed-route-only scope as
 * useTurnByTurnGuidance (no live re-routing), and only runs when the planned
 * route actually has speed-limit data — HERE returns null/omits spans for
 * segments it doesn't know, so a route with none just never announces
 * anything rather than guessing.
 */
export function useSpeedZoneAlerts(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const plannedRoute = activeTrip?.plannedRoute;
  const isImperial = useIsImperialUnits();
  const { speak } = useVoicePlayback();
  // Routed through refs so the effect's dependency array doesn't churn on
  // unrelated re-renders — same pattern as useTurnByTurnGuidance.
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const isImperialRef = useRef(isImperial);
  useEffect(() => { isImperialRef.current = isImperial; }, [isImperial]);

  useEffect(() => {
    const spans = plannedRoute?.speedLimitSpans;
    const tripId = activeTrip?.id;
    if (!isTracking || !plannedRoute || !spans || spans.length === 0 || !tripId) return;

    const cumulativeRouteDistances = buildCumulativeRouteDistances(plannedRoute.coordinates);
    let lastAnnouncedSpanStartMeters: number | null = null;
    let complianceWatch: SpeedZoneComplianceWatch | null = null;
    // Anchors distanceAlongRoute's search window to the previous fix's match
    // instead of the whole route — see turnByTurnLogic.ts and
    // useTurnByTurnGuidance.ts, which use the same pattern.
    let lastMatchedIndex: number | null = null;

    const unsubscribe = subscribeGpsFix((speedMs, timestamp, point) => {
      const { distanceMeters: distanceTraveledMeters, matchedIndex } = distanceAlongRoute(
        point, plannedRoute.coordinates, cumulativeRouteDistances, lastMatchedIndex,
      );
      lastMatchedIndex = matchedIndex;

      const announcement = nextSpeedZoneToAnnounce(spans, distanceTraveledMeters, lastAnnouncedSpanStartMeters);
      if (announcement) {
        lastAnnouncedSpanStartMeters = announcement.distanceFromStartMeters;
        const limitLabel = formatSpeed(announcement.speedLimitMps * 3.6, isImperialRef.current);
        speakRef.current(
          announcement.isApproaching
            ? `You are approaching a ${limitLabel} speed zone. Please adjust your speed.`
            : `You are now in a ${limitLabel} speed zone. Please reduce your speed.`,
        );
      }

      // Independent of the voice announcement above — documents how long/how
      // far it actually took to slow down after entering a stricter zone,
      // for the reward system's compliance scoring, not just whether a
      // warning was spoken. Stored as a TelematicsEvent (not sent to VGD —
      // mapTelematicsEventsToVgdPoints has no per-point VGD parameter for
      // this type, same as the existing 'speeding' events), so it's visible
      // in trip detail and reachable wherever trip.events already is.
      const advanced = advanceSpeedZoneCompliance(complianceWatch, spans, distanceTraveledMeters, speedMs, timestamp);
      complianceWatch = advanced.watch;
      if (advanced.result) {
        dispatch(addTelematicsEvent({
          id: generateId(),
          type: 'speeding',
          timestamp,
          location: point,
          value: advanced.result.secondsToComply,
          metadata: {
            speedLimitMps: advanced.result.speedLimitMps,
            entrySpeedMs: advanced.result.entrySpeedMs,
            metersToComply: advanced.result.metersToComply,
            compliedWithinZone: advanced.result.compliedWithinZone,
          },
        }));
      }
    });

    return unsubscribe;
  }, [isTracking, plannedRoute, activeTrip?.id, dispatch]);
}
