// Pure, unit-testable "is this really a vehicle trip starting?" decision,
// split out of useTripAutoDetection so the exact rejection rule can be tested
// without a device. Side effects (diagnostics, ref resets) stay in the hook.

// A brisk walk (~3 mph) easily clears the auto-start speed threshold (~1 mph)
// on its own — real-drive feedback: walking away from a parked car with the
// phone in hand repeatedly auto-started a trip after only a few yards.
// BackgroundGeolocation's on-device activity classifier gives us a signal
// speed alone can't, so auto-start is gated on it when it's confident.
export const NON_VEHICLE_ACTIVITIES = new Set(['still', 'walking', 'on_foot', 'running', 'on_bicycle']);

// Below this confidence the classifier itself isn't sure — fall back to
// speed-only behavior rather than block a real drive on a low-confidence
// "walking" guess (e.g. stop-and-go traffic confusing it).
export const MIN_ACTIVITY_CONFIDENCE = 75;

// The classifier is only trusted while its answer is still physically
// possible at the speed GPS is actually measuring. Real-drive log, with the
// phone rigidly mounted in a holder instead of loose on a charger pad:
//
//   Speed qualified but activity rejected as non-vehicle.
//   {"type":"still","confidence":100,"speedKmh":41.112}
//
// "still" at 100% confidence while doing 41 km/h — a rigid mount gives the
// classifier almost no vibration signature, so it can confidently report
// "still" for a whole drive. Because the gate also resets the confirm-window
// state, every qualifying fix got thrown away and auto-start never fired:
// 8 minutes of real driving unrecorded, and a wrong start address, distance,
// consumption and CO2 for the trip that did eventually record.
//
// GPS speed is a direct measurement; the activity type is an inference. Where
// they contradict each other outright, the measurement wins. Caps are
// per-activity rather than one global number so each rejection still covers
// its own plausible range — "still" stays trusted through GPS jitter around a
// parked car (the real 4.1 km/h reading in that same log), and walking/running
// still block a trip starting as someone walks away from the car.
export const ACTIVITY_MAX_PLAUSIBLE_SPEED_KMH: Record<string, number> = {
  still: 10,
  walking: 12,
  on_foot: 12,
  running: 25,
  on_bicycle: 45,
};

export interface ActivitySample {
  type: string;
  confidence: number;
}

export type ActivityGateDecision =
  | { reject: true }
  | { reject: false; contradictedBySpeed: boolean; maxPlausibleKmh?: number };

/**
 * Decides whether a qualifying-speed GPS fix should be rejected because the
 * device thinks the user isn't in a vehicle.
 *
 * `contradictedBySpeed` is true when the classifier said non-vehicle but the
 * measured speed makes that impossible — the caller logs that case rather
 * than silently ignoring it, so a later "it started while I was walking"
 * report stays traceable to this exact override.
 */
export function evaluateActivityGate(
  activity: ActivitySample | null | undefined,
  speedKmh: number,
): ActivityGateDecision {
  if (!activity) return { reject: false, contradictedBySpeed: false };
  if (activity.confidence < MIN_ACTIVITY_CONFIDENCE) {
    return { reject: false, contradictedBySpeed: false };
  }
  if (!NON_VEHICLE_ACTIVITIES.has(activity.type)) {
    return { reject: false, contradictedBySpeed: false };
  }

  const maxPlausibleKmh = ACTIVITY_MAX_PLAUSIBLE_SPEED_KMH[activity.type];
  if (maxPlausibleKmh !== undefined && speedKmh > maxPlausibleKmh) {
    return { reject: false, contradictedBySpeed: true, maxPlausibleKmh };
  }

  return { reject: true };
}
