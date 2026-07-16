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
  completedWorks: CompletedWork[];
  nextDueDate: string | null; // YYYY-MM-DD
  mileageIn: number | null;
  mileageOut: number | null;
}

export interface ServiceRecordState {
  records: ServiceRecord[];
  selectedRecord: ServiceRecord | null;
  isLoading: boolean;
  error: string | null;
}
