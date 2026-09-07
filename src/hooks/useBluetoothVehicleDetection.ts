import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { useVoicePlayback } from './useVoicePlayback';
import { selectVehicle } from '../store/slices/vehicleSlice';
import {
  startBluetoothVehicleDetection,
  stopBluetoothVehicleDetection,
  subscribeBluetoothDeviceConnected,
} from '../services/bluetooth/bluetoothVehicleDetectionModule';

// BLUETOOTH_CONNECT is a runtime ("dangerous") permission on Android 12+
// (API 31+) — without it, BluetoothVehicleDetectionModule.kt's own
// hasPermission() check silently fails and start() resolves false with no
// error, so the native BroadcastReceiver never registers and
// getConnectedBluetoothDeviceName() returns null forever, even with a
// genuine OS-level BT connection to a paired vehicle. Nothing in this app
// ever requested it (only ACCESS_FINE_LOCATION is requested, in
// AppNavigator.tsx) — real-world impact: BT-gated trip auto-start
// (useTripAutoDetection.ts) silently never fired for any Android 12+ user,
// indistinguishable from "not actually connected" with no visible error.
// No-op on iOS/older Android, where the native side doesn't need it.
async function ensureBluetoothPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return;
  const status = await check(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
  if (status !== RESULTS.GRANTED) {
    await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
  }
}

const PROMPT_TIMEOUT_MS = 15_000;

export interface BluetoothVehiclePrompt {
  vehicleName: string;
  driverName: string;
}

/**
 * Detects the car's paired Bluetooth connection and auto-selects the
 * matching vehicle (see bluetoothPairingSlice.ts for the local device-name
 * -> vehicle map). Speaks a confirmation and surfaces a dismissible prompt
 * the driver can use to change vehicle/driver before the trip actually
 * starts recording (still motion-triggered, untouched — see
 * useTripAutoDetection.ts). If ignored, the timeout below just lets the
 * already-applied default stand, matching the requested behavior exactly.
 */
export function useBluetoothVehicleDetection(): {
  prompt: BluetoothVehiclePrompt | null;
  dismissPrompt: () => void;
} {
  const dispatch = useAppDispatch();
  const { claims } = useAppSelector(s => s.auth);
  const { vehicles, selectedVehicle } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const { pairings } = useAppSelector(s => s.bluetoothPairing);
  const { speak } = useVoicePlayback();

  const [prompt, setPrompt] = useState<BluetoothVehiclePrompt | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mutable refs so the long-lived connect-event subscription always reads
  // current Redux state without needing to re-subscribe on every change
  // (same pattern as useTripAutoDetection.ts's isTrackingRef/activeTripRef).
  const pairingsRef = useRef(pairings);
  const vehiclesRef = useRef(vehicles);
  const selectedVehicleRef = useRef(selectedVehicle);
  const driverNameRef = useRef('you');

  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  useEffect(() => { selectedVehicleRef.current = selectedVehicle; }, [selectedVehicle]);
  useEffect(() => {
    driverNameRef.current = selectedDriver?.name ?? claims?.firstName ?? 'you';
  }, [selectedDriver, claims]);

  function dismissPrompt() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPrompt(null);
  }

  useEffect(() => {
    let cancelled = false;
    ensureBluetoothPermission().finally(() => {
      if (!cancelled) startBluetoothVehicleDetection();
    });

    const unsubscribe = subscribeBluetoothDeviceConnected(deviceName => {
      if (!deviceName) return;

      const pairing = pairingsRef.current.find(p => p.bluetoothDeviceName === deviceName);
      if (!pairing) return; // Unpaired/unknown device — nothing to auto-select.

      const vehicle = vehiclesRef.current.find(v => v.id === pairing.vehicleId);
      if (!vehicle) return;

      if (selectedVehicleRef.current?.id !== vehicle.id) {
        dispatch(selectVehicle(vehicle.id));
      }

      const vehicleName = `${vehicle.make} ${vehicle.model}`;
      const driverName = driverNameRef.current;

      speak(
        `Trip will be recorded under ${driverName} in your ${vehicleName}. ` +
        'Open the app to change vehicle or driver before driving.',
      );

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setPrompt({ vehicleName, driverName });
      timeoutRef.current = setTimeout(dismissPrompt, PROMPT_TIMEOUT_MS);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopBluetoothVehicleDetection();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // Subscribes once for the app's lifetime — current state is read via the
    // refs above, not captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prompt, dismissPrompt };
}
