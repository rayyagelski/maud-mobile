/**
 * @format
 */

import { AppRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import App from './App';
import { name as appName } from './app.json';
import { HEADLESS_LOCATION_QUEUE_KEY, HEADLESS_LOCATION_QUEUE_MAX } from './src/utils/constants';

// Android can tear down the whole JS engine while the app is backgrounded
// (Doze/App Standby demoting a long-cached process) independent of
// stopOnTerminate:false — that flag only keeps the plugin's *native*
// tracking service alive; nothing was listening on the JS side once the
// engine was gone, and only a full app restart (a fresh JS engine calling
// BackgroundGeolocation.onLocation() again) resumed delivery. Real testing
// showed this made trip auto-detection silently fail for the rest of a
// drive whenever the app had been backgrounded for a while. This headless
// task registers a fallback JS entrypoint Android can invoke directly, no
// live app instance required — it can't safely dispatch into the app's
// Redux store from here (no Provider/store exists in this isolated
// context), so it just queues the raw event; useTripAutoDetection drains
// and replays this queue through its normal handleLocation logic the next
// time it actually mounts with a live store.
// Only 'location' events are queued — the live foreground listener
// (useTripAutoDetection.ts) only subscribes via BackgroundGeolocation.
// onLocation too, so this replays the exact same event shape it already
// knows how to handle, rather than introducing a second, differently-shaped
// event type (e.g. motionchange's nested { isMoving, location }) into the
// replay path.
const BackgroundGeolocationHeadlessTask = async (event) => {
  if (event.name !== 'location') return;
  try {
    const raw = await AsyncStorage.getItem(HEADLESS_LOCATION_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push(event.params);
    const capped = queue.length > HEADLESS_LOCATION_QUEUE_MAX
      ? queue.slice(queue.length - HEADLESS_LOCATION_QUEUE_MAX)
      : queue;
    await AsyncStorage.setItem(HEADLESS_LOCATION_QUEUE_KEY, JSON.stringify(capped));
  } catch {
    // Best-effort — losing a queued fix here is no worse than the status
    // quo before this task existed (silently dropped either way).
  }
};

BackgroundGeolocation.registerHeadlessTask(BackgroundGeolocationHeadlessTask);

AppRegistry.registerComponent(appName, () => App);
