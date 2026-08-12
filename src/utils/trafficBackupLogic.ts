// Pure, unit-testable logic for traffic-backup detection + live rerouting.
// Network/GPS side effects live in useTrafficMonitor + hereRoutingClient.
//
// Detection reuses HERE Routing v8's own `typicalDuration` (historical,
// no-traffic baseline) against its always-traffic-aware `duration` — no
// separate Traffic Flow API integration needed, since the app already
// fetches a fresh route from the current position to the trip's destination
// via fetchHereRoutes.

export interface RouteEta {
  durationSeconds: number;
  typicalDurationSeconds?: number;
}

export interface TrafficBackup {
  delaySeconds: number;
}

// A meaningful backup requires both an absolute delay floor and a
// relative-to-typical ratio — a short route running "50% slower" but only 2
// real minutes late isn't worth interrupting the driver for, and a long
// route running just "10% slower" but 20 real minutes late definitely is.
export const TRAFFIC_BACKUP_MIN_DELAY_SECONDS = 5 * 60;
export const TRAFFIC_BACKUP_MIN_DELAY_RATIO = 0.25;

export function detectTrafficBackup(route: RouteEta): TrafficBackup | null {
  if (route.typicalDurationSeconds == null) return null;
  const delaySeconds = route.durationSeconds - route.typicalDurationSeconds;
  if (delaySeconds < TRAFFIC_BACKUP_MIN_DELAY_SECONDS) return null;
  if (delaySeconds < route.typicalDurationSeconds * TRAFFIC_BACKUP_MIN_DELAY_RATIO) return null;
  return { delaySeconds };
}

// Minimum real time saved for an alternative to be worth interrupting the
// driver with a reroute prompt — same "don't nag over noise" reasoning as
// the delay floor above.
export const REROUTE_MIN_IMPROVEMENT_SECONDS = 3 * 60;

// Fastest alternative that beats the current route by enough to matter, or
// null if none does.
export function findBetterAlternative<T extends { durationSeconds: number }>(
  currentDurationSeconds: number,
  alternatives: T[],
): T | null {
  let best: T | null = null;
  for (const alt of alternatives) {
    const improvement = currentDurationSeconds - alt.durationSeconds;
    if (improvement >= REROUTE_MIN_IMPROVEMENT_SECONDS && (!best || alt.durationSeconds < best.durationSeconds)) {
      best = alt;
    }
  }
  return best;
}

// Once the driver dismisses a reroute prompt, don't re-surface one for the
// same backup — only if it has since grown meaningfully worse, not just
// jittered by a few seconds between polling cycles.
export const REROUTE_RENOTIFY_MIN_INCREASE_SECONDS = 2 * 60;

export function shouldRenotify(delaySeconds: number, dismissedDelaySeconds: number): boolean {
  if (dismissedDelaySeconds <= 0) return true;
  return delaySeconds - dismissedDelaySeconds >= REROUTE_RENOTIFY_MIN_INCREASE_SECONDS;
}
