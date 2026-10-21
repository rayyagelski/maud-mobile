import { useEffect } from 'react';
import { useAppSelector } from './useAppSelector';
import { useVoicePlayback } from './useVoicePlayback';
import { markSummarySpoken, wasSummarySpoken } from '../services/tripSummaryVoice';

// Only trips that just ended: trip-history sync and score backfill also add
// results to older trips, which must never be read out.
export const RESULT_ANNOUNCE_WINDOW_MS = 15 * 60 * 1000;

interface AnnounceableTrip {
  id: string;
  endTime?: number;
  reward?: { voicePayload?: { script?: string } };
}

// The just-ended trips whose summary hasn't been spoken yet.
export function tripsToAnnounce<T extends AnnounceableTrip>(
  trips: T[], now: number, alreadySpoken: (tripId: string) => boolean,
): Array<{ tripId: string; script: string }> {
  const out: Array<{ tripId: string; script: string }> = [];
  for (const trip of trips) {
    const script = trip.reward?.voicePayload?.script;
    if (!script || trip.endTime == null || alreadySpoken(trip.id)) continue;
    if (now - trip.endTime > RESULT_ANNOUNCE_WINDOW_MS) continue;
    out.push({ tripId: trip.id, script });
  }
  return out;
}

// When several results are waiting at once (they piled up while the app
// couldn't receive them), only the newest trip is read out — the rest are
// marked as heard. Reading them all queued 20+ s summaries behind each other
// (real drive: the second one was dropped anyway) and replayed old trips.
export function pickAnnouncement<T extends AnnounceableTrip>(
  trips: T[], now: number, alreadySpoken: (tripId: string) => boolean,
): { speak: { tripId: string; script: string } | null; markOnly: string[] } {
  const pending = tripsToAnnounce(trips, now, alreadySpoken);
  if (pending.length === 0) return { speak: null, markOnly: [] };
  const endTimeOf = (tripId: string) => trips.find(t => t.id === tripId)?.endTime ?? 0;
  const newest = pending.reduce((a, b) => (endTimeOf(b.tripId) > endTimeOf(a.tripId) ? b : a));
  return { speak: newest, markOnly: pending.filter(p => p !== newest).map(p => p.tripId) };
}

/**
 * Speaks a trip's results the moment they arrive, whether or not the phone's
 * screen is on. They used to be spoken only by the Trip Summary screen when
 * it opened — with the phone asleep at the end of a drive, that was whenever
 * the driver next woke the phone. Mounted app-wide (AppNavigator), like the
 * "Trip recording started" announcement, so it runs in the background too.
 * Respects Settings > Voice > "Auto-play trip summary".
 */
export function useTripResultAnnouncement(): void {
  const trips = useAppSelector(s => s.trips.trips);
  const autoPlay = useAppSelector(s => s.settings.autoPlayTripSummaryVoice);
  const { speak } = useVoicePlayback();

  useEffect(() => {
    if (!autoPlay) return;
    const { speak: next, markOnly } = pickAnnouncement(trips, Date.now(), wasSummarySpoken);
    markOnly.forEach(markSummarySpoken);
    if (next) {
      markSummarySpoken(next.tripId);
      speak(next.script);
    }
    // speak is a fresh closure each render; trips/autoPlay are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, autoPlay]);
}
