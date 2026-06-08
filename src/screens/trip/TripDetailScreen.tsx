import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, G, Rect, Path } from 'react-native-svg';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MountainIcon, HourglassIcon, GaugeIcon,
  FlashIcon, LeafIcon, FuelIcon, CloudIcon, SunIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const TEAL = '#3ABFBF';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Score arc (compact) ────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number }) {
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
      <Text style={arcSt.lbl}>Eco</Text>
    </View>
  );
}
const arcSt = StyleSheet.create({
  num: { fontSize: 22, fontWeight: '800', color: TEAL },
  lbl: { fontSize: 10, color: '#AAAAAA', marginTop: 1 },
});

// ── Behaviour bar ──────────────────────────────────────────────────────────

function BehaviourBar({
  label, pct, color,
}: { label: string; pct: number; color: string }) {
  return (
    <View style={bhSt.row}>
      <Text style={bhSt.label}>{label}</Text>
      <View style={bhSt.track}>
        <View style={[bhSt.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={bhSt.pct}>{pct}%</Text>
    </View>
  );
}
const bhSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { width: 100, fontSize: 13, color: '#555' },
  track: {
    flex: 1, height: 8, backgroundColor: '#EEEEEE', borderRadius: 4,
    overflow: 'hidden', marginHorizontal: 10,
  },
  fill: { height: '100%', borderRadius: 4 },
  pct: { width: 36, fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'right' },
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Trip Detail</Text>
            <Text style={styles.headerSub}>16 Feb 2026 · 08:20 AM</Text>
          </View>
          <View style={{ width: 22 }} />
        </View>
      </SafeAreaView>
      <View style={styles.divider} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Overview card: score + route */}
        <View style={[styles.card, styles.overviewCard]}>
          <ScoreArc score={78} />
          <View style={styles.overviewRight}>
            <View style={styles.wpRow}>
              <View style={[styles.wpDot, styles.wpDotA]}>
                <Text style={styles.wpDotTxt}>A</Text>
              </View>
              <View style={styles.wpInfo}>
                <Text style={styles.wpMain}>4321 Milena Blvd</Text>
                <Text style={styles.wpSub}>Orlando, FL</Text>
              </View>
            </View>
            <View style={styles.wpConnector} />
            <View style={styles.wpRow}>
              <View style={[styles.wpDot, styles.wpDotB]}>
                <Text style={styles.wpDotTxt}>B</Text>
              </View>
              <View style={styles.wpInfo}>
                <Text style={styles.wpMain}>1727 Brickell Ave</Text>
                <Text style={styles.wpSub}>Miami, FL</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip stats */}
        <Text style={styles.sectionTitle}>TRIP STATS</Text>
        <View style={styles.card}>
          <StatRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value="120 miles" />
          <StatRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value="1h 35 min" />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value="51 MPH" />
          <StatRow icon={<GaugeIcon color="#999" size={18} />} label="Max Speed" value="85 MPH" last />
        </View>

        {/* Energy */}
        <Text style={styles.sectionTitle}>ENERGY</Text>
        <View style={styles.energyRow}>
          <EnergyCard
            icon={<FlashIcon color="#888" size={15} />}
            label="Consumed"
            value="28.4 kWh"
            sub="23.7 kWh/100 mi"
          />
          <EnergyCard
            icon={<FlashIcon color={TEAL} size={15} />}
            label="Regenerated"
            value="4.1 kWh"
            sub="14.4% recovered"
          />
        </View>

        {/* Driving behaviour */}
        <Text style={styles.sectionTitle}>DRIVING BEHAVIOUR</Text>
        <View style={styles.card}>
          <BehaviourBar label="Smooth" pct={72} color="#27AE60" />
          <BehaviourBar label="Moderate" pct={20} color="#F5A623" />
          <BehaviourBar label="Harsh" pct={8} color="#E53935" />
        </View>

        {/* CO₂ & Cost */}
        <Text style={styles.sectionTitle}>COST & IMPACT</Text>
        <View style={styles.energyRow}>
          <EnergyCard
            icon={<LeafIcon color="#888" size={15} />}
            label="CO₂ Saved"
            value="9.4 kg"
            sub="vs avg ICE"
          />
          <EnergyCard
            icon={<FuelIcon color="#888" size={15} />}
            label="Charge Cost"
            value="€3.12"
            sub="€0.11/kWh"
          />
        </View>

        {/* Weather */}
        <Text style={styles.sectionTitle}>WEATHER</Text>
        <View style={styles.card}>
          <View style={styles.weatherRow}>
            <CloudIcon color="#5B9BD5" size={28} />
            <Text style={styles.weatherText}>Cloudy / Warm</Text>
            <Text style={styles.weatherArrow}>→</Text>
            <SunIcon color="#F5A623" size={28} />
            <Text style={styles.weatherText}>Sunny / Warm</Text>
          </View>
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

  // Weather
  weatherRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-evenly', paddingVertical: 4,
  },
  weatherText: { fontSize: 13, color: '#555', fontWeight: '500' },
  weatherArrow: { fontSize: 18, color: '#999', fontWeight: '300' },
});
