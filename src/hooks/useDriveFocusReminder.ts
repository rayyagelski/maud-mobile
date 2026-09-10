import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { useAppSelector } from './useAppSelector';

/**
 * Prompts the driver, once per trip, to turn on their phone's own Do Not
 * Disturb / Driving Focus mode when a trip starts recording.
 *
 * This is a reminder + deep-link, not real call-blocking: neither iOS nor
 * Android exposes an API for a third-party app to silence incoming calls or
 * force-enable the system's focus mode — that's deliberately OS-gatekept
 * (Apple restricts it to CarPlay/user-configured Focus filters; Android would
 * require a new native module requesting ACCESS_NOTIFICATION_POLICY, and even
 * that only affects notification interruption, not the phone ringer). Opening
 * the relevant settings screen for the user to flip themselves is the
 * honest, buildable version of this feature without adding native code.
 */
function openFocusSettings() {
  // Used to attempt Linking.sendIntent('android.settings.
  // NOTIFICATION_POLICY_ACCESS_SETTINGS') first, for a more precise deep
  // link straight to DND settings, with openSettings() as a fallback. Real
  // -drive feedback showed that intent action crashing the whole app
  // (reported twice, identical crash both times) even after wrapping it in
  // try/catch for its known synchronous-throw failure mode — rather than
  // keep chasing every possible way an OEM-variable native intent can fail,
  // removed it entirely. Linking.openSettings() (plain app-settings page,
  // same call already used as the safe fallback everywhere else in this
  // app) is a core, universally-supported RN API with no such risk — worth
  // landing one screen short of the ideal destination in exchange for
  // certainty this can't crash the app again.
  Linking.openSettings().catch(() => {});
}

export function useDriveFocusReminder(): void {
  const isTracking = useAppSelector(s => s.trips.isTracking);
  const enabled = useAppSelector(s => s.settings.driveFocusReminderEnabled);
  const wasTrackingRef = useRef(isTracking);

  useEffect(() => {
    if (enabled && isTracking && !wasTrackingRef.current) {
      Alert.alert(
        'Stay focused on the road',
        "For your safety, consider turning on Do Not Disturb or Driving Focus mode for this trip.",
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openFocusSettings },
        ],
      );
    }
    wasTrackingRef.current = isTracking;
  }, [isTracking, enabled]);
}
