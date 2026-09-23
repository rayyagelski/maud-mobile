import { useEffect } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { getBackgroundRestrictions } from '../services/bluetooth/bluetoothVehicleDetectionModule';
import { logDiagnostic } from '../services/diagnosticsLog';

// After "Not now", don't ask again for this long — the restriction is a
// real functional problem, so it comes back, but not on every app open.
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
const DISMISSED_AT_KEY = 'backgroundNetworkPromptDismissedAt';

/**
 * Checks, once per app launch, whether Android will cut this app off from
 * the network while it runs in the background — and if so, says what that
 * breaks and takes the driver to the setting that fixes it.
 *
 * Why: real-drive server data showed every GPS point from two whole drives
 * arriving at the server in the same second — the second the app was next
 * opened. With the screen off, the OS was holding all of the app's network
 * traffic, which silently disabled everything that needs a live answer
 * mid-drive: speed-zone alerts (HERE), live trip upload, and trip-end
 * scoring (the earlier 9-minute trip-end stall). GPS recording itself kept
 * working, which is why this was invisible until now.
 *
 * Three independent Android switches can do this; each is checked and
 * always logged, so the next Diagnostics log says which one (if any) is on:
 *  - battery optimization not disabled for the app,
 *  - "Restricted" battery mode (isBackgroundRestricted),
 *  - background mobile data blocked (Data Saver, or the app's own
 *    "Allow background data usage" switch).
 *
 * Settings are opened only through the two paths already proven safe in
 * this app: BackgroundGeolocation's own battery-optimization request (used
 * in onboarding) and Linking.openSettings() for the app's info page (where
 * both "Mobile data" and "Battery" live). No OEM-specific intents — see
 * the earlier removal of those after they crashed on some devices.
 */
export function useBackgroundNetworkCheck(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;

    (async () => {
      let ignoringBatteryOptimizations: boolean | null = null;
      try {
        ignoringBatteryOptimizations = await BackgroundGeolocation.deviceSettings.isIgnoringBatteryOptimizations();
      } catch {
        // Unsupported on this device/OS — leave unknown.
      }
      const restrictions = await getBackgroundRestrictions();
      if (cancelled) return;

      const dataBlocked = restrictions.dataSaver === 'enabled';
      const batteryRestricted = restrictions.backgroundRestricted === true;
      const batteryOptimized = ignoringBatteryOptimizations === false;

      logDiagnostic('Background network restrictions.', {
        ignoringBatteryOptimizations,
        dataSaver: restrictions.dataSaver,
        backgroundRestricted: restrictions.backgroundRestricted,
      });

      if (!dataBlocked && !batteryRestricted && !batteryOptimized) return;

      try {
        const dismissedAt = Number(await AsyncStorage.getItem(DISMISSED_AT_KEY));
        if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_MS) return;
      } catch {
        // Can't read the throttle — ask anyway rather than never.
      }
      if (cancelled) return;

      const steps: string[] = [];
      if (dataBlocked) steps.push('• Mobile data → turn ON "Allow background data usage"');
      if (batteryRestricted || batteryOptimized) steps.push('• Battery → choose "Unrestricted"');

      // Battery optimization alone has a dedicated system prompt; anything
      // involving the other two needs the app's info page.
      const useBatteryPrompt = batteryOptimized && !dataBlocked && !batteryRestricted;

      Alert.alert(
        'Allow MAUD Connect to use data in the background',
        'Your phone is blocking MAUD Connect\'s internet access while the screen is off. '
          + 'Trips still record, but speed zone alerts can\'t work and trip data only uploads once you open the app.\n\n'
          + (useBatteryPrompt ? 'Please allow it to run without battery restrictions.' : `In the next screen:\n${steps.join('\n')}`),
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => { AsyncStorage.setItem(DISMISSED_AT_KEY, String(Date.now())).catch(() => {}); },
          },
          {
            text: 'Open Settings',
            onPress: () => {
              logDiagnostic('Background network prompt: opening settings.', { useBatteryPrompt });
              if (useBatteryPrompt) {
                // showIgnoreBatteryOptimizations() only builds a request —
                // show() is what actually opens the screen.
                BackgroundGeolocation.deviceSettings.showIgnoreBatteryOptimizations()
                  .then(request => BackgroundGeolocation.deviceSettings.show(request))
                  .catch(() => { Linking.openSettings().catch(() => {}); });
              } else {
                Linking.openSettings().catch(() => {});
              }
            },
          },
        ],
      );
    })().catch(() => {});

    return () => { cancelled = true; };
  }, []);
}
