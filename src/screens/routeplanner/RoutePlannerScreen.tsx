import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Dimensions,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  ArrowUpIcon, MicIcon, MountainIcon, HourglassIcon,
  CloudIcon, LeafIcon, FuelIcon, DollarIcon, WarningTriangleIcon,
} from '../../components/icons';

const TEAL = '#3ABFBF';
const NAV_BG = '#1C3829';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.52;

// ── Dummy route data ───────────────────────────────────────────────────────

const INITIAL_REGION = {
  latitude: 51.5045,
  longitude: -0.1145,
  latitudeDelta: 0.045,
  longitudeDelta: 0.025,
};

const ROUTE_MAIN: { latitude: number; longitude: number }[] = [
  { latitude: 51.5115, longitude: -0.1195 },
  { latitude: 51.5095, longitude: -0.1175 },
  { latitude: 51.5070, longitude: -0.1155 },
  { latitude: 51.5050, longitude: -0.1145 },
  { latitude: 51.5020, longitude: -0.1135 },
  { latitude: 51.4990, longitude: -0.1130 },
];

const ROUTE_TRAFFIC: { latitude: number; longitude: number }[] = [
  { latitude: 51.5050, longitude: -0.1145 },
  { latitude: 51.5035, longitude: -0.1140 },
  { latitude: 51.5020, longitude: -0.1135 },
];

const DESTINATION = { latitude: 51.5115, longitude: -0.1195 };

// ── Sub-components ─────────────────────────────────────────────────────────

function TimeBubble({ label, style, accent }: {
  label: string; style?: object; accent?: boolean;
}) {
  return (
    <View style={[styles.timeBubble, accent && styles.timeBubbleAccent, style]}>
      <Text style={[styles.timeBubbleText, accent && { color: '#F47920' }]}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }: {
  icon: React.ReactNode; label: string; value?: string;
}) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text style={styles.infoLabel}>{label}</Text>
      {value ? <Text style={styles.infoValue}>{value}</Text> : null}
    </View>
  );
}

function StatCard({ icon, label, value, half }: {
  icon: React.ReactNode; label: string; value: string; half?: boolean;
}) {
  return (
    <View style={[styles.statCard, half && styles.statCardHalf]}>
      <View style={styles.statHeader}>
        {icon}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function RoutePlannerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [showAiPopup, setShowAiPopup] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowAiPopup(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.root}>
      {/* ── Map section ── */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={INITIAL_REGION}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {/* Main route – blue */}
          <Polyline
            coordinates={ROUTE_MAIN}
            strokeColor="#3B8BEB"
            strokeWidth={5}
            lineCap="round"
          />
          {/* Traffic segment – red */}
          <Polyline
            coordinates={ROUTE_TRAFFIC}
            strokeColor="#E53935"
            strokeWidth={5}
            lineCap="round"
          />
          {/* Destination marker */}
          <Marker coordinate={DESTINATION}>
            <View style={styles.destMarker}>
              <View style={styles.destMarkerInner} />
            </View>
          </Marker>
        </MapView>

        {/* Navigation header */}
        <View style={[styles.navHeader, { paddingTop: insets.top + 6 }]}>
          <View style={styles.navHeaderLeft}>
            <ArrowUpIcon color="white" size={28} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.navStreet}>Bridge St/A302</Text>
              <Text style={styles.navTowards}>towards Westminster</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.micBtn} activeOpacity={0.8}>
            <MicIcon color={TEAL} size={20} />
          </TouchableOpacity>
        </View>

        {/* Then indicator */}
        <View style={[styles.thenBar, { top: insets.top + 68 }]}>
          <BackArrowIcon size={14} color="white" />
          <Text style={styles.thenText}>  Then</Text>
          <Text style={styles.thenArrow}>  →</Text>
        </View>

        {/* IDA AI badge */}
        <TouchableOpacity
          style={styles.idaBadge}
          activeOpacity={0.85}
          onPress={() => setShowAiPopup(v => !v)}
        >
          <Text style={styles.idaLabel}>IDA</Text>
          <Text style={styles.idaSub}>AI°</Text>
        </TouchableOpacity>

        {/* Time bubbles (decorative) */}
        <TimeBubble label="10 min" style={styles.bubble10} />
        <TimeBubble label="9 min"  style={styles.bubble9} />
        <TimeBubble label="+3 min" style={styles.bubblePlus3} accent />
        <View style={styles.bubble8}>
          <Text style={styles.bubble8Text}>8 min</Text>
        </View>

        {/* Compass button */}
        <View style={styles.compassBtn}>
          <Text style={styles.compassArrow}>▲</Text>
        </View>

        {/* AI route suggestion popup */}
        {showAiPopup && (
          <View style={styles.aiPopup}>
            <Text style={styles.aiPopupText}>
              I found a faster route that can save you 2 minutes. Would you like to switch?"
            </Text>
            <View style={styles.aiPopupBtns}>
              <TouchableOpacity
                style={styles.aiAcceptBtn}
                onPress={() => setShowAiPopup(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.aiAcceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAiPopup(false)} activeOpacity={0.7}>
                <Text style={styles.aiCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Bottom panel ── */}
      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
        showsVerticalScrollIndicator={false}
      >
        {/* From / To card */}
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.routeTag}>From</Text>
            <Text style={styles.routeValue}>Current Location</Text>
          </View>
          <View style={styles.routeConnector}>
            <View style={styles.routeLine} />
          </View>
          <View style={styles.routeRow}>
            <View style={styles.dotBlack} />
            <Text style={styles.routeTag}>To</Text>
            <TextInput
              style={styles.routeInput}
              placeholder="Country, City, Zip, Street.."
              placeholderTextColor="#AAAAAA"
            />
          </View>
        </View>

        {/* Trip info rows */}
        <View style={styles.infoSection}>
          <InfoRow
            icon={<MountainIcon color="#888" size={18} />}
            label="Distance"
            value="120 miles"
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<HourglassIcon color="#888" size={18} />}
            label="Duration"
            value="1h 35 min"
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<WarningTriangleIcon color="#888" size={18} />}
            label="Alerts"
          />
        </View>

        {/* Cost & Consumption */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>COST & CONSUMPTION</Text>
          <Text style={styles.sectionEst}>  (estimated)</Text>
        </View>
        <View style={styles.statRow}>
          <StatCard
            icon={<LeafIcon color="#888" size={16} />}
            label="CO₂ Emissions"
            value="12.3 kg"
            half
          />
          <StatCard
            icon={<FuelIcon color="#888" size={16} />}
            label="Consumption"
            value="7.8 L"
            half
          />
        </View>
        <StatCard
          icon={<DollarIcon color="#888" size={16} />}
          label="Trip cost"
          value="13,26"
        />

        {/* Weather */}
        <Text style={[styles.sectionTitle, { marginTop: 18, marginBottom: 10 }]}>WEATHER</Text>
        <View style={styles.weatherCard}>
          <View>
            <Text style={styles.weatherDate}>Thu 08</Text>
            <Text style={styles.weatherCity}>San Francisco, CA</Text>
          </View>
          <View style={styles.weatherRight}>
            <Text style={styles.weatherTemp}>23</Text>
            <View style={styles.weatherCondRow}>
              <CloudIcon color="#5B9BD5" size={20} />
              <Text style={styles.weatherCond}> Cloudy/ Warm</Text>
            </View>
          </View>
        </View>

        {/* Start Trip */}
        <TouchableOpacity style={styles.startBtn} activeOpacity={0.88}>
          <Text style={styles.startBtnText}>Start Trip</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // Map
  mapContainer: { width: '100%', overflow: 'hidden' },

  destMarker: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#E53935',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'white',
  },
  destMarkerInner: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: 'white',
  },

  // Navigation header overlay
  navHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: NAV_BG,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  navHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  navStreet: { fontSize: 17, fontWeight: '800', color: 'white' },
  navTowards: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  micBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 12,
  },

  // Then bar
  thenBar: {
    position: 'absolute', left: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(28,56,41,0.9)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  thenText: { color: 'white', fontSize: 13, fontWeight: '600' },
  thenArrow: { color: 'white', fontSize: 14, fontWeight: '700' },

  // IDA AI badge
  idaBadge: {
    position: 'absolute', left: 12, top: '45%',
    backgroundColor: '#1A2332',
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: TEAL,
  },
  idaLabel: { color: 'white', fontSize: 14, fontWeight: '800' },
  idaSub: { color: TEAL, fontSize: 10, fontWeight: '600' },

  // Time bubbles
  timeBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(30,30,30,0.85)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14,
  },
  timeBubbleAccent: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F47920' },
  timeBubbleText: { color: 'white', fontSize: 13, fontWeight: '700' },
  bubble10: { top: '38%', left: '42%' },
  bubble9:  { right: 14, top: '55%' },
  bubblePlus3: { left: '38%', top: '58%' },
  bubble8: {
    position: 'absolute', bottom: '15%', left: 14,
    backgroundColor: '#1B3D88',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16,
  },
  bubble8Text: { color: 'white', fontSize: 15, fontWeight: '800' },

  // Compass
  compassBtn: {
    position: 'absolute', right: 14, bottom: '12%',
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'white',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  compassArrow: { fontSize: 18, color: '#E53935' },

  // AI popup
  aiPopup: {
    position: 'absolute', left: 14, right: 14, top: '32%',
    backgroundColor: 'white',
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  aiPopupText: { fontSize: 14, color: '#1A1A1A', lineHeight: 20, marginBottom: 12 },
  aiPopupBtns: { flexDirection: 'row', alignItems: 'center', columnGap: 16 },
  aiAcceptBtn: {
    backgroundColor: TEAL, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 20,
  },
  aiAcceptText: { color: 'white', fontWeight: '700', fontSize: 14 },
  aiCancelText: { color: '#E53935', fontWeight: '600', fontSize: 14 },

  // Bottom panel
  panel: { flex: 1, backgroundColor: '#F5F5F5' },
  panelContent: { padding: 16, rowGap: 0, paddingBottom: 32 },

  // Route card
  routeCard: {
    backgroundColor: 'white', borderRadius: 16,
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  dotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#27AE60' },
  dotBlack: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#1A1A1A' },
  routeConnector: { paddingLeft: 5, paddingVertical: 4 },
  routeLine: { width: 2, height: 18, backgroundColor: '#DDDDDD', marginLeft: 1 },
  routeTag: { fontSize: 13, color: '#888888', width: 36 },
  routeValue: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  routeInput: { flex: 1, fontSize: 14, color: '#1A1A1A', padding: 0 },

  // Info rows
  infoSection: {
    backgroundColor: 'white', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 6,
    marginBottom: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, columnGap: 10 },
  infoLabel: { flex: 1, fontSize: 14, color: '#555555' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  infoDivider: { height: 1, backgroundColor: '#F0F0F0' },

  // Section title
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.6 },
  sectionEst: { fontSize: 12, color: '#888888' },

  // Stat cards
  statRow: { flexDirection: 'row', columnGap: 12, marginBottom: 12 },
  statCard: {
    backgroundColor: 'white', borderRadius: 14,
    padding: 14, flex: 1, marginBottom: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statCardHalf: { flex: 1 },
  statHeader: { flexDirection: 'row', alignItems: 'center', columnGap: 6, marginBottom: 10 },
  statLabel: { fontSize: 12, color: '#888888' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1A1A1A' },

  // Weather
  weatherCard: {
    backgroundColor: 'white', borderRadius: 16,
    padding: 16, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  weatherDate: { fontSize: 13, color: '#888', marginBottom: 4 },
  weatherCity: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  weatherRight: { alignItems: 'flex-end' },
  weatherTemp: { fontSize: 26, fontWeight: '800', color: '#1A1A1A' },
  weatherCondRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  weatherCond: { fontSize: 13, color: '#555555' },

  // Start Trip button
  startBtn: {
    backgroundColor: TEAL, borderRadius: 28,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: TEAL, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  startBtnText: { fontSize: 17, fontWeight: '700', color: 'white' },
});
