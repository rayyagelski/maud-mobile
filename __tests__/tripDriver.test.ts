import { tripDriverSlot, tripsForDriverSlot, effectiveViewedSlot, driverForSlot } from '../src/utils/tripDriver';
import { reconcileTripHistory, vgdDriverSlot } from '../src/utils/tripHistorySync';
import type { Driver } from '../src/types/driver.types';
import type { Trip } from '../src/types/trip.types';
import type { VgdTripSummary } from '../src/types/vgd.types';

const MANFRED: Driver = { id: '1', name: 'Manfred', role: 'self', isDefault: true };
const MARGIT: Driver = { id: '5', name: 'Margit', role: 'family', isDefault: false };
const ALEX: Driver = { id: '6', name: 'Alex', role: 'other', isDefault: false };
const DRIVERS = [MANFRED, MARGIT, ALEX];

function trip(id: string, extra: Partial<Trip> = {}): Trip {
  return {
    id, vehicleId: 'v', driverId: '1', tripType: 'private', transportMode: 'car', status: 'completed',
    startTime: 1, route: [], events: [], ...extra,
  };
}

describe('which driver a trip belongs to', () => {
  it('uses the slot stored on the trip first', () => {
    expect(tripDriverSlot(trip('a', { driverId: '1', driverSlot: 'child' }), DRIVERS)).toBe('child');
  });

  it('falls back to the recording driver for older trips', () => {
    expect(tripDriverSlot(trip('a', { driverId: '5' }), DRIVERS)).toBe('spouse');
    expect(tripDriverSlot(trip('a', { driverId: '6' }), DRIVERS)).toBe('child');
  });

  it('treats trips of unknown drivers as the account holder\'s', () => {
    expect(tripDriverSlot(trip('a', { driverId: 'gone' }), DRIVERS)).toBe('main');
  });

  it('filters a trip list to one driver', () => {
    const trips = [trip('m'), trip('s', { driverId: '5' }), trip('c', { driverSlot: 'child' })];
    expect(tripsForDriverSlot(trips, DRIVERS, 'child').map(t => t.id)).toEqual(['c']);
    expect(tripsForDriverSlot(trips, DRIVERS, 'main').map(t => t.id)).toEqual(['m']);
  });
});

describe('viewed driver', () => {
  it('defaults to the account holder', () => {
    expect(effectiveViewedSlot(DRIVERS, undefined)).toBe('main');
  });

  it('falls back to the account holder when the viewed driver no longer exists', () => {
    expect(effectiveViewedSlot([MANFRED], 'child')).toBe('main');
    expect(effectiveViewedSlot(DRIVERS, 'child')).toBe('child');
    expect(driverForSlot(DRIVERS, 'child')?.name).toBe('Alex');
  });
});

describe('history sync takes the driver from VGD', () => {
  const summary = (tripId: string, driver: string) =>
    ({ tripId, driver, purpose: 'private', analytics: { startTime: 100, endTime: 200 } } as unknown as VgdTripSummary);

  it('restored trips get VGD\'s driver slot', () => {
    const out = reconcileTripHistory([], [summary('t1', 'child')], [], 'v', '1');
    expect(out[0].driverSlot).toBe('child');
  });

  it('corrects the slot of a trip already on the phone (Alex, 22 Oct: spouse -> child)', () => {
    const local = trip('local', { vgdTripId: 't1', driverId: '6', driverSlot: 'spouse' });
    const out = reconcileTripHistory([local], [summary('t1', 'child')], [], 'v', '1');
    expect(out).toHaveLength(1);
    expect(out[0].driverSlot).toBe('child');
  });

  it('ignores driver values VGD doesn\'t define', () => {
    expect(vgdDriverSlot('family')).toBeUndefined();
    const local = trip('local', { vgdTripId: 't1', driverSlot: 'main' });
    expect(reconcileTripHistory([local], [summary('t1', 'nobody')], [], 'v', '1')[0].driverSlot).toBe('main');
  });
});
