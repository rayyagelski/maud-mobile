import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  LeafIcon, StarOutlineIcon, TrendUpIcon, ChevronIcon, DollarIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Trip } from '../../types/trip.types';

const TEAL = '#3ABFBF';

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];
const TREND_TABS = ['Eco Score', 'Savings', 'Points'] as const;
type TrendTab = (typeof TREND_TABS)[number];

function timeframeDays(label: string): number {
  return parseInt(label, 10) || 7;
}

function avgEcoScore(trips: Trip[]): number {
  const scored = trips.filter(t => t.reward);
  if (scored.length === 0) return 0;
  return Math.round(scored.reduce((sum, t) => sum + (t.reward?.ecoScore ?? 0), 0) / scored.length);
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

function MiniBarChart({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <Text style={miniSt.noData}>No scored trips yet in this range.</Text>;
  }
  return (
    <View style={miniSt.container}>
      {values.map((h, i) => (
        <View key={i} style={[miniSt.bar, { height: `${h}%` as any }]} />
      ))}
    </View>
  );
}
const miniSt = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', height: 48, columnGap: 3, marginTop: 10 },
  bar: { width: 9, backgroundColor: TEAL, borderRadius: 2 },
  noData: { fontSize: 12, color: '#AAAAAA', marginTop: 10 },
});

// ── Trend bar chart ────────────────────────────────────────────────────────

function TrendBarChart({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <Text style={trendSt.noData}>No trips in this range yet.</Text>;
  }
  return (
    <View style={trendSt.wrapper}>
      {values.map((h, i) => (
        <View key={i} style={trendSt.col}>
          <View style={trendSt.barBg}>
            <View style={[trendSt.barFill, { height: `${Math.max(4, h)}%` as any }]} />
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
  noData: { fontSize: 12, color: '#AAAAAA', textAlign: 'center', marginTop: 20 },
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
  const allTrips = useAppSelector(s => s.trips.trips);
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [trendTab, setTrendTab] = useState<TrendTab>('Eco Score');

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
      current: allTrips
        .filter(t => t.status === 'completed' && t.startTime >= cutoff)
        .sort((a, b) => a.startTime - b.startTime),
      previous: allTrips.filter(t => t.status === 'completed' && t.startTime >= prevCutoff && t.startTime < cutoff),
    };
  }, [allTrips, selectedTime]);

  const overallScore = avgEcoScore(current);
  const prevScore = avgEcoScore(previous);
  const trendPct = prevScore > 0 ? Math.round(((overallScore - prevScore) / prevScore) * 100) : null;
  const totalPoints = current.reduce((sum, t) => sum + (t.reward?.tripPointsEarned ?? 0), 0);
  const totalCo2Grams = current.reduce((sum, t) => sum + (t.reward?.co2AvoidedGrams ?? 0), 0);
  const savedTrips = current.filter(t => t.reward?.moneySavedCents != null && t.reward.currencyCode);
  const totalSavedCents = savedTrips.reduce((sum, t) => sum + (t.reward!.moneySavedCents ?? 0), 0);
  const currencyCode = savedTrips[0]?.reward?.currencyCode ?? null;

  const scoredTrips = useMemo(() => current.filter(t => t.reward), [current]);

  const miniBarValues = useMemo(
    () => scoredTrips.slice(-13).map(t => Math.max(8, Math.round(t.reward?.ecoScore ?? 0))),
    [scoredTrips],
  );

  const trendValues = useMemo(() => {
    const trips = scoredTrips.slice(-14);
    if (trendTab === 'Eco Score') return trips.map(t => t.reward?.ecoScore ?? 0);
    if (trendTab === 'Points') {
      const max = Math.max(1, ...trips.map(t => t.reward?.tripPointsEarned ?? 0));
      return trips.map(t => ((t.reward?.tripPointsEarned ?? 0) / max) * 100);
    }
    const max = Math.max(1, ...trips.map(t => t.reward?.moneySavedCents ?? 0));
    return trips.map(t => ((t.reward?.moneySavedCents ?? 0) / max) * 100);
  }, [scoredTrips, trendTab]);

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
            <ScoreArc score={overallScore} />
            <View style={styles.scoreRight}>
              <Text style={styles.ptsMonth}>+{totalPoints} pts this period</Text>
              {trendPct !== null && (
                <View style={styles.trendRow}>
                  <TrendUpIcon color={TEAL} size={14} />
                  <Text style={styles.trendText}>  {trendPct >= 0 ? '+' : ''}{trendPct}% vs previous period</Text>
                </View>
              )}
              <MiniBarChart values={miniBarValues} />
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
            <RewardCol
              icon={<DollarIcon color="#888" size={20} />}
              value={currencyCode ? `${(totalSavedCents / 100).toFixed(2)} ${currencyCode}` : '—'}
              label="Saved" />
            <View style={styles.rewardsDivider} />
            <RewardCol
              icon={<LeafIcon color="#888" size={20} />}
              value={totalCo2Grams > 0 ? `${(totalCo2Grams / 1000).toFixed(1)} kg` : '—'}
              label={'CO₂ avoided'} />
            <View style={styles.rewardsDivider} />
            <RewardCol icon={<StarOutlineIcon color="#888" size={20} />} value={`+${totalPoints}`} label="Eco Points" />
          </View>
        </View>

        {/* Eco Savings Trend */}
        <Text style={styles.sectionTitle}>ECO SAVINGS TREND</Text>
        <View style={styles.card}>
          <View style={styles.tabRow}>
            {TREND_TABS.map(tab => (
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
          <TrendBarChart values={trendValues} />
        </View>

        {/* Details per day/trip */}
        <Text style={styles.sectionTitle}>DETAILS PER TRIP</Text>
        <View style={styles.card}>
          {scoredTrips.slice(-10).reverse().map((trip, i, arr) => (
            <TouchableOpacity
              key={trip.id}
              style={[styles.detailRow, i < arr.length - 1 && styles.detailRowBorder]}
              onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
              activeOpacity={0.7}
            >
              <Text style={styles.detailDate}>{new Date(trip.startTime).toLocaleDateString()}</Text>
              <Text style={styles.detailTime}>
                {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.detailPts}>+{trip.reward?.tripPointsEarned ?? 0}</Text>
              <Text style={styles.detailArrow}>›</Text>
            </TouchableOpacity>
          ))}
          {scoredTrips.length === 0 && (
            <Text style={styles.emptyText}>No scored trips yet in this range.</Text>
          )}
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
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },
});
