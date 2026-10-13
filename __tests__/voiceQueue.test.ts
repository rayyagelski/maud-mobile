// A fake TTS engine: records what was spoken and lets the test end
// utterances the way Android does (finish, or cancel after stop()).
type Handler = (event: { utteranceId: string }) => void;
const handlers: Record<string, Handler[]> = {};
const spoken: string[] = [];
let stopped = 0;

jest.mock('react-native-tts', () => ({
  getInitStatus: () => Promise.resolve(),
  addEventListener: (name: string, handler: Handler) => { (handlers[name] ??= []).push(handler); },
  speak: (text: string) => { spoken.push(text); return Promise.resolve(`id:${text}`); },
  stop: () => { stopped += 1; },
}));

import { enqueueSpeech } from '../src/hooks/useVoicePlayback';

const emit = (name: string, text: string) => (handlers[name] ?? []).forEach(h => h({ utteranceId: `id:${text}` }));
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('voice queue', () => {
  beforeEach(async () => {
    // Drain anything left playing from the previous test.
    spoken.forEach(text => emit('tts-finish', text));
    await flush();
    spoken.length = 0;
    stopped = 0;
  });

  it('lets "Trip recording started" finish before the first turn instruction (same priority)', async () => {
    await enqueueSpeech('Trip recording started.', 'critical');
    await flush();
    await enqueueSpeech('Head north on Florence Ridge Dr.', 'critical');
    await flush();

    expect(spoken).toEqual(['Trip recording started.']);
    expect(stopped).toBe(0);

    emit('tts-finish', 'Trip recording started.');
    await flush();
    expect(spoken).toEqual(['Trip recording started.', 'Head north on Florence Ridge Dr.']);
  });

  it('lets the Bluetooth message finish before the route recommendation (both normal)', async () => {
    await enqueueSpeech('Trip will be recorded under Margit in your Infiniti QX50.', 'normal');
    await flush();
    await enqueueSpeech('Your route is the fastest option.', 'normal');
    await flush();
    expect(spoken).toHaveLength(1);

    emit('tts-finish', 'Trip will be recorded under Margit in your Infiniti QX50.');
    await flush();
    expect(spoken[1]).toBe('Your route is the fastest option.');
  });

  it('a more urgent message interrupts, and the cancel of the interrupted one does not skip it', async () => {
    await enqueueSpeech('Weather alert: light rain.', 'normal');
    await flush();
    await enqueueSpeech('Turn left onto Oswalt Rd.', 'critical');
    await flush();
    expect(stopped).toBe(1);
    expect(spoken).toEqual(['Weather alert: light rain.', 'Turn left onto Oswalt Rd.']);

    emit('tts-cancel', 'Weather alert: light rain.');
    await enqueueSpeech('Approaching a 25 mph zone.', 'high');
    await flush();
    // Still waiting: the turn instruction is playing and was not ended by the old cancel.
    expect(spoken).toHaveLength(2);
  });

  it('drops a queued message that has gone stale', async () => {
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      await enqueueSpeech('Trip recording started.', 'critical');
      await flush();
      await enqueueSpeech('Approaching a 25 mph zone.', 'high');
      now += 6000; // speed-zone warnings are stale after 5 s
      emit('tts-finish', 'Trip recording started.');
      await flush();
      expect(spoken).toEqual(['Trip recording started.']);
    } finally {
      Date.now = realNow;
    }
  });
});
