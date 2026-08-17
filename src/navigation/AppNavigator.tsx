import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { check, PERMISSIONS, RESULTS, type PermissionStatus } from 'react-native-permissions';
import { Platform } from 'react-native';
import AuthNavigator from './AuthNavigator';
import MainStackNavigator from './MainStackNavigator';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useTripAutoDetection } from '../hooks/useTripAutoDetection';
import { useTripStartAnnouncement } from '../hooks/useTripStartAnnouncement';
import { useDriveFocusReminder } from '../hooks/useDriveFocusReminder';
import { useHarshEventTracker } from '../hooks/useHarshEventTracker';
import { useComplianceMonitor } from '../hooks/useComplianceMonitor';
import { useSevereWeatherAlerts } from '../hooks/useSevereWeatherAlerts';
import { useTurnByTurnGuidance } from '../hooks/useTurnByTurnGuidance';
import { useSpeedZoneAlerts } from '../hooks/useSpeedZoneAlerts';
import { useLiveSpeedZoneAlerts } from '../hooks/useLiveSpeedZoneAlerts';
import { useTrafficMonitor } from '../hooks/useTrafficMonitor';
import { useVgdPointFlush } from '../hooks/useVgdPointFlush';
import { useAutoSelectVehicle } from '../hooks/useAutoSelectVehicle';
import { useTripHistorySync } from '../hooks/useTripHistorySync';
import { useSyncEngine } from '../services/syncEngine';
import BluetoothVehiclePromptBanner from '../components/bluetooth/BluetoothVehiclePromptBanner';
import TripRecordingBanner from '../components/trip/TripRecordingBanner';
import { configureClient } from '../api/client';
import { refreshToken, setToken } from '../store/slices/authSlice';
import { setLocationOnboardingComplete } from '../store/slices/settingsSlice';
import { loadToken } from '../services/secureTokenStorage';
import { navigationRef } from './navigationRef';
import type { RootStackParamList } from '../types/navigation.types';

const Root = createStackNavigator<RootStackParamList>();

// Null-render component so the hook can call useAppSelector / useAppDispatch
// while living inside the Redux Provider and NavigationContainer.
function TripDetectionRunner() {
  useAutoSelectVehicle();
  useTripAutoDetection();
  useTripStartAnnouncement();
  useDriveFocusReminder();
  useHarshEventTracker();
  useComplianceMonitor();
  useSevereWeatherAlerts();
  useTurnByTurnGuidance();
  useSpeedZoneAlerts();
  useLiveSpeedZoneAlerts();
  useTrafficMonitor();
  useVgdPointFlush();
  useSyncEngine();
  return null;
}

// Owns layout for the app-root banners (Bluetooth vehicle prompt, trip
// recording status) so they stack vertically instead of each independently
// self-positioning at absolute top:0 and overlapping one another when both
// are visible at once (e.g. the BT prompt appears right as a trip starts).
function RootBannerStack() {
  return (
    <SafeAreaView style={styles.bannerStack} edges={['top']} pointerEvents="box-none">
      <BluetoothVehiclePromptBanner />
      <TripRecordingBanner />
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, token } = useAppSelector(s => s.auth);
  const prevAuth = React.useRef(false);

  // Deliberately not gated on locationGranted/locationOnboardingComplete
  // below (unlike TripDetectionRunner) — restoring past trip history has
  // nothing to do with permission for recording new trips, and a user
  // should see their history even before granting location access.
  useTripHistorySync();

  // TripDetectionRunner (specifically useTripAutoDetection's
  // BackgroundGeolocation.ready()/.start()) must not run before the user has
  // actually granted location permission — that SDK requests the same OS
  // permission on its own, and racing it against LocationPermissionScreen's
  // own react-native-permissions request() deadlocks Android's permission
  // dialog (the "Requesting…" button hangs forever, and BackgroundGeolocation
  // can end up starting/detecting motion before the user ever finished the
  // onboarding flow). Checked on mount and re-checked on every foreground
  // transition, since granting happens via an OS dialog or a trip to Settings
  // that this component has no other way to observe.
  const [locationGranted, setLocationGranted] = useState(false);
  // Foreground permission alone isn't enough to gate on, either: it's
  // GRANTED partway through LocationPermissionScreen's flow, before the
  // background-location and battery-optimization follow-up dialogs and
  // before the user ever reaches MainTabs. Gating solely on locationGranted
  // let BackgroundGeolocation start motion detection while the user was
  // still working through those dialogs — a jittery first GPS fix (normal
  // right after permission is freshly granted) could clear the auto-start
  // speed threshold and start a trip, and the "Trip recording started" voice
  // announcement, before the user was ever near the vehicle. This flag is
  // set once the permission-flow screens actually hand off to MainTabs.
  const locationOnboardingComplete = useAppSelector(s => s.settings.locationOnboardingComplete);

  useEffect(() => {
    const permission = Platform.OS === 'ios'
      ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
      : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

    const checkPermission = () => {
      check(permission).then((status: PermissionStatus) => {
        setLocationGranted(status === RESULTS.GRANTED);
      });
    };

    checkPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });
    return () => sub.remove();
  }, []);

  // The auth token now lives in encrypted storage (not redux-persist) — restore
  // it on cold start. Restored unconditionally, even if expired: the existing
  // request interceptor in api/client.ts already refreshes expired tokens
  // transparently on the next API call, same as before this change.
  useEffect(() => {
    loadToken().then(saved => {
      if (saved) dispatch(setToken(saved));
    });
  }, [dispatch]);

  useEffect(() => {
    configureClient(
      () => token,
      async () => {
        if (!token) return null;
        const result = await dispatch(refreshToken(token));
        if (refreshToken.fulfilled.match(result)) return result.payload as string;
        return null;
      },
    );
  }, [token, dispatch]);

  // On fresh login (auth state goes false → true), check if location permission
  // already granted. If not, the stack naturally starts at LocationPermission.
  // If already granted, navigate straight to MainTabs.
  useEffect(() => {
    if (!prevAuth.current && isAuthenticated) {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

      check(permission).then((status: PermissionStatus) => {
        if (status === RESULTS.GRANTED) {
          // Permission already granted — skip the permission screen. This is
          // also the migration path for users who granted location before
          // locationOnboardingComplete existed: they'd never revisit
          // LocationPermissionScreen/TurnOnLocationScreen to set it, so
          // TripDetectionRunner would stay gated off forever without this.
          dispatch(setLocationOnboardingComplete(true));
          if (navigationRef.isReady()) navigationRef.navigate('Main' as never);
        }
      });
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated, dispatch]);

  return (
    <NavigationContainer ref={navigationRef}>
      {locationGranted && locationOnboardingComplete && <TripDetectionRunner />}
      {isAuthenticated && <RootBannerStack />}
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Root.Screen name="Main" component={MainStackNavigator} />
        ) : (
          <Root.Screen name="Auth" component={AuthNavigator} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bannerStack: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
});
