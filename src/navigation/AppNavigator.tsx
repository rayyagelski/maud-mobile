import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { check, PERMISSIONS, RESULTS, type PermissionStatus } from 'react-native-permissions';
import { Platform } from 'react-native';
import AuthNavigator from './AuthNavigator';
import MainStackNavigator from './MainStackNavigator';
import { useAppSelector } from '../hooks/useAppSelector';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useTripAutoDetection } from '../hooks/useTripAutoDetection';
import { configureClient } from '../api/client';
import { refreshToken } from '../store/slices/authSlice';
import { navigationRef } from './navigationRef';
import type { RootStackParamList } from '../types/navigation.types';

const Root = createStackNavigator<RootStackParamList>();

// Null-render component so the hook can call useAppSelector / useAppDispatch
// while living inside the Redux Provider and NavigationContainer.
function TripDetectionRunner() {
  useTripAutoDetection();
  return null;
}

export default function AppNavigator() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, token } = useAppSelector(s => s.auth);
  const prevAuth = React.useRef(false);

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
      <TripDetectionRunner />
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
