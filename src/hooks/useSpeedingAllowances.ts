import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useIsImperialUnits } from './useIsImperialUnits';
import { fetchSpeedingAllowances } from '../store/slices/settingsSlice';
import { allowanceRowsFor, type SpeedingAllowanceRow } from '../utils/speedingAllowance';

export const SPEEDING_ALLOWANCES_REFRESH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

// The speeding allowance table for the driver's units (mph / km/h, same
// choice as the backend: the account's country) — see speedingAllowance.ts.
export function useSpeedingAllowanceRows(): { rows: SpeedingAllowanceRow[]; imperial: boolean } {
  const imperial = useIsImperialUnits();
  const tables = useAppSelector(s => s.settings.speedingAllowances);
  const rows = useMemo(() => allowanceRowsFor(tables, imperial), [tables, imperial]);
  return { rows, imperial };
}

// Reloads the tables (edited in Sonata) when the app starts and when it
// comes back to the foreground, at most every 6 hours. A failed load keeps
// the stored (or built-in) tables.
export function useSpeedingAllowancesRefresh(): void {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(s => s.auth.isAuthenticated);
  const lastFetchAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const refresh = () => {
      const now = Date.now();
      if (lastFetchAt.current != null && now - lastFetchAt.current < SPEEDING_ALLOWANCES_REFRESH_MIN_INTERVAL_MS) return;
      lastFetchAt.current = now;
      dispatch(fetchSpeedingAllowances());
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [isAuthenticated, dispatch]);
}
