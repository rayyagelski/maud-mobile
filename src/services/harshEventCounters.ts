// Standalone module (no Redux/hook dependency) so both useHarshEventTracker
// (writer) and tripSlice's endTrip thunk (reader) can import it without a
// circular dependency between the store and the hooks layer.
export interface HarshEventCounters {
  speedingSeconds: number;
  harshBrakeCount: number;
  harshAccelCount: number;
  harshCornerCount: number;
  phoneTextSeconds: number;
}

function emptyCounters(): HarshEventCounters {
  return {
    speedingSeconds: 0,
    harshBrakeCount: 0,
    harshAccelCount: 0,
    harshCornerCount: 0,
    phoneTextSeconds: 0,
  };
}

let counters = emptyCounters();

export function getHarshEventCounters(): HarshEventCounters {
  return { ...counters };
}

export function resetHarshEventCounters(): void {
  counters = emptyCounters();
}

export function incrementHarshEventCount(
  key: 'harshBrakeCount' | 'harshAccelCount' | 'harshCornerCount',
): void {
  counters[key] += 1;
}

export function addSpeedingSeconds(seconds: number): void {
  counters.speedingSeconds += seconds;
}

export function addPhoneTextSeconds(seconds: number): void {
  counters.phoneTextSeconds += seconds;
}
