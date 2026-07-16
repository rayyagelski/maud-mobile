import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { generateId } from '../../utils/helpers';
import type { SyncQueueItem, SyncQueueItemInput, SyncQueueState } from '../../types/sync.types';

const initialState: SyncQueueState = {
  items: [],
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
  },
});

export const { enqueueSyncItem, dequeueSyncItem } = syncQueueSlice.actions;
export default syncQueueSlice.reducer;
