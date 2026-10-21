/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
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

// No Android headless task for location events: enableHeadless is off (see
// useTripAutoDetection.ts). Starting the app engine in the background for
// overnight location events left the app frozen at the Welcome screen the
// next morning.
//
// The task below is different: Android never starts it and it never starts
// the app engine. The already-running app starts it itself during a trip
// (useKeepTimersRunningDuringTrips) purely so React Native keeps running JS
// timers while the screen is off — see BluetoothVehicleDetectionModule.kt.
// It does nothing and stays "running" until the app finishes it natively.
AppRegistry.registerHeadlessTask('MaudKeepTimersRunning', () => () => new Promise(() => {}));

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
