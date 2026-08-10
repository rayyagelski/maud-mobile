import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { setAutoPlayTripSummaryVoice, setDriveFocusReminderEnabled } from '../../store/slices/settingsSlice';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

function SettingRow({ title, subtitle, value, onValueChange }: {
  title: string; subtitle: string; value: boolean; onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#E0E0E0', true: TEAL }}
        thumbColor="white"
      />
    </View>
  );
}

// Android only — some OEMs (Xiaomi, Samsung, Huawei, OnePlus, etc.) keep
// their own power-manager restrictions on top of the standard OS battery-
// optimization exemption already requested during onboarding
// (LocationPermissionScreen). This is a manual escape hatch for users still
// seeing the app get killed mid-trip ("not always on" real-drive feedback)
// after that — opens the device's own OEM-specific power settings screen.
async function handleOpenPowerSettings() {
  try {
    await BackgroundGeolocation.deviceSettings.showPowerManager();
  } catch {
    // Not supported on this device/OEM — nothing to fall back to.
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const dispatch = useAppDispatch();
  const { autoPlayTripSummaryVoice, driveFocusReminderEnabled } = useAppSelector(s => s.settings);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>VOICE</Text>
        <View style={styles.card}>
          <SettingRow
            title="Auto-play trip summary"
            subtitle="Speak the voice recap automatically as soon as a trip ends"
            value={autoPlayTripSummaryVoice}
            onValueChange={(v) => dispatch(setAutoPlayTripSummaryVoice(v))}
          />
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>DRIVING</Text>
        <View style={styles.card}>
          <SettingRow
            title="Focus mode reminder"
            subtitle="Prompt to turn on Do Not Disturb / Driving Focus when a trip starts"
            value={driveFocusReminderEnabled}
            onValueChange={(v) => dispatch(setDriveFocusReminderEnabled(v))}
          />
        </View>

        {Platform.OS === 'android' && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>TRACKING RELIABILITY</Text>
            <View style={styles.card}>
              <TouchableOpacity
                onPress={handleOpenPowerSettings}
                activeOpacity={0.7}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>Improve background tracking</Text>
                  <Text style={styles.rowSubtitle}>
                    If trips stop recording or the app closes on its own while driving, open your
                    phone's power-saving settings and allow MAUD Connect to run unrestricted.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#E0E0E0' },

  body: { padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.4, marginBottom: 10 },

  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', columnGap: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowSubtitle: { fontSize: 12, color: '#888', marginTop: 3, lineHeight: 16 },
});
