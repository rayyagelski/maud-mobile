import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';
import { useVoicePlayback } from './useVoicePlayback';

/**
 * Speaks a short confirmation the moment trip recording actually begins
 * (isTracking false -> true), regardless of whether the trip was started
 * automatically (motion detected) or from an armed Route Planner start —
 * both paths flow through the same isTracking flag, so watching it here
 * covers every start path in one place instead of duplicating the speak()
 * call at each dispatch(startTrip(...)) call site.
 */
export function useTripStartAnnouncement(): void {
  const isTracking = useAppSelector(s => s.trips.isTracking);
  const { speak } = useVoicePlayback();
  const wasTrackingRef = useRef(isTracking);

  useEffect(() => {
    if (isTracking && !wasTrackingRef.current) {
      speak('Trip recording started.');
    }
    wasTrackingRef.current = isTracking;
  }, [isTracking, speak]);
}
