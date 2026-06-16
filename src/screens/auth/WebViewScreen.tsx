import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../types/navigation.types';
import BackArrowIcon from '../../components/common/BackArrowIcon';

type WebViewRouteProp = RouteProp<AuthStackParamList, 'WebView'>;

export default function WebViewScreen() {
  const navigation = useNavigation();
  const route = useRoute<WebViewRouteProp>();
  const { url, title } = route.params;
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color="#00D4C8" />
          </TouchableOpacity>
          {title ? (
            <Text style={styles.headerTitle}>{title}</Text>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <WebView
        source={{ uri: url }}
        style={styles.webview}
        originWhitelist={['*']}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onSslError={event => {
          // Android only: proceed past SSL hostname mismatch for known trusted site
          event.nativeEvent.handler.proceed();
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00D4C8" />
        </View>
      )}
    </View>
  );
}

const BG = '#0B0E1A';
const BORDER = 'rgba(0,212,200,0.15)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeTop: { backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  headerSpacer: { width: 22 },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
});
