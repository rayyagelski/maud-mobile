import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  FlashIcon, PhoneIcon, ArrowUpIcon, PinIcon,
  RefreshIcon, MoonIcon, DropletIcon, CalendarIcon,
  ChevronIcon, TrendUpIcon, RouteIcon, FlagIcon, BuildingIcon, HomeIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useVgdRoadTypeBreakdown } from '../../hooks/useVgdRoadTypeBreakdown';
import { useVgdBehaviorAggregate } from '../../hooks/useVgdBehaviorAggregate';
import { tripDistanceKm, tripDurationSeconds, tripIsNight, tripIsAfterMidnight } from '../../utils/helpers';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import type { Trip } from '../../types/trip.types';

const TEAL = '#3ABFBF';
// "Good" tier uses the app's own turquoise, not grass-green — kept as a
// separate name from TEAL since it means something semantically distinct
// (best-tier severity color), even though the value is identical today.
const GOOD = TEAL;
const LIME = '#A9D94C';
const ORANGE = '#F5A623';
const RED = '#E5484D';

const KM_TO_MILES = 0.621371;

const TIMEFRAMES = ['7 Days', '14 Days', '28 Days'];
const DROPDOWN_OPTIONS = ['90 Days', '180 Days', '365 Days'];

// v1 rate thresholds, as specified by product (not calibrated against real
// MAUD trip data yet). "poor" is the rate at which the behavior's subscore
// hits 0 — everything below scales linearly toward 100 at rate=0. Speeding is
// a % of drive time; the rest are counts (or seconds, for phone) per 100
// miles driven. For non-US/metric users this should ideally be computed per
// 100 km internally rather than converting the mile-based threshold, but v1
// applies the same per-100mi threshold universally.
const BEHAVIOR_POOR_RATE = {
  speedingPctOfDriveTime: 8,
  phoneSecondsPer100Mi: 45,
  harshBrakePer100Mi: 4,
  harshAccelPer100Mi: 4,
  harshCornerPer100Mi: 3,
} as const;

// Generic context severity multipliers applied to each trip's contribution
// before it's aggregated into a rate — a simplified, uniform-across-behaviors
// stand-in for the compound/interaction multipliers (e.g. phone+speeding+
// highway+rain+night compounding together) that really belong server-side,
// computed per-event against HERE road attributes. Not implemented here.
const CONTEXT_MULTIPLIERS = {
  night: 1.10,
  rain: 1.15,
  highway: 1.10,
  afterMidnight: 1.20,
} as const;

function tripContextMultiplier(trip: Trip): number {
  const ctx = trip.context;
  let m = 1;
  // isNight/isAfterMidnight are pure date math (tripIsNight/tripIsAfterMidnight
  // fall back to computing from startTime), so they apply to every trip
  // regardless of source. isRain/highwayShare have no VGD-derivable
  // equivalent (no stored weather for most already-elapsed trips, no route
  // points to compute a highway share from) — stay local-trip-only rather
  // than being guessed.
  if (tripIsNight(trip)) m *= CONTEXT_MULTIPLIERS.night;
  if (ctx?.isRain) m *= CONTEXT_MULTIPLIERS.rain;
  if (ctx && ctx.highwayShare >= 0.5) m *= CONTEXT_MULTIPLIERS.highway;
  if (tripIsAfterMidnight(trip)) m *= CONTEXT_MULTIPLIERS.afterMidnight;
  return m;
}

// Lower-is-better subscore: 100 at rate=0, 0 at rate>=poorRate, linear between.
function behaviorScore(rate: number, poorRate: number): number {
  return Math.max(0, Math.min(100, Math.round(100 * (1 - rate / poorRate))));
}

function scoreColor(score: number): string {
  if (score >= 85) return GOOD;
  if (score >= 70) return LIME;
  if (score >= 50) return ORANGE;
  return RED;
}

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

function BehaviorRow({
  icon, label, count, unit = '', percent, barPct, barColor = TEAL, last = false,
}: {
  icon: React.ReactNode; label: string; count: number; unit?: string; percent?: number;
  barPct: number; barColor?: string; last?: boolean;
}) {
  return (
    <View style={[styles.bRow, !last && styles.bRowBorder]}>
      <View style={styles.bTop}>
        <View style={styles.bIconBox}>{icon}</View>
        <Text style={styles.bLabel}>{label}</Text>
        <Text style={styles.bCount}>{count}{unit}</Text>
        {percent !== undefined && <Text style={styles.bPercent}>{percent}%</Text>}
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

  // Context-weighted exposure totals — each trip's raw counters are scaled by
  // its own night/rain/highway/after-midnight multiplier before being summed,
  // so two identical harsh-braking counts don't score the same if one
  // happened on a calm daytime commute and the other at night in the rain.
  const exposure = useMemo(
    () =>
      current.reduce(
        (acc, t) => {
          const c = t.eventCounters;
          if (c) {
            const m = tripContextMultiplier(t);
            acc.speedingSeconds += c.speedingSeconds * m;
            acc.phoneTextSeconds += c.phoneTextSeconds * m;
            acc.harshBrakeCount += c.harshBrakeCount * m;
            acc.harshAccelCount += c.harshAccelCount * m;
            acc.harshCornerCount += c.harshCornerCount * m;
          }
          acc.driveSeconds += tripDurationSeconds(t);
          acc.miles += tripDistanceKm(t) * KM_TO_MILES;
          return acc;
        },
        {
          speedingSeconds: 0, phoneTextSeconds: 0, harshBrakeCount: 0,
          harshAccelCount: 0, harshCornerCount: 0, driveSeconds: 0, miles: 0,
        },
      ),
    [current],
  );

  // Real harsh-event counts backfilled from VGD for trips that have no local
  // eventCounters (source: 'vgd', e.g. the testing account's backend-only
  // drives — see useVgdBehaviorAggregate). Unlike the local reduce above,
  // this is a single cross-trip aggregate (one VGD events call per trip, not
  // per-trip-then-summed), so it's added unweighted rather than run back
  // through tripContextMultiplier per trip — a deliberate simplification,
  // same spirit as CONTEXT_MULTIPLIERS' own "uniform stand-in" note above.
  // VGD has no speeding-seconds/phone-usage-seconds equivalent, so those two
  // stay local-only.
  const vgdBehavior = useVgdBehaviorAggregate(current);
  const exposureWithVgd = useMemo(() => ({
    ...exposure,
    harshBrakeCount: exposure.harshBrakeCount + vgdBehavior.harshBrakeCount,
    harshAccelCount: exposure.harshAccelCount + vgdBehavior.harshAccelCount,
    harshCornerCount: exposure.harshCornerCount + vgdBehavior.harshCornerCount,
  }), [exposure, vgdBehavior]);

  // Real, unweighted totals for the selected period — what the UI actually
  // displays per row (see BehaviorRow below). Deliberately separate from
  // `exposure`/`exposureWithVgd` above: those are night/rain/highway-
  // weighted specifically for the 0-100 score math (a real event can count
  // as "more" than one toward the score), which would misrepresent an
  // "absolute number of events" display — a genuine 15 cornering events must
  // read as 15, not as some multiplied-up figure.
  const rawCounts = useMemo(
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
  const rawCountsWithVgd = useMemo(() => ({
    ...rawCounts,
    harshBrakeCount: rawCounts.harshBrakeCount + vgdBehavior.harshBrakeCount,
    harshAccelCount: rawCounts.harshAccelCount + vgdBehavior.harshAccelCount,
    harshCornerCount: rawCounts.harshCornerCount + vgdBehavior.harshCornerCount,
  }), [rawCounts, vgdBehavior]);

  const per100Mi = exposureWithVgd.miles > 0 ? exposureWithVgd.miles / 100 : null;
  const speedingRate = exposureWithVgd.driveSeconds > 0
    ? (exposureWithVgd.speedingSeconds / exposureWithVgd.driveSeconds) * 100 : 0;
  const phoneRate = per100Mi ? exposureWithVgd.phoneTextSeconds / per100Mi : 0;
  const harshBrakeRate = per100Mi ? exposureWithVgd.harshBrakeCount / per100Mi : 0;
  const harshAccelRate = per100Mi ? exposureWithVgd.harshAccelCount / per100Mi : 0;
  const harshCornerRate = per100Mi ? exposureWithVgd.harshCornerCount / per100Mi : 0;

  const speedingScore = behaviorScore(speedingRate, BEHAVIOR_POOR_RATE.speedingPctOfDriveTime);
  const phoneScore = behaviorScore(phoneRate, BEHAVIOR_POOR_RATE.phoneSecondsPer100Mi);
  const harshBrakeScore = behaviorScore(harshBrakeRate, BEHAVIOR_POOR_RATE.harshBrakePer100Mi);
  const harshAccelScore = behaviorScore(harshAccelRate, BEHAVIOR_POOR_RATE.harshAccelPer100Mi);
  const harshCornerScore = behaviorScore(harshCornerRate, BEHAVIOR_POOR_RATE.harshCornerPer100Mi);

  // isRain has no VGD-derivable fallback (see tripContextMultiplier), so
  // rain-trip counting stays local-context-only — but night detection
  // (tripIsNight) works for every trip via startTime, so a VGD-restored trip
  // is no longer invisible to the Night/Rain-Night rows either.
  const rainTrips = current.filter(t => t.context?.isRain).length;
  const nightTrips = current.filter(t => tripIsNight(t)).length;
  const rainAndNightTrips = current.filter(t => t.context?.isRain && tripIsNight(t)).length;
  const weekendTrips = current.filter(t => {
    const day = new Date(t.startTime).getDay();
    return day === 0 || day === 6;
  }).length;
  // Bar length + label are each row's share of the sum of all four rows
  // (matches product's "11 Trips = 100%" reading), not relative to whichever
  // row happens to be largest.
  const totalInsightTrips = Math.max(1, rainTrips + nightTrips + rainAndNightTrips + weekendTrips);
  const insightPct = (n: number) => Math.round((n / totalInsightTrips) * 100);

  // Real road-type-change counts, read back from VGD (see
  // useVgdRoadTypeBreakdown) — one events call per VGD-synced trip in the
  // selected period, aggregated by HERE functional-class bucket.
  const roadTypes = useVgdRoadTypeBreakdown(current);
  const totalRoadTypeChanges = Math.max(
    1, roadTypes.highway + roadTypes.majorRoad + roadTypes.urban + roadTypes.residential,
  );
  const roadTypePct = (n: number) => Math.round((n / totalRoadTypeChanges) * 100);

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
          <View style={styles.headerSpacer} />
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
                  <TrendUpIcon color={trendPct >= 0 ? GOOD : ORANGE} size={14} />
                  <Text style={[styles.trendText, { color: trendPct >= 0 ? GOOD : ORANGE }]}>
                    {'  '}{trendPct >= 0 ? '+' : ''}{trendPct}% vs previous period
                  </Text>
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

        {/* Driving Behavior — real absolute event counts (not reward points,
            not the 0-100 penalty score) for the selected period. The bar's
            length/color still reflects the underlying context-weighted
            score (speedingScore etc.) as a severity indicator, but the
            number shown is the genuine count — see rawCountsWithVgd above. */}
        <SectionHeader title="Driving Behavior" subtitle={`${current.length} trips`} />
        <View style={styles.card}>
          {vgdBehavior.isLoading ? (
            // Render once, with the final VGD-merged numbers already in, rather
            // than flashing local-only counts first and jumping a few seconds
            // later — see useVgdBehaviorAggregate. Only blocks rendering when
            // there's actually something to fetch (vgdOnlyTrips.length > 0);
            // an account with no VGD-only trips never sees this at all.
            <Text style={styles.noDataText}>Loading driving behavior…</Text>
          ) : (
            <>
              <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
                label="Speeding" count={Math.round(rawCountsWithVgd.speedingSeconds / 60)} unit=" min" barPct={speedingScore}
                barColor={scoreColor(speedingScore)} />
              <BehaviorRow icon={<PhoneIcon color="#888" size={16} />}
                label="Phone Usage" count={Math.round(rawCountsWithVgd.phoneTextSeconds / 60)} unit=" min" barPct={phoneScore}
                barColor={scoreColor(phoneScore)} />
              <BehaviorRow icon={<FlashIcon color="#888" size={16} />}
                label="Harsh Braking" count={rawCountsWithVgd.harshBrakeCount} unit=" events" barPct={harshBrakeScore}
                barColor={scoreColor(harshBrakeScore)} />
              <BehaviorRow icon={<ArrowUpIcon color="#888" size={16} />}
                label="Harsh Acceleration" count={rawCountsWithVgd.harshAccelCount} unit=" events" barPct={harshAccelScore}
                barColor={scoreColor(harshAccelScore)} />
              <BehaviorRow icon={<RefreshIcon color="#888" size={16} />}
                label="Cornering" count={rawCountsWithVgd.harshCornerCount} unit=" events" barPct={harshCornerScore}
                barColor={scoreColor(harshCornerScore)} last />
            </>
          )}
        </View>

        {/* Trip Insights — each bar/percent is this row's share of the sum
            of all four rows for the selected period. */}
        <SectionHeader title="Trip Insights" subtitle={`${totalInsightTrips} trips`} />
        <View style={styles.card}>
          <BehaviorRow icon={<PinIcon color="#888" size={16} />}
            label="Rain Trips" count={rainTrips} percent={insightPct(rainTrips)} barPct={insightPct(rainTrips)} />
          <BehaviorRow icon={<MoonIcon color="#888" size={16} />}
            label="Night Trips" count={nightTrips} percent={insightPct(nightTrips)} barPct={insightPct(nightTrips)} />
          <BehaviorRow icon={<DropletIcon color="#888" size={16} />}
            label="Rain/Night Trips" count={rainAndNightTrips} percent={insightPct(rainAndNightTrips)} barPct={insightPct(rainAndNightTrips)} />
          <BehaviorRow icon={<CalendarIcon color="#888" size={16} />}
            label="Weekend Trips" count={weekendTrips} percent={insightPct(weekendTrips)} barPct={insightPct(weekendTrips)} last />
        </View>

        {/* Road Type Changes — real VGD-sourced road-type-change events.
            Each bar/percent is this row's share of the total road-type
            changes for the selected period. */}
        <SectionHeader title="Road Type Changes" subtitle={!roadTypes.isLoading && roadTypes.hasVgdTrips ? `${totalRoadTypeChanges} changes` : undefined} />
        <View style={styles.card}>
          {roadTypes.isLoading ? (
            <Text style={styles.noDataText}>Loading road-type data…</Text>
          ) : !roadTypes.hasVgdTrips ? (
            <Text style={styles.noDataText}>No VGD-synced trips in this range yet.</Text>
          ) : (
            <>
              <BehaviorRow icon={<RouteIcon color="#888" size={16} />}
                label="Highway" count={roadTypes.highway} percent={roadTypePct(roadTypes.highway)} barPct={roadTypePct(roadTypes.highway)} />
              <BehaviorRow icon={<FlagIcon color="#888" size={16} />}
                label="Major Road" count={roadTypes.majorRoad} percent={roadTypePct(roadTypes.majorRoad)} barPct={roadTypePct(roadTypes.majorRoad)} />
              <BehaviorRow icon={<BuildingIcon color="#888" size={16} />}
                label="Urban Road" count={roadTypes.urban} percent={roadTypePct(roadTypes.urban)} barPct={roadTypePct(roadTypes.urban)} />
              <BehaviorRow icon={<HomeIcon color="#888" />}
                label="Residential" count={roadTypes.residential} percent={roadTypePct(roadTypes.residential)} barPct={roadTypePct(roadTypes.residential)} last />
            </>
          )}
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerSpacer: { width: 22 },
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
  bPercent: { fontSize: 12, fontWeight: '600', color: '#888888' },
  bBarBg: { height: 6, backgroundColor: '#EEEEEE', borderRadius: 3, overflow: 'hidden' },
  bBarFill: { height: '100%', borderRadius: 3 },
});
