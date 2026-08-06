import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SettingsState {
  // When true, TripSummaryScreen speaks the trip's voice recap automatically
  // on mount instead of requiring a manual tap of the mic button.
  autoPlayTripSummaryVoice: boolean;
  // When true, useDriveFocusReminder prompts the driver once per trip to
  // turn on their phone's own Do Not Disturb / Driving Focus mode. Neither
  // iOS nor Android lets a third-party app silence calls/notifications
  // directly, so this is a reminder-and-deep-link, not real enforcement.
  driveFocusReminderEnabled: boolean;
}

const initialState: SettingsState = {
  autoPlayTripSummaryVoice: false,
  driveFocusReminderEnabled: true,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setAutoPlayTripSummaryVoice(state, action: PayloadAction<boolean>) {
      state.autoPlayTripSummaryVoice = action.payload;
    },
    setDriveFocusReminderEnabled(state, action: PayloadAction<boolean>) {
      state.driveFocusReminderEnabled = action.payload;
    },
  },
});

export const { setAutoPlayTripSummaryVoice, setDriveFocusReminderEnabled } = settingsSlice.actions;
export default settingsSlice.reducer;
