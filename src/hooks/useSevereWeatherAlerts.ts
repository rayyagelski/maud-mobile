import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useVoicePlayback } from './useVoicePlayback';
import { subscribeGpsFix } from '../services/gpsSpeedBus';
import { getSevereAlerts, getHeavyRainAlert } from '../services/weather/hereWeatherClient';
import { shouldRefreshCache, type Coordinate } from '../utils/complianceAlertLogic';
import { alertSignature, pickNewAlert } from '../utils/weatherAlertLogic';
import { WEATHER_ALERT_REFRESH_DISTANCE_KM } from '../utils/constants';

/**
 * Severe weather voice alerts — spoken during any active, tracked trip
 * (Route Planner or auto-detect), sourced from HERE's Destination Weather
 * `alerts` product. Reuses the same GPS-fix stream useComplianceMonitor
 * subscribes to (gpsSpeedBus) rather than opening a second location
 * subscription. Voice-only: no Redux state, no UI — the seen-alert set
 * lives for the duration of one mount (i.e. one trip).
 */
export function useSevereWeatherAlerts(): void {
  const { isTracking } = useAppSelector(s => s.trips);
  const { speak } = useVoicePlayback();
  // speak() is a fresh closure every render (not memoized by useVoicePlayback) —
  // routed through a ref so the data-fetching effect below doesn't tear down
  // and reset its seen-alerts/query-cache state on every unrelated re-render.
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  useEffect(() => {
    if (!isTracking) return;

    let alerts: Awaited<ReturnType<typeof getSevereAlerts>> = [];
    let lastQueryPoint: Coordinate | null = null;
    let isFetching = false;
    const seen = new Set<string>();

    const unsubscribe = subscribeGpsFix((_speedMs, _timestamp, point) => {
      const position: Coordinate = { latitude: point.latitude, longitude: point.longitude };

      if (!isFetching && shouldRefreshCache(lastQueryPoint, position, WEATHER_ALERT_REFRESH_DISTANCE_KM)) {
        isFetching = true;
        lastQueryPoint = position;
        // Official alerts (storm/flood warnings) and a heavy-rain observation
        // check are independent trigger sources — real-drive testing found
        // the feature silent during genuinely heavy rain because no official
        // alert existed for that rain, only the (much rarer) severe-weather
        // advisory case was ever covered. Each settles independently so one
        // failing doesn't wipe out a successful result from the other; on a
        // total failure, keep the stale cache rather than clearing alerts.
        Promise.allSettled([getSevereAlerts(position), getHeavyRainAlert(position)])
          .then(([officialResult, heavyRainResult]) => {
            if (officialResult.status === 'rejected' && heavyRainResult.status === 'rejected') {
              return;
            }
            const officialAlerts = officialResult.status === 'fulfilled' ? officialResult.value : [];
            const heavyRain = heavyRainResult.status === 'fulfilled' ? heavyRainResult.value : null;
            alerts = heavyRain ? [...officialAlerts, heavyRain] : officialAlerts;
          })
          .finally(() => {
            isFetching = false;
          });
      }

      const alert = pickNewAlert(alerts, seen);
      if (alert) {
        seen.add(alertSignature(alert));
        speakRef.current(`Weather alert: ${alert.description}`);
      }
    });

    return unsubscribe;
  }, [isTracking]);
}
