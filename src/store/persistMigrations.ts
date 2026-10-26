import type { MigrationManifest, PersistedState } from 'redux-persist';

// Versions of the saved state ('persist:root', see store/index.ts). A saved
// state from before a version is passed through each newer migration once,
// on the first start of the app version that adds it. Every migration must
// leave a state it doesn't recognise unchanged.
export const PERSIST_VERSION = 1;

type Slices = { settings?: Record<string, unknown>; compliance?: Record<string, unknown> };

export const persistMigrations: MigrationManifest = {
  // 2026-10-26: new defaults, applied once to existing installs too (the
  // driver can still change them in Settings / Speed Zones afterwards):
  // trip summary auto-play ON, Drive Focus reminder OFF, Speed Zone alerts ON.
  1: (state: PersistedState): PersistedState => {
    if (!state) return state;
    const s = state as PersistedState & Slices;
    return {
      ...s,
      ...(s.settings && {
        settings: { ...s.settings, autoPlayTripSummaryVoice: true, driveFocusReminderEnabled: false },
      }),
      ...(s.compliance && { compliance: { ...s.compliance, alertsEnabled: true } }),
    } as PersistedState;
  },
};
