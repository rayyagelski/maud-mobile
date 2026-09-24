import React from 'react';
import { View } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store, persistor } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { publishUserTouch } from './src/services/userTouchBus';

// Sees the start of every touch in the app (capture phase, root first) and
// returns false so the touch continues to whatever it was meant for — see
// userTouchBus.ts for why.
function noteTouchStart(): boolean {
  publishUserTouch();
  return false;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onStartShouldSetResponderCapture={noteTouchStart}>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <SafeAreaProvider>
              <AppNavigator />
            </SafeAreaProvider>
          </PersistGate>
        </Provider>
      </View>
    </GestureHandlerRootView>
  );
}
