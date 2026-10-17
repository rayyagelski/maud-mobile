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
    for (const { tripId, script } of tripsToAnnounce(trips, Date.now(), wasSummarySpoken)) {
      markSummarySpoken(tripId);
      speak(script);
    }
    // speak is a fresh closure each render; trips/autoPlay are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, autoPlay]);
}
