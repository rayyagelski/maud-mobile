import { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
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
  if (Platform.OS === 'android') {
    // Deep-links straight to the system's DND access/settings screen.
    Linking.sendIntent('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS').catch(() => {
      Linking.openSettings();
    });
  } else {
    // iOS has no public deep link into Focus/Driving mode settings — the
    // app's own Settings page is the closest reachable screen.
    Linking.openSettings();
  }
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
