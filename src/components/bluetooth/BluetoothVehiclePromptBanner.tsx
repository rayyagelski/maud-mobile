import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useBluetoothVehicleDetection } from '../../hooks/useBluetoothVehicleDetection';
import { navigationRef } from '../../navigation/navigationRef';

const TEAL = '#3ABFBF';

// Rendered inside AppNavigator's shared top-of-screen banner stack (see
// RootBannerStack there) — renders the dismissible "trip will be recorded
// under X in your Y" confirmation whenever the car's paired Bluetooth
// connects. Auto-dismisses via the timeout in useBluetoothVehicleDetection if
// left untouched, matching the requested "no response -> proceed with
// default" behavior. Does not position itself (no SafeAreaView/absolute) —
// the shared stack owns layout so this can sit above/below sibling banners
// (e.g. TripRecordingBanner) instead of overlapping them.
export default function BluetoothVehiclePromptBanner() {
  const { prompt, dismissPrompt } = useBluetoothVehicleDetection();

  if (!prompt) return null;

  function goToChangeVehicle() {
    dismissPrompt();
    if (navigationRef.isReady()) navigationRef.navigate('VehicleList' as never);
  }

  function goToChangeDriver() {
    dismissPrompt();
    if (navigationRef.isReady()) navigationRef.navigate('Drivers' as never);
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.message}>
        Recording under <Text style={styles.bold}>{prompt.driverName}</Text> in your{' '}
        <Text style={styles.bold}>{prompt.vehicleName}</Text>
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={goToChangeVehicle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.actionText}>Change vehicle</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToChangeDriver} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.actionText}>Change driver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismissPrompt} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.dismissText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: 12, marginBottom: 0, borderRadius: 14, padding: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
    borderLeftWidth: 4, borderLeftColor: TEAL,
  },
  message: { fontSize: 14, color: '#1A1A1A', marginBottom: 10 },
  bold: { fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', columnGap: 20 },
  actionText: { fontSize: 13, fontWeight: '700', color: '#1E4E8C' },
  dismissText: { fontSize: 13, fontWeight: '700', color: '#888888' },
});
