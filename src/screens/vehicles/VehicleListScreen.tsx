import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { selectVehicle } from '../../store/slices/vehicleSlice';
import { setPairing, removePairing } from '../../store/slices/bluetoothPairingSlice';
import {
  getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected,
  subscribeBluetoothDeviceDisconnected,
} from '../../services/bluetooth/bluetoothVehicleDetectionModule';
import Button from '../../components/common/Button';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Vehicle } from '../../types/vehicle.types';

export default function VehicleListScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<MainStackNavigationProp>();
  const { vehicles, selectedVehicle } = useAppSelector(s => s.vehicles);
  const { pairings } = useAppSelector(s => s.bluetoothPairing);

  // Reads/subscribes to the same native detection the app-wide
  // useBluetoothVehicleDetection hook already starts — this screen never
  // calls start() itself, matching the app's existing "single subscription,
  // shared via a lightweight bus" pattern (see gpsSpeedBus.ts).
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);

  useEffect(() => {
    getConnectedBluetoothDeviceName().then(setConnectedDeviceName);
    const unsubConnect = subscribeBluetoothDeviceConnected(setConnectedDeviceName);
    const unsubDisconnect = subscribeBluetoothDeviceDisconnected(() => setConnectedDeviceName(null));
    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  async function handleSelect(vehicle: Vehicle) {
    await dispatch(selectVehicle(vehicle.id));
    navigation.goBack();
  }

  function handlePair(vehicleId: string) {
    if (!connectedDeviceName) return;
    dispatch(setPairing({ bluetoothDeviceName: connectedDeviceName, vehicleId }));
  }

  function handleUnpair(vehicleId: string) {
    dispatch(removePairing({ vehicleId }));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={vehicles}
        keyExtractor={v => v.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No vehicles yet. Add your first vehicle.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const pairing = pairings.find(p => p.vehicleId === item.id);
          return (
            <TouchableOpacity
              style={[styles.card, item.id === selectedVehicle?.id && styles.cardSelected]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <Text style={styles.vehicleName}>{item.make} {item.model}</Text>
                {item.id === selectedVehicle?.id && <Text style={styles.activeBadge}>Active</Text>}
              </View>
              <Text style={styles.vehicleSub}>{item.year} · {item.fuelType} · {item.vehicleType}</Text>
              {item.vin && <Text style={styles.vin}>VIN: {item.vin}</Text>}

              <View style={styles.bluetoothRow}>
                {pairing ? (
                  <>
                    <Text style={styles.bluetoothText}>🔵 Paired with "{pairing.bluetoothDeviceName}"</Text>
                    <TouchableOpacity onPress={() => handleUnpair(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.bluetoothAction}>Unpair</Text>
                    </TouchableOpacity>
                  </>
                ) : connectedDeviceName ? (
                  <>
                    <Text style={styles.bluetoothText}>🔵 Connected: "{connectedDeviceName}"</Text>
                    <TouchableOpacity onPress={() => handlePair(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.bluetoothAction}>Pair with this car</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.bluetoothTextMuted}>No car Bluetooth connected right now</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <Button
            title="Add New Vehicle"
            onPress={() => navigation.navigate('AddVehicle')}
            variant="secondary"
            style={{ marginTop: 8 }}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2F2F7' },
  list: { padding: 20 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#8E8E93', fontSize: 15 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSelected: { borderColor: '#1E4E8C' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  activeBadge: { fontSize: 12, color: '#FFFFFF', backgroundColor: '#1E4E8C', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  vehicleSub: { fontSize: 14, color: '#6D6D72', marginTop: 4, textTransform: 'capitalize' },
  vin: { fontSize: 11, color: '#AEAEB2', marginTop: 4 },
  bluetoothRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFEFF4',
  },
  bluetoothText: { fontSize: 12, color: '#3C3C43', flexShrink: 1, marginRight: 8 },
  bluetoothTextMuted: { fontSize: 12, color: '#AEAEB2' },
  bluetoothAction: { fontSize: 12, fontWeight: '700', color: '#1E4E8C' },
});
