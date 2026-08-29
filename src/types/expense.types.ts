export type ExpenseCategory = 'fuel' | 'other';

// 'leasing', 'insurance', 'tax' and 'service' are synthetic category keys
// returned by the summary endpoint only — derived for real from the
// vehicle's own Leasing/Financing/Insurance/Registration/ServiceAndRepair
// records, never storable categories for a manually-created Expense.
export type ExpenseSummaryCategory = ExpenseCategory | 'leasing' | 'insurance' | 'tax' | 'service';

export interface Expense {
  id: number;
  category: ExpenseCategory;
  amount: number;
  currencyCode: string;
  expenseDate: string; // YYYY-MM-DD
  vendor?: string | null;
  notes?: string | null;
}

export interface CreateExpenseParams {
  category: ExpenseCategory;
  amount: number;
  currencyCode?: string;
  expenseDate: string; // YYYY-MM-DD
  vendor?: string;
  notes?: string;
}

export interface ExpenseSummary {
  actual: Partial<Record<ExpenseSummaryCategory, number>>;
  predicted: Partial<Record<ExpenseSummaryCategory, number>>;
  // Same per-category breakdown as `actual`, recomputed for the equal-length
  // period immediately preceding the requested one — powers the "vs previous
  // period" trend shown on each Cost Breakdown item.
  previousActual: Partial<Record<ExpenseSummaryCategory, number>>;
  totalActual: number;
  totalPredicted: number;
  currencyCode: string;
}

export interface ExpenseState {
  expenses: Expense[];
  summary: ExpenseSummary | null;
  isLoading: boolean;
  error: string | null;
}
