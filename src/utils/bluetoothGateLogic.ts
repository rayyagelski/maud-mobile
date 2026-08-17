import type { BluetoothVehiclePairing } from '../store/slices/bluetoothPairingSlice';

export function isPairedDeviceConnected(
  connectedDeviceName: string | null,
  pairings: BluetoothVehiclePairing[],
): boolean {
  return connectedDeviceName != null && pairings.some(p => p.bluetoothDeviceName === connectedDeviceName);
}

// Trip recording (auto-detect + Route Planner) and the phone-usage-violation
// penalty are both meant to require an actual BT connection to the driver's
// paired vehicle, per product requirement — but only where that's actually
// enforceable: BluetoothVehicleDetectionModule's native side isn't wired
// into the iOS Xcode project yet (see isBluetoothVehicleDetectionAvailable
// in bluetoothVehicleDetectionModule.ts), and a driver who has never paired
// any vehicle at all has no way to ever satisfy a hard BT requirement. In
// both cases this falls back to true (gate satisfied — defer entirely to
// the existing speed-only behavior) rather than silently blocking every
// trip for a platform/user the feature isn't actually set up for yet.
export function isBluetoothGateSatisfied(
  moduleAvailable: boolean,
  pairings: BluetoothVehiclePairing[],
  connectedDeviceName: string | null,
): boolean {
  if (!moduleAvailable || pairings.length === 0) return true;
  return isPairedDeviceConnected(connectedDeviceName, pairings);
}
