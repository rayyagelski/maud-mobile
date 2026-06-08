import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  FlashIcon, LeafIcon, StarOutlineIcon, TrendUpIcon, ChevronIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

const TEAL = '#3ABFBF';

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];
const MINI_BAR_HEIGHTS = [38, 44, 50, 46, 58, 55, 64, 68, 72, 76, 84, 90, 100];
const TREND_HEIGHTS = [18, 24, 30, 34, 40, 44, 50, 57, 63, 70, 76, 84, 91, 100];

const DETAIL_ROWS = [
  { date: '16/02/2026', time: '08:20 AM', city: 'Miami',   pts: '+27', id: 'trip-001' },
  { date: '15/02/2026', time: '08:20 AM', city: 'Orlando', pts: '+12', id: 'trip-002' },
  { date: '14/02/2026', time: '08:10 AM', city: 'Miami',   pts: '+7',  id: 'trip-003' },
  { date: '12/02/2026', time: '08:20 AM', city: 'Daytona', pts: '+3',  id: 'trip-004' },
];

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
          <Circle cx={cx} cy={cx} r={r} stroke="#E5E5E5" strokeWidth={SW} fill="none"
            strokeDasharray={`${arcFull} ${C}`} strokeLinecap="round" />
          <Circle cx={cx} cy={cx} r={r} stroke={TEAL} strokeWidth={SW} fill="none"
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
    <View style={miniSt.container}>
      {MINI_BAR_HEIGHTS.map((h, i) => (
        <View key={i} style={[miniSt.bar, { height: `${h}%` as any }]} />
      ))}
    </View>
  );
}
const miniSt = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 48, columnGap: 3, marginTop: 10 },
  bar: { width: 9, backgroundColor: TEAL, borderRadius: 2 },
});

// ── Trend bar chart ────────────────────────────────────────────────────────

function TrendBarChart() {
  return (
    <View style={trendSt.wrapper}>
      {TREND_HEIGHTS.map((h, i) => (
        <View key={i} style={trendSt.col}>
          <View style={trendSt.barBg}>
            <View style={[trendSt.barFill, { height: `${h}%` as any }]} />
          </View>
          <Text style={trendSt.xLabel}>{i + 1}</Text>
        </View>
      ))}
    </View>
  );
}
const trendSt = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'flex-end', height: 110, marginTop: 12, marginBottom: 4 },
  col: { flex: 1, alignItems: 'center' },
  barBg: { width: '80%', height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: TEAL, borderRadius: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  xLabel: { fontSize: 9, color: '#AAAAAA', marginTop: 4 },
});

// ── Reward column ─────────────────────────────────────────────────────────

function RewardCol({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.rewardCol}>
      {icon}
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function EcoScoreScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [trendTab, setTrendTab] = useState('Energy');

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Eco Score</Text>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

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

        {/* Eco Rewards */}
        <Text style={styles.sectionTitle}>ECO REWARDS</Text>
        <View style={styles.card}>
          <View style={styles.rewardsRow}>
            <RewardCol icon={<FlashIcon color="#888" size={20} />} value="+17.6 kWh" label="Saved" />
            <View style={styles.rewardsDivider} />
            <RewardCol icon={<LeafIcon color="#888" size={20} />} value="+9.4 kg" label={'CO₂ avoided'} />
            <View style={styles.rewardsDivider} />
            <RewardCol icon={<StarOutlineIcon color="#888" size={20} />} value="+320" label="Eco Points" />
          </View>
        </View>

        {/* Baseline comparison */}
        <View style={styles.card}>
          <Text style={styles.baselineTitle}>Baseline (similar EVs / conditions)</Text>
          <View style={styles.grayBar} />
          <View style={styles.tealBarRow}>
            <View style={styles.tealBar} />
            <Text style={styles.barArrow}>›</Text>
          </View>
          <Text style={styles.drivingLabel}>Your Driving + Charging</Text>
          <View style={styles.highlightBox}>
            <Text style={styles.highlightText}>
              You drove + charged{'\n'}more efficiently{'\n'}than{' '}
              <Text style={styles.highlightBold}>76%</Text>
              {' '}of similar EV drivers
            </Text>
          </View>
          <View style={styles.improvingRow}>
            <Text style={styles.lastDaysText}>Last {selectedTime}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.improvingText}>improving  </Text>
              <TrendUpIcon color={TEAL} size={14} />
            </View>
          </View>
        </View>

        {/* Eco Savings Trend */}
        <Text style={styles.sectionTitle}>ECO SAVINGS TREND</Text>
        <View style={styles.card}>
          <View style={styles.tabRow}>
            {['Energy', 'Cost', 'Points'].map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, trendTab === tab && styles.tabActive]}
                onPress={() => setTrendTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, trendTab === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TrendBarChart />
        </View>

        {/* Details per day/trip */}
        <Text style={styles.sectionTitle}>DETAILS PER DAY/TRIP</Text>
        <View style={styles.card}>
          {DETAIL_ROWS.map((row, i) => (
            <TouchableOpacity
              key={row.id}
              style={[styles.detailRow, i < DETAIL_ROWS.length - 1 && styles.detailRowBorder]}
              onPress={() => navigation.navigate('TripDetail', { tripId: row.id })}
              activeOpacity={0.7}
            >
              <Text style={styles.detailDate}>{row.date}</Text>
              <Text style={styles.detailTime}>{row.time}, {row.city}</Text>
              <Text style={styles.detailPts}>{row.pts}</Text>
              <Text style={styles.detailArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 36 },

  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Score card
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreRight: { flex: 1, marginLeft: 16 },
  ptsMonth: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  trendText: { fontSize: 13, fontWeight: '600', color: TEAL },

  // Timeframe
  timeframeLabel: {
    fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 0.8, marginBottom: 12,
  },
  pillRow: { flexDirection: 'row', columnGap: 8, marginBottom: 16, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22,
    borderWidth: 1, borderColor: '#DDD', backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
  },
  pillActive: { backgroundColor: TEAL, borderColor: TEAL },
  pillText: { fontSize: 13, fontWeight: '600', color: '#555' },
  pillTextActive: { color: 'white' },

  // Dropdown
  dropdownCard: {
    backgroundColor: 'white', borderRadius: 14, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1,
    shadowRadius: 12, elevation: 6, alignSelf: 'flex-end', minWidth: 140,
  },
  dropdownItem: { paddingHorizontal: 20, paddingVertical: 14 },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownText: { fontSize: 14, color: '#333', fontWeight: '500' },
  dropdownTextActive: { color: TEAL, fontWeight: '700' },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },

  // Eco Rewards
  rewardsRow: { flexDirection: 'row', alignItems: 'stretch' },
  rewardCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  rewardsDivider: { width: 1, backgroundColor: '#EEEEEE', marginVertical: 4 },
  rewardValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginTop: 8, marginBottom: 4 },
  rewardLabel: { fontSize: 11, color: '#888', textAlign: 'center' },

  // Baseline comparison
  baselineTitle: { fontSize: 13, color: '#555', marginBottom: 10 },
  grayBar: { height: 5, backgroundColor: '#E5E5E5', borderRadius: 3, marginBottom: 8 },
  tealBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tealBar: { height: 8, flex: 0.78, backgroundColor: TEAL, borderRadius: 4 },
  barArrow: { fontSize: 18, fontWeight: '700', color: TEAL, marginLeft: 8 },
  drivingLabel: { fontSize: 13, color: '#555', marginBottom: 12 },
  highlightBox: {
    backgroundColor: '#E8F7F7', borderRadius: 12, padding: 16, marginBottom: 14, alignItems: 'center',
  },
  highlightText: { fontSize: 14, color: '#333', textAlign: 'center', lineHeight: 22 },
  highlightBold: { fontWeight: '800', color: '#1A1A1A' },
  improvingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastDaysText: { fontSize: 13, color: '#888' },
  improvingText: { fontSize: 13, fontWeight: '600', color: TEAL },

  // Trend tabs
  tabRow: { flexDirection: 'row', columnGap: 8, marginBottom: 4 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#DDD', backgroundColor: 'white',
  },
  tabActive: { backgroundColor: TEAL, borderColor: TEAL },
  tabText: { fontSize: 13, fontWeight: '600', color: '#555' },
  tabTextActive: { color: 'white' },

  // Detail rows
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  detailDate: { fontSize: 13, color: '#888', width: 90 },
  detailTime: { flex: 1, fontSize: 13, color: '#333' },
  detailPts: { fontSize: 13, fontWeight: '700', color: TEAL, marginRight: 8 },
  detailArrow: { fontSize: 16, color: '#CCCCCC' },
});
