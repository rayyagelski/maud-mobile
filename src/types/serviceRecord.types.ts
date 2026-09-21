export interface CompletedWork {
  description: string | null;
  costOfLabour: number | null;
  costOfParts: number | null;
}

export interface ServiceRecord {
  id: number;
  date: string | null; // YYYY-MM-DD
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  invoiceNumber: string | null;
  customerId: string | null;
  totalCost: number;
  currencyCode: string;
  completedWorks: CompletedWork[];
  nextDueDate: string | null; // YYYY-MM-DD
  // km, same unit as mileageIn/mileageOut — last service mileage + the
  // AI-estimated distance interval (see backend ServiceDueDateEnrichmentService).
  nextDueMileage: number | null;
  mileageIn: number | null;
  mileageOut: number | null;
}

// ── Vehicle condition (driver-reported, backend-synced) ────────────────────

export type VehicleComponent = 'brakes' | 'tires' | 'battery' | 'alignment';
export type ComponentConditionStatus = 'good' | 'warning' | 'bad';

export interface ComponentCondition {
  component: VehicleComponent;
  status: ComponentConditionStatus;
  updatedAt: string | null;
}

// ── Predictive alerts ──────────────────────────────────────────────────────

export type ServiceUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'ok';

export interface ServicePrediction {
  jobType: string;
  label: string;
  component: VehicleComponent | null;
  // true = no recorded occurrence of this job; projected from the vehicle's
  // current odometer / age to the next interval boundary instead.
  estimated: boolean;
  lastDoneDate: string | null;
  lastDoneMileageKm: number | null;
  dueDate: string | null;
  dueMileageKm: number | null;
  daysRemaining: number | null;
  kmRemaining: number | null;
  urgency: ServiceUrgency;
}

export interface ServiceRecordState {
  records: ServiceRecord[];
  selectedRecord: ServiceRecord | null;
  isLoading: boolean;
  error: string | null;
}
