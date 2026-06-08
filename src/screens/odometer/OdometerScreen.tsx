import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { GaugeIcon } from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

function PlusIcon({ color = TEAL, size = 24 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function EditIcon({ color = 'white', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function OdometerScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Odometer</Text>
          <TouchableOpacity hitSlop={HIT}>
            <PlusIcon />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      {/* Background */}
      <View style={styles.bg}>
        <View style={styles.card}>
          {/* Gauge icon circle */}
          <View style={styles.iconCircle}>
            <GaugeIcon color="white" size={52} />
          </View>

          <Text style={styles.mileageLabel}>Current Mileage</Text>
          <Text style={styles.mileageValue}>45,280</Text>
          <Text style={styles.mileageUnit}>kilometers</Text>

          <TouchableOpacity style={styles.updateBtn} activeOpacity={0.85}>
            <EditIcon color="white" size={18} />
            <Text style={styles.updateBtnText}>Update Mileage</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF1F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#E0E0E0' },

  bg: { flex: 1, padding: 20, paddingTop: 28 },

  card: {
    backgroundColor: 'white', borderRadius: 28, padding: 32,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },

  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: TEAL,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 22,
  },

  mileageLabel: { fontSize: 15, color: '#888', marginBottom: 8 },
  mileageValue: { fontSize: 52, fontWeight: '800', color: '#1A1A1A', letterSpacing: -1 },
  mileageUnit: { fontSize: 15, color: '#888', marginBottom: 28 },

  updateBtn: {
    flexDirection: 'row', alignItems: 'center', columnGap: 10,
    backgroundColor: TEAL, borderRadius: 28,
    paddingVertical: 16, paddingHorizontal: 40,
  },
  updateBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },
});
