export type ExpenseCategory = 'fuel' | 'leasing' | 'insurance' | 'tax' | 'other';

// 'service' is a synthetic category key returned by the summary endpoint,
// derived from real ServiceAndRepair records — never a storable category for
// a manually-created Expense.
export type ExpenseSummaryCategory = ExpenseCategory | 'service';

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
