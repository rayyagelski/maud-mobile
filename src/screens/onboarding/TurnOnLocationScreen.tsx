import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import LocationOffIcon from '../../components/common/LocationOffIcon';
import SettingsGearIcon from '../../components/common/SettingsGearIcon';
import type { MainStackNavigationProp } from '../../types/navigation.types';

export default function TurnOnLocationScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();

  function handleOpenSettings() {
    Linking.openSettings();
  }

  function handleContinue() {
    navigation.replace('MainTabs');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconBadge}>
          <LocationOffIcon size={32} color="#3ECFBF" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Turn On Location</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Location services need to be enabled in your device settings for accurate trip data and eco-scoring.
        </Text>

        {/* Buttons */}
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={handleOpenSettings}
            activeOpacity={0.85}
          >
            <SettingsGearIcon size={20} color="#FFFFFF" />
            <Text style={styles.settingsBtnText}>Open Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.7}
          >
            <Text style={styles.continueBtnText}>Continue Without Location</Text>
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
  settingsBtn: {
    backgroundColor: '#3ECFBF',
    borderRadius: 28,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#3ECFBF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  settingsBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  continueBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
});
