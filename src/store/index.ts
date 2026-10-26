import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, type PersistConfig } from 'redux-persist';
import { throttledAsyncStorage } from './throttledAsyncStorage';
import { tripsPersistTransform } from './tripsPersistTransform';
import authReducer from './slices/authSlice';
import vehicleReducer from './slices/vehicleSlice';
import driverReducer from './slices/driverSlice';
import tripReducer from './slices/tripSlice';
import complianceReducer from './slices/complianceSlice';
import trafficReducer from './slices/trafficSlice';
import expenseReducer from './slices/expenseSlice';
import serviceRecordReducer from './slices/serviceRecordSlice';
import rewardReducer from './slices/rewardSlice';
import syncQueueReducer from './slices/syncQueueSlice';
import bluetoothPairingReducer from './slices/bluetoothPairingSlice';
import settingsReducer from './slices/settingsSlice';
import { tokenPersistMiddleware } from './tokenPersistMiddleware';
import { recentActionsMiddleware } from './recentActions';
import { Alert, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMigrate, createTransform, type PersistorOptions } from 'redux-persist';
import { PERSIST_VERSION, persistMigrations } from './persistMigrations';
import {
  beginLaunch, checkpoint, getPreviousLaunchSummary, resetFailureCount, FAILED_LAUNCHES_BEFORE_RECOVERY,
} from '../services/startupGuard';
import { getDiagnosticsReport, logDiagnostic } from '../services/diagnosticsLog';
import { installHangWatchdog, takeHangReports } from '../services/hangWatchdog';
import { HEADLESS_LOCATION_QUEUE_KEY } from '../utils/constants';
import type { SyncQueueState } from '../types/sync.types';

// isSyncing describes a flush running in THIS process. Persisted as-is, an
// app killed mid-flush (likely while the server hangs — each request waits
// out its 15 s timeout) came back with isSyncing:true, and flushSyncQueue's
// "already running" guard then skipped every flush forever: the queue never
// drained and kept growing with every drive.
const syncQueueTransientTransform = createTransform<SyncQueueState, SyncQueueState>(
  (inbound) => ({ ...inbound, isSyncing: false }),
  (outbound) => ({ ...outbound, isSyncing: false }),
  { whitelist: ['syncQueue'] },
);

const rootReducer = combineReducers({
  auth: authReducer,
  vehicles: vehicleReducer,
  drivers: driverReducer,
  trips: tripReducer,
  compliance: complianceReducer,
  traffic: trafficReducer,
  expenses: expenseReducer,
  serviceRecords: serviceRecordReducer,
  rewards: rewardReducer,
  syncQueue: syncQueueReducer,
  bluetoothPairing: bluetoothPairingReducer,
  settings: settingsReducer,
});

// Explicitly typed rather than inferred from the object literal: adding
// `transforms` below otherwise widens persistReducer's inferred state to a
// Partial<> of the root state, which then fails to satisfy configureStore
// and breaks the AppDispatch type for every thunk in the app.
const persistConfig: PersistConfig<ReturnType<typeof rootReducer>> = {
  key: 'root',
  // Throttled, not raw AsyncStorage — see throttledAsyncStorage.ts. Every
  // dispatch touching a whitelisted slice (trips especially, during active
  // GPS tracking) otherwise re-serializes and writes the whole combined
  // 'persist:root' blob, and that cost grows with trip length while write
  // frequency stays constant — real-drive testing showed this stalling the
  // JS thread badly enough to freeze the app ~15-25 minutes into a trip.
  storage: throttledAsyncStorage,
  // expenses/serviceRecords are backend-owned lists refetched per screen visit,
  // not persisted (unlike trips, which need offline durability).
  // auth is deliberately NOT persisted here — the token lives in encrypted
  // storage instead (see secureTokenStorage.ts / tokenPersistMiddleware.ts)
  // and is restored on launch by AppNavigator.
  whitelist: ['vehicles', 'drivers', 'trips', 'compliance', 'syncQueue', 'bluetoothPairing', 'settings'],
  // Bounds the one slice that grows without limit, so the blob this config
  // writes/reads can't keep getting more expensive every drive — see
  // tripsPersistTransform.ts. Throttling (above) reduced how OFTEN the blob
  // is written; this caps how BIG it gets.
  transforms: [tripsPersistTransform, syncQueueTransientTransform],
  // One-time changes to saved state, e.g. new defaults for existing installs.
  version: PERSIST_VERSION,
  migrate: createMigrate(persistMigrations, { debug: false }),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

// Redux Toolkit's immutability and serializability checks are dev-mode-only
// bug detectors that walk the ENTIRE state on every dispatch (immutability:
// twice). Field-test APKs ship a --dev true bundle (yarn debug-apk-standalone),
// so they ran on the phone too, and their cost grows with every recorded trip:
// measured ~35x the cost of the dispatch itself at a 0.9 MB state, before
// dev-mode JS slowness on a phone. Freezes logged right after REHYDRATE and
// after bursts of sync/reward actions match that. They never change behavior
// (production builds strip them), so turning them off is safe.
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }).concat(tokenPersistMiddleware, recentActionsMiddleware),
});

// Loading persisted state is started by hand (manualPersist) so the startup
// guard can run first: after FAILED_LAUNCHES_BEFORE_RECOVERY launches in a
// row that never became usable, the driver is offered a reset of local data
// before that data is loaded again — the in-app equivalent of the reinstall
// that was otherwise the only way out. See startupGuard.ts.
export const persistor = persistStore(store, { manualPersist: true } as PersistorOptions);

const unsubscribeBootstrap = persistor.subscribe(() => {
  if (persistor.getState().bootstrapped) {
    unsubscribeBootstrap();
    checkpoint('persisted state loaded');
  }
});

// Never lets the prompt hold startup hostage: shown after a short delay (this
// runs while the first screen is still being set up), and treated as "Try
// again" if no answer comes — e.g. the dialog couldn't be shown at all.
const RECOVERY_PROMPT_DELAY_MS = 500;
// Long enough to read the prompt, take a screenshot and share the report.
// It was 60 s: a driver still reading it had startup carry on (and freeze)
// behind the open prompt, after which its buttons no longer responded.
const RECOVERY_PROMPT_TIMEOUT_MS = 5 * 60_000;
// Share sends the text through an Android Intent, whose size is limited.
const MAX_REPORT_CHARS = 60_000;

// The prompt itself says where the last stuck launch stopped, so a
// screenshot is enough even if nothing after it works. "Send report" shares
// the whole Diagnostics log, prepared before the prompt is shown so the tap
// only has to open the share sheet; then the prompt comes back. A reinstall
// would wipe that log, which is why it is offered here.
function askToResetLocalData(failedLaunches: number): Promise<boolean> {
  const stuckAt = getPreviousLaunchSummary();
  const reportReady = getDiagnosticsReport()
    .then(report => report.slice(-MAX_REPORT_CHARS))
    .catch(() => '');
  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const answer = (reset: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(reset);
    };
    const ask = () => {
      if (settled) return;
      clearTimeout(timeout);
      // Also runs while the share sheet is open, so a share that never
      // returns can't hold startup either.
      timeout = setTimeout(() => answer(false), RECOVERY_PROMPT_TIMEOUT_MS);
      Alert.alert(
        'MAUD Connect didn\'t start correctly',
        `The app got stuck while starting the last ${failedLaunches} times. Resetting its local data usually fixes this `
          + 'without reinstalling.\n\nYour recorded trips are kept on the server and come back automatically. '
          + 'You\'ll stay logged in, but you may need to pair your car again.\n\n'
          + (stuckAt ? `Last start stopped at: ${stuckAt}\n\n` : '')
          + 'Please take a screenshot of this message and tap "Send report" before resetting.',
        [
          {
            text: 'Send report',
            onPress: () => {
              logDiagnostic('Startup recovery: report sent.', { failedLaunches });
              reportReady
                .then(report => Share.share({
                  message: `${stuckAt ? `Last start stopped at: ${stuckAt}\n\n` : ''}${report}`,
                }))
                .catch(() => {})
                .finally(ask);
            },
          },
          { text: 'Try again', style: 'cancel', onPress: () => answer(false) },
          { text: 'Reset local data', style: 'destructive', onPress: () => answer(true) },
        ],
        { cancelable: false },
      );
    };
    setTimeout(ask, RECOVERY_PROMPT_DELAY_MS);
  });
}

// Started before anything else so a freeze anywhere in startup is recorded
// (see hangWatchdog.ts). A report from an earlier run goes into the
// Diagnostics log before the recovery prompt, so "Send report" includes it.
installHangWatchdog();

takeHangReports()
  .then((report) => {
    if (report) logDiagnostic('Freeze report from an earlier run (native watchdog).', { report });
  })
  .then(() => beginLaunch())
  .then(async (failedLaunches) => {
    if (failedLaunches < FAILED_LAUNCHES_BEFORE_RECOVERY) return;
    const reset = await askToResetLocalData(failedLaunches);
    logDiagnostic('Startup recovery offered.', { failedLaunches, resetChosen: reset });
    if (reset) {
      await throttledAsyncStorage.removeItem(`persist:${persistConfig.key}`);
      await AsyncStorage.removeItem(HEADLESS_LOCATION_QUEUE_KEY);
    }
    resetFailureCount();
  })
  .catch(() => {})
  .finally(() => {
    checkpoint('loading persisted state');
    persistor.persist();
  });

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
