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
import TripSummaryScreen from '../screens/trip/TripSummaryScreen';
import TripDetailScreen from '../screens/trip/TripDetailScreen';
import TripHistoryScreen from '../screens/trip/TripHistoryScreen';
import MyTripScreen from '../screens/trip/MyTripScreen';
import DriverScoreScreen from '../screens/driverScore/DriverScoreScreen';
import EcoScoreScreen from '../screens/ecoScore/EcoScoreScreen';
import ExpensesScreen from '../screens/expenses/ExpensesScreen';
import ServiceHistoryScreen from '../screens/serviceHistory/ServiceHistoryScreen';
import InvoiceScreen from '../screens/invoice/InvoiceScreen';
import OdometerScreen from '../screens/odometer/OdometerScreen';
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
      <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ServiceHistory" component={ServiceHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Invoice" component={InvoiceScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Odometer" component={OdometerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RoutePlanner" component={RoutePlannerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TripSummary" component={TripSummaryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TripHistory" component={TripHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MyTrip" component={MyTripScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DriverScore" component={DriverScoreScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EcoScore" component={EcoScoreScreen} options={{ headerShown: false }} />
      {/* <Stack.Screen name="Drivers" component={DriversScreen} options={{ title: 'Drivers' }} /> */}
      {/* <Stack.Screen name="AddDriver" component={AddDriverScreen} options={{ title: 'Add Driver' }} /> */}
    </Stack.Navigator>
  );
}
