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
  nextSpeedZoneToAnnounce, advanceSpeedZoneCompliance, currentSpanIndex, fillMissingSpeedLimits,
  createSpeedZoneAnnouncementMemory, speedingSecondsForFix, speedZoneAnnouncementText,
  type SpeedZoneComplianceWatch,
} from '../utils/speedZoneAlertLogic';
import { fetchSpeedLimitAheadRoute, type LatLng, type SpeedLimitSpan } from '../services/here/hereRoutingClient';
import { formatSpeed, generateId } from '../utils/helpers';
import { logDiagnostic } from '../services/diagnosticsLog';
import { addSpeedingSeconds } from '../services/harshEventCounters';
import {
  LIVE_SPEED_ZONE_AHEAD_METERS, LIVE_SPEED_ZONE_REFETCH_DISTANCE_METERS,
  LIVE_SPEED_ZONE_MIN_REFETCH_INTERVAL_MS, LIVE_SPEED_ZONE_MIN_SPEED_MS, LIVE_SPEED_ZONE_FETCH_STALL_MS,
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
  // Compliance toggle (dashboard footer) — see useSpeedZoneAlerts.
  const { alertsEnabled } = useAppSelector(s => s.compliance);
  const alertsEnabledRef = useRef(alertsEnabled);
  useEffect(() => { alertsEnabledRef.current = alertsEnabled; }, [alertsEnabled]);
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
    // See createSpeedZoneAnnouncementMemory — one announcement per zone.
    const announced = createSpeedZoneAnnouncementMemory();
    let lastFixTimestamp: number | null = null;
    let complianceWatch: SpeedZoneComplianceWatch | null = null;
    let lastMatchedIndex: number | null = null;
    let lastFetchAt = 0;
    let fetching = false;
    // In-flight request bookkeeping for the timer-free stall guard in the
    // fix handler — see LIVE_SPEED_ZONE_FETCH_STALL_MS there.
    let fetchStartedAt = 0;
    let fetchGeneration = 0;
    // The in-flight request, so an abandoned one can actually be cancelled.
    let inFlight: AbortController | null = null;
    let distanceAlongReference = 0;
    // Same off-route detection useSpeedZoneAlerts.ts needed — the reference
    // route here is a real HERE-routed path, but only ever toward a
    // synthetic "straight ahead from where we last fetched" destination
    // (see fetchSpeedLimitAheadRoute), not the road the driver actually
    // takes. Turning at an intersection the straight-line extrapolation
    // didn't anticipate leaves the old reference describing a road no
    // longer being driven until the next refetch — muting voice/compliance
    // during that gap (and forcing an early refetch, not just waiting for
    // the usual distance/time trigger) avoids the same "stale window ->
    // wrong or repeated announcement" failure mode as the Route-Planner
    // case, just self-correcting faster since this hook already refetches
    // periodically regardless.
    let offRouteStreak = 0;

    // 'off-route' | 'distance' | 'initial' — logged alongside the fetch
    // result so a real drive's Diagnostics log can actually tell which of
    // the two refetch triggers fired, rather than just "a refetch happened".
    async function refetch(origin: LatLng, headingDegrees: number, reason: 'off-route' | 'distance' | 'initial') {
      if (fetching) return;
      fetching = true;
      fetchStartedAt = Date.now();
      lastFetchAt = fetchStartedAt;
      const generation = ++fetchGeneration;
      if (reason === 'initial') {
        // Dates the request itself, so a log can tell "asked at trip start,
        // answered 16 minutes later" (a stalled connection) apart from
        // "not asked until 16 minutes in" (a gate). Only the first one —
        // the rest are frequent enough that the result line suffices.
        logDiagnostic('Speed-zone reference route requested.', { reason });
      }
      const controller = new AbortController();
      inFlight = controller;
      try {
        const route = await fetchSpeedLimitAheadRoute(
          origin, headingDegrees, LIVE_SPEED_ZONE_AHEAD_METERS, controller.signal,
        );
        if (generation !== fetchGeneration) {
          // Abandoned by the fix handler below while this was hanging —
          // a newer request owns the reference now (or is about to).
          logDiagnostic('Speed-zone reference route: stale response discarded.', {
            reason, ageSeconds: Math.round((Date.now() - fetchStartedAt) / 1000),
          });
          return;
        }
        if (route && route.speedLimitSpans.length > 0) {
          referenceCoords = route.coordinates;
          // Logged from the RAW spans, before filling — logging the filled
          // result here would silently hide whether HERE actually had any
          // gaps to begin with, which is the one thing this log exists to
          // answer. null in limitsKmh below means HERE genuinely returned no
          // value for that span.
          const rawNullCount = route.speedLimitSpans.filter(s => s.speedLimitMps == null).length;
          // See fillMissingSpeedLimits' own doc comment — a gap in HERE's
          // posted-limit data (common on minor/residential roads) is now
          // estimated from the last known value instead of going silent.
          referenceSpans = fillMissingSpeedLimits(route.speedLimitSpans);
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
          // Diagnostic — the only way to tell "no alerts because HERE had no
          // speed-limit data for these roads" apart from "no alerts because
          // this never ran" apart from "HERE had gaps and we estimated
          // through them" from a real-drive report.
          logDiagnostic('Speed-zone reference route fetched.', {
            reason,
            spans: route.speedLimitSpans.length,
            spansMissingData: rawNullCount,
            limitsKmh: Array.from(new Set(
              route.speedLimitSpans.map(s => (s.speedLimitMps == null ? null : Math.round(s.speedLimitMps * 3.6))),
            )),
          });
        } else {
          logDiagnostic('Speed-zone reference route had no speed-limit data — nothing to announce here.', {
            reason,
            hadRoute: route != null,
          });
        }
      } catch (err) {
        // Best-effort — just try again once the next qualifying fix arrives.
        // A request cancelled on purpose (abandoned as stalled, or the trip
        // ended) was already logged by whoever cancelled it.
        if (!controller.signal.aborted) {
          logDiagnostic('Speed-zone reference route fetch failed.', {
            reason,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (inFlight === controller) inFlight = null;
        // A stale request must not clear the flag a newer one owns.
        if (generation === fetchGeneration) fetching = false;
      }
    }

    const unsubscribe = subscribeGpsFix((speedMs, timestamp, point) => {
      if (speedMs < LIVE_SPEED_ZONE_MIN_SPEED_MS) return;

      // Stall guard, clocked by GPS fixes rather than a JS timer: with the
      // screen off Android throttles timers, and hereRoutingClient's own
      // AbortController timeout demonstrably never fired on a real drive —
      // the "initial" request issued at trip start resolved 16 minutes
      // later, and since one request in flight blocks all others, the
      // entire drive went without speed-limit data. Fixes keep arriving
      // every second while driving, so this check always runs on time.
      if (fetching && Date.now() - fetchStartedAt > LIVE_SPEED_ZONE_FETCH_STALL_MS) {
        logDiagnostic('Speed-zone reference route request stalled — abandoning it.', {
          ageSeconds: Math.round((Date.now() - fetchStartedAt) / 1000),
        });
        inFlight?.abort();
        inFlight = null;
        fetchGeneration++;
        fetching = false;
        // Let the refetch below go straight through rather than waiting
        // out the rate floor again on top of the stall.
        lastFetchAt = 0;
      }

      const wasOffRoute = offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD;
      const offRoute = referenceCoords ? isOffRoute(point, referenceCoords) : false;
      offRouteStreak = offRoute ? offRouteStreak + 1 : 0;

      // Off-route is a LEVEL here, not the single-tick edge it used to be
      // (`offRouteStreak === threshold`). Real-drive log: one turn off the
      // reference at 9:52, and the next refetch of any kind came at 10:26 —
      // the edge tick fell inside the 15s rate floor, was skipped, and the
      // streak never equalled the threshold again; meanwhile distance along
      // the (wrong) reference stops advancing while off-route, so the
      // distance trigger could never fire either. 33 minutes of driving
      // with no speed-limit data. Wanting a refetch for as long as we're
      // off-route (still rate-limited by the floor) can't get stuck.
      const refetchReason: 'off-route' | 'distance' | 'initial' | null = offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD
        ? 'off-route'
        : !referenceSpans
          ? 'initial'
          : distanceAlongReference >= LIVE_SPEED_ZONE_REFETCH_DISTANCE_METERS
            ? 'distance'
            : null;
      if (
        refetchReason && point.heading != null
        && Date.now() - lastFetchAt >= LIVE_SPEED_ZONE_MIN_REFETCH_INTERVAL_MS
      ) {
        refetch({ latitude: point.latitude, longitude: point.longitude }, point.heading, refetchReason);
      }

      if (wasOffRoute && offRouteStreak === 0) lastMatchedIndex = null;

      if (!referenceSpans || !referenceCoords) return;
      if (offRouteStreak >= OFF_ROUTE_STREAK_THRESHOLD) return;

      const { distanceMeters: distanceTraveledMeters, matchedIndex } = distanceAlongRoute(
        point, referenceCoords, cumulativeRouteDistances, lastMatchedIndex,
      );
      distanceAlongReference = distanceTraveledMeters;
      lastMatchedIndex = matchedIndex;

      const announcement = nextSpeedZoneToAnnounce(
        referenceSpans, distanceTraveledMeters, lastAnnouncedSpanStartMeters,
        (limit) => announced.isRecentlyAnnounced(limit, timestamp),
      );
      if (announcement) {
        lastAnnouncedSpanStartMeters = announcement.distanceFromStartMeters;
        lastAnnouncedSpeedLimitMps = announcement.speedLimitMps;
        announced.markAnnounced(announcement.speedLimitMps, timestamp);
        const limitLabel = formatSpeed(announcement.speedLimitMps * 3.6, isImperialRef.current);
        logDiagnostic('Speed-zone announcement.', {
          limit: limitLabel,
          approaching: announcement.isApproaching,
          speedKmh: Math.round(speedMs * 3.6),
          mutedByComplianceToggle: !alertsEnabledRef.current,
        });
        // 'high' — same reasoning as useSpeedZoneAlerts.ts (see
        // useVoicePlayback.ts).
        if (alertsEnabledRef.current) {
          speakRef.current(speedZoneAnnouncementText(limitLabel, announcement.isApproaching), 'high');
        }
      }

      // Driver Score "Speeding" minutes — see speedingSecondsForFix.
      if (lastFixTimestamp != null) {
        const over = speedingSecondsForFix(
          referenceSpans, distanceTraveledMeters, speedMs, (timestamp - lastFixTimestamp) / 1000,
        );
        if (over > 0) addSpeedingSeconds(over);
      }
      lastFixTimestamp = timestamp;

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

    return () => {
      unsubscribe();
      // Trip ended — don't leave a request queued behind a blocked network.
      inFlight?.abort();
      inFlight = null;
      fetchGeneration++;
    };
  }, [isTracking, plannedRoute, activeTrip?.id, dispatch]);
}
