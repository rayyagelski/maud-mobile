jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/services/diagnosticsLog', () => ({ logDiagnostic: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { throttledAsyncStorage, CHUNK_CHARS, CHUNK_MARKER } from '../src/store/throttledAsyncStorage';

const KEY = 'persist:root';

async function chunkKeys(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(`${KEY}::chunk:`));
}

describe('throttledAsyncStorage chunking', () => {
  // A clock that jumps 10 s per read, so every write is past the throttle
  // window and flushes immediately instead of waiting on a trailing timer.
  let now = 0;
  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockImplementation(() => (now += 10_000));
    await AsyncStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  async function write(value: string) {
    await throttledAsyncStorage.setItem(KEY, value);
  }

  it('stores a small value as-is under the key', async () => {
    await write('{"a":1}');

    expect(await AsyncStorage.getItem(KEY)).toBe('{"a":1}');
    expect(await chunkKeys()).toHaveLength(0);
    expect(await throttledAsyncStorage.getItem(KEY)).toBe('{"a":1}');
  });

  it('splits a value over the cursor-safe size into chunks and reads it back intact', async () => {
    const big = 'x'.repeat(CHUNK_CHARS * 2 + 123);
    await write(big);

    expect(await AsyncStorage.getItem(KEY)).toBe(`${CHUNK_MARKER}3`);
    const chunks = await chunkKeys();
    expect(chunks).toHaveLength(3);
    for (const k of chunks) {
      expect(((await AsyncStorage.getItem(k)) as string).length).toBeLessThanOrEqual(CHUNK_CHARS);
    }
    expect(await throttledAsyncStorage.getItem(KEY)).toBe(big);
  });

  it('removes leftover chunks when the value shrinks', async () => {
    await write('y'.repeat(CHUNK_CHARS * 3 + 1));
    await write('z'.repeat(CHUNK_CHARS + 1));

    expect(await chunkKeys()).toHaveLength(2);
    expect(await throttledAsyncStorage.getItem(KEY)).toBe('z'.repeat(CHUNK_CHARS + 1));

    await write('{"small":true}');
    expect(await chunkKeys()).toHaveLength(0);
    expect(await throttledAsyncStorage.getItem(KEY)).toBe('{"small":true}');
  });

  it('still reads a legacy unchunked value written before chunking existed', async () => {
    await AsyncStorage.setItem(KEY, '{"legacy":1}');
    expect(await throttledAsyncStorage.getItem(KEY)).toBe('{"legacy":1}');
  });

  it('returns null rather than a truncated blob when a chunk is missing', async () => {
    await write('w'.repeat(CHUNK_CHARS * 2 + 5));
    await AsyncStorage.removeItem(`${KEY}::chunk:1`);

    expect(await throttledAsyncStorage.getItem(KEY)).toBeNull();
  });

  it('removeItem clears the key and all of its chunks', async () => {
    await write('v'.repeat(CHUNK_CHARS * 2 + 5));
    await throttledAsyncStorage.removeItem(KEY);

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await chunkKeys()).toHaveLength(0);
  });
});
