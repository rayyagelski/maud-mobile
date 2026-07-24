import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Dimensions, Alert, Animated, Keyboard, Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  ArrowUpIcon, MicIcon, MountainIcon, HourglassIcon,
  LeafIcon, FuelIcon, DollarIcon, WarningTriangleIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { startTrip, endTrip } from '../../store/slices/tripSlice';
import { vehiclesApi } from '../../api';
import type { FuelPriceResponse } from '../../types/vehicle.types';
import {
  fetchHereRoute, geocodeAddress, suggestAddresses,
  type LatLng, type HereRouteResult, type AddressSuggestion,
} from '../../services/here/hereRoutingClient';
import {
  formatDistance, formatDuration, litersToGallons, gramsToLbs, estimateFuelCo2Grams,
} from '../../utils/helpers';

const TEAL = '#3ABFBF';
const NAV_BG = '#1C3829';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_HEIGHT * 0.52;
// Collapsed height while the keyboard is up — keeps just enough of the map
// visible for context (nav header) while giving the destination field/
// suggestions room to sit above the keyboard instead of behind it.
const MAP_HEIGHT_COLLAPSED = SCREEN_HEIGHT * 0.15;
const KEYBOARD_ANIM_MS = 250;

const FALLBACK_REGION = {
  latitude: 25.276987,
  longitude: 55.296249,
  latitudeDelta: 0.045,
  longitudeDelta: 0.025,
};

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
  const navigation = useNavigation<MainStackNavigationProp>();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { claims } = useAppSelector(s => s.auth);
  const isImperial = useIsImperialUnits();
  const { selectedVehicle, vehicles } = useAppSelector(s => s.vehicles);
  const { selectedDriver } = useAppSelector(s => s.drivers);
  const { activeTrip, isTracking } = useAppSelector(s => s.trips);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [route, setRoute] = useState<HereRouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [isEndingTrip, setIsEndingTrip] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapHeightAnim = useRef(new Animated.Value(MAP_HEIGHT)).current;
  const [fuelPrice, setFuelPrice] = useState<FuelPriceResponse | null>(null);

  // Collapse the map (rather than letting the keyboard just overlay on top
  // of the destination field/suggestions with no reflow at all) while the
  // keyboard is visible, then restore it once dismissed — the same
  // expanding/collapsing pattern other apps (e.g. Yahoo Finance's bottom
  // sheet) use instead of a static layout the keyboard can cover.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateTo = (toValue: number) => {
      Animated.timing(mapHeightAnim, {
        toValue,
        duration: KEYBOARD_ANIM_MS,
        useNativeDriver: false, // height isn't supported by the native driver
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, () => animateTo(MAP_HEIGHT_COLLAPSED));
    const hideSub = Keyboard.addListener(hideEvent, () => animateTo(MAP_HEIGHT));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [mapHeightAnim]);

  useEffect(() => {
    Geolocation.getCurrentPosition(
      ({ coords }) => setOrigin({ latitude: coords.latitude, longitude: coords.longitude }),
      (err) => console.warn('[RoutePlanner] location fetch failed', err.message),
      { enableHighAccuracy: true },
    );
  }, []);

  // Fuel/electricity price for the Trip Cost estimate below — fail-soft like
  // every other auxiliary lookup in this app (weather, AI tip, reward
  // submission): a failed price fetch just means Trip Cost stays unfilled,
  // never blocks route planning.
  const fuelPriceVehicleId = selectedVehicle?.id ?? vehicles[0]?.id;
  useEffect(() => {
    if (!fuelPriceVehicleId) {
      setFuelPrice(null);
      return;
    }
    let cancelled = false;
    vehiclesApi.getFuelPrice(fuelPriceVehicleId)
      .then((res) => { if (!cancelled) setFuelPrice(res.data); })
      .catch(() => { if (!cancelled) setFuelPrice(null); });
    return () => { cancelled = true; };
  }, [fuelPriceVehicleId]);

  // As-you-type address suggestions, debounced and biased near the current
  // location — only fires once there's enough text to search meaningfully.
  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (!origin || destinationQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    suggestDebounceRef.current = setTimeout(() => {
      suggestAddresses(destinationQuery.trim(), origin)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 300);
    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [destinationQuery, origin]);

  async function routeToDestination(destination: LatLng) {
    if (!origin) return;
    setIsRouting(true);
    try {
      const result = await fetchHereRoute(origin, destination);
      if (!result) {
        Alert.alert('No route', 'No route could be calculated to that destination.');
        return;
      }
      setRoute(result);
    } catch {
      Alert.alert('Route error', 'Could not calculate a route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  }

  function handleSelectSuggestion(suggestion: AddressSuggestion) {
    setDestinationQuery(suggestion.label);
    setSuggestions([]);
    routeToDestination(suggestion.position);
  }

  async function handleSearchDestination() {
    if (!destinationQuery.trim() || !origin) return;
    setSuggestions([]);
    setIsRouting(true);
    try {
      const destination = await geocodeAddress(destinationQuery.trim());
      if (!destination) {
        Alert.alert('Not found', "Couldn't find that destination. Try a more specific address.");
        return;
      }
      await routeToDestination(destination);
    } catch {
      Alert.alert('Route error', 'Could not calculate a route right now. Please try again.');
    } finally {
      setIsRouting(false);
    }
  }

  const vehicle = selectedVehicle ?? vehicles[0] ?? null;
  const distanceKm = route ? route.distanceMeters / 1000 : null;

  // Estimated fuel/energy used for the planned route — same (distance/100) *
  // consumption calc as before, just now unit-aware for display.
  const fuelOrEnergyUsed =
    vehicle?.estimatedConsumption && distanceKm != null
      ? (distanceKm / 100) * vehicle.estimatedConsumption
      : null;
  const isElectric = vehicle?.fuelType === 'electric';
  const consumptionLabel = fuelOrEnergyUsed == null
    ? '—'
    : isElectric
      ? `${fuelOrEnergyUsed.toFixed(1)} kWh` // no US-specific EV energy unit; kWh is used in both locales
      : isImperial
        ? `${litersToGallons(fuelOrEnergyUsed).toFixed(1)} gal`
        : `${fuelOrEnergyUsed.toFixed(1)} L`;

  // CO2 estimate — only for combustion fuel types (see estimateFuelCo2Grams'
  // own doc comment for why EV/hydrogen are omitted rather than guessed).
  const co2Grams = !isElectric && fuelOrEnergyUsed != null
    ? estimateFuelCo2Grams(vehicle?.fuelType, fuelOrEnergyUsed)
    : null;
  const co2Label = co2Grams == null
    ? '—'
    : isImperial
      ? `${gramsToLbs(co2Grams).toFixed(1)} lb`
      : `${(co2Grams / 1000).toFixed(1)} kg`;

  // Trip cost estimate — fuel/energy cost only (distance × consumption ×
  // price). Deliberately not full parity with the web app's "Driving
  // Analysis" Total Cost (which also includes insurance/lease/tax/
  // maintenance) — that data isn't exposed to mobile. Same "omit rather than
  // fabricate" convention: no label at all until both consumption and a real
  // price are known.
  const tripCostAmount = fuelOrEnergyUsed != null && fuelPrice
    ? isElectric
      ? fuelPrice.electricityPricePerKwh != null ? fuelOrEnergyUsed * fuelPrice.electricityPricePerKwh : null
      : fuelPrice.fuelPricePerLiter != null ? fuelOrEnergyUsed * fuelPrice.fuelPricePerLiter : null
    : null;
  const tripCostLabel = tripCostAmount != null
    ? `${tripCostAmount.toFixed(2)} ${fuelPrice?.currencyCode ?? ''}`.trim()
    : '—';

  async function handleStartEndTrip() {
    if (isTracking && activeTrip) {
      setIsEndingTrip(true);
      const tripId = activeTrip.id;
      await dispatch(endTrip(tripId));
      setIsEndingTrip(false);
      navigation.navigate('TripSummary', { tripId });
      return;
    }

    const vehicleId = claims?.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId || !claims) {
      Alert.alert('No vehicle selected', 'Select a vehicle from Home before starting a trip.');
      return;
    }
    dispatch(startTrip({
      vehicleId,
      driverId: selectedDriver?.id ?? String(claims.userId),
      tripType: 'business',
      transportMode: 'car',
    }));
  }

  const mapRegion = origin
    ? { ...origin, latitudeDelta: 0.045, longitudeDelta: 0.025 }
    : FALLBACK_REGION;

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      {/* ── Map section ── */}
      <Animated.View style={[styles.mapContainer, { height: mapHeightAnim }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          region={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {route && route.coordinates.length > 1 && (
            <Polyline
              coordinates={route.coordinates}
              strokeColor="#3B8BEB"
              strokeWidth={5}
              lineCap="round"
            />
          )}
          {route && route.coordinates.length > 0 && (
            <Marker coordinate={route.coordinates[route.coordinates.length - 1]}>
              <View style={styles.destMarker}>
                <View style={styles.destMarkerInner} />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Floating back button */}
        <SafeAreaView edges={['top']} style={styles.mapBackOverlay} pointerEvents="box-none">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.mapBackBtn} hitSlop={HIT} activeOpacity={0.8}>
            <BackArrowIcon size={22} color="#1A1A1A" />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Navigation header (decorative — real turn-by-turn is a later phase) */}
        <View style={[styles.navHeader, { paddingTop: insets.top + 6 }]}>
          <View style={styles.navHeaderLeft}>
            <ArrowUpIcon color="white" size={28} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.navStreet}>{isTracking ? 'Trip in progress' : 'Plan your route'}</Text>
              <Text style={styles.navTowards}>
                {route ? `${formatDistance(route.distanceMeters / 1000, isImperial)} · ${formatDuration(route.durationSeconds)}` : 'Enter a destination below'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.micBtn} activeOpacity={0.8}>
            <MicIcon color={TEAL} size={20} />
          </TouchableOpacity>
        </View>

        {/* Time bubbles (decorative) */}
        {route && (
          <View style={styles.bubble8}>
            <Text style={styles.bubble8Text}>{formatDuration(route.durationSeconds)}</Text>
          </View>
        )}

        {/* Compass button */}
        <View style={styles.compassBtn}>
          <Text style={styles.compassArrow}>▲</Text>
        </View>
      </Animated.View>

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
            <Text style={styles.routeValue}>{origin ? 'Current Location' : 'Locating…'}</Text>
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
              value={destinationQuery}
              onChangeText={setDestinationQuery}
              onSubmitEditing={handleSearchDestination}
              returnKeyType="search"
              editable={!isRouting}
            />
          </View>
        </View>

        {/* Address suggestions dropdown */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsCard}>
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.suggestionRow, index === suggestions.length - 1 && styles.suggestionRowLast]}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionText} numberOfLines={2}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Trip info rows */}
        <View style={styles.infoSection}>
          <InfoRow
            icon={<MountainIcon color="#888" size={18} />}
            label="Distance"
            value={route ? formatDistance(route.distanceMeters / 1000, isImperial) : undefined}
          />
          <View style={styles.infoDivider} />
          <InfoRow
            icon={<HourglassIcon color="#888" size={18} />}
            label="Duration"
            value={route ? formatDuration(route.durationSeconds) : undefined}
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
            value={co2Label}
            half
          />
          <StatCard
            icon={<FuelIcon color="#888" size={16} />}
            label="Consumption"
            value={consumptionLabel}
            half
          />
        </View>
        <StatCard
          icon={<DollarIcon color="#888" size={16} />}
          label="Trip cost"
          value={tripCostLabel}
        />

        {/* Start / End Trip */}
        <TouchableOpacity
          style={[styles.startBtn, isTracking && styles.endTripBtn]}
          activeOpacity={0.88}
          disabled={isEndingTrip}
          onPress={handleStartEndTrip}
        >
          <Text style={styles.startBtnText}>
            {isEndingTrip ? 'Ending…' : isTracking ? 'End Trip' : 'Start Trip'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // Map
  mapContainer: { width: '100%', overflow: 'hidden' },
  mapBackOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  mapBackBtn: {
    marginLeft: 16, marginTop: 8,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },

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

  // Time bubbles
  timeBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(30,30,30,0.85)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14,
  },
  timeBubbleAccent: { backgroundColor: 'white', borderWidth: 1, borderColor: '#F47920' },
  timeBubbleText: { color: 'white', fontSize: 13, fontWeight: '700' },
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

  // Address suggestions
  suggestionsCard: {
    backgroundColor: 'white', borderRadius: 16,
    marginTop: -8, marginBottom: 14,
    paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  suggestionRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  suggestionRowLast: { borderBottomWidth: 0 },
  suggestionText: { fontSize: 14, color: '#1A1A1A' },

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

  // Start Trip button
  startBtn: {
    backgroundColor: TEAL, borderRadius: 28,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 18,
    shadowColor: TEAL, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  startBtnText: { fontSize: 17, fontWeight: '700', color: 'white' },

  endTripBtn: {
    backgroundColor: '#E53935',
    shadowColor: '#E53935',
  },
});
