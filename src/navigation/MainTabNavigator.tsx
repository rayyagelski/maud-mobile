import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();

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
          // A hardcoded paddingBottom overrides react-navigation's own
          // safe-area-aware default entirely, rather than adding to it — on
          // a device with on-screen 3-button navigation (real screen space,
          // non-zero bottom inset), the tab bar sat cramped right against
          // the system nav bar instead of clearing it. Add the real inset
          // on top of the intended visual padding instead of replacing it.
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          // Without an explicit height, the library falls back to its own
          // fixed default and does NOT grow to fit whatever extra padding
          // is set above — real-drive feedback: adding the padding alone
          // (previous fix) squeezed the icon+label into that same fixed-
          // size area, clipping the label off the bottom entirely instead
          // of just sitting close to the system nav bar as before. 58px
          // covers icon + label + both paddings with headroom; insets.bottom
          // extends it further for on-screen 3-button navigation.
          height: 58 + insets.bottom,
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
