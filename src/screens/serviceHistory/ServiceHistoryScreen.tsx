import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import { CalendarIcon, ChevronIcon } from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const GREEN = '#27AE60';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const CONDITION_ITEMS = [
  { label: 'Brakes',    status: 'Good' },
  { label: 'Tires',     status: 'Good' },
  { label: 'Battery',   status: 'Good' },
  { label: 'Alignment', status: 'Good' },
];

const ALERTS = [
  { title: 'Brake Pads',    sub: '~1,200 km · ~18 days', action: 'Book',  primary: true  },
  { title: 'Tire Pressure', sub: 'Check within 7 days',   action: 'Check', primary: false },
];

const PAST_SERVICES = [
  { date: 'March 12, 2024',   shop: 'Greenway Auto Repair',    cost: '€295' },
  { date: 'November 2, 2023', shop: 'Drivetek Service Center', cost: '€350' },
  { date: 'July 18, 2023',    shop: 'Greenway Auto Repair',    cost: '€210' },
  { date: 'March 3, 2023',    shop: 'Auto Services',           cost: '€575' },
];

// ── Local icons ────────────────────────────────────────────────────────────

function SearchIcon({ color = '#1A1A1A', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={1.8} />
      <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon({ color = '#1A1A1A', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function WrenchIcon({ color = 'white', size = 24 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({
  title, expanded, onToggle,
}: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ChevronIcon open={expanded} color="#1A1A1A" size={20} />
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function ServiceHistoryScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [conditionOpen, setConditionOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(true);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Service History</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity hitSlop={HIT}>
              <SearchIcon />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={HIT} style={styles.plusBtn}>
              <PlusIcon />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Next Service Due card */}
        <View style={styles.nextCard}>
          <View style={styles.nextCardTop}>
            <View style={styles.serviceIconBox}>
              <WrenchIcon color="white" size={26} />
            </View>
            <Text style={styles.nextCardTitle}>Next Service Due</Text>
          </View>
          <View style={styles.nextCardBody}>
            <View style={styles.infoRow}>
              <WrenchIcon color={TEAL} size={15} />
              <Text style={styles.infoText}>
                {'  '}At <Text style={styles.infoTeal}>85,000 km</Text>
              </Text>
            </View>
            <View style={styles.infoRow}>
              <CalendarIcon color="#555" size={15} />
              <Text style={styles.infoText}>
                {'  '}In ~90 days{' '}
                <Text style={styles.infoGray}>(~Aug 21, 2024)</Text>
              </Text>
            </View>
            <Text style={styles.currentKm}>
              Currently at <Text style={styles.currentKmBold}>73,200 km</Text>{' '}(~Today)
            </Text>
          </View>
        </View>

        {/* Overall Vehicle Condition */}
        <SectionHeader
          title="OVERALL VEHICLE CONDITION"
          expanded={conditionOpen}
          onToggle={() => setConditionOpen(v => !v)}
        />
        {conditionOpen && (
          <View style={styles.card}>
            {CONDITION_ITEMS.map((item, i) => (
              <View
                key={item.label}
                style={[styles.condRow, i < CONDITION_ITEMS.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.condLabel}>{item.label}</Text>
                <View style={styles.goodPill}>
                  <Text style={styles.goodPillText}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Predictive Alerts */}
        <SectionHeader
          title="PREDICTIVE ALERTS"
          expanded={alertsOpen}
          onToggle={() => setAlertsOpen(v => !v)}
        />
        {alertsOpen && (
          <View style={styles.card}>
            {ALERTS.map((alert, i) => (
              <View
                key={alert.title}
                style={[styles.alertRow, i < ALERTS.length - 1 && styles.rowBorder]}
              >
                <View style={styles.alertInfo}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertSub}>{alert.sub}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, alert.primary ? styles.actionPrimary : styles.actionSecondary]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.actionText, !alert.primary && styles.actionTextSecondary]}>
                    {alert.action}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Past Service */}
        <SectionHeader
          title="PAST SERVICE"
          expanded={pastOpen}
          onToggle={() => setPastOpen(v => !v)}
        />
        {pastOpen && (
          <View style={styles.card}>
            {PAST_SERVICES.map((svc, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.pastRow, i < PAST_SERVICES.length - 1 && styles.rowBorder]}
                onPress={() => navigation.navigate('Invoice', { serviceId: `svc-${i}` })}
                activeOpacity={0.7}
              >
                <View style={styles.pastInfo}>
                  <Text style={styles.pastDate}>{svc.date}</Text>
                  <Text style={styles.pastShop}>{svc.shop}</Text>
                </View>
                <Text style={styles.pastCost}>{svc.cost}</Text>
                <Text style={styles.pastArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  plusBtn: { marginLeft: 18 },
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 40 },

  // Next Service Due card
  nextCard: {
    backgroundColor: '#E6F5F5', borderRadius: 18, padding: 16, marginBottom: 24,
  },
  nextCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  serviceIconBox: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: TEAL, justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  nextCardTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  nextCardBody: { paddingLeft: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  infoText: { fontSize: 14, color: '#333' },
  infoTeal: { fontWeight: '700', color: TEAL },
  infoGray: { color: '#888' },
  currentKm: { fontSize: 13, color: '#888', marginTop: 2 },
  currentKmBold: { fontWeight: '700', color: '#555' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.3 },

  // Card base
  card: {
    backgroundColor: 'white', borderRadius: 18, paddingHorizontal: 16, marginBottom: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },

  // Condition rows
  condRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
  },
  condLabel: { fontSize: 15, color: '#333' },
  goodPill: {
    backgroundColor: GREEN, borderRadius: 22,
    paddingHorizontal: 24, paddingVertical: 9,
  },
  goodPillText: { fontSize: 14, fontWeight: '700', color: 'white' },

  // Alert rows
  alertRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
  },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  alertSub: { fontSize: 13, color: '#888' },
  actionBtn: { borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
  actionPrimary: { backgroundColor: '#F57C00' },
  actionSecondary: { backgroundColor: '#EEEEEE' },
  actionText: { fontSize: 14, fontWeight: '700', color: 'white' },
  actionTextSecondary: { color: '#555' },

  // Past service rows
  pastRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
  },
  pastInfo: { flex: 1 },
  pastDate: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  pastShop: { fontSize: 13, color: '#888' },
  pastCost: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginRight: 10 },
  pastArrow: { fontSize: 20, color: '#CCCCCC' },
});
