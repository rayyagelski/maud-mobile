import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  GearIcon, FlashIcon, PhoneIcon, ArrowUpIcon, PinIcon,
  RefreshIcon, MoonIcon, DropletIcon, CalendarIcon,
  ChevronIcon, TrendUpIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Trip } from '../../types/trip.types';

const TEAL = '#3ABFBF';

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];

function timeframeDays(label: string): number {
  return parseInt(label, 10) || 7;
}

function avgSafetyScore(trips: Trip[]): number {
  const scored = trips.filter(t => t.reward);
  if (scored.length === 0) return 0;
  return Math.round(scored.reduce((sum, t) => sum + (t.reward?.safetyScore ?? 0), 0) / scored.length);
}

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

function MiniBarChart({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <Text style={styles.noDataText}>No scored trips yet in this range.</Text>;
  }
  return (
    <View style={styles.barChart}>
      {values.map((h, i) => (
        <View key={i} style={[styles.barChartBar, { height: `${h}%` as any }]} />
      ))}
    </View>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionPts}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Behavior row (with progress bar) ──────────────────────────────────────

function BehaviorRow({ icon, label, count, barPct, barColor = TEAL, last = false }: {
  icon: React.ReactNode; label: string; count: number;
  barPct: number; barColor?: string; last?: boolean;
}) {
  return (
    <View style={[styles.bRow, !last && styles.bRowBorder]}>
      <View style={styles.bTop}>
        <View style={styles.bIconBox}>{icon}</View>
        <Text style={styles.bLabel}>{label}</Text>
        <Text style={styles.bCount}>{count}</Text>
      </View>
      <View style={styles.bBarBg}>
        <View style={[styles.bBarFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function DriverScoreScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const allTrips = useAppSelector(s => s.trips.trips);
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  const { current, previous } = useMemo(() => {
    const days = timeframeDays(selectedTime);
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const prevCutoff = cutoff - days * 24 * 60 * 60 * 1000;
    return {
      current: allTrips.filter(t => t.status === 'completed' && t.startTime >= cutoff),
      previous: allTrips.filter(t => t.status === 'completed' && t.startTime >= prevCutoff && t.startTime < cutoff),
    };
  }, [allTrips, selectedTime]);

  const overallScore = avgSafetyScore(current);
  const prevScore = avgSafetyScore(previous);
  const trendPct = prevScore > 0 ? Math.round(((overallScore - prevScore) / prevScore) * 100) : null;
  const totalPoints = current.reduce((sum, t) => sum + (t.reward?.tripPointsEarned ?? 0), 0);

  const barValues = useMemo(
    () =>
      current
        .filter(t => t.reward)
        .slice()
        .sort((a, b) => a.startTime - b.startTime)
        .slice(-13)
        .map(t => Math.max(8, Math.round(t.reward?.tripRewardScore ?? 0))),
    [current],
  );

  const counters = useMemo(
    () =>
      current.reduce(
        (acc, t) => {
          const c = t.eventCounters;
          if (c) {
            acc.speedingSeconds += c.speedingSeconds;
            acc.phoneTextSeconds += c.phoneTextSeconds;
            acc.harshBrakeCount += c.harshBrakeCount;
            acc.harshAccelCount += c.harshAccelCount;
            acc.harshCornerCount += c.harshCornerCount;
          }
          return acc;
        },
        { speedingSeconds: 0, phoneTextSeconds: 0, harshBrakeCount: 0, harshAccelCount: 0, harshCornerCount: 0 },
      ),
    [current],
  );
  const speedingCount = Math.round(counters.speedingSeconds / 60); // minutes
  const phoneUsageCount = Math.round(counters.phoneTextSeconds / 60); // minutes
  const maxBehaviorCount = Math.max(
    1, speedingCount, phoneUsageCount,
    counters.harshBrakeCount, counters.harshAccelCount, counters.harshCornerCount,
  );

  const rainTrips = current.filter(t => t.context?.isRain).length;
  const nightTrips = current.filter(t => t.context?.isNight).length;
  const rainAndNightTrips = current.filter(t => t.context?.isRain && t.context?.isNight).length;
  const weekendTrips = current.filter(t => {
    const day = new Date(t.startTime).getDay();
    return day === 0 || day === 6;
  }).length;
  const maxInsightCount = Math.max(1, rainTrips, nightTrips, rainAndNightTrips, weekendTrips);

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
            <ScoreArc score={overallScore} />
            <View style={styles.scoreRight}>
              <Text style={styles.ptsMonth}>+{totalPoints} pts this period</Text>
              {trendPct !== null && (
                <View style={styles.trendRow}>
                  <TrendUpIcon color={TEAL} size={14} />
                  <Text style={styles.trendText}>  {trendPct >= 0 ? '+' : ''}{trendPct}% vs previous period</Text>
                </View>
              )}
              <MiniBarChart values={barValues} />
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
        <SectionHeader title="Driving Behavior" subtitle={`${current.length} trips`} />
        <View style={styles.card}>
          <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
            label="Speeding (min)" count={speedingCount} barPct={(speedingCount / maxBehaviorCount) * 100} barColor="#F5A623" />
          <BehaviorRow icon={<PhoneIcon color="#888" size={16} />}
            label="Phone Usage (min)" count={phoneUsageCount} barPct={(phoneUsageCount / maxBehaviorCount) * 100} />
          <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
            label="Harsh Braking" count={counters.harshBrakeCount} barPct={(counters.harshBrakeCount / maxBehaviorCount) * 100} />
          <BehaviorRow icon={<ArrowUpIcon color="#888" size={16} />}
            label="Harsh Acceleration" count={counters.harshAccelCount} barPct={(counters.harshAccelCount / maxBehaviorCount) * 100} />
          <BehaviorRow icon={<RefreshIcon color="#888" size={16} />}
            label="Cornering" count={counters.harshCornerCount} barPct={(counters.harshCornerCount / maxBehaviorCount) * 100} last />
        </View>

        {/* Trip Insights */}
        <SectionHeader title="Trip Insights" />
        <View style={styles.card}>
          <BehaviorRow icon={<PinIcon color="#888" size={16} />}
            label="Rain Trips" count={rainTrips} barPct={(rainTrips / maxInsightCount) * 100} />
          <BehaviorRow icon={<MoonIcon color="#888" size={16} />}
            label="Night Trips" count={nightTrips} barPct={(nightTrips / maxInsightCount) * 100} />
          <BehaviorRow icon={<DropletIcon color="#888" size={16} />}
            label="Rain/Night Trips" count={rainAndNightTrips} barPct={(rainAndNightTrips / maxInsightCount) * 100} />
          <BehaviorRow icon={<CalendarIcon color="#888" size={16} />}
            label="Weekend Trips" count={weekendTrips} barPct={(weekendTrips / maxInsightCount) * 100} last />
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
  noDataText: { fontSize: 12, color: '#AAAAAA', marginTop: 10 },

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
  bTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bIconBox: {
    width: 28, height: 28, borderRadius: 7,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  bLabel: { flex: 1, fontSize: 14, color: '#333333' },
  bCount: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginRight: 8 },
  bBarBg: { height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, overflow: 'hidden' },
  bBarFill: { height: '100%', borderRadius: 3 },
});
