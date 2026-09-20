import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { selectVehicle } from '../../store/slices/vehicleSlice';
import { setPairing, removePairing } from '../../store/slices/bluetoothPairingSlice';
import {
  getConnectedBluetoothDeviceName,
  getBondedBluetoothDeviceNames,
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

  // Bonded-device picker: the phone's already-paired-at-the-OS-level
  // devices, not a live scan and not a way to create a new OS pairing (see
  // getBondedBluetoothDeviceNames' own doc comment — Android reserves both
  // of those to system apps). Lets a driver map "which of these is my car"
  // in-app without waiting for a live connect event or leaving the app —
  // the actual OS-level connect still has to happen via handleConnectBluetooth
  // below if the car isn't in this list yet.
  const [pickerVehicleId, setPickerVehicleId] = useState<string | null>(null);
  const [bondedDevices, setBondedDevices] = useState<string[]>([]);
  const [bondedDevicesLoading, setBondedDevicesLoading] = useState(false);

  function openDevicePicker(vehicleId: string) {
    setPickerVehicleId(vehicleId);
    setBondedDevicesLoading(true);
    getBondedBluetoothDeviceNames()
      .then(setBondedDevices)
      .finally(() => setBondedDevicesLoading(false));
  }

  function closeDevicePicker() {
    setPickerVehicleId(null);
    setBondedDevices([]);
  }

  function handleChooseBondedDevice(deviceName: string) {
    if (!pickerVehicleId) return;
    dispatch(setPairing({ bluetoothDeviceName: deviceName, vehicleId: pickerVehicleId }));
    closeDevicePicker();
  }

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

  // Deep-links to the OS Bluetooth settings screen so the driver can connect
  // to the car from there, then come back here to pair — this screen itself
  // has no way to initiate an OS-level BT connection. This used to try
  // Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS') first (a more
  // precise deep link), guarded in try/catch for its known synchronous-
  // throw failure mode — but the equivalent DND-settings intent in
  // useDriveFocusReminder.ts crashed the app twice in real testing even
  // with that same guard in place, so this was simplified the same way:
  // Linking.openSettings() alone (plain app-settings page) is a core,
  // universally-supported RN API with no comparable OEM-variable native-
  // intent risk. Lands one screen short of the ideal destination in
  // exchange for certainty this can't crash the app.
  function handleConnectBluetooth() {
    Linking.openSettings().catch(() => {});
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
                {/* A saved pairing mapping (bluetoothPairingSlice) is not the
                    same thing as being connected right now — it used to be
                    shown as "Paired with X" unconditionally, with no relation
                    to connectedDeviceName at all, so a car that hadn't been
                    in range for weeks still showed the same badge as one
                    sitting connected right now. Split into three real states:
                    paired AND currently connected, paired but NOT currently
                    connected, and not paired at all. */}
                {pairing && connectedDeviceName === pairing.bluetoothDeviceName ? (
                  <>
                    <Text style={styles.bluetoothText}>🔵 Connected: "{pairing.bluetoothDeviceName}"</Text>
                    <TouchableOpacity onPress={() => handleUnpair(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.bluetoothAction}>Unpair</Text>
                    </TouchableOpacity>
                  </>
                ) : pairing ? (
                  <>
                    <Text style={styles.bluetoothTextMuted} numberOfLines={1}>
                      Paired with "{pairing.bluetoothDeviceName}" — not connected
                    </Text>
                    <View style={styles.bluetoothActions}>
                      <TouchableOpacity onPress={() => openDevicePicker(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.bluetoothAction}>Choose device</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleUnpair(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.bluetoothActionMuted}>Unpair</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : connectedDeviceName ? (
                  <>
                    <Text style={styles.bluetoothText}>🔵 Connected: "{connectedDeviceName}"</Text>
                    <TouchableOpacity onPress={() => handlePair(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.bluetoothAction}>Pair with this car</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.bluetoothTextMuted}>No car Bluetooth connected right now</Text>
                    <TouchableOpacity onPress={() => openDevicePicker(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.bluetoothAction}>Choose device</Text>
                    </TouchableOpacity>
                  </>
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

      <Modal
        visible={pickerVehicleId != null}
        animationType="slide"
        transparent
        onRequestClose={closeDevicePicker}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose your car's Bluetooth</Text>
            <Text style={styles.modalSubtitle}>
              Devices your phone is already paired with. Don't see your car? Pair it in Bluetooth
              settings first, then come back here.
            </Text>

            {bondedDevicesLoading ? (
              <Text style={styles.modalEmptyText}>Loading…</Text>
            ) : bondedDevices.length === 0 ? (
              <Text style={styles.modalEmptyText}>
                No paired devices found on this phone yet.
              </Text>
            ) : (
              <FlatList
                data={bondedDevices}
                keyExtractor={name => name}
                style={styles.modalList}
                renderItem={({ item: deviceName }) => (
                  <TouchableOpacity
                    style={styles.modalDeviceRow}
                    onPress={() => handleChooseBondedDevice(deviceName)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalDeviceName}>{deviceName}</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => { closeDevicePicker(); handleConnectBluetooth(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalFooterLink}>Open Bluetooth Settings</Text>
              </TouchableOpacity>
              <Button title="Cancel" onPress={closeDevicePicker} variant="secondary" />
            </View>
          </View>
        </View>
      </Modal>
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
  bluetoothTextMuted: { fontSize: 12, color: '#AEAEB2', flexShrink: 1, marginRight: 8 },
  bluetoothAction: { fontSize: 12, fontWeight: '700', color: '#1E4E8C' },
  bluetoothActions: { flexDirection: 'row', columnGap: 14 },
  bluetoothActionMuted: { fontSize: 12, fontWeight: '700', color: '#AEAEB2' },

  // Bonded-device picker modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '75%',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  modalSubtitle: { fontSize: 13, color: '#6D6D72', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  modalEmptyText: { fontSize: 14, color: '#8E8E93', textAlign: 'center', paddingVertical: 24 },
  modalList: { flexGrow: 0 },
  modalDeviceRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EFEFF4' },
  modalDeviceName: { fontSize: 15, color: '#1C1C1E', fontWeight: '600' },
  modalFooter: { marginTop: 16, alignItems: 'center', rowGap: 12 },
  modalFooterLink: { fontSize: 13, fontWeight: '700', color: '#1E4E8C' },
});
