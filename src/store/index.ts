import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authReducer from './slices/authSlice';
import vehicleReducer from './slices/vehicleSlice';
import driverReducer from './slices/driverSlice';
import tripReducer from './slices/tripSlice';
import complianceReducer from './slices/complianceSlice';
import expenseReducer from './slices/expenseSlice';
import serviceRecordReducer from './slices/serviceRecordSlice';
import rewardReducer from './slices/rewardSlice';
import syncQueueReducer from './slices/syncQueueSlice';
import { tokenPersistMiddleware } from './tokenPersistMiddleware';

const rootReducer = combineReducers({
  auth: authReducer,
  vehicles: vehicleReducer,
  drivers: driverReducer,
  trips: tripReducer,
  compliance: complianceReducer,
  expenses: expenseReducer,
  serviceRecords: serviceRecordReducer,
  rewards: rewardReducer,
  syncQueue: syncQueueReducer,
});

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // expenses/serviceRecords are backend-owned lists refetched per screen visit,
  // not persisted (unlike trips, which need offline durability).
  // auth is deliberately NOT persisted here — the token lives in encrypted
  // storage instead (see secureTokenStorage.ts / tokenPersistMiddleware.ts)
  // and is restored on launch by AppNavigator.
  whitelist: ['vehicles', 'drivers', 'trips', 'compliance', 'syncQueue'],
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
