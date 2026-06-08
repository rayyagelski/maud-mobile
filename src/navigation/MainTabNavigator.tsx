import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/home/HomeScreen';
import ComplianceScreen from '../screens/compliance/ComplianceScreen';
import BreakdownScreen from '../screens/breakdown/BreakdownScreen';
import EmergencyScreen from '../screens/emergency/EmergencyScreen';
import { HomeIcon, ComplianceIcon, BreakdownIcon, EmergencyIcon } from '../components/icons';
import type { MainTabParamList } from '../types/navigation.types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TEAL = '#3ABFBF';
const GRAY = '#9E9E9E';

const homeTabIcon = ({ color }: { color: string }) => <HomeIcon color={color} />;
const complianceTabIcon = ({ color }: { color: string }) => <ComplianceIcon color={color} />;
const breakdownTabIcon = ({ color }: { color: string }) => <BreakdownIcon color={color} />;
const emergencyTabIcon = ({ color }: { color: string }) => <EmergencyIcon color={color} />;

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: GRAY,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#EBEBEB',
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: homeTabIcon,
        }}
      />
      <Tab.Screen
        name="Compliance"
        component={ComplianceScreen}
        options={{
          tabBarLabel: 'Compliance',
          tabBarIcon: complianceTabIcon,
        }}
      />
      <Tab.Screen
        name="Breakdown"
        component={BreakdownScreen}
        options={{
          tabBarLabel: 'Breakdown',
          tabBarIcon: breakdownTabIcon,
        }}
      />
      <Tab.Screen
        name="Emergency"
        component={EmergencyScreen}
        options={{
          tabBarLabel: 'Emergency',
          tabBarIcon: emergencyTabIcon,
        }}
      />
    </Tab.Navigator>
  );
}
