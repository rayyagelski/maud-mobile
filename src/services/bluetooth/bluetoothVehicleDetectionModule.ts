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
}

const nativeModule = NativeModules.BluetoothVehicleDetection as
  | BluetoothVehicleDetectionNativeModule
  | undefined;

const emitter = nativeModule ? new NativeEventEmitter(NativeModules.BluetoothVehicleDetection) : null;

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

export function subscribeBluetoothDeviceConnected(listener: DeviceNameListener): () => void {
  if (!emitter) return () => {};
  const subscription = emitter.addListener('onBluetoothDeviceConnected', (event: { deviceName: string | null }) =>
    listener(event.deviceName),
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
