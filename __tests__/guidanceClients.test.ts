jest.mock('../src/config/env', () => ({ HERE_API_KEY: 'test-key' }));

import { fetchIntersectionControls } from '../src/services/overpass/intersectionControlClient';
import { fetchHereRoutes } from '../src/services/here/hereRoutingClient';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as unknown as Response;

describe('OpenStreetMap traffic lights / stop signs lookup', () => {
  const turn = { latitude: 28.5, longitude: -81.7 };

  it('falls back to the mirror when the main server fails, and maps the nodes', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (calls.length === 1) return json({}, false, 504);
      return json({ elements: [
        { type: 'node', lat: 28.5, lon: -81.7, tags: { highway: 'traffic_signals' } },
        { type: 'node', lat: 28.5001, lon: -81.7, tags: { highway: 'stop', stop: 'all' } },
      ] });
    }) as unknown as typeof fetch;
    const nodes = await fetchIntersectionControls([turn]);
    expect(calls).toHaveLength(2);
    expect(nodes).toEqual([
      { latitude: 28.5, longitude: -81.7, kind: 'traffic_signals', allWay: false },
      { latitude: 28.5001, longitude: -81.7, kind: 'stop', allWay: true },
    ]);
  });

  it('gives nothing (plain instructions) when no server answers', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    await expect(fetchIntersectionControls([turn])).resolves.toEqual([]);
  });

  it('sends nothing for a route without turns', async () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    await expect(fetchIntersectionControls([])).resolves.toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('HERE route request when recalculating', () => {
  it('includes the driving direction and the units', async () => {
    let requested = '';
    globalThis.fetch = jest.fn(async (url: string) => { requested = url; return json({ routes: [] }); }) as unknown as typeof fetch;
    await fetchHereRoutes({ latitude: 28.5, longitude: -81.7 }, { latitude: 28.4, longitude: -81.8 }, 0, true, undefined, 271.6);
    const params = new URL(requested).searchParams;
    expect(params.get('origin')).toBe('28.5,-81.7;course=272');
    expect(params.get('units')).toBe('imperial');
  });

  it('is unchanged without a direction', async () => {
    let requested = '';
    globalThis.fetch = jest.fn(async (url: string) => { requested = url; return json({ routes: [] }); }) as unknown as typeof fetch;
    await fetchHereRoutes({ latitude: 28.5, longitude: -81.7 }, { latitude: 28.4, longitude: -81.8 });
    expect(new URL(requested).searchParams.get('origin')).toBe('28.5,-81.7');
  });
});
