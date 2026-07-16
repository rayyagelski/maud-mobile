import client from '../client';
import type { Expense, CreateExpenseParams, ExpenseSummary } from '../../types/expense.types';

interface ExpenseDto {
  id: number;
  category: string;
  amount: number;
  currencyCode: string;
  expenseDate: string;
  vendor: string | null;
  notes: string | null;
}

function fromDto(dto: ExpenseDto): Expense {
  return {
    id: dto.id,
    category: dto.category as Expense['category'],
    amount: dto.amount,
    currencyCode: dto.currencyCode,
    expenseDate: dto.expenseDate,
    vendor: dto.vendor,
    notes: dto.notes,
  };
}

export const expensesApi = {
  list: async (vehicleId: string, days = 28) => {
    const res = await client.get<{ expenses: ExpenseDto[] }>(`/vehicles/${vehicleId}/expenses`, {
      params: { days },
    });
    return res.data.expenses.map(fromDto);
  },

  create: async (vehicleId: string, params: CreateExpenseParams) => {
    const res = await client.post<{ expense: ExpenseDto }>(`/vehicles/${vehicleId}/expenses`, {
      category: params.category,
      amount: params.amount,
      currency_code: params.currencyCode,
      expense_date: params.expenseDate,
      vendor: params.vendor,
      notes: params.notes,
    });
    return fromDto(res.data.expense);
  },

  summary: async (vehicleId: string, days = 28) => {
    const res = await client.get<ExpenseSummary>(`/vehicles/${vehicleId}/expenses/summary`, {
      params: { days },
    });
    return res.data;
  },
};
