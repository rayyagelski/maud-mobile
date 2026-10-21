import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import {
  startJsTimersKeepAlive, stopJsTimersKeepAlive, subscribeScreenInteractive,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';
import { logDiagnostic } from '../services/diagnosticsLog';

// Kept on this long after a trip ends: the trip's upload, scoring and the
// spoken result all happen after recording stops (about 25 s on real drives).
export const KEEP_TIMERS_AFTER_TRIP_MS = 5 * 60 * 1000;

interface KeepAliveDeps {
  start: () => Promise<boolean>;
  stop: () => void;
  onStarted?: (ok: boolean) => void;
  graceMs?: number;
}

// On while a trip records, off KEEP_TIMERS_AFTER_TRIP_MS after it ends (a
// new trip in that window just keeps it on). The off-timer is itself a JS
// timer, which runs because the keep-alive is still on at that point.
export function createTimerKeepAlive({ start, stop, onStarted, graceMs = KEEP_TIMERS_AFTER_TRIP_MS }: KeepAliveDeps) {
  let active = false;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelStop = () => {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
  };
  return {
    setTracking(tracking: boolean) {
      if (tracking) {
        cancelStop();
        if (active) return;
        active = true;
        start().then(ok => onStarted?.(ok), () => onStarted?.(false));
      } else if (active && !stopTimer) {
        stopTimer = setTimeout(() => {
          stopTimer = null;
          active = false;
          stop();
        }, graceMs);
      }
    },
    dispose() {
      cancelStop();
      if (active) stop();
      active = false;
    },
    isActive: () => active,
  };
}

const TIMER_CHECK_EVERY_MS = 60 * 1000;

/**
 * Keeps the app's JavaScript timers running with the phone locked, for each
 * trip plus a few minutes after it. Without this React Native freezes every
 * JS timer while the screen is off — and fetch() delivers its responses
 * through a timer — so with a locked phone the speed-zone data and the trip
 * result only reached the app when it was unlocked. Event-driven messages
 * (Bluetooth, "Trip recording started") never needed timers, which is why
 * those still worked. See startJsTimersKeepAlive (native module).
 */
export function useKeepTimersRunningDuringTrips(): void {
  const isTracking = useAppSelector(s => s.trips.isTracking);
  const controllerRef = useRef<ReturnType<typeof createTimerKeepAlive> | null>(null);

  useEffect(() => {
    const controller = createTimerKeepAlive({
      start: startJsTimersKeepAlive,
      stop: () => {
        stopJsTimersKeepAlive();
        logDiagnostic('Background timers released (trip over).', {});
      },
      onStarted: ok => logDiagnostic('Background timers kept running for the trip.', { ok }),
    });
    controllerRef.current = controller;

    // Proof from the next drive that it works: one line per trip saying
    // timers ran on time while the screen was off. Its absence on a locked
    // drive (with speed zones stalling again) would mean it didn't.
    let screenOn = true;
    const unsubscribeScreen = subscribeScreenInteractive((interactive) => { screenOn = interactive; });
    let confirmedThisTrip = false;
    let lastTickAt = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const lateMs = now - lastTickAt - TIMER_CHECK_EVERY_MS;
      lastTickAt = now;
      if (!controller.isActive()) {
        confirmedThisTrip = false;
        return;
      }
      if (!screenOn && !confirmedThisTrip) {
        confirmedThisTrip = true;
        logDiagnostic('JS timers running with the screen off.', { lateMs });
      }
    }, TIMER_CHECK_EVERY_MS);

    return () => {
      clearInterval(interval);
      unsubscribeScreen();
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setTracking(isTracking);
  }, [isTracking]);
}
