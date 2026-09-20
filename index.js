/**
 * @format
 */

import { AppRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { name as appName } from './app.json';
import { HEADLESS_LOCATION_QUEUE_KEY, HEADLESS_LOCATION_QUEUE_MAX } from './src/utils/constants';
import { logDiagnostic } from './src/services/diagnosticsLog';

// Standalone/QA builds have no Metro/adb access, so an "Uncaught Error"
// redbox's own call stack is frequently unsymbolicated (real-world example:
// only React Native's own internal error-reporting frames — SyntheticError/
// handleException/handleError/reportFatalError — show up, never the actual
// app frame that threw) and the redbox itself disappears once dismissed,
// leaving no way to report back anything more specific than a screenshot of
// a stack that doesn't actually name the bug. Installed as early as
// possible (before AppRegistry.registerComponent, before App/Redux/any
// screen code runs) so it's in place for every crash, not just ones after
// some later mount point. Captures into the same on-device Diagnostics log
// (Settings > Diagnostics) already used for BT/trip-detection tracing, so a
// real message + stack survives the redbox being dismissed and can be
// shared without needing a computer. Chains to RN's own default handler
// (still shows the redbox / logs to Logcat) rather than replacing it.
const defaultErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  logDiagnostic(isFatal ? 'FATAL uncaught JS error' : 'Uncaught JS error', {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  });
  defaultErrorHandler(error, isFatal);
});

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

// App is require()'d lazily inside the component provider rather than
// imported at the top of this file, and that detail is load-bearing.
//
// Android runs a headless task (above) in its own short-lived JS context,
// and spinning that context up evaluates THIS module's entire import graph
// first — before the task function is even called, and regardless of which
// event type it turns out to be. A static `import App from './App'` pulls in
// App.tsx -> src/store -> `persistStore(store)`, which runs at module scope
// and immediately kicks off a full rehydrate of the combined 'persist:root'
// blob (every whitelisted slice, including all of `trips`), plus a write-back
// of the whole thing on the resulting state change.
//
// With heartbeatInterval at 60s (see useTripAutoDetection.ts's .ready()
// config), an overnight idle stretch fires that hundreds of times: hundreds
// of full read/parse/stringify/write cycles over a blob that grows with every
// recorded trip, in contexts Android is free to kill part-way through — which
// can leave 'persist:root' truncated, and a truncated blob is unrecoverable
// from inside the app (real-world symptom: app frozen and unresponsive at the
// Welcome screen every morning, only fixable by reinstalling). The headless
// task itself needs nothing from Redux — only AsyncStorage and two constants.
//
// registerComponent takes a componentProvider precisely so this can be
// deferred: it's only invoked when the UI is actually mounted, so a headless
// context never touches the store at all.
AppRegistry.registerComponent(appName, () => require('./App').default);
