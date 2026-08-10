import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBluetoothVehicleDetection } from '../../hooks/useBluetoothVehicleDetection';
import { navigationRef } from '../../navigation/navigationRef';

const TEAL = '#3ABFBF';

// Mounted once at the app root (see AppNavigator.tsx) — renders the
// dismissible "trip will be recorded under X in your Y" confirmation
// whenever the car's paired Bluetooth connects. Auto-dismisses via the
// timeout in useBluetoothVehicleDetection if left untouched, matching the
// requested "no response -> proceed with default" behavior.
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
    <SafeAreaView style={styles.safe} edges={['top']} pointerEvents="box-none">
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
  banner: {
    margin: 12, borderRadius: 14, padding: 14,
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
