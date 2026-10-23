jest.mock('../src/hooks/useAppSelector', () => ({ useAppSelector: jest.fn() }));
jest.mock('../src/hooks/useAppDispatch', () => ({ useAppDispatch: jest.fn() }));

import { driverSlot, driverRoleLabel, takenDriverSlots, SELECTABLE_DRIVER_ROLES } from '../src/utils/driverRoles';
import { mapDriverRoleToVgd } from '../src/utils/vgdPointMapper';
import { shouldRefreshDrivers, DRIVERS_REFRESH_MIN_INTERVAL_MS } from '../src/hooks/useDriversRefresh';
import driverReducer, { fetchDrivers } from '../src/store/slices/driverSlice';
import type { Driver } from '../src/types/driver.types';

describe('driver roles = VGD driver slots', () => {
  it('maps explicit roles to their slot', () => {
    expect(mapDriverRoleToVgd('self')).toBe('main');
    expect(mapDriverRoleToVgd('spouse')).toBe('spouse');
    expect(mapDriverRoleToVgd('child')).toBe('child');
  });

  it('keeps legacy roles in the slot they were always uploaded to', () => {
    // Margit ('family') stays SPOUSE; Alex ('other' since 23 Oct) stays CHILD.
    expect(mapDriverRoleToVgd('family')).toBe('spouse');
    expect(mapDriverRoleToVgd('other')).toBe('child');
  });

  it('never sends VGD an unknown driver value (that would lose the trip)', () => {
    expect(driverSlot('cousin')).toBe('main');
  });

  it('labels roles by slot', () => {
    expect(driverRoleLabel('self')).toBe('Main');
    expect(driverRoleLabel('family')).toBe('Spouse');
    expect(driverRoleLabel('other')).toBe('Child');
    expect(driverRoleLabel('child')).toBe('Child');
  });

  it('only offers main, spouse and child, and knows which are taken', () => {
    expect(SELECTABLE_DRIVER_ROLES.map(r => r.slot)).toEqual(['main', 'spouse', 'child']);
    const taken = takenDriverSlots([{ role: 'self' }, { role: 'family' }]);
    expect([...taken].sort()).toEqual(['main', 'spouse']);
    expect(taken.has('child')).toBe(false);
  });
});

describe('driver list refresh', () => {
  it('refreshes on first launch and then at most every 5 minutes', () => {
    expect(shouldRefreshDrivers(null, 1000)).toBe(true);
    expect(shouldRefreshDrivers(1000, 1000 + DRIVERS_REFRESH_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldRefreshDrivers(1000, 1000 + DRIVERS_REFRESH_MIN_INTERVAL_MS)).toBe(true);
  });

  it('updates the selected driver with fresh details from the server', () => {
    const stale: Driver = { id: '6', name: 'Alex', role: 'family', isDefault: false };
    const fresh: Driver = { ...stale, role: 'other' };
    const state = driverReducer(
      { drivers: [stale], selectedDriver: stale, isLoading: false, error: null },
      { type: fetchDrivers.fulfilled.type, payload: [fresh] },
    );
    expect(state.selectedDriver?.role).toBe('other');
    expect(state.drivers[0].role).toBe('other');
  });
});
