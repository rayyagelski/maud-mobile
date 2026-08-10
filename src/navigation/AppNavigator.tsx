import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
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
import { useVgdPointFlush } from '../hooks/useVgdPointFlush';
import { useAutoSelectVehicle } from '../hooks/useAutoSelectVehicle';
import { useSyncEngine } from '../services/syncEngine';
import BluetoothVehiclePromptBanner from '../components/bluetooth/BluetoothVehiclePromptBanner';
import { configureClient } from '../api/client';
import { refreshToken, setToken } from '../store/slices/authSlice';
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
  useVgdPointFlush();
  useSyncEngine();
  return null;
}

export default function AppNavigator() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, token } = useAppSelector(s => s.auth);
  const prevAuth = React.useRef(false);

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
          // Permission already granted — skip the permission screen
          if (navigationRef.isReady()) navigationRef.navigate('Main' as never);
        }
      });
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated]);

  return (
    <NavigationContainer ref={navigationRef}>
      {locationGranted && <TripDetectionRunner />}
      {isAuthenticated && <BluetoothVehiclePromptBanner />}
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
