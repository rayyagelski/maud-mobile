import { useIsImperialUnits } from './useIsImperialUnits';

// Rewards (and other cents-only amounts) have no per-record currencyCode from
// the backend, unlike expenses/invoices/service records. Reuse the same
// US-vs-EU signal that already drives imperial vs metric units.
export function useCurrencySymbol(): string {
  return useIsImperialUnits() ? '$' : '€';
}
