import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import client, { configureClient, getRefreshedSharedToken } from '../src/api/client';
import { authApi } from '../src/api/endpoints/auth';

declare const Buffer: { from(text: string): { toString(encoding: 'base64'): string } };

// JWT with only an `exp` claim (no signature needed — the app only decodes it).
function jwt(exp: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/[=]+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp })}.x`;
}

const now = () => Math.floor(Date.now() / 1000);

describe('expired token at startup', () => {
  let sent: InternalAxiosRequestConfig[];
  let refreshCalls: number;

  beforeEach(() => {
    sent = [];
    refreshCalls = 0;
    const adapter: AxiosAdapter = async (config) => {
      sent.push(config);
      const data = config.url === '/refresh' ? { token: jwt(now() + 86400) } : { ok: true };
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    };
    client.defaults.adapter = adapter;
  });

  function signedInWithExpiredToken() {
    let token = jwt(now() - 60);
    const expired = token;
    configureClient(
      () => token,
      async () => {
        refreshCalls++;
        const res = await authApi.refresh(expired);
        token = res.data.token;
        return token;
      },
    );
    return expired;
  }

  it('refreshes once and sends the request (used to loop forever without any network call)', async () => {
    const expired = signedInWithExpiredToken();
    const res = await client.get('/vehicles');
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    const refresh = sent.find(c => c.url === '/refresh');
    // The refresh request goes out with the expired token it is meant to carry.
    expect(refresh?.headers.get('X-Token-Auth')).toBe(`Bearer ${expired}`);
    expect(refresh?.headers.has('X-Maud-Skip-Token-Refresh')).toBe(false);
    const request = sent.find(c => c.url === '/vehicles');
    expect(request?.headers.get('X-Token-Auth')).not.toBe(`Bearer ${expired}`);
  });

  it('requests arriving together share one refresh', async () => {
    signedInWithExpiredToken();
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c'), getRefreshedSharedToken()]);
    expect(refreshCalls).toBe(1);
    expect(sent.filter(c => c.url === '/refresh')).toHaveLength(1);
  });

  it('a valid token is sent without refreshing', async () => {
    const valid = jwt(now() + 3600);
    configureClient(() => valid, async () => { refreshCalls++; return null; });
    const res = await client.get('/vehicles');
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(0);
    expect(sent[0].headers.get('X-Token-Auth')).toBe(`Bearer ${valid}`);
  });
});
