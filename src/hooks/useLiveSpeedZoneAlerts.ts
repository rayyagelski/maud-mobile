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
import { fetchSpeedLimitAheadRoute, type LatLng, type SpeedLimitSpan } from '../services/here/hereRoutingClient';
import { formatSpeed, generateId } from '../utils/helpers';
import {
  LIVE_SPEED_ZONE_AHEAD_METERS, LIVE_SPEED_ZONE_REFETCH_DISTANCE_METERS,
  LIVE_SPEED_ZONE_MIN_REFETCH_INTERVAL_MS, LIVE_SPEED_ZONE_MIN_SPEED_MS,
} from '../utils/constants';

/**
 * Same voice speed-zone warnings as useSpeedZoneAlerts, but for
 * auto-detected trips — those have no plannedRoute (no real destination
 * exists to fetch speedLimitSpans against), so the warning only ever fired
 * for Route-Planner-started trips, "meaningless for regular trips" per
 * real-drive feedback. With no fixed route to project GPS fixes onto,
 * periodically fetches a short synthetic "route ahead" from HERE (continuing
 * straight from current position/heading, see fetchSpeedLimitAheadRoute)
 * purely to read its speedLimitSpans, then re-anchors the same
 * distanceAlongRoute/nextSpeedZoneToAnnounce logic useSpeedZoneAlerts already
 * uses against that short-lived reference instead of a real planned route.
 */
export function useLiveSpeedZoneAlerts(): void {
  const dispatch = useAppDispatch();
  const { isTracking, activeTrip } = useAppSelector(s => s.trips);
  const plannedRoute = activeTrip?.plannedRoute;
  const isImperial = useIsImperialUnits();
  const { speak } = useVoicePlayback();
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const isImperialRef = useRef(isImperial);
  useEffect(() => { isImperialRef.current = isImperial; }, [isImperial]);

  useEffect(() => {
    const tripId = activeTrip?.id;
    // Only for trips with no real planned route — useSpeedZoneAlerts already
    // covers Route-Planner trips against their actual route, more accurately
    // than this synthetic-ahead approximation could.
    if (!isTracking || plannedRoute || !tripId) return;

    let referenceCoords: LatLng[] | null = null;
    let referenceSpans: SpeedLimitSpan[] | null = null;
    let cumulativeRouteDistances: number[] = [];
    let lastAnnouncedSpanStartMeters: number | null = null;
    let complianceWatch: SpeedZoneComplianceWatch | null = null;
    let lastMatchedIndex: number | null = null;
    let lastFetchAt = 0;
    let fetching = false;
    let distanceAlongReference = 0;

    async function refetch(origin: LatLng, headingDegrees: number) {
      if (fetching) return;
      fetching = true;
      lastFetchAt = Date.now();
      try {
        const route = await fetchSpeedLimitAheadRoute(origin, headingDegrees, LIVE_SPEED_ZONE_AHEAD_METERS);
        if (route && route.speedLimitSpans.length > 0) {
          referenceCoords = route.coordinates;
          referenceSpans = route.speedLimitSpans;
          cumulativeRouteDistances = buildCumulativeRouteDistances(route.coordinates);
          lastAnnouncedSpanStartMeters = null;
          lastMatchedIndex = null;
          distanceAlongReference = 0;
        }
      } catch {
        // Best-effort — just try again once the next qualifying fix arrives.
      } finally {
        fetching = false;
      }
    }

    const unsubscribe = subscribeGpsFix((speedMs, timestamp, point) => {
      if (speedMs < LIVE_SPEED_ZONE_MIN_SPEED_MS) return;

      const needsRefetch = !referenceSpans || distanceAlongReference >= LIVE_SPEED_ZONE_REFETCH_DISTANCE_METERS;
      if (
        needsRefetch && point.heading != null
        && Date.now() - lastFetchAt >= LIVE_SPEED_ZONE_MIN_REFETCH_INTERVAL_MS
      ) {
        refetch({ latitude: point.latitude, longitude: point.longitude }, point.heading);
      }

      if (!referenceSpans || !referenceCoords) return;

      const { distanceMeters: distanceTraveledMeters, matchedIndex } = distanceAlongRoute(
        point, referenceCoords, cumulativeRouteDistances, lastMatchedIndex,
      );
      distanceAlongReference = distanceTraveledMeters;
      lastMatchedIndex = matchedIndex;

      const announcement = nextSpeedZoneToAnnounce(referenceSpans, distanceTraveledMeters, lastAnnouncedSpanStartMeters);
      if (announcement) {
        lastAnnouncedSpanStartMeters = announcement.distanceFromStartMeters;
        const limitLabel = formatSpeed(announcement.speedLimitMps * 3.6, isImperialRef.current);
        speakRef.current(
          announcement.isApproaching
            ? `You are approaching a ${limitLabel} speed zone. Please adjust your speed.`
            : `You are now in a ${limitLabel} speed zone. Please reduce your speed.`,
        );
      }

      // Same compliance-tracking TelematicsEvent useSpeedZoneAlerts records —
      // not sent to VGD (no per-point parameter for it), visible in trip
      // detail via trip.events like the Route-Planner case.
      const advanced = advanceSpeedZoneCompliance(complianceWatch, referenceSpans, distanceTraveledMeters, speedMs, timestamp);
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
