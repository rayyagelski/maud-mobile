import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  ClockIcon, MountainIcon, PinIcon, LeafIcon,
  LightbulbIcon, ChevronIcon, ArrowUpIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { haversineDistanceKm, formatDuration, formatDistance } from '../../utils/helpers';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Trip, TripType as TripTypeValue } from '../../types/trip.types';

const TEAL = '#3ABFBF';

const TRIP_TYPES = ['Private', 'Business', 'All'] as const;
type TripTypeFilter = (typeof TRIP_TYPES)[number];
const TRIP_TYPE_MAP: Record<Exclude<TripTypeFilter, 'All'>, TripTypeValue> = {
  Private: 'private',
  Business: 'business',
};

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];

function timeframeDays(label: string): number {
  return parseInt(label, 10) || 7;
}

function tripDistanceKm(trip: Trip): number {
  return trip.route.reduce(
    (sum, point, i) => (i === 0 ? 0 : sum + haversineDistanceKm(trip.route[i - 1], point)),
    0,
  );
}

function tripDurationSeconds(trip: Trip): number {
  if (!trip.endTime) return 0;
  return Math.round((trip.endTime - trip.startTime) / 1000);
}

// ── Local icons ────────────────────────────────────────────────────────────

function FilterIcon({ color = '#1A1A1A', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SmallCarIcon({ color = '#999', size = 20 }: { color?: string; size?: number }) {
  const h = size * 0.82;
  return (
    <Svg width={size} height={h} viewBox="0 0 32 26" fill="none">
      <Path d="M8 12L11 5H21L24 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 12H27V18C27 18.55 26.55 19 26 19H6C5.45 19 5 18.55 5 18V12Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx="10" cy="21" r="2.5" stroke={color} strokeWidth={1.8} />
      <Circle cx="22" cy="21" r="2.5" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCol({ icon, value, label, subLabel }: {
  icon: React.ReactNode; value: string; label: string; subLabel?: string;
}) {
  return (
    <View style={styles.statCol}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subLabel ? <Text style={styles.statSubLabel}>{subLabel}</Text> : null}
    </View>
  );
}

function AvgRow({ icon, label, value, last = false }: {
  icon: React.ReactNode; label: string; value: string; last?: boolean;
}) {
  return (
    <View style={[styles.avgRow, !last && styles.avgRowBorder]}>
      <View style={styles.avgIconBox}>{icon}</View>
      <Text style={styles.avgLabel}>{label}</Text>
      <Text style={styles.avgValue}>{value}</Text>
    </View>
  );
}

function CostCard({ icon, label, value }: {
  icon: React.ReactNode; label: string; value: string;
}) {
  return (
    <View style={styles.costCard}>
      <View style={styles.costCardHeader}>
        {icon}
        <Text style={styles.costCardLabel}>{label}</Text>
      </View>
      <Text style={styles.costCardValue}>{value}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function TripHistoryScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const allTrips = useAppSelector(s => s.trips.trips);
  const [tripType, setTripType] = useState<TripTypeFilter>('All');
  const [selectedTime, setSelectedTime] = useState('7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function selectTime(t: string) {
    setSelectedTime(t);
    setDropdownOpen(false);
  }

  const filteredTrips = useMemo(() => {
    const cutoff = Date.now() - timeframeDays(selectedTime) * 24 * 60 * 60 * 1000;
    return allTrips
      .filter(t => t.status === 'completed' && t.startTime >= cutoff)
      .filter(t => tripType === 'All' || t.tripType === TRIP_TYPE_MAP[tripType])
      .sort((a, b) => b.startTime - a.startTime);
  }, [allTrips, selectedTime, tripType]);

  const stats = useMemo(() => {
    const durations = filteredTrips.map(tripDurationSeconds);
    const distances = filteredTrips.map(tripDistanceKm);
    const totalDurationSec = durations.reduce((a, b) => a + b, 0);
    const totalDistanceKm = distances.reduce((a, b) => a + b, 0);
    const shortTrips = durations.filter(d => d > 0 && d < 5 * 60).length;
    const avgSpeedKmh = totalDurationSec > 0 ? (totalDistanceKm / totalDurationSec) * 3600 : 0;
    const avgDistanceKm = filteredTrips.length > 0 ? totalDistanceKm / filteredTrips.length : 0;
    const uniqueDays = new Set(filteredTrips.map(t => new Date(t.startTime).toDateString())).size;
    const avgDistancePerDayKm = uniqueDays > 0 ? totalDistanceKm / uniqueDays : 0;
    const avgOperationSec = filteredTrips.length > 0 ? totalDurationSec / filteredTrips.length : 0;

    const savedTrips = filteredTrips.filter(t => t.reward?.moneySavedCents != null && t.reward.currencyCode);
    const totalSavedCents = savedTrips.reduce((sum, t) => sum + (t.reward!.moneySavedCents ?? 0), 0);
    const currencyCode = savedTrips[0]?.reward?.currencyCode ?? null;
    const totalCo2Grams = filteredTrips.reduce((sum, t) => sum + (t.reward?.co2AvoidedGrams ?? 0), 0);

    return {
      totalDurationSec, totalDistanceKm, shortTrips, avgSpeedKmh,
      avgDistanceKm, avgDistancePerDayKm, avgOperationSec,
      totalSavedCents, currencyCode, totalCo2Grams,
    };
  }, [filteredTrips]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trip History</Text>
          <TouchableOpacity hitSlop={HIT}>
            <FilterIcon color="#1A1A1A" size={22} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Trip Type filter */}
        <Text style={styles.filterLabel}>Select Trip Type</Text>
        <View style={styles.pillRow}>
          {TRIP_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.pill, tripType === t && styles.pillActive]}
              onPress={() => setTripType(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, tripType === t && styles.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Time frame filter */}
        <Text style={styles.filterLabel}>Select Time Frame</Text>
        <View style={styles.pillWrapper}>
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
        </View>

        {/* Summary stats */}
        <View style={[styles.card, styles.statsCard]}>
          <StatCol icon={<SmallCarIcon color="#999" size={20} />} value={String(filteredTrips.length)} label="Trips" />
          <View style={styles.statsDivider} />
          <StatCol icon={<ClockIcon color="#999" size={20} />} value={formatDuration(stats.totalDurationSec)} label="total driving" />
          <View style={styles.statsDivider} />
          <StatCol
            icon={<MountainIcon color="#999" size={20} />}
            value={String(stats.shortTrips)}
            label="short trips"
            subLabel="(<5 min)"
          />
        </View>

        {/* Driving Averages */}
        <Text style={styles.sectionTitle}>DRIVING AVERAGES</Text>
        <View style={styles.card}>
          <AvgRow icon={<ArrowUpIcon color="#999" size={16} />} label="Avg Speed" value={`${Math.round(stats.avgSpeedKmh)} km/h`} />
          <AvgRow icon={<PinIcon color="#999" size={16} />} label="Avg Distance / Trip" value={formatDistance(stats.avgDistanceKm)} />
          <AvgRow icon={<SmallCarIcon color="#999" size={16} />} label="Avg Distance / Day" value={formatDistance(stats.avgDistancePerDayKm)} />
          <AvgRow icon={<ClockIcon color="#999" size={16} />} label="Avg Operation Time" value={formatDuration(Math.round(stats.avgOperationSec))} last />
        </View>

        {/* Cost & Impact */}
        <Text style={styles.sectionTitle}>COST & IMPACT</Text>
        <View style={styles.costRow}>
          <CostCard
            icon={<Text style={styles.euroIcon}>{stats.currencyCode ? currencySymbol(stats.currencyCode) : '€'}</Text>}
            label="Total Savings"
            value={stats.currencyCode ? `${(stats.totalSavedCents / 100).toFixed(2)} ${stats.currencyCode}` : '—'}
          />
          <CostCard
            icon={<LeafIcon color="#999" size={16} />}
            label="CO₂ Avoided"
            value={stats.totalCo2Grams > 0 ? `${(stats.totalCo2Grams / 1000).toFixed(1)} kg` : '—'}
          />
        </View>

        {/* Insight of the Week */}
        <View style={styles.insightCard}>
          <View style={styles.insightIconBox}>
            <LightbulbIcon color={TEAL} size={22} />
          </View>
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Insight of the Week</Text>
            <Text style={styles.insightBody}>
              Reducing short trips could save fuel and lower CO₂ emissions.
            </Text>
          </View>
        </View>

        {/* Trips History list */}
        <Text style={styles.sectionTitle}>TRIPS HISTORY</Text>
        <View style={styles.card}>
          {filteredTrips.map((trip, i) => (
            <TouchableOpacity
              key={trip.id}
              style={[styles.historyRow, i < filteredTrips.length - 1 && styles.historyRowBorder]}
              onPress={() => navigation.navigate('MyTrip', { tripId: trip.id })}
              activeOpacity={0.7}
            >
              <Text style={styles.historyDate}>
                {new Date(trip.startTime).toLocaleDateString()}
              </Text>
              <Text style={styles.historyTime}>
                {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' • '}{formatDistance(tripDistanceKm(trip))}
              </Text>
              <Text style={styles.historyArrow}>›</Text>
            </TouchableOpacity>
          ))}
          {filteredTrips.length === 0 && (
            <Text style={styles.emptyText}>No trips in this range yet.</Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function currencySymbol(code: string): string {
  return { EUR: '€', USD: '$', GBP: '£' }[code] ?? code;
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

  // Filter labels
  filterLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 12 },

  // Pills
  pillWrapper: { marginBottom: 20, zIndex: 20 },
  pillRow: { flexDirection: 'row', columnGap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22,
    borderWidth: 1.5, borderColor: '#DDD', backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
  },
  pillActive: { backgroundColor: TEAL, borderColor: TEAL },
  pillText: { fontSize: 14, fontWeight: '500', color: '#555' },
  pillTextActive: { color: 'white', fontWeight: '600' },

  // Dropdown
  dropdownCard: {
    position: 'absolute', top: 50, right: 0,
    backgroundColor: 'white', borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15,
    shadowRadius: 12, elevation: 20, minWidth: 150, zIndex: 30,
  },
  dropdownItem: { paddingHorizontal: 20, paddingVertical: 14 },
  dropdownItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  dropdownText: { fontSize: 14, color: '#333', fontWeight: '500' },
  dropdownTextActive: { color: TEAL, fontWeight: '700' },

  // Stats card
  statsCard: { flexDirection: 'row', alignItems: 'flex-start' },
  statCol: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statsDivider: { width: 1, backgroundColor: '#EEEEEE', alignSelf: 'stretch', marginVertical: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginTop: 8, marginBottom: 2 },
  statLabel: { fontSize: 12, color: '#888', textAlign: 'center' },
  statSubLabel: { fontSize: 11, color: '#AAAAAA', textAlign: 'center', marginTop: 1 },

  // Section title
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.4, marginBottom: 10 },

  // Avg rows
  avgRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avgRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  avgIconBox: { width: 26, height: 26, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avgLabel: { flex: 1, fontSize: 14, color: '#555' },
  avgValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  // Cost cards
  costRow: { flexDirection: 'row', columnGap: 12, marginBottom: 12 },
  costCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  costCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  euroIcon: { fontSize: 16, color: '#999', marginRight: 4 },
  costCardLabel: { fontSize: 12, color: '#888', marginLeft: 4 },
  costCardValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },

  // Insight card
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#E8F7F7', borderRadius: 18, padding: 16, marginBottom: 20,
  },
  insightIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(58,191,191,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  insightContent: { flex: 1 },
  insightTitle: { fontSize: 14, fontWeight: '700', color: TEAL, marginBottom: 4 },
  insightBody: { fontSize: 13, color: '#555', lineHeight: 19 },

  // History rows
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  historyDate: { fontSize: 13, color: '#888', width: 90 },
  historyTime: { flex: 1, fontSize: 13, color: '#333' },
  historyArrow: { fontSize: 16, color: '#CCCCCC' },
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },
});
