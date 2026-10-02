import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { webLoginApi } from '../../api/endpoints/webLogin';
import { logDiagnostic } from '../../services/diagnosticsLog';

// Plain dashboard URL — used when a one-time sign-in link can't be had
// (offline, or a backend without the endpoint yet). The user then signs in
// on the web page once; the WebView keeps that session's cookie.
export const WEB_DASHBOARD_URL = 'https://app.myautodata.com/dashboard';

// The WebView only ever shows MAUD's own site. Anything else the dashboard
// links to (manufacturer pages, maps, mail) opens in the phone's browser, so
// a page outside MAUD never runs inside the signed-in app.
const MAUD_HOST = /^https:\/\/([a-z0-9-]+\.)*myautodata\.com(\/|$)/i;

function isMaudUrl(url: string): boolean {
  return MAUD_HOST.test(url);
}

/**
 * The MAUD web dashboard (non-mobility data: documents, invoices, profile,
 * marketplace…) inside the app, already signed in via a one-time login link.
 * Returning to MAUD Connect is the header's back arrow; Android's back
 * button steps back through web pages first.
 */
export default function WebDashboardScreen() {
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    webLoginApi.createLink()
      .then((link) => {
        if (!cancelled) setStartUrl(isMaudUrl(link.url) ? link.url : WEB_DASHBOARD_URL);
      })
      .catch((err: unknown) => {
        logDiagnostic('Web dashboard: sign-in link unavailable, opening plain dashboard.', {
          status: (err as { status?: number } | undefined)?.status ?? null,
        });
        if (!cancelled) setStartUrl(WEB_DASHBOARD_URL);
      });
    return () => { cancelled = true; };
  }, []);

  // Android back: web history first, then leave the screen.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (canGoBack) {
          webViewRef.current?.goBack();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [canGoBack]),
  );

  const onShouldStartLoad = useCallback((req: ShouldStartLoadRequest) => {
    if (isMaudUrl(req.url) || req.url === 'about:blank') return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color={TEAL} />
            <Text style={styles.backLabel}>MAUD Connect</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MAUD Dashboard</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      {startUrl && (
        <WebView
          ref={webViewRef}
          source={{ uri: startUrl }}
          style={styles.webview}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBack(nav.canGoBack)}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
        />
      )}
      {(loading || !startUrl) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      )}
    </View>
  );
}

const TEAL = '#3ABFBF';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'white' },
  safeTop: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 130 },
  backLabel: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: TEAL },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  headerSpacer: { width: 130 },
  webview: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
