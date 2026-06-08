import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { VideoCameraIcon, WarningTriangleIcon } from '../../components/icons';
import type { MainTabNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';
const ORANGE = '#F47920';

export default function ComplianceScreen() {
  const navigation = useNavigation<MainTabNavigationProp>();
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  return (
    <View style={styles.safe}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Compliance</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>
      <View style={styles.headerSeparator} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Compliance Intelligence card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Compliance Intelligence</Text>
              <Text style={styles.cardSub}>
                {alertsEnabled ? 'Alerts are active' : 'Alerts are inactive'}
              </Text>
            </View>
            <Switch
              value={alertsEnabled}
              onValueChange={setAlertsEnabled}
              trackColor={{ false: '#E0E0E0', true: TEAL }}
              thumbColor="white"
            />
          </View>
        </View>

        {/* Enforcement zone alert card */}
        <View style={styles.alertCard}>
          <View style={styles.cameraCircle}>
            <VideoCameraIcon color="white" size={44} />
          </View>
          <Text style={styles.alertTitle}>
            {'You are entering an\nenforcement zone.'}
          </Text>
          <Text style={styles.alertDistance}>500m</Text>
          <Text style={styles.alertSub}>Reduce speed to 50 km/h</Text>
        </View>

        {/* Stay Safe card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <WarningTriangleIcon color={ORANGE} size={22} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.cardTitle}>Stay Safe</Text>
              <Text style={styles.safeBody}>
                {'Help maintain safe driving speeds.\nAlways follow posted speed limits and\ndrive according to road conditions.'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSpacer: { width: 32 },
  headerSeparator: { height: 1, backgroundColor: '#EBEBEB' },

  scroll: { padding: 20, rowGap: 16 },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  cardSub: { fontSize: 14, color: '#888888' },

  alertCard: {
    backgroundColor: '#FFF3E8',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  cameraCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 16,
  },
  alertDistance: {
    fontSize: 56,
    fontWeight: '800',
    color: ORANGE,
    lineHeight: 64,
    marginBottom: 4,
  },
  alertSub: { fontSize: 15, color: '#888888' },

  safeBody: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 22,
    marginTop: 4,
  },
});
