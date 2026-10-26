import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/api', () => ({ vehiclesApi: { getTripCost: jest.fn() } }));

import { vehiclesApi } from '../src/api';
import { useTripCost, formatTripCost } from '../src/hooks/useTripCost';
import type { TripCostResponse } from '../src/types/vehicle.types';

const getTripCost = vehiclesApi.getTripCost as jest.Mock;

function render(trip: Parameters<typeof useTripCost>[0]) {
  const seen: Array<TripCostResponse | null> = [];
  function Probe() {
    seen.push(useTripCost(trip));
    return null;
  }
  return { seen, mount: () => act(async () => { ReactTestRenderer.create(<Probe />); }) };
}

beforeEach(() => getTripCost.mockReset());

describe('trip cost (Trip History and Eco Score trip details)', () => {
  it('asks the backend for the trip window in unix seconds', async () => {
    getTripCost.mockResolvedValue({ data: { cost: 4.256, currencyCode: 'USD' } });
    const { seen, mount } = render({ vehicleId: 'v1', startTime: 1_792_868_351_820, endTime: 1_792_869_251_820 });
    await mount();
    expect(getTripCost).toHaveBeenCalledWith('v1', 1_792_868_352, 1_792_869_252);
    expect(formatTripCost(seen[seen.length - 1])).toBe('4.26 USD');
  });

  it('shows nothing for a trip still in progress, or when the lookup fails', async () => {
    const inProgress = render({ vehicleId: 'v1', startTime: 1000, endTime: undefined });
    await inProgress.mount();
    expect(getTripCost).not.toHaveBeenCalled();
    expect(inProgress.seen[inProgress.seen.length - 1]).toBeNull();

    getTripCost.mockRejectedValue(new Error('offline'));
    const failed = render({ vehicleId: 'v1', startTime: 1000, endTime: 2000 });
    await failed.mount();
    expect(failed.seen[failed.seen.length - 1]).toBeNull();
  });

  it('formats only real costs', () => {
    expect(formatTripCost(null)).toBeNull();
    expect(formatTripCost({ cost: null, currencyCode: 'USD' })).toBeNull();
    expect(formatTripCost({ cost: 0, currencyCode: 'EUR' })).toBe('0.00 EUR');
  });
});
