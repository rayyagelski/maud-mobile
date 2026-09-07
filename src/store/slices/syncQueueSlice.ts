import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { generateId } from '../../utils/helpers';
import { logout } from './authSlice';
import type { SyncQueueItem, SyncQueueItemInput, SyncQueueState } from '../../types/sync.types';

const initialState: SyncQueueState = {
  items: [],
  isSyncing: false,
  lastSyncedAt: null,
};

const syncQueueSlice = createSlice({
  name: 'syncQueue',
  initialState,
  reducers: {
    enqueueSyncItem(
      state,
      action: PayloadAction<SyncQueueItemInput>,
    ) {
      state.items.push({
        ...action.payload,
        id: generateId(),
        createdAt: Date.now(),
      } as SyncQueueItem);
    },
    dequeueSyncItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter(item => item.id !== action.payload);
    },
    syncStarted(state) {
      state.isSyncing = true;
    },
    syncFinished(state) {
      state.isSyncing = false;
      state.lastSyncedAt = Date.now();
    },
  },
  extraReducers: (builder) => {
    builder
      // Queued items reference local trip/vehicle IDs with no owning-user tag
      // (see syncEngine.ts) — flushed here deliberately before this ever
      // fires (see HomeScreen.tsx's logout handler), so by the time `logout`
      // actually dispatches, either everything synced under the outgoing
      // user's token or the user explicitly chose to discard what's left.
      // Resetting on the raw `logout` case too is just a safety net against
      // any other logout path forgetting to flush first.
      .addCase(logout, () => initialState);
  },
});

export const { enqueueSyncItem, dequeueSyncItem, syncStarted, syncFinished } = syncQueueSlice.actions;
export default syncQueueSlice.reducer;
