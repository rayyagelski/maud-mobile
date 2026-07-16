import type { SubmitTripRewardParams } from '../api/endpoints/trips';
import type { CreateExpenseParams } from './expense.types';

interface TripRewardSyncItem {
  id: string;
  kind: 'trip_reward';
  createdAt: number;
  tripId: string;
  params: SubmitTripRewardParams;
}

interface ExpenseCreateSyncItem {
  id: string;
  kind: 'expense_create';
  createdAt: number;
  vehicleId: string;
  params: CreateExpenseParams;
}

export type SyncQueueItem = TripRewardSyncItem | ExpenseCreateSyncItem;

// Omit-ing each variant individually (rather than the union as a whole) so
// the discriminated union's per-variant fields (tripId vs vehicleId) survive
// — Omit<Union, K> collapses to only the keys common across all variants.
export type SyncQueueItemInput =
  | Omit<TripRewardSyncItem, 'id' | 'createdAt'>
  | Omit<ExpenseCreateSyncItem, 'id' | 'createdAt'>;

export interface SyncQueueState {
  items: SyncQueueItem[];
}
