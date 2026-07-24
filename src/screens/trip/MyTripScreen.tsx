import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MountainIcon, HourglassIcon, GaugeIcon, LeafIcon, DollarIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { haversineDistanceKm, formatDistance, formatDuration } from '../../utils/helpers';
import type { MainStackNavigationProp, MyTripRouteProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_HEIGHT = Dimensions.get('window').height * 0.46;

const FALLBACK_MAP_REGION = {
  latitude: 25.276987,
  longitude: 55.296249,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ── Sub-components ─────────────────────────────────────────────────────────

function WaypointPin({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.pinCircle, { backgroundColor: color }]}>
        <Text style={styles.pinLabel}>{label}</Text>
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

function PerfRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.perfRow}>
      <View style={styles.perfIconBox}>{icon}</View>
      <Text style={styles.perfLabel}>{label}</Text>
      <Text style={styles.perfValue}>{value}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function MyTripScreen() {
  const navigation = useNavigation<MainStackNavigationProp>();
  const routeProp = useRoute<MyTripRouteProp>();
  const trip = useAppSelector(s => s.trips.trips.find(t => t.id === routeProp.params?.tripId));
  const isImperial = useIsImperialUnits();
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);

  const routeCoords = trip?.route.map(p => ({ latitude: p.latitude, longitude: p.longitude })) ?? [];
  const distanceKm = trip
    ? trip.route.reduce(
        (sum, point, i) => (i === 0 ? 0 : sum + haversineDistanceKm(trip.route[i - 1], point)),
        0,
      )
    : 0;
  const durationSeconds = trip?.endTime ? Math.round((trip.endTime - trip.startTime) / 1000) : 0;
  const avgSpeedKmh = durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;
  const reward = trip?.reward;
  const start = routeCoords[0];
  const end = routeCoords[routeCoords.length - 1];

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>

      {/* ── Map section ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={start ? { ...start, latitudeDelta: 0.2, longitudeDelta: 0.2 } : FALLBACK_MAP_REGION}
          onMapReady={() => {
            setMapReady(true);
            if (routeCoords.length > 1) {
              mapRef.current?.fitToCoordinates(routeCoords, {
                edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
                animated: false,
              });
            }
          }}
        >
          {mapReady && routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="rgba(255,255,255,0.9)"
              strokeWidth={10}
            />
          )}
          {mapReady && routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#2B3DE8"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {mapReady && start && (
            <Marker coordinate={start} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <WaypointPin label="A" color="#3ABFBF" />
            </Marker>
          )}
          {mapReady && end && end !== start && (
            <Marker coordinate={end} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <WaypointPin label="B" color="#1A1A1A" />
            </Marker>
          )}
        </MapView>

        {/* Floating back button */}
        <SafeAreaView edges={['top']} style={styles.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={HIT}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
        </SafeAreaView>
      </View>

      {/* ── Bottom scrollable panel ── */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {!trip ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>Trip not found.</Text>
          </View>
        ) : (
          <>
            {/* Route + stats (single card) */}
            <View style={styles.card}>
              <View style={styles.wpRow}>
                <View style={[styles.wpDot, styles.wpDotA]}>
                  <Text style={styles.wpDotText}>A</Text>
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
                  <Text style={styles.wpDotText}>B</Text>
                </View>
                <View style={styles.wpInfo}>
                  <Text style={styles.wpMain}>
                    {end ? `${end.latitude.toFixed(4)}, ${end.longitude.toFixed(4)}` : '—'}
                  </Text>
                </View>
              </View>
              <View style={styles.cardDivider} />
              <PerfRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value={formatDistance(distanceKm, isImperial)} />
              <View style={styles.rowDiv} />
              <PerfRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value={formatDuration(durationSeconds)} />
              <View style={styles.rowDiv} />
              <PerfRow icon={<GaugeIcon color="#999" size={18} />} label="Avg Speed" value={`${Math.round(avgSpeedKmh)} km/h`} />
            </View>

            {/* Cost & Impact */}
            {reward && (
              <>
                <Text style={styles.sectionLabel}>COST & IMPACT</Text>
                <View style={styles.costRow}>
                  <View style={styles.costCard}>
                    <View style={styles.costCardHeader}>
                      <LeafIcon color="#999" size={16} />
                      <Text style={styles.costCardLabel}> CO₂ Avoided</Text>
                    </View>
                    <Text style={styles.costValue}>
                      {reward.co2AvoidedGrams != null ? `${(reward.co2AvoidedGrams / 1000).toFixed(1)} kg` : '—'}
                    </Text>
                  </View>
                  <View style={styles.costCard}>
                    <View style={styles.costCardHeader}>
                      <DollarIcon color="#999" size={16} />
                      <Text style={styles.costCardLabel}> Money Saved</Text>
                    </View>
                    <Text style={styles.costValue}>
                      {reward.moneySavedCents != null && reward.currencyCode
                        ? `${(reward.moneySavedCents / 100).toFixed(2)} ${reward.currencyCode}`
                        : '—'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // Map
  mapContainer: { height: MAP_HEIGHT, backgroundColor: '#E8F0E8' },
  mapOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtn: {
    marginHorizontal: 16, marginTop: 8,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },

  // Waypoint pins
  pinCircle: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  pinLabel: { color: 'white', fontWeight: '800', fontSize: 13 },
  pinTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },

  // Bottom scroll
  scroll: { padding: 16, paddingBottom: 36 },

  card: {
    backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  // Waypoints
  wpRow: { flexDirection: 'row', alignItems: 'center' },
  wpDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  wpDotA: { backgroundColor: '#3ABFBF' },
  wpDotB: { backgroundColor: '#1A1A1A' },
  wpDotText: { fontSize: 12, fontWeight: '700', color: 'white' },
  wpInfo: { flex: 1 },
  wpMain: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 1 },
  wpSub: { fontSize: 12, color: '#999' },
  wpConnector: { width: 1.5, height: 14, backgroundColor: '#DDDDDD', marginLeft: 13, marginVertical: 5 },
  cardDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 14 },

  // Perf rows
  rowDiv: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 2 },
  perfRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  perfIconBox: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  perfLabel: { flex: 1, fontSize: 14, color: '#555' },
  perfValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  // Section label
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.4, marginBottom: 10 },

  // Cost & Impact
  costRow: { flexDirection: 'row', columnGap: 12, marginBottom: 16 },
  costCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  costCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  costCardLabel: { fontSize: 12, color: '#888' },
  costValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },

  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', padding: 24 },
});
