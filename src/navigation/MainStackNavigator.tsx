import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MainTabNavigator from './MainTabNavigator';
import LocationPermissionScreen from '../screens/onboarding/LocationPermissionScreen';
import TurnOnLocationScreen from '../screens/onboarding/TurnOnLocationScreen';
// import TripConfirmScreen from '../screens/trip/TripConfirmScreen';
// import ActiveTripScreen from '../screens/trip/ActiveTripScreen';
// import TripDetailScreen from '../screens/trip/TripDetailScreen';
import VehicleListScreen from '../screens/vehicles/VehicleListScreen';
import AddVehicleScreen from '../screens/vehicles/AddVehicleScreen';
import RewardsScreen from '../screens/rewards/RewardsScreen';
import RoutePlannerScreen from '../screens/routeplanner/RoutePlannerScreen';
// import DriversScreen from '../screens/drivers/DriversScreen';
// import AddDriverScreen from '../screens/drivers/AddDriverScreen';
import type { MainStackParamList } from '../types/navigation.types';

const Stack = createStackNavigator<MainStackParamList>();

export default function MainStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1E4E8C' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TurnOnLocation" component={TurnOnLocationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
      {/* <Stack.Screen name="TripConfirm" component={TripConfirmScreen} options={{ title: 'Start Trip' }} /> */}
      {/* <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} options={{ title: 'Trip in Progress', headerLeft: () => null }} /> */}
      {/* <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ title: 'Trip Details' }} /> */}
      <Stack.Screen name="VehicleList" component={VehicleListScreen} options={{ title: 'My Vehicles' }} />
      <Stack.Screen name="AddVehicle" component={AddVehicleScreen} options={{ title: 'Add Vehicle' }} />
      <Stack.Screen name="Rewards" component={RewardsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RoutePlanner" component={RoutePlannerScreen} options={{ headerShown: false }} />
      {/* <Stack.Screen name="Drivers" component={DriversScreen} options={{ title: 'Drivers' }} /> */}
      {/* <Stack.Screen name="AddDriver" component={AddDriverScreen} options={{ title: 'Add Driver' }} /> */}
    </Stack.Navigator>
  );
}
