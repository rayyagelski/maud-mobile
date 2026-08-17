import { isPairedDeviceConnected, isBluetoothGateSatisfied } from '../src/utils/bluetoothGateLogic';
import type { BluetoothVehiclePairing } from '../src/store/slices/bluetoothPairingSlice';

const PAIRING: BluetoothVehiclePairing = { bluetoothDeviceName: 'My Car', vehicleId: 'v1' };

describe('isPairedDeviceConnected', () => {
  it('returns true when the connected device matches a pairing', () => {
    expect(isPairedDeviceConnected('My Car', [PAIRING])).toBe(true);
  });

  it('returns false when no device is connected', () => {
    expect(isPairedDeviceConnected(null, [PAIRING])).toBe(false);
  });

  it('returns false when the connected device is not a paired one', () => {
    expect(isPairedDeviceConnected('Some Headphones', [PAIRING])).toBe(false);
  });
});

describe('isBluetoothGateSatisfied', () => {
  it('is satisfied when the module is unavailable (e.g. iOS pre-Xcode-wiring), regardless of connection', () => {
    expect(isBluetoothGateSatisfied(false, [PAIRING], null)).toBe(true);
  });

  it('is satisfied when the driver has no pairings configured at all', () => {
    expect(isBluetoothGateSatisfied(true, [], null)).toBe(true);
  });

  it('is NOT satisfied when the module is available, pairings exist, but nothing is connected', () => {
    expect(isBluetoothGateSatisfied(true, [PAIRING], null)).toBe(false);
  });

  it('is NOT satisfied when connected to an unpaired device', () => {
    expect(isBluetoothGateSatisfied(true, [PAIRING], 'Some Headphones')).toBe(false);
  });

  it('is satisfied when connected to the paired device', () => {
    expect(isBluetoothGateSatisfied(true, [PAIRING], 'My Car')).toBe(true);
  });
});
