import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  GearIcon, FlashIcon, PhoneIcon, ArrowUpIcon, PinIcon,
  RefreshIcon, MoonIcon, DropletIcon, CalendarIcon, FlagIcon,
  BuildingIcon, ChevronIcon, TrendUpIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];
const BAR_HEIGHTS = [38, 44, 50, 46, 58, 55, 64, 68, 72, 76, 84, 90, 100];

// ── Score arc ──────────────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
  const SIZE = 108;
  const SW = 8;
  const r = (SIZE - SW * 2) / 2;
  const C = 2 * Math.PI * r;
  const arcFull = C * 0.75;
  const arcFill = (score / 100) * arcFull;
  const cx = SIZE / 2;

  return (
    <View style={{ width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <G rotation="-225" origin={`${cx},${cx}`}>
          <Circle cx={cx} cy={cx} r={r}
            stroke="#E5E5E5" strokeWidth={SW} fill="none"
            strokeDasharray={`${arcFull} ${C}`} strokeLinecap="round" />
          <Circle cx={cx} cy={cx} r={r}
            stroke={TEAL} strokeWidth={SW} fill="none"
            strokeDasharray={`${arcFill} ${C}`} strokeLinecap="round" />
        </G>
      </Svg>
      <Text style={arcSt.num}>{score}</Text>
      <Text style={arcSt.label}>Total</Text>
    </View>
  );
}

const arcSt = StyleSheet.create({
  num: { fontSize: 26, fontWeight: '800', color: TEAL },
  label: { fontSize: 11, color: '#AAAAAA', marginTop: 2 },
});

// ── Mini bar chart ─────────────────────────────────────────────────────────

function MiniBarChart() {
  return (
    <View style={styles.barChart}>
      {BAR_HEIGHTS.map((h, i) => (
        <View
          key={i}
          style={[styles.barChartBar, { height: `${h}%` as any }]}
        />
      ))}
    </View>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, pts }: { title: string; pts: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionPts}>{pts}</Text>
    </View>
  );
}

// ── Behavior row (with progress bar) ──────────────────────────────────────

function BehaviorRow({ icon, label, count, pts, barPct, barColor = TEAL, last = false }: {
  icon: React.ReactNode; label: string; count: number;
  pts: string; barPct: number; barColor?: string; last?: boolean;
}) {
  return (
    <View style={[styles.bRow, !last && styles.bRowBorder]}>
      <View style={styles.bTop}>
        <View style={styles.bIconBox}>{icon}</View>
        <Text style={styles.bLabel}>{label}</Text>
        <Text style={styles.bCount}>{count}</Text>
        <Text style={styles.bPts}>{pts}</Text>
      </View>
      <View style={styles.bBarBg}>
        <View style={[styles.bBarFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Road row (no progress bar) ─────────────────────────────────────────────

function RoadRow({ icon, label, count, pts, last = false }: {
  icon: React.ReactNode; label: string; count: number; pts: string; last?: boolean;
}) {
  return (
    <View style={[styles.bRow, styles.roadRow, !last && styles.bRowBorder]}>
      <View style={styles.bIconBox}>{icon}</View>
      <Text style={styles.bLabel}>{label}</Text>
      <Text style={styles.bCount}>{count}</Text>
      <Text style={styles.bPts}>{pts}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function DriverScoreScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Score</Text>
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GearIcon color="#AAAAAA" size={22} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Overview label */}
        <View style={styles.overviewLabel}>
          <RefreshIcon color={TEAL} size={18} />
          <Text style={styles.overviewText}>  Driver Score - Overview</Text>
        </View>

        {/* Score card */}
        <View style={styles.card}>
          <View style={styles.scoreRow}>
            <ScoreArc score={82} />
            <View style={styles.scoreRight}>
              <Text style={styles.ptsMonth}>+740 pts this month</Text>
              <View style={styles.trendRow}>
                <TrendUpIcon color={TEAL} size={14} />
                <Text style={styles.trendText}>  +4% vs last month</Text>
              </View>
              <MiniBarChart />
            </View>
          </View>
        </View>

        {/* Timeframe */}
        <Text style={styles.timeframeLabel}>SELECT TIMEFRAME</Text>
        <View style={styles.pillRow}>
          {TIMEFRAMES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.pill, selectedTime === t && styles.pillActive]}
              onPress={() => selectTime(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, selectedTime === t && styles.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.pill, dropdownOpen && styles.pillActive]}
            onPress={() => setDropdownOpen(v => !v)}
            activeOpacity={0.8}
          >
            <ChevronIcon open={dropdownOpen} color={dropdownOpen ? 'white' : '#555'} size={18} />
          </TouchableOpacity>
        </View>

        {/* Dropdown options */}
        {dropdownOpen && (
          <View style={styles.dropdownCard}>
            {DROPDOWN_OPTIONS.map((opt, i) => (
              <TouchableOpacity
                key={opt}
                style={[styles.dropdownItem, i < DROPDOWN_OPTIONS.length - 1 && styles.dropdownItemBorder]}
                onPress={() => selectTime(opt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dropdownText, selectedTime === opt && styles.dropdownTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Driving Behavior */}
        <SectionHeader title="Driving Behavior" pts="+410 pts" />
        <View style={styles.card}>
          <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
            label="Speeding" count={6} pts="+160 pts" barPct={74} barColor="#F5A623" />
          <BehaviorRow icon={<PhoneIcon color="#888" size={16} />}
            label="Phone Usage" count={4} pts="+80 pts" barPct={62} />
          <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
            label="Harsh Braking" count={3} pts="+70 pts" barPct={54} />
          <BehaviorRow icon={<ArrowUpIcon color="#888" size={16} />}
            label="Harsh Acceleration" count={3} pts="+60 pts" barPct={46} />
          <BehaviorRow icon={<RefreshIcon color="#888" size={16} />}
            label="Cornering" count={5} pts="+40 pts" barPct={36} last />
        </View>

        {/* Trip Insights */}
        <SectionHeader title="Trip Insights" pts="+200 pts" />
        <View style={styles.card}>
          <BehaviorRow icon={<PinIcon color="#888" size={16} />}
            label="Rain Trips" count={4} pts="+70 pts" barPct={68} />
          <BehaviorRow icon={<MoonIcon color="#888" size={16} />}
            label="Night Trips" count={3} pts="+60 pts" barPct={58} />
          <BehaviorRow icon={<DropletIcon color="#888" size={16} />}
            label="Rain/Night Trips" count={1} pts="+30 pts" barPct={18} />
          <BehaviorRow icon={<CalendarIcon color="#888" size={16} />}
            label="Weekend Trips" count={3} pts="+40 pts" barPct={42} last />
        </View>

        {/* Road Type Changes */}
        <SectionHeader title="Road Type Changes" pts="+130 pts" />
        <View style={styles.card}>
          <RoadRow icon={<ArrowUpIcon color="#888" size={16} />}
            label="Highways" count={12} pts="+60 pts" />
          <RoadRow icon={<BuildingIcon color="#888" size={16} />}
            label="Urban Roads" count={9} pts="+45 pts" />
          <RoadRow icon={<FlagIcon color="#888" size={16} />}
            label="Unpaved Roads" count={2} pts="+25 pts" last />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EEEEEE' },

  scroll: { padding: 16, paddingBottom: 32 },

  // Overview label
  overviewLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  overviewText: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },

  // Card
  card: {
    backgroundColor: 'white', borderRadius: 18,
    padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Score card
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreRight: { flex: 1, marginLeft: 16 },
  ptsMonth: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  trendText: { fontSize: 13, fontWeight: '600', color: TEAL },

  // Mini bar chart
  barChart: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: 48, columnGap: 3, marginTop: 10,
  },
  barChartBar: { width: 9, backgroundColor: TEAL, borderRadius: 2 },

  // Timeframe
  timeframeLabel: {
    fontSize: 12, fontWeight: '700', color: '#888888',
    letterSpacing: 0.8, marginBottom: 12,
  },
  pillRow: { flexDirection: 'row', columnGap: 8, marginBottom: 16, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 22, borderWidth: 1, borderColor: '#DDDDDD',
    backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
  },
  pillActive: { backgroundColor: TEAL, borderColor: TEAL },
  pillText: { fontSize: 13, fontWeight: '600', color: '#555555' },
  pillTextActive: { color: 'white' },

  // Dropdown
  dropdownCard: {
    backgroundColor: 'white', borderRadius: 14,
    marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
    alignSelf: 'flex-end',
    minWidth: 140,
  },
  dropdownItem: { paddingHorizontal: 20, paddingVertical: 14 },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownText: { fontSize: 14, color: '#333333', fontWeight: '500' },
  dropdownTextActive: { color: TEAL, fontWeight: '700' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  sectionPts: { fontSize: 14, fontWeight: '700', color: TEAL },

  // Behavior rows
  bRow: { paddingVertical: 10 },
  bRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  roadRow: { flexDirection: 'row', alignItems: 'center' },
  bTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bIconBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  bLabel: { flex: 1, fontSize: 14, color: '#333333' },
  bCount: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginRight: 8 },
  bPts: { fontSize: 13, fontWeight: '600', color: TEAL },
  bBarBg: { height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, overflow: 'hidden' },
  bBarFill: { height: '100%', borderRadius: 3 },
});
