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

// ── Upcoming services ──────────────────────────────────────────────────────
// The manufacturer-listed jobs belonging to the vehicle's NEXT service
// visit (the one the "Next Service Due" header describes), from the
// backend's UpcomingServicesService (TorqueNode maintenance schedule
// resolved against the next-due mileage).

export interface UpcomingService {
  name: string;               // e.g. "Replace Engine Oil", as the manufacturer lists it
  action: string | null;      // "Replace" | "Inspect" | "Rotate" | ...
  component: VehicleComponent | null;
  dueDate: string | null;     // YYYY-MM-DD — the visit's date; same for every service in it
}

export interface UpcomingServicesResponse {
  // false = schedule couldn't be fetched (no key, vehicle unknown, network)
  available: boolean;
  nextService: {
    dueDate: string | null;
    dueMileageKm: number | null;
    // The schedule milestone the visit falls on (manufacturer's own figure).
    milestoneMileageKm: number;
    milestoneMileageMiles: number;
    anchor: 'service-record' | 'odometer' | 'first-milestone';
  } | null;
  services: UpcomingService[];
}

export interface ServiceRecordState {
  records: ServiceRecord[];
  selectedRecord: ServiceRecord | null;
  isLoading: boolean;
  error: string | null;
}
