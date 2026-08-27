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
  // Set once the user has clicked through LocationPermissionScreen (Allow or
  // Skip). AppNavigator gates TripDetectionRunner's mount on this rather than
  // on bare OS-permission-granted state: granting foreground location fires
  // mid-screen (before the background-location and battery-optimization
  // follow-up dialogs, and before MainTabs), so gating on permission alone let
  // BackgroundGeolocation start motion detection while the user was still
  // working through onboarding, nowhere near the vehicle. Persisted (not
  // reset on logout) since this only reflects whether the OS-permission-flow
  // UI has been shown once, not per-session state.
  locationOnboardingComplete: boolean;
  // Default trip purpose applied to every new trip — previously hardcoded
  // per-trip in RoutePlannerScreen with no way to change it globally.
  defaultTripType: 'private' | 'business';
}

const initialState: SettingsState = {
  autoPlayTripSummaryVoice: false,
  driveFocusReminderEnabled: true,
  locationOnboardingComplete: false,
  defaultTripType: 'private',
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
    setLocationOnboardingComplete(state, action: PayloadAction<boolean>) {
      state.locationOnboardingComplete = action.payload;
    },
    setDefaultTripType(state, action: PayloadAction<'private' | 'business'>) {
      state.defaultTripType = action.payload;
    },
  },
});

export const {
  setAutoPlayTripSummaryVoice,
  setDriveFocusReminderEnabled,
  setLocationOnboardingComplete,
  setDefaultTripType,
} = settingsSlice.actions;
export default settingsSlice.reducer;
