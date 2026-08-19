import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useVoicePlayback } from './useVoicePlayback';
import { useIsImperialUnits } from './useIsImperialUnits';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { addTelematicsEvent } from '../store/slices/tripSlice';
import { buildCumulativeRouteDistances, distanceAlongRoute } from '../utils/turnByTurnLogic';
import {
  nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance, currentSpanIndex, type SpeedZoneComplianceWatch,
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
    // Persists across refetches, unlike lastAnnouncedSpanStartMeters (which
    // is only meaningful relative to whichever reference route is currently
    // active). Refetching every ~1.2km/30s while still inside the same
    // real-world zone was re-triggering the announcement every time, since a
    // brand new reference route's span offsets never equal the old route's —
    // real-drive feedback: the same zone announced "at least 15 times" at a
    // merging T-junction. Carrying the actual limit value forward lets a
    // fresh reference route recognize "this is the zone I already announced"
    // even though its offsets are unrelated to the previous route's.
    let lastAnnouncedSpeedLimitMps: number | null = null;
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
          lastMatchedIndex = null;
          distanceAlongReference = 0;
          // The fetch origin is (by construction) the driver's current
          // position, i.e. distance 0 along this new reference — if that
          // position's span carries the same limit already announced under
          // the old reference, mark it pre-announced here too instead of
          // treating it as a fresh zone.
          const originSpanIndex = currentSpanIndex(referenceSpans, 0);
          const originSpan = originSpanIndex >= 0 ? referenceSpans[originSpanIndex] : null;
          lastAnnouncedSpanStartMeters = originSpan?.speedLimitMps === lastAnnouncedSpeedLimitMps
            ? originSpan.distanceFromStartMeters
            : null;
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
        lastAnnouncedSpeedLimitMps = announcement.speedLimitMps;
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
