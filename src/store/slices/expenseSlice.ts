import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { expensesApi } from '../../api';
import { enqueueSyncItem } from './syncQueueSlice';
import type { Expense, ExpenseState, ExpenseSummary, CreateExpenseParams } from '../../types/expense.types';

const initialState: ExpenseState = {
  expenses: [],
  summary: null,
  isLoading: false,
  error: null,
};

export const fetchExpenses = createAsyncThunk(
  'expenses/fetchAll',
  async (params: { vehicleId: string; days?: number }, { rejectWithValue }) => {
    try {
      return await expensesApi.list(params.vehicleId, params.days);
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load expenses');
    }
  },
);

export const fetchExpenseSummary = createAsyncThunk(
  'expenses/fetchSummary',
  async (params: { vehicleId: string; days?: number }, { rejectWithValue }) => {
    try {
      return await expensesApi.summary(params.vehicleId, params.days);
    } catch (err: unknown) {
      const e = err as { errStatus?: string };
      return rejectWithValue(e.errStatus ?? 'Failed to load expense summary');
    }
  },
);

export const createExpense = createAsyncThunk(
  'expenses/create',
  async (params: { vehicleId: string; data: CreateExpenseParams }, { dispatch, rejectWithValue }) => {
    try {
      return await expensesApi.create(params.vehicleId, params.data);
    } catch (err: unknown) {
      const e = err as { status?: number; errStatus?: string };
      // Genuine network failure (no HTTP response reached) — queue for
      // automatic retry once connectivity returns, rather than losing the
      // entry. A real backend rejection (defined `status`) is not queued.
      if (e.status === undefined) {
        dispatch(enqueueSyncItem({ kind: 'expense_create', vehicleId: params.vehicleId, params: params.data }));
        return rejectWithValue('offline_queued');
      }
      return rejectWithValue(e.errStatus ?? 'Failed to add expense');
    }
  },
);

const expenseSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    clearExpenseError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExpenses.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(fetchExpenses.fulfilled, (state, action: PayloadAction<Expense[]>) => {
        state.isLoading = false;
        state.expenses = action.payload;
      })
      .addCase(fetchExpenses.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchExpenseSummary.fulfilled, (state, action: PayloadAction<ExpenseSummary>) => {
        state.summary = action.payload;
      })
      .addCase(createExpense.fulfilled, (state, action: PayloadAction<Expense>) => {
        state.expenses.unshift(action.payload);
      })
      .addCase(createExpense.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearExpenseError } = expenseSlice.actions;
export default expenseSlice.reducer;
