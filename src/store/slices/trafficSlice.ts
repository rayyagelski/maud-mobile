import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlannedRoute } from '../../types/trip.types';

export interface RerouteSuggestion {
  delaySeconds: number;
  alternativeRoute: PlannedRoute;
  alternativeDistanceMeters: number;
  alternativeDurationSeconds: number;
}

export interface TrafficState {
  // Ephemeral (live, trip-scoped) — rehydrating a stale value on app restart
  // is harmless since useTrafficMonitor only runs during an active trip and
  // clears this on mount/unmount, same convention as complianceSlice.
  rerouteSuggestion: RerouteSuggestion | null;
  // Delay (seconds) of the last suggestion the driver dismissed this trip —
  // gates re-notification via trafficBackupLogic's shouldRenotify. Reset to 0
  // whenever the suggestion is accepted or the trip ends.
  dismissedDelaySeconds: number;
}

const initialState: TrafficState = {
  rerouteSuggestion: null,
  dismissedDelaySeconds: 0,
};

const trafficSlice = createSlice({
  name: 'traffic',
  initialState,
  reducers: {
    setRerouteSuggestion(state, action: PayloadAction<RerouteSuggestion>) {
      state.rerouteSuggestion = action.payload;
    },
    dismissRerouteSuggestion(state) {
      if (state.rerouteSuggestion) {
        state.dismissedDelaySeconds = state.rerouteSuggestion.delaySeconds;
      }
      state.rerouteSuggestion = null;
    },
    clearRerouteSuggestion(state) {
      state.rerouteSuggestion = null;
      state.dismissedDelaySeconds = 0;
    },
  },
});

export const { setRerouteSuggestion, dismissRerouteSuggestion, clearRerouteSuggestion } = trafficSlice.actions;
export default trafficSlice.reducer;
