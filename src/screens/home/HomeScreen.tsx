import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TouchableWithoutFeedback, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { store } from '../../store';
import { selectVehicle } from '../../store/slices/vehicleSlice';
import { fetchDrivers } from '../../store/slices/driverSlice';
import { logout } from '../../store/slices/authSlice';
import { flushSyncQueue } from '../../services/syncEngine';
import {
  getConnectedBluetoothDeviceName,
  subscribeBluetoothDeviceConnected,
  subscribeBluetoothDeviceDisconnected,
} from '../../services/bluetooth/bluetoothVehicleDetectionModule';
import {
  CarIcon, ChevronIcon, CheckCircleIcon,
  MedalIcon, PinIcon, GaugeIcon, LeafIcon,
  RouteIcon, DollarIcon, GearIcon, SpeedometerIcon, UsersIcon, RefreshIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Vehicle } from '../../types/vehicle.types';

function formatLastSynced(ts: number | null): string {
  if (ts === null) return 'Never synced';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Synced just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Synced ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `Synced ${diffHr}h ago`;
}

function vehicleSubtitle(vehicle: Vehicle): string {
  const parts = [vehicle.year, vehicle.fuelType].filter(Boolean);
  if (parts.length > 0) return parts.join(' • ');
  return vehicle.vin ? `VIN ${vehicle.vin}` : '';
}

const TEAL = '#3ABFBF';
const TEAL_DARK = '#2DA8A8';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

// ── Feature card ───────────────────────────────────────────────────────────

interface FeatureItem {
  label: string;
  iconBg: string;
  icon: React.ReactNode;
  onPress: () => void;
}

function FeatureCard({ label, iconBg, icon, onPress }: FeatureItem) {
  return (
    <TouchableOpacity style={styles.featureCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.featureIconBox, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.featureLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Vehicle row (inside dropdown) ──────────────────────────────────────────

function VehicleRow({
  vehicle,
  selected,
  onPress,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.vehicleRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.vehicleRowIconBox}>
        <CarIcon />
      </View>
      <View style={styles.vehicleRowInfo}>
        <Text style={styles.vehicleRowName}>
          {vehicle.make} {vehicle.model}
        </Text>
        {!!vehicleSubtitle(vehicle) && (
          <Text style={styles.vehicleRowSub}>{vehicleSubtitle(vehicle)}</Text>
        )}
      </View>
      {selected && <CheckCircleIcon />}
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const { claims } = useAppSelector(s => s.auth);
  const { vehicles, selectedVehicle } = useAppSelector(s => s.vehicles);
  const { drivers } = useAppSelector(s => s.drivers);
  const { items: pendingSyncItems, isSyncing, lastSyncedAt } = useAppSelector(s => s.syncQueue);
  const { pairings } = useAppSelector(s => s.bluetoothPairing);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownY, setDropdownY] = useState(0);
  const vehicleCardRef = useRef<any>(null);

  const firstName = claims?.firstName ?? 'Driver';
  const initial = firstName.charAt(0).toUpperCase();
  const displayVehicle = selectedVehicle ?? vehicles[0] ?? null;

  // Vehicle fetch + auto-select now lives in useAutoSelectVehicle, mounted
  // app-wide via TripDetectionRunner — trip auto-detection can fire before
  // this screen is ever visited, so it can't be left to this screen's mount.

  useEffect(() => {
    if (drivers.length === 0) {
      dispatch(fetchDrivers());
    }
  }, [drivers.length, dispatch]);

  // Surfaces BT pairing/connection state right on the home screen — without
  // this, whether the current vehicle is actually paired at all (a required
  // step for auto-start, see bluetoothGateLogic.ts) was invisible anywhere
  // except VehicleListScreen, so a driver could easily never realize
  // pairing was never completed and be stuck wondering why auto-start
  // silently never fires (real-drive feedback: BT genuinely connected,
  // speed genuinely qualifying, no visible reason auto-start didn't happen).
  const [connectedBtDeviceName, setConnectedBtDeviceName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getConnectedBluetoothDeviceName().then((name) => {
      if (!cancelled) setConnectedBtDeviceName(name);
    });
    const unsubConnect = subscribeBluetoothDeviceConnected((name) => setConnectedBtDeviceName(name));
    const unsubDisconnect = subscribeBluetoothDeviceDisconnected(() => setConnectedBtDeviceName(null));
    return () => {
      cancelled = true;
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  const btPairingForVehicle = displayVehicle
    ? pairings.find(p => p.vehicleId === displayVehicle.id)
    : undefined;
  const btStatus: { label: string; color: string } = !btPairingForVehicle
    ? { label: 'Not paired — tap to pair', color: '#B0B0B0' }
    : connectedBtDeviceName === btPairingForVehicle.bluetoothDeviceName
      ? { label: 'Connected', color: '#27AE60' }
      : { label: 'Paired, not connected', color: '#B0B0B0' };

  function openDropdown() {
    vehicleCardRef.current?.measureInWindow(
      (_x: number, y: number, _w: number, height: number) => {
        setDropdownY(y + height + 6);
        setDropdownOpen(true);
      },
    );
  }

  function handleVehicleCardPress() {
    if (dropdownOpen) {
      setDropdownOpen(false);
    } else {
      openDropdown();
    }
  }

  function handleSelectVehicle(vehicleId: string) {
    dispatch(selectVehicle(vehicleId));
    setDropdownOpen(false);
  }

  // Queued trip/expense/VGD writes (syncQueueSlice) carry no owning-user tag
  // — they just retry with whatever auth token is live when they flush.
  // `logout()` resets vehicles/drivers/trips/syncQueue for the next login,
  // so anything still queued at that point needs the outgoing user's
  // explicit call: sync it now while their token is still the live one, or
  // knowingly discard it. Checked against current state up front (not a
  // silent flush-then-report) so the ask matches what the user requested.
  function handleAvatarPress() {
    const pending = store.getState().syncQueue.items.length;
    if (pending === 0) {
      Alert.alert('Log out', 'Log out of MAUD Connect?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => dispatch(logout()) },
      ]);
      return;
    }
    Alert.alert(
      'Unsynced Data',
      `There ${pending === 1 ? 'is' : 'are'} still ${pending} item${pending === 1 ? '' : 's'} ` +
        "(trips/expenses) that haven't been synced yet. Sync before signing out?",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out Without Syncing', style: 'destructive', onPress: () => dispatch(logout()) },
        { text: 'Sync & Log Out', onPress: handleSyncThenLogout },
      ],
    );
  }

  async function handleSyncThenLogout() {
    await dispatch(flushSyncQueue());
    const remaining = store.getState().syncQueue.items.length;
    if (remaining > 0) {
      // Still offline or still failing after a real attempt — ask again
      // rather than silently discarding or silently blocking logout forever.
      Alert.alert(
        'Sync Incomplete',
        `${remaining} item${remaining === 1 ? '' : 's'} still couldn't sync ` +
          '(no connection, or the server rejected it). Log out anyway and discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out Anyway', style: 'destructive', onPress: () => dispatch(logout()) },
        ],
      );
      return;
    }
    dispatch(logout());
  }

  // No room next to the header icon for a persistent status label (unlike
  // the old under-the-vehicle-card row), so give feedback as an alert instead
  // — otherwise tapping while already fully synced would look like nothing
  // happened at all.
  async function handleSyncPress() {
    const pendingBefore = store.getState().syncQueue.items.length;
    if (pendingBefore === 0) {
      Alert.alert('Sync', formatLastSynced(lastSyncedAt));
      return;
    }
    await dispatch(flushSyncQueue());
    const remaining = store.getState().syncQueue.items.length;
    Alert.alert(
      'Sync',
      remaining === 0
        ? 'All synced.'
        : `${remaining} item${remaining === 1 ? '' : 's'} still couldn't sync — will retry automatically.`,
    );
  }

  const features: FeatureItem[] = [
    { label: 'Rewards', iconBg: '#F5A623', icon: <MedalIcon />, onPress: () => navigation.navigate('Rewards') },
    { label: 'Drivers', iconBg: '#8B5CF6', icon: <UsersIcon />, onPress: () => navigation.navigate('Drivers') },
    { label: 'Route Planner', iconBg: TEAL, icon: <PinIcon />, onPress: () => navigation.navigate('RoutePlanner') },
    { label: 'Driver Score', iconBg: TEAL, icon: <GaugeIcon />, onPress: () => navigation.navigate('DriverScore') },
    { label: 'Eco Score', iconBg: '#27AE60', icon: <LeafIcon />, onPress: () => navigation.navigate('EcoScore') },
    { label: 'Trip Details', iconBg: TEAL, icon: <RouteIcon />, onPress: () => navigation.navigate('TripHistory') },
    { label: 'Expenses', iconBg: '#F57C00', icon: <DollarIcon />, onPress: () => navigation.navigate('Expenses') },
    { label: 'Service History', iconBg: '#8B5CF6', icon: <GearIcon />, onPress: () => navigation.navigate('ServiceHistory') },
    {
      label: 'Odometer',
      iconBg: '#64748B',
      icon: <SpeedometerIcon />,
      onPress: () => navigation.navigate('Odometer'),
    },
    {
      label: 'Settings',
      iconBg: '#455A64',
      icon: <GearIcon />,
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!dropdownOpen}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.firstName}>{firstName}</Text>
              {displayVehicle && (
                <TouchableOpacity
                  style={styles.btStatusRow}
                  onPress={() => navigation.navigate('VehicleList')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 40 }}
                >
                  <View style={[styles.btDot, { backgroundColor: btStatus.color }]} />
                  <Text style={styles.btStatusText}>{btStatus.label}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleSyncPress}
                activeOpacity={0.7}
                disabled={isSyncing}
              >
                <RefreshIcon color={TEAL} />
                {pendingSyncItems.length > 0 && (
                  <View style={styles.syncBadge}>
                    <Text style={styles.syncBadgeText}>
                      {pendingSyncItems.length > 9 ? '9+' : pendingSyncItems.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.avatar} onPress={handleAvatarPress} activeOpacity={0.75}>
                <Text style={styles.avatarText}>{initial}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Vehicle card */}
          <TouchableOpacity
            ref={vehicleCardRef}
            style={styles.vehicleCard}
            onPress={handleVehicleCardPress}
            activeOpacity={0.92}
          >
            <View style={styles.vehicleCardContent}>
              <View style={styles.vehicleIconBox}>
                <CarIcon />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleCurrentLabel}>Current Vehicle</Text>
                <Text style={styles.vehicleName}>
                  {displayVehicle
                    ? `${displayVehicle.make} ${displayVehicle.model}`
                    : 'No vehicle selected'}
                </Text>
                {displayVehicle && !!vehicleSubtitle(displayVehicle) && (
                  <Text style={styles.vehicleSub}>{vehicleSubtitle(displayVehicle)}</Text>
                )}
              </View>
              <ChevronIcon open={dropdownOpen} />
            </View>
          </TouchableOpacity>

          {/* Features grid */}
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featureGrid}>
            {features.map((f, i) => (
              <FeatureCard key={i} {...f} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Vehicle dropdown overlay */}
      <Modal transparent visible={dropdownOpen} animationType="none" onRequestClose={() => setDropdownOpen(false)}>
        <View style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={() => setDropdownOpen(false)}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          </TouchableWithoutFeedback>
          <View style={[styles.dropdown, { top: dropdownY }]}>
            {vehicles.map(v => (
              <VehicleRow
                key={v.id}
                vehicle={v}
                selected={v.id === displayVehicle?.id}
                onPress={() => handleSelectVehicle(v.id)}
              />
            ))}
            {vehicles.length === 0 && (
              <Text style={styles.emptyDropdown}>No vehicles found</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 14, color: '#888888', marginBottom: 2 },
  firstName: { fontSize: 28, fontWeight: '700', color: '#1A1A1A' },
  btStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  btDot: { width: 8, height: 8, borderRadius: 4 },
  btStatusText: { fontSize: 12, fontWeight: '600', color: '#666666' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  syncBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#E74C3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: TEAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: 'white' },

  vehicleCard: {
    backgroundColor: TEAL,
    borderRadius: 18,
    padding: 16,
    marginBottom: 28,
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  vehicleCardContent: { flexDirection: 'row', alignItems: 'center' },
  vehicleIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  vehicleInfo: { flex: 1 },
  vehicleCurrentLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 3 },
  vehicleName: { fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 2 },
  vehicleSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 12,
    columnGap: 12,
  },
  featureCard: {
    width: '47.5%',
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureIconBox: {
    width: 54,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  featureLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },

  dropdown: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: TEAL_DARK,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  vehicleRowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vehicleRowInfo: { flex: 1 },
  vehicleRowName: { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 2 },
  vehicleRowSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  emptyDropdown: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: 20 },
});
