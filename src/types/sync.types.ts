import type { SubmitTripRewardParams } from '../api/endpoints/trips';
import type { CreateExpenseParams } from './expense.types';
import type { CreateVgdTripParams, VgdPoint } from './vgd.types';

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

// Correlates back to the local trip via `localTripId` — `params.id` (the VGD
// trip UUID) is the same value, but kept as a distinct field here for clarity
// and because patch items below only have the VGD id, not a local one.
interface VgdCreateTripSyncItem {
  id: string;
  kind: 'vgd_create_trip';
  createdAt: number;
  localTripId: string;
  params: CreateVgdTripParams;
}

interface VgdPatchPointsSyncItem {
  id: string;
  kind: 'vgd_patch_points';
  createdAt: number;
  vgdTripId: string;
  points: VgdPoint[];
}

export type SyncQueueItem =
  | TripRewardSyncItem
  | ExpenseCreateSyncItem
  | VgdCreateTripSyncItem
  | VgdPatchPointsSyncItem;

// Omit-ing each variant individually (rather than the union as a whole) so
// the discriminated union's per-variant fields (tripId vs vehicleId) survive
// — Omit<Union, K> collapses to only the keys common across all variants.
export type SyncQueueItemInput =
  | Omit<TripRewardSyncItem, 'id' | 'createdAt'>
  | Omit<ExpenseCreateSyncItem, 'id' | 'createdAt'>
  | Omit<VgdCreateTripSyncItem, 'id' | 'createdAt'>
  | Omit<VgdPatchPointsSyncItem, 'id' | 'createdAt'>;

export interface SyncQueueState {
  items: SyncQueueItem[];
}
