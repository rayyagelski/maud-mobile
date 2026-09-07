import {
  isPairedDeviceConnected, isBluetoothGateSatisfied, isBluetoothGateSatisfiedWhereEnforceable,
} from '../src/utils/bluetoothGateLogic';
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
  it('is NOT satisfied when the module is unavailable (e.g. iOS pre-Xcode-wiring) — no fallback to speed-only', () => {
    expect(isBluetoothGateSatisfied(false, [PAIRING], null)).toBe(false);
  });

  it('is NOT satisfied when the driver has no pairings configured at all', () => {
    expect(isBluetoothGateSatisfied(true, [], null)).toBe(false);
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

describe('isBluetoothGateSatisfiedWhereEnforceable', () => {
  it('is satisfied when the module is unavailable — falls back to speed-only, unlike the strict gate', () => {
    expect(isBluetoothGateSatisfiedWhereEnforceable(false, [PAIRING], null)).toBe(true);
  });

  it('is satisfied when the driver has no pairings configured at all', () => {
    expect(isBluetoothGateSatisfiedWhereEnforceable(true, [], null)).toBe(true);
  });

  it('is NOT satisfied when the module is available, pairings exist, but nothing is connected', () => {
    expect(isBluetoothGateSatisfiedWhereEnforceable(true, [PAIRING], null)).toBe(false);
  });

  it('is NOT satisfied when connected to an unpaired device', () => {
    expect(isBluetoothGateSatisfiedWhereEnforceable(true, [PAIRING], 'Some Headphones')).toBe(false);
  });

  it('is satisfied when connected to the paired device', () => {
    expect(isBluetoothGateSatisfiedWhereEnforceable(true, [PAIRING], 'My Car')).toBe(true);
  });
});
