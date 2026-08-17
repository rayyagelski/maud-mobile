import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import { throttledAsyncStorage } from './throttledAsyncStorage';
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

const persistConfig = {
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
