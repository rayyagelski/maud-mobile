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
  transforms: [tripsPersistTransform],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(tokenPersistMiddleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
