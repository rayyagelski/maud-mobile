import type { BluetoothVehiclePairing } from '../store/slices/bluetoothPairingSlice';

export function isPairedDeviceConnected(
  connectedDeviceName: string | null,
  pairings: BluetoothVehiclePairing[],
): boolean {
  return connectedDeviceName != null && pairings.some(p => p.bluetoothDeviceName === connectedDeviceName);
}

// Passive/ambient trip auto-detection (NOT a manually-tapped Route Planner
// "Start Trip" — see the pending-start branch in useTripAutoDetection.ts,
// which deliberately bypasses this gate since it's already explicit driver
// intent) requires an actual BT connection to the driver's paired vehicle,
// per explicit product decision. Previously this fell back to "gate
// satisfied" (speed-only, no BT check at all) when the native module wasn't
// available (iOS pre-Xcode-wiring — see isBluetoothVehicleDetectionAvailable
// in bluetoothVehicleDetectionModule.ts) or the driver had no vehicle
// paired, on the reasoning that a hard requirement was unenforceable in
// those cases. A real-world incident (a trip auto-started and announced
// "Recording in process" out loud in public with no vehicle BT connection
// at all) showed that fallback is not acceptable for *passive* detection —
// no BT connection means no ambient auto-recording, even if that means
// auto-detection stays off entirely on iOS until the module is wired in, or
// for a driver who hasn't paired a vehicle yet. (Applying the same hard gate
// to the explicit Route Planner start was an over-application of this fix,
// discovered afterward: it left navigation/speed-alerts/GPS transmission
// dead for any driver without a live BT connection, since `startTrip` — and
// therefore `isTracking` — never fired at all. Fixed by exempting that path
// entirely rather than adjusting this function, since its "no BT, no
// ambient start" semantics are still correct for what it's meant to gate.)
export function isBluetoothGateSatisfied(
  moduleAvailable: boolean,
  pairings: BluetoothVehiclePairing[],
  connectedDeviceName: string | null,
): boolean {
  if (!moduleAvailable || pairings.length === 0) return false;
  return isPairedDeviceConnected(connectedDeviceName, pairings);
}

// The phone-usage-violation penalty (useHarshEventTracker.ts) is a distinct
// consumer with the opposite fallback intent, by explicit product
// requirement ("...BT-connected to their paired vehicle where that's
// enforceable" — see the comment at its call site): unlike ambient
// auto-detection, an unenforceable BT check here was never the cause of any
// incident, and this only ever runs after a trip is already tracking (by
// whatever means), so there's no risk of an unwanted silent action — just an
// under-counted distraction penalty for a driver with no pairing or on iOS
// pre-Xcode-wiring, which the product requirement explicitly says should
// fall back to speed-only rather than never flagging at all.
export function isBluetoothGateSatisfiedWhereEnforceable(
  moduleAvailable: boolean,
  pairings: BluetoothVehiclePairing[],
  connectedDeviceName: string | null,
): boolean {
  if (!moduleAvailable || pairings.length === 0) return true;
  return isPairedDeviceConnected(connectedDeviceName, pairings);
}
