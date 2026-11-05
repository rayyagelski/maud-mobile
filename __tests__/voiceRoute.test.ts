// Voice goes to the phone speaker (alarm channel) while the car's Bluetooth
// "Media audio" is connected; unchanged otherwise. On iOS the speaker is
// taken for a run of messages and released when the queue is empty.
const mockCalls: Array<{ text: string; options: unknown }> = [];
let mockMediaOnBluetooth = false;
const mockSpeechAudio: string[] = [];
const mockTtsHandlers: Record<string, Array<(event: { utteranceId: string }) => void>> = {};

jest.mock('react-native-tts', () => ({
  getInitStatus: () => Promise.resolve(),
  addEventListener: (name: string, handler: (event: { utteranceId: string }) => void) => { (mockTtsHandlers[name] ??= []).push(handler); },
  speak: (text: string, options: unknown) => { mockCalls.push({ text, options }); return Promise.resolve(`id:${text}`); },
  stop: () => {},
}));
jest.mock('../src/services/diagnosticsLog', () => ({ logDiagnostic: jest.fn() }));
jest.mock('../src/services/bluetooth/bluetoothVehicleDetectionModule', () => ({
  isMediaAudioOnBluetooth: () => Promise.resolve(mockMediaOnBluetooth),
  beginSpeechAudio: () => { mockSpeechAudio.push('begin'); return Promise.resolve(true); },
  endSpeechAudio: () => { mockSpeechAudio.push('end'); },
}));

import { enqueueSpeech, speechOptionsFor } from '../src/hooks/useVoicePlayback';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('voice audio route', () => {
  it('uses the alarm channel only while media audio is on Bluetooth', () => {
    expect(speechOptionsFor(true)).toEqual({ androidParams: { KEY_PARAM_STREAM: 'STREAM_ALARM' } });
    expect(speechOptionsFor(false)).toEqual({});
  });

  it('keeps the normal channel without Bluetooth media (unchanged behaviour)', async () => {
    mockMediaOnBluetooth = false;
    await enqueueSpeech('Trip recording started.', 'high');
    await flush();
    expect(mockCalls[mockCalls.length - 1]).toEqual({ text: 'Trip recording started.', options: {} });
  });

  it('speaks a speed alert on the phone speaker with the car media connected', async () => {
    mockMediaOnBluetooth = true;
    // critical interrupts the high-priority message still playing
    await enqueueSpeech('You are over the speed limit.', 'critical');
    await flush();
    expect(mockCalls[mockCalls.length - 1]).toEqual({
      text: 'You are over the speed limit.', options: { androidParams: { KEY_PARAM_STREAM: 'STREAM_ALARM' } },
    });
  });

  it('holds the speaker across queued messages and releases it once the queue is empty', async () => {
    const finish = (text: string) => (mockTtsHandlers['tts-finish'] ?? []).forEach(h => h({ utteranceId: `id:${text}` }));
    await enqueueSpeech('Queued message.', 'normal');
    mockSpeechAudio.length = 0;
    finish('You are over the speed limit.');
    await flush();
    expect(mockSpeechAudio).toEqual(['begin']);
    finish('Queued message.');
    await flush();
    expect(mockSpeechAudio).toEqual(['begin', 'end']);
  });
});
