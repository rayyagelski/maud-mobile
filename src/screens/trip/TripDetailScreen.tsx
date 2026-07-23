import React from 'react';
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
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useVgdTripDetails } from '../../hooks/useVgdTripDetails';
import { haversineDistanceKm, formatDistance, formatDuration } from '../../utils/helpers';
import type { MainStackNavigationProp, TripDetailRouteProp } from '../../types/navigation.types';
import type { VgdTripEventIndicator } from '../../types/vgd.types';

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

// ── Main screen ────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const route = useRoute<TripDetailRouteProp>();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === route.params.tripId));

  const distanceKm = trip
    ? trip.route.reduce(
        (sum, point, i) => (i === 0 ? 0 : sum + haversineDistanceKm(trip.route[i - 1], point)),
        0,
      )
    : 0;
  const durationSeconds = trip?.endTime ? Math.round((trip.endTime - trip.startTime) / 1000) : 0;
  const avgSpeedKmh = durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;
  const maxSpeedKmh = trip
    ? Math.max(0, ...trip.route.map(p => (p.speed ?? 0) * 3.6))
    : 0;

  const start = trip?.route[0];
  const end = trip?.route[trip.route.length - 1];
  const reward = trip?.reward;

  const harshBrakeCount = trip?.events.filter(e => e.type === 'harsh_brake').length ?? 0;
  const harshAccelCount = trip?.events.filter(e => e.type === 'harsh_accel').length ?? 0;
  const harshCornerCount = trip?.events.filter(e => e.type === 'harsh_corner').length ?? 0;

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
  const visibleVgdEvents = vgdEvents.filter(e => e.indicator !== 'trip_start' && e.indicator !== 'trip_end');

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
                  {start ? `${start.latitude.toFixed(4)}, ${start.longitude.toFixed(4)}` : '—'}
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
                  {end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip stats */}
        <Text style={styles.sectionTitle}>TRIP STATS</Text>
        <View style={styles.card}>
          <StatRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value={formatDistance(distanceKm)} />
          <StatRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value={formatDuration(durationSeconds)} />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={`${Math.round(avgSpeedKmh)} km/h`} />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Max Speed" value={`${Math.round(maxSpeedKmh)} km/h`} last />
        </View>

        {/* Driving behaviour — real harsh-event counts from onboard sensors */}
        <Text style={styles.sectionTitle}>DRIVING BEHAVIOUR</Text>
        <View style={styles.card}>
          <BehaviourBar label="Harsh Braking" count={harshBrakeCount} color="#E53935" />
          <BehaviourBar label="Harsh Acceleration" count={harshAccelCount} color="#F5A623" />
          <BehaviourBar label="Harsh Cornering" count={harshCornerCount} color="#8B5CF6" />
        </View>

        {/* CO₂ & Cost */}
        {reward && (
          <>
            <Text style={styles.sectionTitle}>COST & IMPACT</Text>
            <View style={styles.energyRow}>
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
            </View>
          </>
        )}

        {reward?.aiNarrativeTip && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>AI DRIVING TIP</Text>
            <Text style={styles.tipText}>{reward.aiNarrativeTip}</Text>
          </View>
        )}

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
                    <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={`${Math.round(vgdAnalytics.averageSpeed)} km/h`} />
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
