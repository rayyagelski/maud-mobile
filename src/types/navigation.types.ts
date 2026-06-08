import type { StackNavigationProp } from '@react-navigation/stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  VerifyEmail: { email: string; mode: 'reset' | 'signup' };
  CreateNewPassword: { email: string; code: string };
  PasswordResetSuccess: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Compliance: undefined;
  Breakdown: undefined;
  Emergency: undefined;
};

export type MainStackParamList = {
  LocationPermission: undefined;
  TurnOnLocation: undefined;
  MainTabs: undefined;
  TripConfirm: { autoDetected?: boolean };
  ActiveTrip: { tripId: string };
  TripDetail: { tripId: string };
  VehicleList: undefined;
  AddVehicle: undefined;
  Drivers: undefined;
  AddDriver: undefined;
  Rewards: undefined;
  RoutePlanner: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthNavigationProp = StackNavigationProp<AuthStackParamList>;
export type MainTabNavigationProp = BottomTabNavigationProp<MainTabParamList>;
export type MainStackNavigationProp = StackNavigationProp<MainStackParamList>;

export type TripConfirmRouteProp = RouteProp<MainStackParamList, 'TripConfirm'>;
export type ActiveTripRouteProp = RouteProp<MainStackParamList, 'ActiveTrip'>;
export type TripDetailRouteProp = RouteProp<MainStackParamList, 'TripDetail'>;
