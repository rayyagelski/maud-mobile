import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Dimensions, Alert, Keyboard, Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { MainStackNavigationProp } from '../../types/navigation.types';
import BackArrowIcon from '../../components/common/BackArrowIcon';
import {
  ArrowUpIcon, MicIcon, MountainIcon, HourglassIcon,
  LeafIcon, FuelIcon, DollarIcon, WarningTriangleIcon, SparkleIcon,
} from '../../components/icons';
import { useAppSelector } from '../../hooks/useAppSelector';
import { useAppDispatch } from '../../hooks/useAppDispatch';
import { useIsImperialUnits } from '../../hooks/useIsImperialUnits';
import { useVoicePlayback } from '../../hooks/useVoicePlayback';
import { endTrip, armPendingStart, clearPendingStart, setPlannedRouteOnActiveTrip } from '../../store/slices/tripSlice';
import { dismissRerouteSuggestion, clearRerouteSuggestion } from '../../store/slices/trafficSlice';
import { vehiclesApi, routesApi, type RouteRecommendationResult } from '../../api';
import type { FuelPriceResponse } from '../../types/vehicle.types';
import {
  fetchHereRoutes, geocodeAddress, suggestAddresses,
  type LatLng, type HereRouteResult, type AddressSuggestion,
} from '../../services/here/hereRoutingClient';
import {
  formatDistance, formatDuration, litersToGallons, gramsToLbs, estimateFuelCo2Grams,
} from '../../utils/helpers';

type RouteRecommendation = RouteRecommendationResult;

const TEAL = '#3ABFBF';
const NAV_BG = '#1C3829';
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// The panel is a draggable overlay sitting on top of the (now fixed-size)
// map — default height matches the old static layout's proportion; expanded
// height overlaps nearly the whole map, leaving just enough for the nav
// header/back button, per the user's "expandable to overlap the map" ask.
const PANEL_HEIGHT_DEFAULT = SCREEN_HEIGHT * 0.48;
const PANEL_HEIGHT_EXPANDED = SCREEN_HEIGHT * 0.92;
const PANEL_SNAP_MIDPOINT = (PANEL_HEIGHT_DEFAULT + PANEL_HEIGHT_EXPANDED) / 2;
const SPRING_CONFIG = { damping: 18, stiffness: 150 };

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
  const { activeTrip, isTracking, pendingStart } = useAppSelector(s => s.trips);
  const { rerouteSuggestion } = useAppSelector(s => s.traffic);

  // If the user arms a start here then navigates away before the car ever
  // actually moves, the arm must not survive the screen — otherwise it sits
  // in persisted state and fires on the next unrelated motion blip (e.g.
  // walking to a different car later), starting a trip nobody asked for.
  // Only clears an arm that's still pending; once startTrip.fulfilled has
  // run, pendingStart is already null and this is a no-op.
  const pendingStartOnUnmountRef = useRef(pendingStart);
  useEffect(() => { pendingStartOnUnmountRef.current = pendingStart; }, [pendingStart]);
  useEffect(() => () => {
    if (pendingStartOnUnmountRef.current) {
      dispatch(clearPendingStart());
    }
  }, [dispatch]);

  // Every trip-start path in the app previously hardcoded 'private' with no
  // way to change it — TripHistoryScreen already has a Business filter, but
  // it could never match anything. Default stays private per explicit
  // real-drive feedback (Private = default), user can switch before starting.
  const [tripPurpose, setTripPurpose] = useState<'private' | 'business'>('private');

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  // routes[0] is always HERE's optimal route; index 0 is selected by default.
  // `route` below derives the currently-active one so the rest of the screen
  // (distance/duration/cost/consumption/CO2, the polyline+marker) doesn't
  // need to change — only the parts that need to know about alternatives do.
  const [routes, setRoutes] = useState<HereRouteResult[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const route = routes[selectedRouteIndex] ?? null;
  const [isRouting, setIsRouting] = useState(false);
  const [isEndingTrip, setIsEndingTrip] = useState(false);
  const [routeRecommendation, setRouteRecommendation] = useState<RouteRecommendation | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fuelPrice, setFuelPrice] = useState<FuelPriceResponse | null>(null);
  const { speak } = useVoicePlayback();

  // Draggable bottom sheet — panelHeight is animated on the UI thread via
  // Reanimated (unlike RN core's Animated, this supports animating `height`
  // directly, not just transform/opacity). dragStartHeight captures the
  // height at gesture-start so onUpdate can compute an absolute new height
  // from the cumulative drag distance rather than accumulating per-frame
  // deltas (which would drift).
  const panelHeight = useSharedValue(PANEL_HEIGHT_DEFAULT);
  const dragStartHeight = useSharedValue(PANEL_HEIGHT_DEFAULT);

  function snapPanelTo(height: number) {
    panelHeight.value = withSpring(height, SPRING_CONFIG);
  }

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartHeight.value = panelHeight.value;
    })
    .onUpdate((event) => {
      const next = dragStartHeight.value - event.translationY;
      panelHeight.value = Math.min(PANEL_HEIGHT_EXPANDED, Math.max(PANEL_HEIGHT_DEFAULT, next));
    })
    .onEnd(() => {
      panelHeight.value = withSpring(
        panelHeight.value > PANEL_SNAP_MIDPOINT ? PANEL_HEIGHT_EXPANDED : PANEL_HEIGHT_DEFAULT,
        SPRING_CONFIG,
      );
    });

  const panelAnimatedStyle = useAnimatedStyle(() => ({ height: panelHeight.value }));

  // Keyboard appearing/disappearing snaps the same sheet the drag gesture
  // drives — one mechanism, two triggers — so the destination field/
  // suggestions end up above the keyboard instead of behind it.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => snapPanelTo(PANEL_HEIGHT_EXPANDED));
    const hideSub = Keyboard.addListener(hideEvent, () => snapPanelTo(PANEL_HEIGHT_DEFAULT));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      // Request one alternative alongside HERE's optimal route — the AI
      // recommendation below is only useful when there's actually a choice.
      const results = await fetchHereRoutes(origin, destination, 1, isImperial);
      if (results.length === 0) {
        Alert.alert('No route', 'No route could be calculated to that destination.');
        return;
      }
      setRoutes(results);
      setSelectedRouteIndex(0);
      setRouteRecommendation(null);
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
  const isElectric = vehicle?.fuelType === 'electric';
  const distanceKm = route ? route.distanceMeters / 1000 : null;

  // Estimated fuel/energy used for the planned route — same (distance/100) *
  // consumption calc as before, just now unit-aware for display.
  const fuelOrEnergyUsed =
    vehicle?.estimatedConsumption && distanceKm != null
      ? (distanceKm / 100) * vehicle.estimatedConsumption
      : null;

  // Same fuel-cost formula as tripCostAmount below, factored out so it can
  // be computed per-route (for the AI recommendation, which needs every
  // option's cost, not just the selected one) without duplicating the logic.
  function estimateTripCostForDistance(km: number): number | null {
    if (!vehicle?.estimatedConsumption || !fuelPrice) return null;
    const used = (km / 100) * vehicle.estimatedConsumption;
    const price = isElectric ? fuelPrice.electricityPricePerKwh : fuelPrice.fuelPricePerLiter;
    return price != null ? used * price : null;
  }
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
  const tripCostAmount = distanceKm != null ? estimateTripCostForDistance(distanceKm) : null;
  const tripCostLabel = tripCostAmount != null
    ? `${tripCostAmount.toFixed(2)} ${fuelPrice?.currencyCode ?? ''}`.trim()
    : '—';

  // AI recommendation across all fetched route options — fires once routes
  // and (if available) a fuel price are known. Fail-soft: a failed/declined
  // recommendation just means nothing renders, routes still work normally.
  useEffect(() => {
    if (routes.length < 2) {
      setRouteRecommendation(null);
      return;
    }
    let cancelled = false;
    const options = routes.map((r, index) => {
      const km = r.distanceMeters / 1000;
      return {
        index,
        distanceKm: km,
        durationSeconds: r.durationSeconds,
        cost: estimateTripCostForDistance(km),
        currencyCode: fuelPrice?.currencyCode ?? null,
      };
    });
    routesApi.getRecommendation(options)
      .then((result) => { if (!cancelled) setRouteRecommendation(result); })
      .catch(() => { if (!cancelled) setRouteRecommendation(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, fuelPrice]);

  async function handleStartEndTrip() {
    if (isTracking && activeTrip) {
      setIsEndingTrip(true);
      const tripId = activeTrip.id;
      await dispatch(endTrip(tripId));
      setIsEndingTrip(false);
      navigation.navigate('TripSummary', { tripId });
      return;
    }

    // Already armed and waiting for motion — tapping again cancels instead
    // of re-arming (which would just reset armedAt for no reason).
    if (pendingStart) {
      dispatch(clearPendingStart());
      return;
    }

    const vehicleId = claims?.vehicleId ?? selectedVehicle?.id ?? vehicles[0]?.id;
    if (!vehicleId || !claims) {
      Alert.alert('No vehicle selected', 'Select a vehicle from Home before starting a trip.');
      return;
    }
    // Arm only — recording doesn't actually start until useTripAutoDetection
    // sees real motion, so holding the phone or driving off later doesn't
    // get misrecorded as part of the trip while still parked.
    dispatch(armPendingStart({
      vehicleId,
      driverId: selectedDriver?.id ?? String(claims.userId),
      tripType: tripPurpose,
      transportMode: 'car',
      armedAt: Date.now(),
      // Carries the selected route into Redux so voice turn-by-turn guidance
      // can read it after this screen unmounts — route/routes above are
      // local state and would otherwise be lost the moment tracking begins.
      ...(route && { plannedRoute: { coordinates: route.coordinates, maneuvers: route.maneuvers } }),
    }));
  }

  // Covers the common case where auto-detection already started the trip
  // (the vehicle was moving before Route Planner was opened) — previously
  // the only option here was "End Trip", forcing the user to stop recording
  // just to plan a destination and get voice guidance.
  function handleAttachRouteToActiveTrip() {
    if (!route) return;
    dispatch(setPlannedRouteOnActiveTrip({ coordinates: route.coordinates, maneuvers: route.maneuvers }));
  }

  // Swaps both the active trip's guided route (what useTurnByTurnGuidance/
  // useTrafficMonitor read) and this screen's own displayed route/stats to
  // the faster alternative useTrafficMonitor found.
  function handleAcceptReroute() {
    if (!rerouteSuggestion) return;
    const { alternativeRoute, alternativeDistanceMeters, alternativeDurationSeconds } = rerouteSuggestion;
    dispatch(setPlannedRouteOnActiveTrip(alternativeRoute));
    setRoutes([{
      coordinates: alternativeRoute.coordinates,
      maneuvers: alternativeRoute.maneuvers,
      distanceMeters: alternativeDistanceMeters,
      durationSeconds: alternativeDurationSeconds,
    }]);
    setSelectedRouteIndex(0);
    dispatch(clearRerouteSuggestion());
  }

  function handleDismissReroute() {
    dispatch(dismissRerouteSuggestion());
  }

  const mapRegion = origin
    ? { ...origin, latitudeDelta: 0.045, longitudeDelta: 0.025 }
    : FALLBACK_REGION;

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      {/* ── Map section (fixed, full-size background — the panel overlaps it) ── */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          region={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {/* Non-selected alternatives drawn first (dimmed, tappable to
              select), selected route drawn last so it's always on top. */}
          {routes.map((r, index) => (
            index !== selectedRouteIndex && r.coordinates.length > 1 && (
              <Polyline
                key={index}
                coordinates={r.coordinates}
                strokeColor="#9AA5B1"
                strokeWidth={4}
                lineCap="round"
                tappable
                onPress={() => setSelectedRouteIndex(index)}
              />
            )
          ))}
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
              <Text style={styles.navStreet}>
                {isTracking ? 'Trip in progress' : pendingStart ? 'Waiting for movement…' : 'Plan your route'}
              </Text>
              <Text style={styles.navTowards}>
                {route ? `${formatDistance(route.distanceMeters / 1000, isImperial)} · ${formatDuration(route.durationSeconds)}` : 'Enter a destination below'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.micBtn}
            activeOpacity={0.8}
            disabled={!routeRecommendation}
            onPress={() => routeRecommendation && speak(routeRecommendation.message)}
          >
            <MicIcon color={routeRecommendation ? TEAL : '#CCCCCC'} size={20} />
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
      </View>

      {/* ── Bottom panel: draggable overlay sheet ── */}
      <Animated.View style={[styles.panel, panelAnimatedStyle]}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandleBar} />
          </View>
        </GestureDetector>
        <ScrollView
          style={styles.panelScroll}
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
              // Expanding on the keyboard's own show event (below) can lag or
              // miss entirely on some Android keyboards/devices; focus fires
              // immediately and reliably, so the panel/suggestions have room
              // the moment typing starts rather than waiting on OS timing.
              onFocus={() => snapPanelTo(PANEL_HEIGHT_EXPANDED)}
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

        {/* Live traffic-backup reroute prompt (useTrafficMonitor) */}
        {rerouteSuggestion && (
          <View style={styles.trafficCard}>
            <View style={styles.recommendationHeader}>
              <WarningTriangleIcon color="#F47920" size={16} />
              <Text style={styles.trafficLabel}>TRAFFIC BACKUP AHEAD</Text>
            </View>
            <Text style={styles.recommendationText}>
              Adding about {formatDuration(rerouteSuggestion.delaySeconds)} to your trip. A faster route is available.
            </Text>
            <View style={styles.trafficActions}>
              <TouchableOpacity style={styles.trafficDismissBtn} activeOpacity={0.8} onPress={handleDismissReroute}>
                <Text style={styles.trafficDismissText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.trafficRerouteBtn} activeOpacity={0.8} onPress={handleAcceptReroute}>
                <Text style={styles.trafficRerouteText}>Reroute</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* AI recommendation across route alternatives */}
        {routeRecommendation && (
          <TouchableOpacity
            style={styles.recommendationCard}
            activeOpacity={0.85}
            onPress={() => setSelectedRouteIndex(routeRecommendation.recommendedIndex)}
          >
            <View style={styles.recommendationHeader}>
              <SparkleIcon color={TEAL} size={16} />
              <Text style={styles.recommendationLabel}>AI RECOMMENDATION</Text>
            </View>
            <Text style={styles.recommendationText}>{routeRecommendation.message}</Text>
          </TouchableOpacity>
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

        {/* Trip purpose — only changeable before a trip is armed/tracking;
            once started (manually or auto-detected) it's fixed for that trip. */}
        {!isTracking && !pendingStart && (
          <View style={styles.purposeRow}>
            {(['private', 'business'] as const).map(purpose => (
              <TouchableOpacity
                key={purpose}
                style={[styles.purposePill, tripPurpose === purpose && styles.purposePillActive]}
                onPress={() => setTripPurpose(purpose)}
                activeOpacity={0.8}
              >
                <Text style={[styles.purposePillText, tripPurpose === purpose && styles.purposePillTextActive]}>
                  {purpose === 'private' ? 'Private' : 'Business'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Trip already tracking (auto-detected) with a route planned but not
            yet attached — let voice guidance pick it up without ending the trip. */}
        {isTracking && !!route && !activeTrip?.plannedRoute && (
          <TouchableOpacity
            style={styles.startBtn}
            activeOpacity={0.88}
            onPress={handleAttachRouteToActiveTrip}
          >
            <Text style={styles.startBtnText}>Guide this trip</Text>
          </TouchableOpacity>
        )}

        {/* Start / End Trip */}
        <TouchableOpacity
          style={[styles.startBtn, (isTracking || !!pendingStart) && styles.endTripBtn]}
          activeOpacity={0.88}
          disabled={isEndingTrip}
          onPress={handleStartEndTrip}
        >
          <Text style={styles.startBtnText}>
            {isEndingTrip ? 'Ending…' : isTracking ? 'End Trip' : pendingStart ? 'Waiting to start… (tap to cancel)' : 'Start Trip'}
          </Text>
        </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

  // Map — fixed, fills all space; the panel overlaps it via absolute positioning
  mapContainer: { flex: 1, overflow: 'hidden' },
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

  // Bottom panel — draggable overlay sheet sitting on top of the map
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#F5F5F5',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  dragHandleArea: { alignItems: 'center', paddingVertical: 10 },
  dragHandleBar: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#DDDDDD' },
  panelScroll: { flex: 1 },
  panelContent: { padding: 16, paddingTop: 4, rowGap: 0, paddingBottom: 32 },

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

  // AI route recommendation
  recommendationCard: {
    backgroundColor: '#E6F9F7', borderRadius: 16,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#CCEEEA',
  },
  recommendationHeader: { flexDirection: 'row', alignItems: 'center', columnGap: 6, marginBottom: 6 },
  recommendationLabel: { fontSize: 11, fontWeight: '700', color: TEAL, letterSpacing: 0.4 },
  recommendationText: { fontSize: 13, color: '#1A1A1A', lineHeight: 18 },

  // Live traffic-backup reroute prompt
  trafficCard: {
    backgroundColor: '#FFF4E8', borderRadius: 16,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#FBDDBA',
  },
  trafficLabel: { fontSize: 11, fontWeight: '700', color: '#F47920', letterSpacing: 0.4 },
  trafficActions: { flexDirection: 'row', columnGap: 10, marginTop: 10 },
  trafficDismissBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 18,
    alignItems: 'center', backgroundColor: 'white',
    borderWidth: 1, borderColor: '#DDDDDD',
  },
  trafficDismissText: { fontSize: 13, fontWeight: '700', color: '#666666' },
  trafficRerouteBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 18,
    alignItems: 'center', backgroundColor: '#F47920',
  },
  trafficRerouteText: { fontSize: 13, fontWeight: '700', color: 'white' },

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

  purposeRow: {
    flexDirection: 'row', columnGap: 8, marginTop: 18,
  },
  purposePill: {
    flex: 1, paddingVertical: 12, borderRadius: 20,
    alignItems: 'center', backgroundColor: '#F0F0F0',
  },
  purposePillActive: { backgroundColor: TEAL },
  purposePillText: { fontSize: 14, fontWeight: '600', color: '#666666' },
  purposePillTextActive: { color: 'white' },
});
