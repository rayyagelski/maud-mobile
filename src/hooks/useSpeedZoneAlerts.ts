import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useVoicePlayback } from './useVoicePlayback';
import { useIsImperialUnits } from './useIsImperialUnits';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import {
  buildCumulativeRouteDistances, distanceAlongRoute, isOffRoute, OFF_ROUTE_STREAK_THRESHOLD,
} from '../utils/turnByTurnLogic';
import {
  nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance, fillMissingSpeedLimits,
  createSpeedZoneAnnouncementMemory, speedingSecondsForFix, speedZoneAnnouncementText,
  type SpeedZoneComplianceWatch,
} from '../utils/speedZoneAlertLogic';
import { formatSpeed, generateId } from '../utils/helpers';
import { logDiagnostic } from '../services/diagnosticsLog';
import { addSpeedingSeconds } from '../services/harshEventCounters';

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
  // Compliance toggle (dashboard footer): mutes the spoken alert only —
  // zone tracking, compliance events and their logging carry on either way.
  const { alertsEnabled } = useAppSelector(s => s.compliance);
  const alertsEnabledRef = useRef(alertsEnabled);
  useEffect(() => { alertsEnabledRef.current = alertsEnabled; }, [alertsEnabled]);
  useEffect(() => { isImperialRef.current = isImperial; }, [isImperial]);

  useEffect(() => {
    // Filled once here rather than at every nextSpeedZoneToAnnounce call —
    // see fillMissingSpeedLimits' own doc comment. A gap in HERE's posted-
    // limit data is now estimated from the last known value instead of
    // going silent.
    const spans = plannedRoute?.speedLimitSpans && fillMissingSpeedLimits(plannedRoute.speedLimitSpans);
    const tripId = activeTrip?.id;
    if (!isTracking || !plannedRoute || !spans || spans.length === 0 || !tripId) return;

    const cumulativeRouteDistances = buildCumulativeRouteDistances(plannedRoute.coordinates);
    let lastAnnouncedSpanStartMeters: number | null = null;
    // See createSpeedZoneAnnouncementMemory — one announcement per zone.
    const announced = createSpeedZoneAnnouncementMemory();
    let lastFixTimestamp: number | null = null;
    let complianceWatch: SpeedZoneComplianceWatch | null = null;
    // Anchors distanceAlongRoute's search window to the previous fix's match
    // instead of the whole route — see turnByTurnLogic.ts and
    // useTurnByTurnGuidance.ts, which use the same pattern.
    let lastMatchedIndex: number | null = null;
    // Same off-route detection useTurnByTurnGuidance.ts already has — this
    // hook was missing it entirely. Real-drive symptom that traces straight
    // back to that gap: deviating from the planned route for ~15 minutes
    // produced no speed-zone announcements at all (distanceAlongRoute kept
    // matching to whatever route vertex happened to be nearest within its
    // narrow search window, however wrong, so "distance traveled" barely
    // moved and no new span was ever crossed) and then, on rejoining far
    // ahead of that stale window, unstable matching flickering across a
    // span boundary caused the same zone to be announced over and over.
    // Muting while off-route and forcing a full-route re-search on
    // reacquiring (lastMatchedIndex = null) fixes both.
    let offRouteStreak = 0;

    const unsubscribe = subscribeGpsFix((speedMs, timestamp, point) => {
      const wasOffRoute = offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD;
      offRouteStreak = isOffRoute(point, plannedRoute.coordinates) ? offRouteStreak + 1 : 0;
      if (wasOffRoute && offRouteStreak === 0) lastMatchedIndex = null;

      const { distanceMeters: distanceTraveledMeters, matchedIndex } = distanceAlongRoute(
        point, plannedRoute.coordinates, cumulativeRouteDistances, lastMatchedIndex,
      );
      lastMatchedIndex = matchedIndex;

      if (offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD) return;

      const announcement = nextSpeedZoneToAnnounce(
        spans, distanceTraveledMeters, lastAnnouncedSpanStartMeters,
        (limit) => announced.isRecentlyAnnounced(limit, timestamp),
      );
      if (announcement) {
        lastAnnouncedSpanStartMeters = announcement.distanceFromStartMeters;
        announced.markAnnounced(announcement.speedLimitMps, timestamp);
        const limitLabel = formatSpeed(announcement.speedLimitMps * 3.6, isImperialRef.current);
        logDiagnostic('Speed-zone announcement.', {
          limit: limitLabel, approaching: announcement.isApproaching, speedKmh: Math.round(speedMs * 3.6),
          mutedByComplianceToggle: !alertsEnabledRef.current,
        });
        // 'high' — must not cut off a 'critical' turn-by-turn instruction,
        // but should still be able to interrupt a lower-priority AI-
        // recommendation announcement (see useVoicePlayback.ts).
        if (alertsEnabledRef.current) {
          speakRef.current(speedZoneAnnouncementText(limitLabel, announcement.isApproaching), 'high');
        }
      }

      // Driver Score "Speeding" minutes — see speedingSecondsForFix.
      if (lastFixTimestamp != null) {
        const over = speedingSecondsForFix(spans, distanceTraveledMeters, speedMs, (timestamp - lastFixTimestamp) / 1000);
        if (over > 0) addSpeedingSeconds(over);
      }
      lastFixTimestamp = timestamp;

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
