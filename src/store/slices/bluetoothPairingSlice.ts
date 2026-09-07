import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { logout } from './authSlice';

// Maps a car's Bluetooth hands-free device name to one of this account's
// vehicles — local to this phone only (not synced to the backend), since
// each driver's own phone independently pairs the same or a different car.
// See useBluetoothVehicleDetection.ts for how this drives auto vehicle
// selection.
export interface BluetoothVehiclePairing {
  bluetoothDeviceName: string;
  vehicleId: string;
}

export interface BluetoothPairingState {
  pairings: BluetoothVehiclePairing[];
}

const initialState: BluetoothPairingState = {
  pairings: [],
};

const bluetoothPairingSlice = createSlice({
  name: 'bluetoothPairing',
  initialState,
  reducers: {
    // One vehicle per device name — pairing the same device name to a
    // different vehicle replaces the old mapping rather than duplicating it.
    setPairing(state, action: PayloadAction<BluetoothVehiclePairing>) {
      state.pairings = state.pairings.filter(
        p => p.bluetoothDeviceName !== action.payload.bluetoothDeviceName,
      );
      state.pairings.push(action.payload);
    },
    removePairing(state, action: PayloadAction<{ vehicleId: string }>) {
      state.pairings = state.pairings.filter(p => p.vehicleId !== action.payload.vehicleId);
    },
  },
  extraReducers: (builder) => {
    builder
      // Pairings map a BT device name to one of "this account's" vehicles
      // (see the interface comment above) and are redux-persist'd with no
      // per-user key — surviving a logout would let a different account
      // that logs into the same phone inherit BT-vehicle mappings pointing
      // at the previous user's vehicle IDs.
      .addCase(logout, () => initialState);
  },
});

export const { setPairing, removePairing } = bluetoothPairingSlice.actions;
export default bluetoothPairingSlice.reducer;
