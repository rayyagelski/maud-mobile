import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle, G } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MountainIcon, HourglassIcon, GaugeIcon,
  LeafIcon, DollarIcon, PinIcon, CloudIcon, WarningTriangleIcon,
  FlashIcon, StarOutlineIcon, LightbulbIcon, ChevronIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { useVgdTripDetails } from '../../hooks/useVgdTripDetails';
import { vehiclesApi } from '../../api';
import {
  formatDistance, formatDuration, formatSpeed, tripDistanceKm, tripDurationSeconds, tripAvgSpeedKmh,
} from '../../utils/helpers';
import type { MainStackNavigationProp, TripDetailRouteProp } from '../../types/navigation.types';
import type { VgdTripEventIndicator } from '../../types/vgd.types';
import type { TripCostResponse } from '../../types/vehicle.types';

const EVENT_INDICATOR_LABELS: Record<VgdTripEventIndicator, string> = {
  hard_braking: 'Hard braking',
  acceleration: 'Harsh acceleration',
  cornering: 'Harsh cornering',
  speed_limit: 'Speed limit exceeded',
  road_type: 'Road type change',
  trip_start: 'Trip start',
  trip_end: 'Trip end',
};

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Score arc (compact) ────────────────────────────────────────────────────

function ScoreArc({ score, label }: { score: number; label: string }) {
  const SIZE = 88;
  const SW = 7;
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
      <Text style={arcSt.lbl}>{label}</Text>
    </View>
  );
}
const arcSt = StyleSheet.create({
  num: { fontSize: 22, fontWeight: '800', color: TEAL },
  lbl: { fontSize: 10, color: '#AAAAAA', marginTop: 1 },
});

// ── Behaviour bar ──────────────────────────────────────────────────────────

function BehaviourBar({
  label, count, color,
}: { label: string; count: number; color: string }) {
  const pct = Math.min(100, count * 20);
  return (
    <View style={bhSt.row}>
      <Text style={bhSt.label}>{label}</Text>
      <View style={bhSt.track}>
        <View style={[bhSt.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={bhSt.pct}>{count}</Text>
    </View>
  );
}
const bhSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { width: 120, fontSize: 13, color: '#555' },
  track: {
    flex: 1, height: 8, backgroundColor: '#EEEEEE', borderRadius: 4,
    overflow: 'hidden', marginHorizontal: 10,
  },
  fill: { height: '100%', borderRadius: 4 },
  pct: { width: 24, fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'right' },
});

// ── Stat row (icon + label + value) ───────────────────────────────────────

function StatRow({ icon, label, value, last = false }: {
  icon: React.ReactNode; label: string; value: string; last?: boolean;
}) {
  return (
    <View style={[stSt.row, !last && stSt.rowBorder]}>
      <View style={stSt.iconBox}>{icon}</View>
      <Text style={stSt.label}>{label}</Text>
      <Text style={stSt.value}>{value}</Text>
    </View>
  );
}
const stSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  iconBox: { width: 26, height: 26, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  label: { flex: 1, fontSize: 14, color: '#555' },
  value: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
});

// ── Energy metric card ─────────────────────────────────────────────────────

function EnergyCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <View style={enSt.card}>
      <View style={enSt.header}>{icon}<Text style={enSt.label}>{label}</Text></View>
      <Text style={enSt.value}>{value}</Text>
      {sub ? <Text style={enSt.sub}>{sub}</Text> : null}
    </View>
  );
}
const enSt = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 12, color: '#888', marginLeft: 6 },
  value: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  sub: { fontSize: 11, color: '#AAAAAA', marginTop: 3 },
});

// ── Eco savings (this trip vs. baseline) ────────────────────────────────────

function SavingsStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={ecoSt.stat}>
      {icon}
      <Text style={ecoSt.statValue}>{value}</Text>
      <Text style={ecoSt.statLabel}>{label}</Text>
    </View>
  );
}

// Mirrors EcoScoreScreen's BaselineBars, scoped to a single trip's reward
// (kwh* for EVs, fuel*Liters for combustion — a trip only ever populates one
// pair, see tripSlice's computeTripEnergy). Tapping the bar opens EcoScore,
// which is where "Baseline" is actually explained (per product's note that
// the label here should defer to the Eco Score description).
function TripBaselineBar({ baseline, used, onPress }: { baseline: number; used: number; onPress: () => void }) {
  if (baseline <= 0) return null;
  const usedPct = Math.min(100, Math.round((used / baseline) * 100));
  const percentBetter = Math.round(((baseline - used) / baseline) * 100);
  const better = percentBetter >= 0;
  const barColor = better ? TEAL : '#E5484D';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Text style={ecoSt.baselineLabel}>
        <Text style={ecoSt.baselineLabelStrong}>Baseline </Text>
        (regular drivers)
      </Text>
      <View style={ecoSt.track}>
        <View style={[ecoSt.fill, ecoSt.fillGrey]} />
      </View>
      <View style={ecoSt.barRow}>
        <View style={[ecoSt.track, ecoSt.barRowTrack]}>
          <View style={[ecoSt.fill, { width: `${usedPct}%` as any, backgroundColor: barColor }]} />
        </View>
        <ChevronIcon open={false} color="#AAAAAA" size={16} />
      </View>
      <Text style={ecoSt.baselineCaption}>Your Driving and Environmental Impact</Text>
    </TouchableOpacity>
  );
}
const ecoSt = StyleSheet.create({
  baselineLabel: { fontSize: 13, color: '#888', marginBottom: 8 },
  baselineLabelStrong: { fontWeight: '700', color: '#1A1A1A' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F0F0F0', marginBottom: 8 },
  fill: { height: '100%', borderRadius: 5 },
  fillGrey: { width: '100%', backgroundColor: '#D9D9D9' },
  barRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  barRowTrack: { flex: 1, marginBottom: 0 },
  baselineCaption: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginTop: 10, marginBottom: 16 },
  statsRow: {
    flexDirection: 'row', alignItems: 'stretch',
    borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 14,
    paddingVertical: 14,
  },
  stat: { flex: 1, alignItems: 'center', rowGap: 6 },
  statValue: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  statLabel: { fontSize: 11, color: '#888' },
  statDivider: { width: 1, backgroundColor: '#EEEEEE' },
  behaviorCaption: { fontSize: 13, color: '#777', marginTop: 14, lineHeight: 18 },
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', columnGap: 12,
    backgroundColor: '#EFF9F9', borderRadius: 14, padding: 14, marginTop: 16,
  },
  insightIconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: TEAL,
    justifyContent: 'center', alignItems: 'center',
  },
  insightBody: { flex: 1 },
  insightTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  insightText: { fontSize: 12, color: '#555', lineHeight: 17 },
});

// ── Main screen ────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<TripDetailRouteProp>();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));
  const isImperial = useIsImperialUnits();

  const distanceKm = trip ? tripDistanceKm(trip) : 0;
  const durationSeconds = trip ? tripDurationSeconds(trip) : 0;
  const avgSpeedKmh = trip ? tripAvgSpeedKmh(trip) : 0;
  const maxSpeedKmh = trip
    ? Math.max(0, ...trip.route.map(p => (p.speed ?? 0) * 3.6))
    : 0;

  const reward = trip?.reward;

  // A trip only ever populates one baseline pair — kwh* for EVs, fuel*Liters
  // for combustion vehicles (see EcoScoreScreen's baselineComparison, same
  // assumption here but for a single trip instead of an aggregate).
  const isElectricBaseline = reward?.kwhBaseline != null && reward?.kwhUsed != null;
  const isFuelBaseline = !isElectricBaseline && reward?.fuelBaselineLiters != null && reward?.fuelUsedLiters != null;
  const baselineVal = isElectricBaseline ? reward!.kwhBaseline! : isFuelBaseline ? reward!.fuelBaselineLiters! : 0;
  const usedVal = isElectricBaseline ? reward!.kwhUsed! : isFuelBaseline ? reward!.fuelUsedLiters! : 0;
  const savedUnit = isElectricBaseline ? 'kWh' : 'L';
  const savedAmount = baselineVal - usedVal;

  const harshBrakeCount = trip?.events.filter(e => e.type === 'harsh_brake').length ?? 0;
  const harshAccelCount = trip?.events.filter(e => e.type === 'harsh_accel').length ?? 0;
  const harshCornerCount = trip?.events.filter(e => e.type === 'harsh_corner').length ?? 0;
  const totalHarshEvents = harshBrakeCount + harshAccelCount + harshCornerCount;
  const behaviorCaption = totalHarshEvents === 0
    ? 'Smooth acceleration and steady speed improved efficiency.'
    : `${totalHarshEvents} harsh driving event${totalHarshEvents === 1 ? '' : 's'} this trip reduced your efficiency.`;

  // Vehicle Generated Data read-back — only for trips that actually made it
  // into VGD (older trips predating this feature have no vgdTripId at all).
  const vgdEnabled = Boolean(trip?.vgdTripId && trip?.vgdTripCreated);
  const {
    details: vgdDetails,
    events: vgdEvents,
    isLoading: vgdLoading,
    isProcessing: vgdProcessing,
  } = useVgdTripDetails(vgdEnabled ? trip?.vgdTripId : undefined, trip?.vehicleId ?? '');
  const vgdAnalytics = vgdDetails?.analytics;
  // point is filtered defensively here — legacy VGD trip data (this read
  // path only started actually returning data recently) can carry events
  // with a missing/malformed point.
  const visibleVgdEvents = vgdEvents.filter(
    e => e.indicator !== 'trip_start' && e.indicator !== 'trip_end' && e.point,
  );

  // A `source: 'vgd'` trip (backfilled from the backend, see
  // tripHistorySync.ts) has no route — fall back to VGD's own trip_start/
  // trip_end events, same as MyTripScreen.tsx.
  const vgdStartPoint = vgdEvents.find(e => e.indicator === 'trip_start')?.point?.gps;
  const vgdEndPoint = vgdEvents.find(e => e.indicator === 'trip_end')?.point?.gps;
  const start = trip?.route[0]
    ?? (vgdStartPoint ? { latitude: vgdStartPoint.lat, longitude: vgdStartPoint.lon } : undefined);
  const end = trip?.route[trip.route.length - 1]
    ?? (vgdEndPoint ? { latitude: vgdEndPoint.lat, longitude: vgdEndPoint.lon } : undefined);

  // Real Insurance/Tax/Leasing/Financing + Repair/Maintenance + Fuel/
  // Electricity cost (TotalCostCalculator, server-side) — distinct from
  // "Money Saved" below, which is a comparative trip_reward figure, not an
  // absolute cost. Fail-soft like every other auxiliary lookup in this app.
  const [tripCost, setTripCost] = useState<TripCostResponse | null>(null);
  useEffect(() => {
    if (!trip?.vehicleId || !trip?.endTime) {
      setTripCost(null);
      return;
    }
    let cancelled = false;
    vehiclesApi.getTripCost(
      trip.vehicleId,
      Math.round(trip.startTime / 1000),
      Math.round(trip.endTime / 1000),
    )
      .then((res) => { if (!cancelled) setTripCost(res.data); })
      .catch(() => { if (!cancelled) setTripCost(null); });
    return () => { cancelled = true; };
  }, [trip?.vehicleId, trip?.startTime, trip?.endTime]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Trip Detail</Text>
            {trip && (
              <Text style={styles.headerSub}>
                {new Date(trip.startTime).toLocaleDateString()} · {new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      {!trip ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Trip not found.</Text>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Overview card: score + route */}
        <View style={[styles.card, styles.overviewCard]}>
          <ScoreArc score={reward ? Math.round(reward.ecoScore) : 0} label="Eco" />
          <View style={styles.overviewRight}>
            <View style={styles.wpRow}>
              <View style={[styles.wpDot, styles.wpDotA]}>
                <Text style={styles.wpDotTxt}>A</Text>
              </View>
              <View style={styles.wpInfo}>
                <Text style={styles.wpMain}>
                  {vgdAnalytics?.startAddress
                    ?? (vgdEnabled && (vgdLoading || vgdProcessing) ? 'Resolving address…'
                      : (start ? `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}` : '—'))}
                </Text>
              </View>
            </View>
            <View style={styles.wpConnector} />
            <View style={styles.wpRow}>
              <View style={[styles.wpDot, styles.wpDotB]}>
                <Text style={styles.wpDotTxt}>B</Text>
              </View>
              <View style={styles.wpInfo}>
                <Text style={styles.wpMain}>
                  {vgdAnalytics?.endAddress
                    ?? (vgdEnabled && (vgdLoading || vgdProcessing) ? 'Resolving address…'
                      : (end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—'))}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip stats */}
        <Text style={styles.sectionTitle}>TRIP STATS</Text>
        <View style={styles.card}>
          <StatRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value={formatDistance(distanceKm, isImperial)} />
          <StatRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value={formatDuration(durationSeconds)} />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={formatSpeed(avgSpeedKmh, isImperial)} />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Max Speed" value={formatSpeed(maxSpeedKmh, isImperial)} last />
        </View>

        {/* Driving behaviour — real harsh-event counts from onboard sensors */}
        <Text style={styles.sectionTitle}>DRIVING BEHAVIOUR</Text>
        <View style={styles.card}>
          <BehaviourBar label="Harsh Braking" count={harshBrakeCount} color="#E53935" />
          <BehaviourBar label="Harsh Acceleration" count={harshAccelCount} color="#F5A623" />
          <BehaviourBar label="Harsh Cornering" count={harshCornerCount} color="#8B5CF6" />
        </View>

        {/* CO₂ & Cost */}
        {(reward || tripCost?.cost != null) && (
          <>
            <Text style={styles.sectionTitle}>COST & IMPACT</Text>
            <View style={styles.energyRow}>
              {reward && (
                <>
                  <EnergyCard
                    icon={<LeafIcon color="#888" size={15} />}
                    label="CO₂ Avoided"
                    value={reward.co2AvoidedGrams != null ? `${(reward.co2AvoidedGrams / 1000).toFixed(1)} kg` : '—'}
                  />
                  <EnergyCard
                    icon={<DollarIcon color="#888" size={15} />}
                    label="Money Saved"
                    value={
                      reward.moneySavedCents != null && reward.currencyCode
                        ? `${(reward.moneySavedCents / 100).toFixed(2)} ${reward.currencyCode}`
                        : '—'
                    }
                  />
                </>
              )}
              {/* Absolute trip cost (fuel + insurance + lease/financing +
                  repair/maintenance) — distinct from "Money Saved" above,
                  which only compares against a baseline. */}
              <EnergyCard
                icon={<DollarIcon color="#888" size={15} />}
                label="Trip Cost"
                value={
                  tripCost?.cost != null
                    ? `${tripCost.cost.toFixed(2)} ${tripCost.currencyCode}`
                    : '—'
                }
              />
            </View>
          </>
        )}

        {/* Eco savings — this trip's baseline comparison + kWh/CO₂/points,
            same convention as EcoScoreScreen's aggregate baseline card.
            Shown unconditionally (not gated on `reward`) so trips that
            haven't been scored yet — e.g. VGD-backfilled trips with no
            matched reward entry, see tripHistorySync.ts — still show the
            section with placeholders instead of it vanishing entirely. */}
        <Text style={styles.sectionTitle}>ECO SAVINGS · THIS TRIP</Text>
        <View style={styles.card}>
          {baselineVal > 0 && (
            <TripBaselineBar
              baseline={baselineVal}
              used={usedVal}
              onPress={() => navigation.navigate('EcoScore')}
            />
          )}
          <View style={ecoSt.statsRow}>
            <SavingsStat
              icon={<FlashIcon color="#888" size={20} />}
              value={baselineVal > 0 ? `${savedAmount >= 0 ? '-' : '+'}${Math.abs(savedAmount).toFixed(1)} ${savedUnit}` : '—'}
              label={savedUnit}
            />
            <View style={ecoSt.statDivider} />
            <SavingsStat
              icon={<LeafIcon color="#888" size={20} />}
              value={reward?.co2AvoidedGrams != null ? `-${(reward.co2AvoidedGrams / 1000).toFixed(1)} kg` : '—'}
              label="CO₂"
            />
            <View style={ecoSt.statDivider} />
            <SavingsStat
              icon={<StarOutlineIcon color="#888" size={20} />}
              value={reward ? `+${reward.tripPointsEarned}` : '—'}
              label="Pts"
            />
          </View>
          <Text style={ecoSt.behaviorCaption}>
            {reward ? behaviorCaption : 'This trip hasn’t been scored yet — check back once it finishes processing.'}
          </Text>
          {reward?.aiNarrativeTip && (
            <View style={ecoSt.insightCard}>
              <View style={ecoSt.insightIconBox}>
                <LightbulbIcon color="white" size={18} />
              </View>
              <View style={ecoSt.insightBody}>
                <Text style={ecoSt.insightTitle}>MAUD Insight</Text>
                <Text style={ecoSt.insightText}>{reward.aiNarrativeTip}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Vehicle Generated Data — server-processed detail (addresses,
            weather, road-type/speed-limit/harsh-event enrichment), read back
            from vgd_query. Processed asynchronously by vgd_analytics after
            trip-end, so this can take a little while to appear. */}
        {vgdEnabled && (
          <>
            <Text style={styles.sectionTitle}>VEHICLE GENERATED DATA</Text>
            <View style={styles.card}>
              {vgdLoading && !vgdAnalytics ? (
                <Text style={styles.emptyText}>Loading…</Text>
              ) : vgdProcessing ? (
                <Text style={styles.emptyText}>Still processing…</Text>
              ) : vgdAnalytics ? (
                <>
                  {vgdAnalytics.startAddress && (
                    <StatRow icon={<PinIcon color="#999" size={18} />} label="Start" value={vgdAnalytics.startAddress} />
                  )}
                  {vgdAnalytics.endAddress && (
                    <StatRow icon={<PinIcon color="#999" size={18} />} label="End" value={vgdAnalytics.endAddress} />
                  )}
                  {vgdAnalytics.averageSpeed != null && (
                    <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={formatSpeed(vgdAnalytics.averageSpeed, isImperial)} />
                  )}
                  <StatRow icon={<LeafIcon color="#999" size={18} />} label="CO₂" value={`${Math.round(vgdAnalytics.co2emissions)} g/km`} />
                  {(vgdAnalytics.endWeather?.temperatureDesc || vgdAnalytics.endWeather?.skyInfo) && (
                    <StatRow
                      icon={<CloudIcon color="#999" size={18} />}
                      label="Weather"
                      value={vgdAnalytics.endWeather?.skyInfo ?? vgdAnalytics.endWeather?.temperatureDesc ?? '—'}
                      last
                    />
                  )}
                </>
              ) : (
                <Text style={styles.emptyText}>No data available.</Text>
              )}
            </View>

            {visibleVgdEvents.length > 0 && (
              <View style={styles.card}>
                {visibleVgdEvents.map((event, i) => (
                  <StatRow
                    key={`${event.indicator}-${event.point.time}-${i}`}
                    icon={<WarningTriangleIcon color="#999" size={18} />}
                    label={EVENT_INDICATOR_LABELS[event.indicator]}
                    value={event.point.parameters.address
                      ?? new Date(event.point.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    last={i === visibleVgdEvents.length - 1}
                  />
                ))}
              </View>
            )}
          </>
        )}

      </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  safeHeader: { backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerSub: { fontSize: 12, color: '#888', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEEEEE' },
  scroll: { padding: 16, paddingBottom: 36 },

  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Overview card
  overviewCard: { flexDirection: 'row', alignItems: 'center', columnGap: 16 },
  overviewRight: { flex: 1 },

  // Waypoints (inside overview)
  wpRow: { flexDirection: 'row', alignItems: 'center' },
  wpDot: {
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  wpDotA: { backgroundColor: TEAL },
  wpDotB: { backgroundColor: '#1A1A1A' },
  wpDotTxt: { fontSize: 11, fontWeight: '700', color: 'white' },
  wpInfo: { flex: 1 },
  wpMain: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  wpSub: { fontSize: 11, color: '#999' },
  wpConnector: { width: 1.5, height: 12, backgroundColor: '#DDD', marginLeft: 11, marginVertical: 4 },

  // Section title
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.4, marginBottom: 10 },

  // Energy row (two half-width cards)
  energyRow: { flexDirection: 'row', columnGap: 12, marginBottom: 16 },

  tipText: { fontSize: 13, color: '#555', lineHeight: 19 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 24 },
});
