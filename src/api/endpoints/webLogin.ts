import client from '../client';

// POST /api/v1/web-login-link (App\Controller\API\WebLoginLinkController) —
// a one-time, ~2-minute link that signs the current user in to the MAUD web
// dashboard. Used once, immediately; never stored.
export interface WebLoginLink {
  url: string;
  expiresAt: string;
}

export const webLoginApi = {
  createLink: async (): Promise<WebLoginLink> => {
    const res = await client.post<WebLoginLink>('/web-login-link');
    return res.data;
  },
};
