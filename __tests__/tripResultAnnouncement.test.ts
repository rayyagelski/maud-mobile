jest.mock('../src/hooks/useVoicePlayback', () => ({ useVoicePlayback: () => ({ speak: jest.fn() }) }));
jest.mock('../src/hooks/useAppSelector', () => ({ useAppSelector: jest.fn() }));

import { tripsToAnnounce, pickAnnouncement, RESULT_ANNOUNCE_WINDOW_MS } from '../src/hooks/useTripResultAnnouncement';

const NOW = 1_800_000_000_000;
const withResult = (id: string, endedAgoMs: number) => ({
  id, endTime: NOW - endedAgoMs, reward: { voicePayload: { script: `Summary ${id}` } },
});

describe('tripsToAnnounce', () => {
  it('announces a trip whose results just arrived, even with the phone asleep (no screen involved)', () => {
    expect(tripsToAnnounce([withResult('t1', 60_000)], NOW, () => false))
      .toEqual([{ tripId: 't1', script: 'Summary t1' }]);
  });

  it('never reads out older trips that get results from history sync or backfill', () => {
    expect(tripsToAnnounce([withResult('old', RESULT_ANNOUNCE_WINDOW_MS + 1)], NOW, () => false)).toEqual([]);
  });

  it('does not repeat a summary already spoken (e.g. by the Trip Summary screen)', () => {
    expect(tripsToAnnounce([withResult('t1', 60_000)], NOW, id => id === 't1')).toEqual([]);
  });

  it('waits for the results: a trip without a score yet is not announced', () => {
    expect(tripsToAnnounce([{ id: 't2', endTime: NOW - 1000 }], NOW, () => false)).toEqual([]);
  });
});

describe('pickAnnouncement', () => {
  it('speaks a single waiting result', () => {
    expect(pickAnnouncement([withResult('t1', 60_000)], NOW, () => false))
      .toEqual({ speak: { tripId: 't1', script: 'Summary t1' }, markOnly: [] });
  });

  it('when results piled up, speaks only the newest trip and marks the others as heard', () => {
    // Real drive: two summaries arrived together at unlock; the second was dropped.
    const trips = [withResult('older', 10 * 60_000), withResult('newest', 60_000)];
    expect(pickAnnouncement(trips, NOW, () => false))
      .toEqual({ speak: { tripId: 'newest', script: 'Summary newest' }, markOnly: ['older'] });
  });

  it('nothing to do when everything was heard', () => {
    expect(pickAnnouncement([withResult('t1', 60_000)], NOW, () => true)).toEqual({ speak: null, markOnly: [] });
  });
});
