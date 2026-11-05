import axios from 'axios';
import client from '../src/api/client';
import { logout } from '../src/store/slices/authSlice';
import tripReducer, { clearAllTrips } from '../src/store/slices/tripSlice';
import type { TripState } from '../src/types/trip.types';
import { accountDeletionErrorMessage } from '../src/utils/accountDeletion';

// Through the real client, so the tests see the error shape its response
// interceptor actually rejects with, not an axios error.
async function rejectionFor(response: { status: number; data: unknown } | null): Promise<any> {
  const adapter = async (config: any) => {
    if (response === null) throw new axios.AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED', config);
    throw new axios.AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
      ...response, statusText: '', headers: {}, config,
    });
  };
  return client.post('/account/delete', { password: 'x' }, { adapter }).catch((error: unknown) => error);
}

describe('account deletion: what the customer is told', () => {
  it('names a wrong password', async () => {
    const error = await rejectionFor({ status: 403, data: { status: 'error', message: 'invalid_password' } });
    expect(accountDeletionErrorMessage(error)).toBe("That password isn't correct.");
  });

  it('says the account is still there when the server could not finish', async () => {
    const error = await rejectionFor({ status: 503, data: { status: 'error', message: 'erasure_failed' } });
    expect(accountDeletionErrorMessage(error)).toContain("wasn't deleted");
  });

  it('does not call another refusal a wrong password', async () => {
    const error = await rejectionFor({ status: 403, data: { status: 'error', message: 'forbidden' } });
    expect(accountDeletionErrorMessage(error)).toBe("Your account wasn't deleted. Please try again.");
  });

  it('does not claim the account survived when no answer came back', async () => {
    const message = accountDeletionErrorMessage(await rejectionFor(null));
    expect(message).toContain("couldn't reach the server");
    expect(message).not.toContain("wasn't deleted");
  });
});

describe('account deletion: trips stored on the phone', () => {
  const initial = tripReducer(undefined, { type: 'init' });
  const withTrip = { ...initial, activeTrip: { id: 't1' }, history: [{ id: 't0' }] } as unknown as TripState;

  it('wipes them, unlike a plain logout which keeps them', () => {
    expect(tripReducer(withTrip, clearAllTrips())).toEqual(initial);
    expect(tripReducer(withTrip, logout())).toEqual(withTrip);
  });
});
