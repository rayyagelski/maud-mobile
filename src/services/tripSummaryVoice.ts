// Trips whose spoken summary was already auto-played this app session —
// shared by the app-wide trip-end announcement (useTripResultAnnouncement)
// and the Trip Summary screen, so a summary is spoken once, whichever of the
// two gets to it first.
const spokenTripIds = new Set<string>();

export function wasSummarySpoken(tripId: string): boolean {
  return spokenTripIds.has(tripId);
}

export function markSummarySpoken(tripId: string): void {
  spokenTripIds.add(tripId);
}
