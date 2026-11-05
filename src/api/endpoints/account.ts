import client from '../client';

// Erasing a long trip history takes the server far longer than a normal
// request (it allows 60 s for the trip data alone).
const DELETE_TIMEOUT_MS = 120_000;

export const accountApi = {
  // POST /api/v1/account/delete (App\Controller\API\AccountController).
  delete: (password: string) =>
    client.post<{ status: string }>('/account/delete', { password }, { timeout: DELETE_TIMEOUT_MS }),
};
