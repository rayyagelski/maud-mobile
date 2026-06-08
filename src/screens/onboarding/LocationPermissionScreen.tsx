import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { request, check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import LocationPinIcon from '../../components/common/LocationPinIcon';
import type { MainStackNavigationProp } from '../../types/navigation.types';

export default function LocationPermissionScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [isRequesting, setIsRequesting] = useState(false);

  async function handleAllow() {
    setIsRequesting(true);
    try {
      const permission = Platform.OS === 'ios'
        ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE
        : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

      // Check first — if location services are off the OS returns UNAVAILABLE
      const current = await check(permission);
      if (current === RESULTS.UNAVAILABLE) {
        navigation.replace('TurnOnLocation');
        return;
      }

      const result = await request(permission);

      if (result === RESULTS.BLOCKED) {
        // Permanently denied — send to settings
        navigation.replace('TurnOnLocation');
        return;
      }
    } catch {
      // Permission request failed — continue to app
    } finally {
      setIsRequesting(false);
      // Only replace if still on this screen (not already navigated above)
      try { navigation.replace('MainTabs'); } catch {}
    }
  }

  function handleSkip() {
    navigation.replace('MainTabs');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconBadge}>
          <LocationPinIcon size={32} color="#3ECFBF" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Enable Location Access</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          MAUD needs access to your location to provide accurate trip tracking, eco-scoring, and nearby services.
        </Text>

        {/* Buttons */}
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={[styles.allowBtn, isRequesting && styles.btnDisabled]}
            onPress={handleAllow}
            disabled={isRequesting}
            activeOpacity={0.85}
          >
            <Text style={styles.allowBtnText}>
              {isRequesting ? 'Requesting…' : 'Allow Location Access'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipBtnText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E6F9F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A2E',
    textAlign: 'center',
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 44,
  },
  btnGroup: {
    alignSelf: 'stretch',
    gap: 12,
  },
  allowBtn: {
    backgroundColor: '#3ECFBF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3ECFBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  allowBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
});
