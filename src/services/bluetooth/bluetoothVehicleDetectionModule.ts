// Thin wrapper around the native BluetoothVehicleDetection module (custom
// per-platform code — no suitable existing RN library found for detecting a
// Classic-Bluetooth hands-free/audio connection and its device name, see
// android/.../bluetooth/BluetoothVehicleDetectionModule.kt and
// ios/MAUDConnect/BluetoothVehicleDetection.swift). Both platforms expose the
// identical method/event names, so no Platform.OS branching is needed here.
import { NativeEventEmitter, NativeModules } from 'react-native';

interface BluetoothVehicleDetectionNativeModule {
  start(): Promise<boolean>;
  stop(): void;
  getConnectedDeviceName(): Promise<string | null>;
  getBondedDevices(): Promise<string[]>;
  startScreenStateUpdates(): void;
  isScreenInteractive(): Promise<boolean>;
  getBackgroundRestrictions(): Promise<BackgroundRestrictions>;
}

const nativeModule = NativeModules.BluetoothVehicleDetection as
  | BluetoothVehicleDetectionNativeModule
  | undefined;

const emitter = nativeModule ? new NativeEventEmitter(NativeModules.BluetoothVehicleDetection) : null;

// False until the native module is actually registered — true on Android
// today; false on iOS until BluetoothVehicleDetection.swift is added to the
// Xcode project target (a manual step, not something a script/CLI can do).
// Callers that gate real behavior (e.g. requiring a BT connection to start
// trip recording) on this must fall back to their pre-BT behavior when
// false, not treat "unavailable" the same as "confirmed disconnected".
export function isBluetoothVehicleDetectionAvailable(): boolean {
  return nativeModule != null;
}

type DeviceNameListener = (deviceName: string | null) => void;

// Starts (or resumes) listening for the car's Bluetooth connection. Resolves
// false if the module isn't available (e.g. native code not yet rebuilt) or
// the required Android runtime permission hasn't been granted — fail-soft,
// same convention as every other auxiliary feature in this app.
export async function startBluetoothVehicleDetection(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.start();
  } catch {
    return false;
  }
}

export function stopBluetoothVehicleDetection(): void {
  nativeModule?.stop();
}

export async function getConnectedBluetoothDeviceName(): Promise<string | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.getConnectedDeviceName();
  } catch {
    return null;
  }
}

// The phone's already-bonded (paired-at-the-OS-level) device names — NOT a
// scan for nearby devices, and NOT a way to create a new pairing. Android
// reserves both of those to system apps; this only surfaces devices already
// in the OS's own pairing list, for a driver to pick "which one is my car"
// from inside the app. Always empty on iOS (no equivalent API — see
// BluetoothVehicleDetection.swift's own comment) and whenever the native
// module isn't linked.
export async function getBondedBluetoothDeviceNames(): Promise<string[]> {
  if (!nativeModule) return [];
  try {
    return await nativeModule.getBondedDevices();
  } catch {
    return [];
  }
}

export function subscribeBluetoothDeviceConnected(listener: DeviceNameListener): () => void {
  if (!emitter) return () => {};
  const subscription = emitter.addListener('onBluetoothDeviceConnected', (event: { deviceName: string | null }) =>
    listener(event.deviceName),
  );
  return () => subscription.remove();
}

// Whether the screen is on AND unlocked — i.e. someone could actually be
// handling the phone. See BluetoothVehicleDetectionModule.kt: on Android,
// AppState alone can't distinguish "switched to another app" from "screen
// locked in the holder". Resolves true wherever the signal doesn't exist
// (iOS, module not linked) so callers fall back to AppState-only behaviour.
export async function isScreenInteractive(): Promise<boolean> {
  if (!nativeModule?.isScreenInteractive) return true;
  try {
    return await nativeModule.isScreenInteractive();
  } catch {
    return true;
  }
}

// Android restrictions that block the app's network while it's in the
// background — see BluetoothVehicleDetectionModule.kt. 'enabled' dataSaver
// means THIS app is restricted on mobile data in the background (Data Saver
// on without an exemption, or the app's own background-data switch off).
export interface BackgroundRestrictions {
  dataSaver: 'disabled' | 'whitelisted' | 'enabled' | 'unknown';
  backgroundRestricted: boolean | null;
}

export async function getBackgroundRestrictions(): Promise<BackgroundRestrictions> {
  const unknown: BackgroundRestrictions = { dataSaver: 'unknown', backgroundRestricted: null };
  if (!nativeModule?.getBackgroundRestrictions) return unknown;
  try {
    return await nativeModule.getBackgroundRestrictions();
  } catch {
    return unknown;
  }
}

export function subscribeScreenInteractive(listener: (interactive: boolean) => void): () => void {
  if (!emitter || !nativeModule?.startScreenStateUpdates) return () => {};
  nativeModule.startScreenStateUpdates();
  const subscription = emitter.addListener('onScreenInteractiveChanged', (event: { interactive: boolean }) =>
    listener(event.interactive),
  );
  return () => subscription.remove();
}

export function subscribeBluetoothDeviceDisconnected(listener: DeviceNameListener): () => void {
  if (!emitter) return () => {};
  const subscription = emitter.addListener('onBluetoothDeviceDisconnected', (event: { deviceName: string | null }) =>
    listener(event.deviceName),
  );
  return () => subscription.remove();
}
