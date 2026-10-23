import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { fetchDrivers } from '../store/slices/driverSlice';

export const DRIVERS_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRefreshDrivers(lastFetchAt: number | null, now: number): boolean {
  return lastFetchAt == null || now - lastFetchAt >= DRIVERS_REFRESH_MIN_INTERVAL_MS;
}

/**
 * Reloads the driver profiles when the app starts and when it comes back to
 * the foreground (at most every 5 minutes). Trip upload takes the driver's
 * VGD slot from the copy stored on the phone, which was only refreshed on
 * the Drivers screen: a role corrected on the server (Alex, 23 Oct) would
 * otherwise still have filed the next trip under the old slot.
 */
export function useDriversRefresh(): void {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(s => s.auth.isAuthenticated);
  const lastFetchAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const refresh = () => {
      const now = Date.now();
      if (!shouldRefreshDrivers(lastFetchAt.current, now)) return;
      lastFetchAt.current = now;
      dispatch(fetchDrivers());
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [isAuthenticated, dispatch]);
}
