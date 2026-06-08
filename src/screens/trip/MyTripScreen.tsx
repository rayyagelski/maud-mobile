import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  MountainIcon, HourglassIcon, GaugeIcon,
  LeafIcon, FuelIcon, CloudIcon, SunIcon,
} from '../../components/icons';
import type { MainStackNavigationProp } from '../../types/navigation.types';

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_HEIGHT = Dimensions.get('window').height * 0.46;
const POPUP_WIDTH = Math.min(Dimensions.get('window').width * 0.65, 255);

const MAP_REGION = {
  latitude: 27.15,
  longitude: -80.78,
  latitudeDelta: 3.8,
  longitudeDelta: 3.0,
};

const ROUTE_COORDS = [
  { latitude: 28.538, longitude: -81.379 }, // Orlando
  { latitude: 28.204, longitude: -81.080 },
  { latitude: 27.900, longitude: -80.700 }, // Melbourne area
  { latitude: 27.450, longitude: -80.350 }, // Fort Pierce area
  { latitude: 27.290, longitude: -80.380 }, // Stuart area
  { latitude: 26.940, longitude: -80.200 }, // Jupiter area
  { latitude: 26.710, longitude: -80.054 }, // Palm Beach
  { latitude: 26.122, longitude: -80.143 }, // Fort Lauderdale
  { latitude: 25.762, longitude: -80.192 }, // Miami
];

type Incident = {
  id: string;
  coord: { latitude: number; longitude: number };
  title: string;
  lines: string[];
};

const INCIDENTS: Incident[] = [
  {
    id: '1',
    coord: { latitude: 27.900, longitude: -80.700 },
    title: 'Over Speed Limit',
    lines: ['Speed Limit:  55 MPH', 'Your Speed:  85 MPH', '1:35 PM, 1066 Brickell RD'],
  },
  {
    id: '2',
    coord: { latitude: 27.290, longitude: -80.380 },
    title: 'Phone Usage',
    lines: ['Speed Limit:  45 MPH', 'Your Speed:  53 MPH', '1:45 PM - 1:55 PM', '1231 Brickell RD'],
  },
];

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

function RedDot() {
  return (
    <View style={styles.redDotOuter}>
      <View style={styles.redDotInner} />
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
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  // Prevents map onPress from immediately clearing a marker tap on Android
  const markerJustTapped = useRef(false);

  function handleMarkerPress(inc: Incident) {
    markerJustTapped.current = true;
    setSelectedIncident(inc);
  }

  function handleMapPress() {
    if (markerJustTapped.current) {
      markerJustTapped.current = false;
      return;
    }
    setSelectedIncident(null);
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>

      {/* ── Map section ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={MAP_REGION}
          onMapReady={() => {
            setMapReady(true);
            mapRef.current?.fitToCoordinates(ROUTE_COORDS, {
              edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
              animated: false,
            });
          }}
          onPress={handleMapPress}
        >
          {mapReady && (
            <Polyline
              coordinates={ROUTE_COORDS}
              strokeColor="rgba(255,255,255,0.9)"
              strokeWidth={10}
            />
          )}
          {mapReady && (
            <Polyline
              coordinates={ROUTE_COORDS}
              strokeColor="#2B3DE8"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {mapReady && INCIDENTS.map(inc => (
            <Marker
              key={inc.id}
              coordinate={inc.coord}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => handleMarkerPress(inc)}
              tracksViewChanges={false}
            >
              <RedDot />
            </Marker>
          ))}
          {mapReady && (
            <Marker
              coordinate={ROUTE_COORDS[0]}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <WaypointPin label="A" color="#3ABFBF" />
            </Marker>
          )}
          {mapReady && (
            <Marker
              coordinate={ROUTE_COORDS[ROUTE_COORDS.length - 1]}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
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

        {/* Incident popup */}
        {selectedIncident && (
          <TouchableOpacity
            style={styles.incidentPopup}
            onPress={() => setSelectedIncident(null)}
            activeOpacity={0.95}
          >
            <Text style={styles.incidentTitle}>{selectedIncident.title}</Text>
            {selectedIncident.lines.map((line, i) => (
              <Text key={i} style={styles.incidentLine}>{line}</Text>
            ))}
          </TouchableOpacity>
        )}
      </View>

      {/* ── Bottom scrollable panel ── */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Route + stats (single card) */}
        <View style={styles.card}>
          <View style={styles.wpRow}>
            <View style={[styles.wpDot, styles.wpDotA]}>
              <Text style={styles.wpDotText}>A</Text>
            </View>
            <View style={styles.wpInfo}>
              <Text style={styles.wpMain}>4321 Milena Blvd</Text>
              <Text style={styles.wpSub}>Orlando, FL 22882</Text>
            </View>
          </View>
          <View style={styles.wpConnector} />
          <View style={styles.wpRow}>
            <View style={[styles.wpDot, styles.wpDotB]}>
              <Text style={styles.wpDotText}>B</Text>
            </View>
            <View style={styles.wpInfo}>
              <Text style={styles.wpMain}>1727 Brickell Ave</Text>
              <Text style={styles.wpSub}>Miami, FL, 28282</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          <PerfRow icon={<MountainIcon color="#999" size={18} />} label="Distance" value="120 miles" />
          <View style={styles.rowDiv} />
          <PerfRow icon={<HourglassIcon color="#999" size={18} />} label="Duration" value="1h 35 min" />
          <View style={styles.rowDiv} />
          <PerfRow icon={<GaugeIcon color="#999" size={18} />} label="Odometer" value="23570 Mi" />
        </View>

        {/* Cost & Consumption */}
        <Text style={styles.sectionLabel}>COST & CONSUMPTION</Text>
        <View style={styles.costRow}>
          <View style={styles.costCard}>
            <View style={styles.costCardHeader}>
              <LeafIcon color="#999" size={16} />
              <Text style={styles.costCardLabel}> CO₂ Emissions</Text>
            </View>
            <Text style={styles.costValue}>12.3 kg</Text>
          </View>
          <View style={styles.costCard}>
            <View style={styles.costCardHeader}>
              <FuelIcon color="#999" size={16} />
              <Text style={styles.costCardLabel}> Consumption</Text>
            </View>
            <Text style={styles.costValue}>7.8 L</Text>
          </View>
        </View>

        {/* Weather */}
        <Text style={styles.sectionLabel}>WEATHER</Text>
        <View style={styles.card}>
          <View style={styles.weatherRow}>
            <CloudIcon color="#5B9BD5" size={30} />
            <Text style={styles.weatherText}>Cloudy/ Warm</Text>
            <Text style={styles.weatherArrow}>→</Text>
            <SunIcon color="#F5A623" size={30} />
            <Text style={styles.weatherText}>Sunny/ Warm</Text>
          </View>
        </View>

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

  // Incident markers
  redDotOuter: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#D32F2F',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  redDotInner: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#8B0000' },

  // Incident popup
  incidentPopup: {
    position: 'absolute', top: 54, right: 12,
    width: POPUP_WIDTH,
    backgroundColor: 'white', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
  },
  incidentTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  incidentLine: { fontSize: 13, color: '#555', marginBottom: 3 },

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

  // Cost & Consumption
  costRow: { flexDirection: 'row', columnGap: 12, marginBottom: 16 },
  costCard: {
    flex: 1, backgroundColor: 'white', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  costCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  costCardLabel: { fontSize: 12, color: '#888' },
  costValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },

  // Weather
  weatherRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-evenly', paddingVertical: 4,
  },
  weatherText: { fontSize: 14, color: '#555', fontWeight: '500' },
  weatherArrow: { fontSize: 18, color: '#999', fontWeight: '300' },
});
