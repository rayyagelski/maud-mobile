import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ComplianceAlert } from '../../utils/complianceAlertLogic';

export interface ComplianceState {
  // Persisted user preference — read by useComplianceMonitor regardless of
  // which screen is currently open.
  alertsEnabled: boolean;
  // Ephemeral (live, trip-scoped); rehydrating a stale value on app restart
  // is harmless since it's overwritten within one GPS fix once tracking resumes.
  activeAlert: ComplianceAlert | null;
}

const initialState: ComplianceState = {
  alertsEnabled: true,
  activeAlert: null,
};

const complianceSlice = createSlice({
  name: 'compliance',
  initialState,
  reducers: {
    setAlertsEnabled(state, action: PayloadAction<boolean>) {
      state.alertsEnabled = action.payload;
      if (!action.payload) state.activeAlert = null;
    },
    setActiveAlert(state, action: PayloadAction<ComplianceAlert | null>) {
      state.activeAlert = action.payload;
    },
    clearActiveAlert(state) {
      state.activeAlert = null;
    },
  },
});

export const { setAlertsEnabled, setActiveAlert, clearActiveAlert } = complianceSlice.actions;
export default complianceSlice.reducer;
