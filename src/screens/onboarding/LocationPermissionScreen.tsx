import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { request, check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import BackgroundGeolocation from 'react-native-background-geolocation';
import LocationPinIcon from '../../components/common/LocationPinIcon';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setLocationOnboardingComplete } from '../../store/slices/settingsSlice';

export default function LocationPermissionScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const [isRequesting, setIsRequesting] = useState(false);

  // Android needs a beat to hand focus back to this Activity after the OS
  // permission dialog dismisses — an Alert.alert() fired in that same tick
  // can silently fail to render, leaving nothing for the user to tap and
  // the awaiting promise (and isRequesting) stuck forever.
  function waitForActivityFocus() {
    return new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(resolve, 350);
      });
    });
  }

  // Background location must be requested as a separate, later step on both
  // platforms — the OS won't grant it alongside the initial foreground
  // request. Shown only after foreground access is actually granted, since
  // neither platform allows requesting background permission first. A
  // failure/denial here is non-fatal: trips just fall back to foreground-only
  // tracking (the original, more limited behavior) rather than blocking the app.
  async function requestBackgroundLocation() {
    const permission = Platform.OS === 'ios'
      ? PERMISSIONS.IOS.LOCATION_ALWAYS
      : PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION;

    await waitForActivityFocus();

    await new Promise<void>((resolve) => {
      Alert.alert(
        'Track Trips in the Background',
        'To keep recording your trip while your phone is locked or in your pocket, MAUD Connect needs "Allow all the time" location access. Without this, trips will only be tracked while the app is open on screen.',
        [{ text: 'Continue', onPress: () => resolve() }],
      );
    });

    try {
      await request(permission);
    } catch {
      // Denied/unavailable — fall back to foreground-only tracking, not fatal.
    }
  }

  // Android-only: OS-level background location permission alone isn't enough
  // to keep the app running for a full drive — many OEMs (Samsung, Xiaomi,
  // Huawei, OnePlus, etc.) apply their own aggressive battery-management
  // policies that kill the whole process anyway, requiring the user to
  // manually relaunch mid-trip ("app not always on" real-drive feedback).
  // BackgroundGeolocation's own deviceSettings API requests the standard
  // Android "ignore battery optimizations" exemption for this app — the same
  // fix the SDK's own docs recommend for exactly this symptom. Fail-soft:
  // never blocks onboarding if the device/OS doesn't support it.
  async function requestBatteryOptimizationExemption() {
    if (Platform.OS !== 'android') return;
    try {
      const alreadyExempt = await BackgroundGeolocation.deviceSettings.isIgnoringBatteryOptimizations();
      if (alreadyExempt) return;

      await waitForActivityFocus();

      await new Promise<void>((resolve) => {
        Alert.alert(
          'Keep Trip Tracking Running',
          'Some phones stop apps running in the background to save battery, which can cut a trip recording short. Allow MAUD Connect to run without battery restrictions to keep tracking reliable for your whole drive.',
          [{ text: 'Continue', onPress: () => resolve() }],
        );
      });

      await BackgroundGeolocation.deviceSettings.showIgnoreBatteryOptimizations();
    } catch {
      // Not supported on this device/OS version — fall back to default behavior.
    }
  }

  // Android 12+ (API 31+) treats BLUETOOTH_CONNECT as a runtime permission —
  // real feedback: the bare OS dialog ("Allow MAUDConnect to find, connect
  // to, and determine the relative position of nearby devices?") showed up
  // with no context, right after login, and read as unrelated/suspicious to
  // users who had no idea it meant "detect your car's Bluetooth." Explains
  // the actual reason first, same pattern as the background-location and
  // battery-optimization steps above.
  async function requestBluetoothPermission() {
    if (Platform.OS !== 'android' || Platform.Version < 31) return;
    try {
      const current = await check(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
      if (current === RESULTS.GRANTED) return;

      await waitForActivityFocus();

      await new Promise<void>((resolve) => {
        Alert.alert(
          'Connect to Your Car Automatically',
          "MAUD Connect uses Bluetooth to detect the moment your phone connects to your car's audio system, so trip recording can start automatically when you drive — you won't need to open the app or tap anything.",
          [{ text: 'Continue', onPress: () => resolve() }],
        );
      });

      await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
    } catch {
      // Denied/unavailable — automatic Bluetooth-based trip start just won't
      // be available; not fatal to onboarding.
    }
  }

  // Android's own "physical activity" permission (ACTIVITY_RECOGNITION) is
  // requested internally by react-native-background-geolocation the first
  // time it starts (see useTripAutoDetection.ts) — this app never calls
  // request() for it directly, so there's no request() call to precede here
  // the way there is for location/Bluetooth above. Real feedback: users saw
  // "Allow MAUDConnect to access your physical activity?" with zero context
  // and assumed it meant fitness/step-tracking, asking "why does a driving
  // app need this, are we running?" This is purely informational — it can't
  // suppress or delay the SDK's own dialog, only explain it in advance so
  // it isn't a surprise when it appears shortly after onboarding finishes.
  async function explainActivityRecognition() {
    if (Platform.OS !== 'android') return;
    await waitForActivityFocus();
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Telling Driving Apart from Walking',
        "Android will also ask to let MAUD Connect check your phone's activity type. This isn't fitness tracking — it's what lets automatic trip detection tell a real drive apart from walking or cycling, so it doesn't start or stop recording at the wrong time.",
        [{ text: 'Continue', onPress: () => resolve() }],
      );
    });
  }

  async function handleAllow() {
    setIsRequesting(true);
    try {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

      // Check first — if location services are off the OS returns UNAVAILABLE
      const current = await check(permission);
      if (current === RESULTS.UNAVAILABLE) {
        // Not done yet — TurnOnLocationScreen marks onboarding complete once
        // the user actually proceeds from there.
        navigation.replace('TurnOnLocation');
        return;
      }

      const result = await request(permission);

      if (result === RESULTS.BLOCKED) {
        // Permanently denied — send to settings; same as above, not complete yet.
        navigation.replace('TurnOnLocation');
        return;
      }

      if (result === RESULTS.GRANTED) {
        await requestBackgroundLocation();
        await requestBatteryOptimizationExemption();
        await requestBluetoothPermission();
        await explainActivityRecognition();
      }
    } catch {
      // Permission request failed — continue to app
    } finally {
      setIsRequesting(false);
      // Only replace if still on this screen (not already navigated above —
      // that replace() throws here, which we rely on to skip marking
      // onboarding complete: the user is still on TurnOnLocationScreen at
      // this point, not actually done yet).
      try {
        navigation.replace('MainTabs');
        dispatch(setLocationOnboardingComplete(true));
      } catch {}
    }
  }

  function handleSkip() {
    dispatch(setLocationOnboardingComplete(true));
    navigation.replace('MainTabs');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconBadge}>
          <LocationPinIcon size={32} color="#3ECFBF" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Enable Location Access</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          MAUD needs access to your location to provide accurate trip tracking, eco-scoring, and nearby services.
        </Text>

        {/* Buttons */}
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={[styles.allowBtn, isRequesting && styles.btnDisabled]}
            onPress={handleAllow}
            disabled={isRequesting}
            activeOpacity={0.85}
          >
            <Text style={styles.allowBtnText}>
              {isRequesting ? 'Requesting…' : 'Allow Location Access'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E6F9F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 44,
  },
  btnGroup: {
    alignSelf: 'stretch',
    gap: 12,
  },
  allowBtn: {
    backgroundColor: '#3ECFBF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3ECFBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  allowBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
});
