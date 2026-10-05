import { configureStore, combineReducers } from '@reduxjs/toolkit';
import {
  persistStore, persistReducer, type PersistConfig,
  FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER,
} from 'redux-persist';
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
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTransform, type PersistorOptions } from 'redux-persist';
import { beginLaunch, checkpoint, resetFailureCount, FAILED_LAUNCHES_BEFORE_RECOVERY } from '../services/startupGuard';
import { logDiagnostic } from '../services/diagnosticsLog';
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
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
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
const RECOVERY_PROMPT_TIMEOUT_MS = 60_000;

function askToResetLocalData(failedLaunches: number): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(false), RECOVERY_PROMPT_TIMEOUT_MS);
    setTimeout(() => Alert.alert(
      'MAUD Connect didn\'t start correctly',
      `The app got stuck while starting the last ${failedLaunches} times. Resetting its local data usually fixes this `
        + 'without reinstalling.\n\nYour recorded trips are kept on the server and come back automatically. '
        + 'You\'ll stay logged in, but you may need to pair your car again.',
      [
        { text: 'Try again', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Reset local data', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    ), RECOVERY_PROMPT_DELAY_MS);
  });
}

beginLaunch()
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
